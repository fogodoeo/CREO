'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_CHANNELS, channelKey, normalizeChannel, normalizeChannelId } = require('./platform-core');
const { CATALOG_KEY, ACTIVE_CHANNEL_KEY } = require('./platform-repository');

const RECORD_TYPES = new Set(['vendor', 'item', 'shipment', 'setting', 'broadcast', 'asset']);

function parseJson(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
}

function safeCompare(leftValue, rightValue) {
    const left = Buffer.from(String(leftValue || ''));
    const right = Buffer.from(String(rightValue || ''));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

class SQLitePlatformRepository {
    constructor(options = {}) {
        this.dataDir = path.resolve(options.dataDir || process.env.CREO_DATA_DIR || path.join(__dirname, 'storage'));
        this.dbPath = path.resolve(options.dbPath || path.join(this.dataDir, 'creo-platform.sqlite'));
        this.adminSecret = String(options.adminSecret || process.env.CREO_ADMIN_SECRET || '');
        this.mirror = options.mirror || null;
        this.durable = options.durable ?? Boolean(process.env.CREO_DATA_DIR);
        this.outboxTimer = null;
        this.mirrorKickTimer = null;
        this.mirrorWorkerEnabled = options.startWorker !== false;
        this.lastMirrorError = '';
        this.lastMirrorSyncAt = null;
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        this.db = new DatabaseSync(this.dbPath);
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS platform_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS platform_outbox (
                key TEXT PRIMARY KEY,
                operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
                value TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at INTEGER NOT NULL DEFAULT 0,
                last_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS platform_outbox_due_idx ON platform_outbox(next_attempt_at, updated_at);
        `);
        this.statements = {
            get: this.db.prepare('SELECT key, value FROM platform_kv WHERE key = ?'),
            upsert: this.db.prepare(`INSERT INTO platform_kv(key,value,updated_at) VALUES(?,?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`),
            delete: this.db.prepare('DELETE FROM platform_kv WHERE key = ?'),
            listPrefix: this.db.prepare('SELECT key,value FROM platform_kv WHERE key LIKE ? ORDER BY key ASC'),
            enqueue: this.db.prepare(`INSERT INTO platform_outbox(key,operation,value,attempts,next_attempt_at,last_error,created_at,updated_at)
                VALUES(?,?,?,0,0,'',?,?) ON CONFLICT(key) DO UPDATE SET operation=excluded.operation,value=excluded.value,
                attempts=0,next_attempt_at=0,last_error='',updated_at=excluded.updated_at`),
            due: this.db.prepare('SELECT key,operation,value,attempts FROM platform_outbox WHERE next_attempt_at <= ? ORDER BY updated_at ASC LIMIT ?'),
            synced: this.db.prepare('DELETE FROM platform_outbox WHERE key = ?'),
            failed: this.db.prepare('UPDATE platform_outbox SET attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE key=?'),
            outboxCount: this.db.prepare('SELECT COUNT(*) AS count FROM platform_outbox')
        };
        if (this.mirror && this.mirrorWorkerEnabled) this.startOutboxWorker();
    }

    transaction(callback) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = callback();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    enqueue(key, operation, value = null) {
        if (!this.mirror) return;
        const now = new Date().toISOString();
        this.statements.enqueue.run(key, operation, value, now, now);
    }

    cacheRows(rows) {
        if (!rows?.length) return;
        const now = new Date().toISOString();
        this.transaction(() => {
            for (const row of rows) {
                if (!row?.key || row.value === undefined || row.value === null) continue;
                this.statements.upsert.run(String(row.key), String(row.value), now);
            }
        });
    }

    kickMirror() {
        if (!this.mirror || !this.mirrorWorkerEnabled || this.mirrorKickTimer) return;
        this.mirrorKickTimer = setTimeout(() => {
            this.mirrorKickTimer = null;
            this.flushOutbox().catch(() => {});
        }, 0);
        this.mirrorKickTimer.unref?.();
    }

    async getRowsByKeys(keys) {
        const local = keys.map((key) => this.statements.get.get(key)).filter(Boolean);
        const found = new Set(local.map((row) => row.key));
        const missing = keys.filter((key) => !found.has(key));
        if (missing.length && this.mirror?.getRowsByKeys) {
            try {
                const remote = await this.mirror.getRowsByKeys(missing);
                this.cacheRows(remote);
                local.push(...remote);
            } catch (error) {
                this.lastMirrorError = String(error.message || error).slice(0, 200);
            }
        }
        return local;
    }

    async getRow(key) {
        const local = this.statements.get.get(key);
        if (local || !this.mirror?.getRow) return local || null;
        try {
            const remote = await this.mirror.getRow(key);
            if (remote) this.cacheRows([remote]);
            return remote || null;
        } catch (error) {
            this.lastMirrorError = String(error.message || error).slice(0, 200);
            return null;
        }
    }

    async upsertRows(rows) {
        if (!rows.length) return;
        const now = new Date().toISOString();
        this.transaction(() => {
            for (const row of rows) {
                const value = String(row.value);
                this.statements.upsert.run(row.key, value, now);
                this.enqueue(row.key, 'upsert', value);
            }
        });
        this.kickMirror();
    }

    async deleteRow(key) {
        this.transaction(() => {
            this.statements.delete.run(key);
            this.enqueue(key, 'delete');
        });
        this.kickMirror();
    }

    async getCatalog() {
        const row = await this.getRow(CATALOG_KEY);
        const stored = parseJson(row?.value, null);
        const source = Array.isArray(stored?.channels) && stored.channels.length ? stored.channels : DEFAULT_CHANNELS;
        const defaults = new Map(DEFAULT_CHANNELS.map((channel) => [channel.id, channel]));
        return {
            version: Number(stored?.version) || 1,
            updatedAt: stored?.updatedAt || null,
            channels: source.map((channel) => normalizeChannel(channel, defaults.get(channel.id) || {})).filter((channel) => channel.id)
        };
    }

    async saveCatalog(channels, expectedVersion = null) {
        let payload;
        this.transaction(() => {
            const row = this.statements.get.get(CATALOG_KEY);
            const stored = parseJson(row?.value, null);
            const currentVersion = Number(stored?.version) || 1;
            if (expectedVersion !== null && Number(expectedVersion) !== currentVersion) {
                const error = new Error('다른 화면에서 채널 설정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
                error.code = 'VERSION_CONFLICT';
                throw error;
            }
            const now = new Date().toISOString();
            payload = {
                version: currentVersion + 1,
                updatedAt: now,
                channels: channels.map((channel) => normalizeChannel(channel)).filter((channel) => channel.id)
            };
            const value = JSON.stringify(payload);
            this.statements.upsert.run(CATALOG_KEY, value, now);
            this.enqueue(CATALOG_KEY, 'upsert', value);
        });
        this.kickMirror();
        return payload;
    }

    async getActiveChannel() {
        const row = await this.getRow(ACTIVE_CHANNEL_KEY);
        return normalizeChannelId(row?.value || 'cdcup') || 'cdcup';
    }

    async setActiveChannel(channelId) {
        const id = normalizeChannelId(channelId);
        if (!id) throw new Error('Invalid channel id');
        await this.upsertRows([{ key: ACTIVE_CHANNEL_KEY, value: id }]);
        return id;
    }

    async listRecords(channelId, type) {
        const channel = normalizeChannelId(channelId);
        if (!channel || !RECORD_TYPES.has(type)) throw new Error('Invalid record scope');
        const prefix = `${channelKey(channel, type)}::`;
        const local = this.statements.listPrefix.all(`${prefix}%`).map((row) => parseJson(row.value, null)).filter(Boolean);
        if (local.length || !this.mirror?.listRecords) return local;
        try {
            const remote = await this.mirror.listRecords(channel, type);
            this.cacheRows(remote.map((record) => ({ key: channelKey(channel, type, record.id), value: JSON.stringify(record) })));
            return remote;
        } catch (error) {
            this.lastMirrorError = String(error.message || error).slice(0, 200);
            return local;
        }
    }

    async getRecord(channelId, type, id = 'state') {
        const row = await this.getRow(channelKey(channelId, type, id));
        return parseJson(row?.value, null);
    }

    async upsertRecord(channelId, type, record) {
        if (!record?.id) throw new Error('record id is required');
        const channel = normalizeChannelId(channelId);
        if (!channel || !RECORD_TYPES.has(type)) throw new Error('Invalid record scope');
        const now = new Date().toISOString();
        const payload = { ...record, id: String(record.id), channelId: channel, updatedAt: now, createdAt: record.createdAt || now };
        await this.upsertRows([{ key: channelKey(channel, type, payload.id), value: JSON.stringify(payload) }]);
        return payload;
    }

    async deleteRecord(channelId, type, id) {
        await this.deleteRow(channelKey(channelId, type, id));
    }

    async verifyAdmin(password) {
        const supplied = String(password || '');
        if (!supplied) return false;
        if (this.adminSecret) return safeCompare(supplied, this.adminSecret);
        return false;
    }

    startOutboxWorker() {
        if (this.outboxTimer || !this.mirror) return;
        this.outboxTimer = setInterval(() => this.flushOutbox().catch(() => {}), 30_000);
        this.outboxTimer.unref?.();
        this.flushOutbox().catch(() => {});
    }

    async flushOutbox(limit = 20) {
        if (!this.mirror) return { synced: 0, pending: 0 };
        const due = this.statements.due.all(Date.now(), Math.max(1, Math.min(100, Number(limit) || 20)));
        let synced = 0;
        for (const row of due) {
            try {
                if (row.operation === 'delete') await this.mirror.deleteRow(row.key);
                else await this.mirror.upsertRows([{ key: row.key, value: row.value }]);
                this.statements.synced.run(row.key);
                synced += 1;
                this.lastMirrorError = '';
                this.lastMirrorSyncAt = new Date().toISOString();
            } catch (error) {
                const attempts = Number(row.attempts || 0) + 1;
                const backoff = Math.min(3_600_000, 5_000 * (2 ** Math.min(attempts, 9)));
                this.statements.failed.run(attempts, Date.now() + backoff, String(error.message || error).slice(0, 500), new Date().toISOString(), row.key);
                this.lastMirrorError = String(error.message || error).slice(0, 200);
            }
        }
        return { synced, pending: Number(this.statements.outboxCount.get().count || 0) };
    }

    async health() {
        return {
            ok: true,
            backend: 'sqlite',
            durable: this.durable,
            databasePath: this.dbPath,
            channels: (await this.getCatalog()).channels.length,
            catalogVersion: (await this.getCatalog()).version,
            outboxPending: Number(this.statements.outboxCount.get().count || 0),
            mirrorEnabled: Boolean(this.mirror),
            mirrorLastSyncAt: this.lastMirrorSyncAt,
            mirrorError: this.lastMirrorError || null
        };
    }

    close() {
        if (this.outboxTimer) clearInterval(this.outboxTimer);
        if (this.mirrorKickTimer) clearTimeout(this.mirrorKickTimer);
        this.outboxTimer = null;
        this.mirrorKickTimer = null;
        try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (_) {}
        this.db.close();
    }
}

module.exports = { SQLitePlatformRepository };

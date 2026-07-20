'use strict';

const crypto = require('node:crypto');
const { DEFAULT_CHANNELS, channelKey, normalizeChannel, normalizeChannelId } = require('./platform-core');

const CATALOG_KEY = 'creo_v2::catalog';
const ACTIVE_CHANNEL_KEY = 'creo_v2::active_channel';
const ALLOWED_RECORD_TYPES = new Set(['vendor', 'item', 'shipment', 'setting', 'broadcast', 'asset']);
const FALLBACK_SUPABASE_URL = 'https://iuwqjeecwepqyqqlzprf.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1d3FqZWVjd2VwcXlxcWx6cHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTA3OTIsImV4cCI6MjA5Nzc4Njc5Mn0.psiAk4cqzjHqT6gP46m6nQM97nNsLEgc-a7K8BEAd_Y';

function jsonParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
}

function isProtectedKey(key) {
    return String(key || '').startsWith('creo_v2::');
}

function storedSignature(key, payload, secret) {
    return crypto.createHmac('sha256', secret).update(`${key}\n${payload}`).digest('base64url');
}

function protectStoredValue(key, value, secret) {
    const payload = String(value);
    if (!secret || !isProtectedKey(key)) return payload;
    return JSON.stringify({ v: 1, payload, sig: storedSignature(key, payload, secret) });
}

function readStoredValue(key, stored, secret) {
    const raw = String(stored ?? '');
    if (!secret || !isProtectedKey(key)) return raw;
    const envelope = jsonParse(raw, null);
    if (!envelope || envelope.v !== 1 || typeof envelope.payload !== 'string' || typeof envelope.sig !== 'string') return null;
    const expected = storedSignature(key, envelope.payload, secret);
    const left = Buffer.from(envelope.sig);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    return envelope.payload;
}

class SupabaseConfigRepository {
    constructor(options = {}) {
        this.url = String(options.url || process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL).replace(/\/$/, '');
        this.key = String(
            options.key
            || process.env.SUPABASE_SERVICE_ROLE_KEY
            || process.env.SUPABASE_ANON_KEY
            || FALLBACK_SUPABASE_ANON_KEY
        );
        this.fetch = options.fetchImpl || globalThis.fetch;
        this.adminSecret = String(options.adminSecret || process.env.CREO_ADMIN_SECRET || '');
        this.integritySecret = String(options.integritySecret || process.env.CREO_DATA_SIGNING_SECRET || this.adminSecret);
        if (!this.fetch) throw new Error('fetch is required');
    }

    async request(pathname, options = {}) {
        const response = await this.fetch(`${this.url}/rest/v1/${pathname}`, {
            ...options,
            headers: {
                apikey: this.key,
                Authorization: `Bearer ${this.key}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Storage ${response.status}: ${detail.slice(0, 300)}`);
        }
        const text = await response.text();
        return text ? jsonParse(text, text) : null;
    }

    async getRowsByKeys(keys) {
        if (!keys.length) return [];
        const encoded = keys.map((key) => `"${String(key).replace(/"/g, '\\"')}"`).join(',');
        const rows = await this.request(`config?select=key,value&key=in.(${encodeURIComponent(encoded)})`) || [];
        return rows.map((row) => ({ ...row, value: readStoredValue(row.key, row.value, this.integritySecret) }))
            .filter((row) => row.value !== null);
    }

    async getRow(key) {
        const rows = await this.request(`config?select=key,value&key=eq.${encodeURIComponent(key)}&limit=1`);
        const row = rows?.[0];
        if (!row) return null;
        const value = readStoredValue(row.key, row.value, this.integritySecret);
        return value === null ? null : { ...row, value };
    }

    async upsertRows(rows) {
        if (!rows.length) return;
        await this.request('config', {
            method: 'POST',
            headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
            body: JSON.stringify(rows.map((row) => ({
                key: row.key,
                value: protectStoredValue(row.key, row.value, this.integritySecret)
            })))
        });
    }

    async deleteRow(key) {
        await this.request(`config?key=eq.${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' }
        });
    }

    async getCatalog() {
        const row = await this.getRow(CATALOG_KEY);
        const stored = jsonParse(row?.value, null);
        const source = Array.isArray(stored?.channels) && stored.channels.length ? stored.channels : DEFAULT_CHANNELS;
        const defaults = new Map(DEFAULT_CHANNELS.map((channel) => [channel.id, channel]));
        return {
            version: Number(stored?.version) || 1,
            updatedAt: stored?.updatedAt || null,
            channels: source.map((channel) => normalizeChannel(channel, defaults.get(channel.id) || {})).filter((channel) => channel.id)
        };
    }

    async saveCatalog(channels, expectedVersion = null) {
        const current = await this.getCatalog();
        if (expectedVersion !== null && Number(expectedVersion) !== current.version) {
            const error = new Error('다른 화면에서 채널 설정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
            error.code = 'VERSION_CONFLICT';
            throw error;
        }
        const payload = {
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
            channels: channels.map((channel) => normalizeChannel(channel)).filter((channel) => channel.id)
        };
        await this.upsertRows([{ key: CATALOG_KEY, value: JSON.stringify(payload) }]);
        return payload;
    }

    async getActiveChannel() {
        const rows = await this.getRowsByKeys([ACTIVE_CHANNEL_KEY, 'active_event_module']);
        const map = new Map(rows.map((row) => [row.key, row.value]));
        return normalizeChannelId(map.get(ACTIVE_CHANNEL_KEY) || map.get('active_event_module') || 'cdcup') || 'cdcup';
    }

    async setActiveChannel(channelId) {
        const id = normalizeChannelId(channelId);
        if (!id) throw new Error('Invalid channel id');
        await this.upsertRows([{ key: ACTIVE_CHANNEL_KEY, value: id }]);
        return id;
    }

    async listRecords(channelId, type) {
        const channel = normalizeChannelId(channelId);
        if (!channel || !ALLOWED_RECORD_TYPES.has(type)) throw new Error('Invalid record scope');
        const prefix = channelKey(channel, type, '');
        const like = encodeURIComponent(`${prefix}::%`);
        const rows = await this.request(`config?select=key,value&key=like.${like}&order=key.asc`) || [];
        return rows.map((row) => readStoredValue(row.key, row.value, this.integritySecret))
            .filter((value) => value !== null)
            .map((value) => jsonParse(value, null))
            .filter(Boolean);
    }

    async getRecord(channelId, type, id = 'state') {
        const row = await this.getRow(channelKey(channelId, type, id));
        return jsonParse(row?.value, null);
    }

    async upsertRecord(channelId, type, record) {
        if (!record?.id) throw new Error('record id is required');
        const channel = normalizeChannelId(channelId);
        if (!channel || !ALLOWED_RECORD_TYPES.has(type)) throw new Error('Invalid record scope');
        const payload = {
            ...record,
            id: String(record.id),
            channelId: channel,
            updatedAt: new Date().toISOString(),
            createdAt: record.createdAt || new Date().toISOString()
        };
        await this.upsertRows([{ key: channelKey(channel, type, payload.id), value: JSON.stringify(payload) }]);
        return payload;
    }

    async deleteRecord(channelId, type, id) {
        await this.deleteRow(channelKey(channelId, type, id));
    }

    async verifyAdmin(password) {
        const supplied = String(password || '');
        if (!supplied) return false;
        if (this.adminSecret) {
            const crypto = require('node:crypto');
            const left = Buffer.from(supplied);
            const right = Buffer.from(this.adminSecret);
            return left.length === right.length && crypto.timingSafeEqual(left, right);
        }
        const row = await this.getRow('admin_pw');
        // 기존 운영 도구와 동일하게, 관리자 비밀번호가 아직 설정되지 않은
        // 설치에서는 비어 있지 않은 입력을 임시 통과시킨다. admin_pw 또는
        // CREO_ADMIN_SECRET을 설정하는 즉시 정확한 값만 허용된다.
        if (!row?.value) return true;
        return String(row.value) === supplied;
    }

    async health() {
        const catalog = await this.getCatalog();
        return { ok: true, channels: catalog.channels.length, catalogVersion: catalog.version };
    }
}

module.exports = {
    ACTIVE_CHANNEL_KEY,
    ALLOWED_RECORD_TYPES,
    CATALOG_KEY,
    SupabaseConfigRepository,
    protectStoredValue,
    readStoredValue
};

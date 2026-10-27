'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { mobilePhoneCandidates, normalizeMobilePhone } = require('./public/mobile-phone');

const clean = (value, limit = 160) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
const equal = (a, b) => Boolean(a && b && Buffer.byteLength(a) === Buffer.byteLength(b)
    && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)));
const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
};

function contactOf(member) {
    for (const source of ['profile', 'answer', 'verified']) {
        const evidence = member.sources?.[source];
        const phone = source === 'verified'
            ? (evidence?.verified === true && /^[+\d\s().-]+$/.test(evidence.text) && evidence.text.replace(/\D/g, '').length >= 11
                ? normalizeMobilePhone(evidence.text) : '')
            : extractContact(evidence?.text, source === 'profile');
        if (phone) return { phone, source };
    }
    return { phone: '', source: '' };
}

function extractContact(text, allowShort) {
    const full = String(text || '').normalize('NFKC').match(/(?<!\d)(?:010|\+?82[ .-]*10)[ .()-]*\d{4}[ .()-]*\d{4}(?!\d)/g) || [];
    const phones = [...new Set([...(allowShort ? mobilePhoneCandidates(text) : []), ...full.map(normalizeMobilePhone)].filter(Boolean))];
    return phones.length === 1 ? phones[0] : '';
}

class BandMemberDirectory {
    constructor(options = {}) {
        const env = options.env || process.env;
        this.enabled = options.enabled ?? env.BAND_DIRECTORY_ENABLED === 'true';
        this.bandNo = String(options.bandNo || env.BAND_DIRECTORY_BAND_NO || '104432443');
        this.token = options.token || env.BAND_DIRECTORY_BOT_TOKEN || '';
        this.now = options.now || Date.now;
        this.isAdmin = options.isAdmin || (() => false);
        this.fetchImpl = options.fetchImpl || global.fetch;
        this.botUrl = env.BAND_DIRECTORY_BOT_URL || '';
        if (!this.enabled) return;
        const file = options.dbPath || path.join(env.CREO_DATA_DIR || path.join(__dirname, 'storage'), 'band-members.sqlite');
        if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
        this.db = new DatabaseSync(file);
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS members (band_no TEXT NOT NULL, member_key TEXT NOT NULL,
                data TEXT NOT NULL, PRIMARY KEY(band_no, member_key));
            CREATE TABLE IF NOT EXISTS approvals (band_no TEXT NOT NULL, application_id TEXT NOT NULL,
                member_key TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY(band_no, application_id));
            CREATE TABLE IF NOT EXISTS bot_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
        this.db.exec(`CREATE TABLE IF NOT EXISTS member_aliases (band_no TEXT NOT NULL,
            alias_key TEXT NOT NULL, member_key TEXT NOT NULL, PRIMARY KEY(band_no,alias_key));`);
    }

    transaction(fn) {
        this.db.exec('BEGIN IMMEDIATE');
        try { const value = fn(); this.db.exec('COMMIT'); return value; }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }

    upsert(input) {
        if (String(input.bandNo) !== this.bandNo) throw new Error('wrong_band');
        const originalKey = clean(input.memberKey);
        const key = this.canonicalKey(originalKey);
        // BAND returns opaque base64 keys, including padding and +/ characters.
        // Keep the exact identity; these values are only used in bound SQL.
        if (!key || !/^[A-Za-z0-9_+/=-]{8,160}$/.test(key)) throw new Error('member_key_required');
        const observedAt = Number(input.observedAt);
        if (!Number.isFinite(observedAt) || observedAt <= 0 || observedAt > this.now() + 60000) throw new Error('invalid_observation_time');
        const existing = this.db.prepare('SELECT data FROM members WHERE band_no=? AND member_key=?').get(this.bandNo, key);
        const member = existing ? JSON.parse(existing.data) : {
            bandNo: this.bandNo, memberKey: key, sources: {}, status: 'existing', createdAt: this.now(), updatedAt: 0
        };
        for (const source of ['profile', 'answer', 'verified']) {
            if (!Object.hasOwn(input.sources || {}, source)) continue;
            const evidence = input.sources[source];
            if (!evidence || typeof evidence.text !== 'string') throw new Error('invalid_evidence');
            // A roster observation has no application evidence. It must never erase it.
            if (observedAt >= (member.sources[source]?.observedAt || 0)) {
                member.sources[source] = { text: clean(evidence.text, source === 'answer' ? 8000 : 1000),
                    observedAt, verified: source === 'verified' && evidence.verified === true };
            }
        }
        if (observedAt >= member.updatedAt) {
            if (typeof input.displayName === 'string') member.displayName = clean(input.displayName, 240);
            if (typeof input.userNo === 'string' && clean(input.userNo)) {
                if (member.userNo && member.userNo !== clean(input.userNo)) throw new Error('identity_mismatch');
                member.userNo = clean(input.userNo);
            }
            if (['existing', 'pending', 'approved'].includes(input.status)
                && !(member.status === 'approved' && input.status === 'pending')) member.status = input.status;
            member.updatedAt = observedAt;
        }
        const contact = contactOf(member);
        member.phone = contact.phone;
        member.phoneSource = contact.source;
        this.db.prepare('INSERT INTO members VALUES(?,?,?) ON CONFLICT(band_no,member_key) DO UPDATE SET data=excluded.data')
            .run(this.bandNo, key, JSON.stringify(member));
        return member;
    }

    resolve(input) {
        if (!this.enabled || !input.bandMemberKey || (input.bandNo && String(input.bandNo) !== this.bandNo)) return null;
        const row = this.db.prepare('SELECT data FROM members WHERE band_no=? AND member_key=?')
            .get(this.bandNo, this.canonicalKey(clean(input.bandMemberKey)));
        if (!row) return null;
        const member = JSON.parse(row.data);
        if (!member.phone || member.status === 'pending') return null;
        return { phone: member.phone, memberKey: member.memberKey, displayName: member.displayName || '', phoneSource: member.phoneSource };
    }

    canonicalKey(key) {
        return this.db.prepare('SELECT member_key FROM member_aliases WHERE band_no=? AND alias_key=?')
            .get(this.bandNo, key)?.member_key || key;
    }

    unresolvedApprovals() {
        return this.db.prepare('SELECT data FROM members WHERE band_no=?').all(this.bandNo)
            .map(row => JSON.parse(row.data)).filter(m => m.status === 'approved' && !m.userNo)
            .slice(0, 10).map(m => ({ memberKey: m.memberKey }));
    }

    reconcile(input) {
        const sourceKey = clean(input.memberKey), targetKey = clean(input.canonicalMemberKey), userNo = clean(input.userNo);
        if (!/^\d{1,20}$/.test(userNo) || !sourceKey || !targetKey) throw new Error('verified_identity_required');
        return this.transaction(() => {
            if (this.canonicalKey(sourceKey) === targetKey && sourceKey !== targetKey) return { linked: true };
            const read = key => {
                const row = this.db.prepare('SELECT data FROM members WHERE band_no=? AND member_key=?').get(this.bandNo, key);
                return row ? JSON.parse(row.data) : null;
            };
            const source = read(sourceKey), target = read(targetKey);
            if (!source || source.status !== 'approved' || (source.userNo && source.userNo !== userNo)
                || !target || (sourceKey !== targetKey ? target.userNo !== userNo : target.userNo && target.userNo !== userNo)) throw new Error('identity_mismatch');
            const merged = { ...target, userNo, status: 'approved', sources: { ...target.sources },
                createdAt: Math.min(source.createdAt, target.createdAt), updatedAt: Math.max(source.updatedAt, target.updatedAt) };
            for (const [name, evidence] of Object.entries(source.sources)) {
                if (!merged.sources[name] || evidence.observedAt > merged.sources[name].observedAt) merged.sources[name] = evidence;
            }
            const contact = contactOf(merged); merged.phone = contact.phone; merged.phoneSource = contact.source;
            this.db.prepare('UPDATE members SET data=? WHERE band_no=? AND member_key=?').run(JSON.stringify(merged), this.bandNo, targetKey);
            if (sourceKey !== targetKey) {
                this.db.prepare('UPDATE member_aliases SET member_key=? WHERE band_no=? AND member_key=?').run(targetKey, this.bandNo, sourceKey);
                this.db.prepare('INSERT INTO member_aliases VALUES(?,?,?) ON CONFLICT(band_no,alias_key) DO UPDATE SET member_key=excluded.member_key')
                    .run(this.bandNo, sourceKey, targetKey);
                this.db.prepare('DELETE FROM members WHERE band_no=? AND member_key=?').run(this.bandNo, sourceKey);
            }
            return { linked: true };
        });
    }

    claim(input) {
        const applicationId = clean(input.applicationId, 240);
        if (!applicationId) throw new Error('application_id_required');
        return this.transaction(() => {
            const member = this.upsert({ ...input.member, status: 'pending' });
            if (!member.phone) return { claimed: false, state: 'missing_phone' };
            const current = this.db.prepare('SELECT * FROM approvals WHERE band_no=? AND application_id=?').get(this.bandNo, applicationId);
            if (current) return { claimed: false, state: current.state };
            this.db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?)').run(this.bandNo, applicationId, member.memberKey, 'claimed', this.now());
            return { claimed: true, state: 'claimed' };
        });
    }

    finish(input) {
        return this.transaction(() => {
            const id = clean(input.applicationId, 240);
            const current = this.db.prepare('SELECT * FROM approvals WHERE band_no=? AND application_id=?').get(this.bandNo, id);
            if (!current) throw new Error('claim_required');
            if (current.state === 'approved') return { state: 'approved' };
            const state = input.success === true ? 'approved' : 'uncertain';
            this.db.prepare('UPDATE approvals SET state=?,updated_at=? WHERE band_no=? AND application_id=?').run(state, this.now(), this.bandNo, id);
            if (state === 'approved') {
                const row = this.db.prepare('SELECT data FROM members WHERE band_no=? AND member_key=?').get(this.bandNo, current.member_key);
                const member = JSON.parse(row.data);
                member.status = 'approved';
                this.db.prepare('UPDATE members SET data=? WHERE band_no=? AND member_key=?').run(JSON.stringify(member), this.bandNo, member.memberKey);
            }
            return { state };
        });
    }

    list({ query = '', offset = 0, limit = 50 } = {}) {
        const all = this.db.prepare('SELECT data FROM members WHERE band_no=?').all(this.bandNo).map(row => JSON.parse(row.data));
        const needle = clean(query, 120).toLowerCase();
        const filtered = all.filter(m => !needle || `${m.displayName || ''} ${m.phone} ${m.sources.answer?.text || ''}`.toLowerCase().includes(needle))
            .sort((a, b) => b.updatedAt - a.updatedAt || a.memberKey.localeCompare(b.memberKey));
        return { total: all.length, contactable: all.filter(m => m.phone).length, matched: filtered.length,
            items: filtered.slice(offset, offset + limit), bandNo: this.bandNo };
    }

    setMeta(key, value) {
        this.db.prepare('INSERT INTO bot_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
    }
    getMeta(key) {
        const row = this.db.prepare('SELECT value FROM bot_meta WHERE key=?').get(key);
        return row ? JSON.parse(row.value) : null;
    }
    saveSession(body) {
        if (!Array.isArray(body.cookies) || body.cookies.length > 80) throw new Error('invalid_session');
        const cookies = body.cookies.filter(c => typeof c.name === 'string' && typeof c.value === 'string'
            && /^(\.)?([a-z0-9-]+\.)*band\.us$/i.test(c.domain || ''));
        if (!cookies.length) throw new Error('empty_session');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(this.token).digest(), iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify({ cookies, revision: clean(body.revision) })), cipher.final()]);
        this.setMeta('session', { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
    }
    readSession() {
        const value = this.getMeta('session');
        if (!value) return {};
        try {
            const cipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(this.token).digest(), Buffer.from(value.iv, 'base64'));
            cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
            return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString());
        } catch { return {}; }
    }
    status() {
        if (!this.enabled) return { enabled: false };
        const heartbeat = this.getMeta('heartbeat');
        return { enabled: true, bandNo: this.bandNo, heartbeat,
            keepalive: this.getMeta('keepalive'),
            stale: !heartbeat || this.now() - heartbeat.receivedAt > 90000,
            members: this.db.prepare('SELECT count(*) AS count FROM members WHERE band_no=?').get(this.bandNo).count };
    }

    async handle(req, res, url) {
        if (!url.pathname.startsWith('/api/band-directory/')) return false;
        if (!this.enabled) { json(res, 503, { error: 'directory_disabled' }); return true; }
        const bot = equal(String(req.headers.authorization || ''), `Bearer ${this.token}`) && this.token.length >= 32;
        const botRoute = url.pathname.startsWith('/api/band-directory/bot/');
        if (botRoute ? !bot : !await this.isAdmin(req)) { json(res, 401, { error: 'unauthorized' }); return true; }
        try {
            if (req.method === 'GET') {
                if (url.pathname === '/api/band-directory/members') json(res, 200, this.list({ query: url.searchParams.get('q'),
                    offset: Math.max(0, Number(url.searchParams.get('offset')) || 0), limit: 50 }));
                else if (url.pathname.endsWith('/status')) json(res, 200, this.status());
                else if (botRoute && url.pathname.endsWith('/progress')) json(res, 200, this.getMeta('rosterProgress') || {});
                else if (botRoute && url.pathname.endsWith('/session')) json(res, 200, this.readSession());
                else if (botRoute && url.pathname.endsWith('/reconcile')) json(res, 200, { members: this.unresolvedApprovals() });
                else json(res, 404, { error: 'not_found' });
                return true;
            }
            if (req.method !== 'POST' || !botRoute) { json(res, 405, { error: 'method_not_allowed' }); return true; }
            const chunks = []; let size = 0;
            for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 1024 * 1024) throw new Error('body_too_large'); chunks.push(Buffer.from(chunk)); }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (url.pathname.endsWith('/members')) {
                if (!Array.isArray(body.members) || body.members.length > 200) throw new Error('invalid_batch');
                const count = this.transaction(() => body.members.map(m => this.upsert(m)).length);
                json(res, 200, { saved: count });
            } else if (url.pathname.endsWith('/claim')) json(res, 200, this.claim(body));
            else if (url.pathname.endsWith('/session')) { this.saveSession(body); json(res, 200, { ok: true }); }
            else if (url.pathname.endsWith('/reconcile')) json(res, 200, this.reconcile(body));
            else if (url.pathname.endsWith('/finish')) json(res, 200, this.finish(body));
            else if (url.pathname.endsWith('/progress')) {
                this.setMeta('rosterProgress', { complete: body.complete === true, offset: Math.max(0, Number(body.offset) || 0), updatedAt: this.now() });
                json(res, 200, { ok: true });
            } else if (url.pathname.endsWith('/heartbeat')) {
                // Never forward raw errors, profile text, application answers or cookies to health/status.
                this.setMeta('heartbeat', { receivedAt: this.now(), connected: body.connected === true,
                    autoApprove: body.autoApprove === true, pending: Math.max(0, Number(body.pending) || 0),
                    approved: Math.max(0, Number(body.approved) || 0), rosterComplete: body.rosterComplete === true,
                    state: ['starting', 'running', 'login_required', 'error'].includes(body.state) ? body.state : 'error' });
                if (/^https:\/\/[a-z0-9-]+\.onrender\.com\/?$/.test(body.serviceUrl || '')) this.setMeta('botUrl', body.serviceUrl);
                json(res, 200, { ok: true });
            } else json(res, 404, { error: 'not_found' });
        } catch { json(res, 400, { error: 'request_failed' }); }
        return true;
    }

    startKeepalive() {
        if (!this.enabled) return;
        const ping = async () => {
            if (this.pinging) return;
            const target = this.botUrl || this.getMeta('botUrl');
            if (!target || !/^https:\/\/[a-z0-9-]+\.onrender\.com\/?$/.test(target)) return;
            this.pinging = true;
            try {
                const response = await this.fetchImpl(new URL('/healthz', target), { signal: AbortSignal.timeout(15000), redirect: 'error' });
                await response.body?.cancel();
                this.setMeta('keepalive', { at: this.now(), ok: response.ok, intervalSeconds: 300 });
            }
            catch { this.setMeta('keepalive', { at: this.now(), ok: false, intervalSeconds: 300 }); }
            finally { this.pinging = false; }
        };
        void ping();
        this.timer = setInterval(ping, 300000);
        this.timer.unref?.();
    }
    close() { clearInterval(this.timer); this.db?.close(); }
}

module.exports = { BandMemberDirectory, contactOf };

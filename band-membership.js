'use strict';

const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const SESSION_TYPE = 'band_phone_membership';
const DEFAULT_TARGET_BAND_URL = 'https://www.band.us/band/101878670/post';

function normalizePhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('82') && digits.length === 12) digits = `0${digits.slice(2)}`;
    if (digits.length === 8) digits = `010${digits}`;
    return /^010\d{8}$/.test(digits) ? digits : '';
}

function profileNameCandidates(value) {
    const raw = String(value || '')
        .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    if (!raw) return [];
    const withoutPhone = raw
        .replace(/(?<!\d)010[\s./_-]*\d{4}[\s./_-]*\d{4}(?!\d)/g, ' ')
        .replace(/(?<!\d)\d{8}(?!\d)/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[\/|·\s]+$/g, '')
        .trim();
    const candidates = [raw, withoutPhone];
    if (withoutPhone) {
        candidates.push(withoutPhone.replace(/[\/|·]+/g, ' ').replace(/\s+/g, ' ').trim());
        candidates.push(...withoutPhone.split(/[\/|·]+/g).map((part) => part.trim()));
    }
    return [...new Set(candidates.filter(Boolean))].slice(0, 8);
}

function positiveInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function rateLimitAttempts(value, fallback = 8, allowUnlimited = true) {
    if (allowUnlimited && String(value ?? '').trim() === '0') return 0;
    return positiveInteger(value, fallback, 2, 100);
}

function validIdentifier(value, fallback = '') {
    const text = String(value || fallback).trim();
    return /^[a-z_][a-z0-9_]*$/i.test(text) ? text : '';
}

function loadConfig(env = process.env) {
    const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const sessionSecret = String(
        env.BAND_MEMBER_SESSION_SECRET
        || env.BAND_OAUTH_SESSION_SECRET
        || env.CREO_DATA_SIGNING_SECRET
        || ''
    ).trim();
    const table = validIdentifier(env.BAND_MEMBER_TABLE, 'band_members');
    const phoneColumn = validIdentifier(env.BAND_MEMBER_PHONE_COLUMN, 'phone_normalized');
    const activeColumn = validIdentifier(env.BAND_MEMBER_ACTIVE_COLUMN, 'is_active');
    const memberKeyColumn = validIdentifier(env.BAND_MEMBER_KEY_COLUMN, 'band_member_key');
    const displayNameColumn = validIdentifier(env.BAND_MEMBER_NAME_COLUMN, 'display_name');
    const targetBandUrl = String(
        env.BAND_MEMBER_TARGET_BAND_URL
        || env.BAND_OAUTH_TARGET_BAND_URL
        || DEFAULT_TARGET_BAND_URL
    ).trim();
    const allowedOrigins = String(env.BAND_MEMBER_ALLOWED_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^https?:\/\//i.test(value));
    const config = {
        url,
        serviceRoleKey,
        sessionSecret,
        table,
        phoneColumn,
        activeColumn,
        memberKeyColumn,
        displayNameColumn,
        targetBandUrl,
        allowedOrigins,
        sessionTtlSec: positiveInteger(env.BAND_MEMBER_SESSION_TTL_SEC, 7200, 300, 86400),
        requestTimeoutMs: positiveInteger(env.BAND_MEMBER_REQUEST_TIMEOUT_MS, 7000, 1000, 20000),
        rateLimitWindowMs: positiveInteger(env.BAND_MEMBER_RATE_LIMIT_WINDOW_MS, 600000, 10000, 3600000),
        rateLimitAttempts: rateLimitAttempts(
            env.BAND_MEMBER_RATE_LIMIT_ATTEMPTS,
            120,
            true
        ),
        positiveCacheMs: positiveInteger(env.BAND_MEMBER_POSITIVE_CACHE_MS, 60000, 5000, 600000),
        negativeCacheMs: positiveInteger(env.BAND_MEMBER_NEGATIVE_CACHE_MS, 500, 250, 5000)
    };
    config.configured = Boolean(
        /^https:\/\/[^/]+/i.test(config.url)
        && config.serviceRoleKey
        && config.sessionSecret.length >= 32
        && config.table
        && config.phoneColumn
        && config.activeColumn
        && /^https:\/\//i.test(config.targetBandUrl)
    );
    return config;
}

function signToken(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function verifyToken(token, secret, nowMs = Date.now()) {
    const [body, signature, extra] = String(token || '').split('.');
    if (!body || !signature || extra) throw new Error('invalid token');
    const expected = createHmac('sha256', secret).update(body).digest();
    let received;
    try { received = Buffer.from(signature, 'base64url'); }
    catch { throw new Error('invalid token'); }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        throw new Error('invalid token');
    }
    let payload;
    try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
    catch { throw new Error('invalid token'); }
    const now = Math.floor(nowMs / 1000);
    if (!payload || payload.typ !== SESSION_TYPE || !payload.sub) throw new Error('invalid token');
    if (!Number.isFinite(payload.iat) || payload.iat > now + 60) throw new Error('invalid token');
    if (!Number.isFinite(payload.exp) || payload.exp < now) throw new Error('expired token');
    return payload;
}

function publicSubject(phone, secret) {
    return `member_${createHmac('sha256', secret)
        .update(`band-phone:${phone}`)
        .digest('base64url')
        .slice(0, 32)}`;
}

function sessionSubject() {
    return `member_${randomBytes(24).toString('base64url').slice(0, 32)}`;
}

async function readSmallJson(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let tooLarge = false;
        req.setEncoding?.('utf8');
        req.on('data', (chunk) => {
            if (tooLarge) return;
            body += chunk;
            if (body.length > 4096) {
                tooLarge = true;
                body = '';
            }
        });
        req.on('end', () => {
            if (tooLarge) {
                reject(new Error('body too large'));
                return;
            }
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(new Error('invalid json')); }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, value, extraHeaders = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        ...extraHeaders
    });
    res.end(JSON.stringify(value));
}

function requestOriginAllowed(req, config) {
    const origin = String(req.headers?.origin || '').trim();
    if (!origin) return true;
    if (config.allowedOrigins.includes(origin)) return true;
    try {
        return new URL(origin).host === String(req.headers?.host || '');
    } catch {
        return false;
    }
}

function clientAddress(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter(config, now) {
    const attempts = new Map();
    return function allow(key) {
        if (config.rateLimitAttempts === 0) return true;
        const current = now();
        const cutoff = current - config.rateLimitWindowMs;
        const recent = (attempts.get(key) || []).filter((timestamp) => timestamp > cutoff);
        if (recent.length >= config.rateLimitAttempts) {
            attempts.set(key, recent);
            return false;
        }
        recent.push(current);
        attempts.set(key, recent);
        if (attempts.size > 1000) {
            for (const [address, timestamps] of attempts) {
                if (!timestamps.some((timestamp) => timestamp > cutoff)) attempts.delete(address);
            }
        }
        return true;
    };
}

function createBandMembership(options = {}) {
    const env = options.env || process.env;
    const config = loadConfig(env);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const now = options.now || Date.now;
    const logger = options.logger || console;
    const isAdmin = options.isAdmin;
    const allowAttempt = createRateLimiter(config, now);
    const memberCache = new Map();
    const memberLookups = new Map();
    const identityCache = new Map();

    function cachedMember(phone) {
        const cached = memberCache.get(phone);
        if (!cached) return undefined;
        if (cached.expiresAt <= now()) {
            memberCache.delete(phone);
            return undefined;
        }
        return cached.member;
    }

    async function lookupMember(phone) {
        const cached = cachedMember(phone);
        if (cached !== undefined) return cached;
        if (memberLookups.has(phone)) return memberLookups.get(phone);
        const lookup = (async () => {
        const query = new URL(`${config.url}/rest/v1/${config.table}`);
        query.searchParams.set('select', config.phoneColumn);
        query.searchParams.set(config.phoneColumn, `eq.${phone}`);
        query.searchParams.set(config.activeColumn, 'eq.true');
        query.searchParams.set('limit', '1');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
        try {
            const response = await fetchImpl(query, {
                headers: {
                    apikey: config.serviceRoleKey,
                    Authorization: `Bearer ${config.serviceRoleKey}`,
                    Accept: 'application/json'
                },
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`Supabase ${response.status}`);
            const rows = await response.json();
            const member = Array.isArray(rows) && rows.length > 0;
            memberCache.set(phone, {
                member,
                expiresAt: now() + (member ? config.positiveCacheMs : config.negativeCacheMs)
            });
            return member;
        } finally {
            clearTimeout(timer);
        }
        })().finally(() => memberLookups.delete(phone));
        memberLookups.set(phone, lookup);
        return lookup;
    }

    async function upsertMember({ phone, displayName = '', memberKey = '' }) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) throw new Error('invalid phone');
        const cleanName = String(displayName || '')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
        const cleanMemberKey = String(memberKey || '')
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, 160);
        const query = new URL(`${config.url}/rest/v1/${config.table}`);
        query.searchParams.set('on_conflict', config.phoneColumn);
        const nowIso = new Date(now()).toISOString();
        const body = {
            [config.phoneColumn]: normalizedPhone,
            [config.activeColumn]: true,
            [config.displayNameColumn]: cleanName || null,
            [config.memberKeyColumn]: cleanMemberKey || null,
            updated_at: nowIso
        };
        const response = await fetchImpl(query, {
            method: 'POST',
            headers: {
                apikey: config.serviceRoleKey,
                Authorization: `Bearer ${config.serviceRoleKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`Supabase ${response.status}`);
        memberCache.set(normalizedPhone, {
            member: true,
            expiresAt: now() + config.positiveCacheMs
        });
        identityCache.clear();
        return true;
    }

    async function lookupMemberSubject(column, value) {
        const cleanValue = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!config.configured || !fetchImpl || !column || !cleanValue) return '';
        const cacheKey = `${column}:${cleanValue}`;
        const cached = identityCache.get(cacheKey);
        if (cached && cached.expiresAt > now()) return cached.subject;

        const query = new URL(`${config.url}/rest/v1/${config.table}`);
        query.searchParams.set('select', `${config.phoneColumn},${column}`);
        query.searchParams.set(column, `eq.${cleanValue}`);
        query.searchParams.set(config.activeColumn, 'eq.true');
        query.searchParams.set('limit', '2');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
        let subject = '';
        try {
            const response = await fetchImpl(query, {
                headers: {
                    apikey: config.serviceRoleKey,
                    Authorization: `Bearer ${config.serviceRoleKey}`,
                    Accept: 'application/json'
                },
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`Supabase ${response.status}`);
            const rows = await response.json();
            const phones = [...new Set((Array.isArray(rows) ? rows : [])
                .map((row) => normalizePhone(row?.[config.phoneColumn]))
                .filter(Boolean))];
            if (phones.length === 1) subject = publicSubject(phones[0], config.sessionSecret);
        } finally {
            clearTimeout(timer);
        }
        identityCache.set(cacheKey, {
            subject,
            expiresAt: now() + (subject ? config.positiveCacheMs : config.negativeCacheMs)
        });
        return subject;
    }

    async function resolveMemberSubject(input = {}) {
        if (!config.configured) return '';
        const phone = normalizePhone(input.phone);
        if (phone) return publicSubject(phone, config.sessionSecret);
        for (const displayName of profileNameCandidates(input.displayName)) {
            const byDisplayName = await lookupMemberSubject(config.displayNameColumn, displayName);
            if (byDisplayName) return byDisplayName;
        }
        const byBandKey = await lookupMemberSubject(config.memberKeyColumn, input.bandMemberKey);
        if (byBandKey) return byBandKey;
        return '';
    }

    function sessionResponse(payload, token = '') {
        return {
            member: true,
            token: token || undefined,
            user: {
                id: payload.sub,
                name: 'BAND 회원',
                isTargetMember: true,
                memberScoped: Boolean(payload.mid)
            },
            targetBandUrl: config.targetBandUrl,
            expiresAt: new Date(payload.exp * 1000).toISOString()
        };
    }

    async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/band-membership/')) return false;
        if (!requestOriginAllowed(req, config)) {
            sendJson(res, 403, { error: '허용되지 않은 요청입니다.' });
            return true;
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '600'
            });
            res.end();
            return true;
        }

        if (url.pathname === '/api/band-membership/config' && req.method === 'GET') {
            sendJson(res, 200, {
                configured: config.configured,
                targetBandUrl: config.targetBandUrl,
                rateLimitDisabled: config.rateLimitAttempts === 0
            });
            return true;
        }

        if (!config.configured || !fetchImpl) {
            sendJson(res, 503, { error: '회원 확인 기능을 준비하고 있어요.' });
            return true;
        }

        if (url.pathname === '/api/band-membership/admin-sync' && req.method === 'POST') {
            if (typeof isAdmin !== 'function' || !await isAdmin(req)) {
                sendJson(res, 401, { error: '관리자 인증이 필요합니다.' });
                return true;
            }
            let input;
            try { input = await readSmallJson(req); }
            catch {
                sendJson(res, 400, { error: '회원 정보를 확인해주세요.' });
                return true;
            }
            const phone = normalizePhone(input.phone);
            if (!phone) {
                sendJson(res, 400, { error: '010으로 시작하는 휴대전화번호 11자리를 입력해주세요.' });
                return true;
            }
            try {
                await upsertMember({
                    phone,
                    displayName: input.displayName,
                    memberKey: input.memberKey
                });
                sendJson(res, 200, { ok: true, synced: true });
            } catch (error) {
                logger.error?.('[band-membership] admin sync failed:', error.message);
                sendJson(res, 502, { error: '회원 명단에 등록하지 못했어요.' });
            }
            return true;
        }

        if (url.pathname === '/api/band-membership/verify' && req.method === 'POST') {
            let input;
            try { input = await readSmallJson(req); }
            catch {
                sendJson(res, 400, { error: '전화번호 형식을 확인해주세요.' });
                return true;
            }
            const phone = normalizePhone(input.phone);
            if (!phone) {
                sendJson(res, 400, { error: '010으로 시작하는 휴대전화번호 11자리를 입력해주세요.' });
                return true;
            }
            const phoneAttemptKey = `phone:${publicSubject(phone, config.sessionSecret)}`;
            const cacheHit = cachedMember(phone) !== undefined;
            if (!cacheHit && (!allowAttempt(clientAddress(req)) || !allowAttempt(phoneAttemptKey))) {
                sendJson(res, 429, { error: '확인 횟수가 많아요. 잠시 후 다시 시도해주세요.' });
                return true;
            }
            try {
                const member = await lookupMember(phone);
                if (!member) {
                    sendJson(res, 200, { member: false, targetBandUrl: config.targetBandUrl });
                    return true;
                }
                const issuedAt = Math.floor(now() / 1000);
                const payload = {
                    typ: SESSION_TYPE,
                    iat: issuedAt,
                    exp: issuedAt + config.sessionTtlSec,
                    sub: sessionSubject(),
                    mid: publicSubject(phone, config.sessionSecret)
                };
                const token = signToken(payload, config.sessionSecret);
                sendJson(res, 200, sessionResponse(payload, token));
            } catch (error) {
                logger.error?.('[band-membership] lookup failed:', error.message);
                sendJson(res, 502, { error: '회원 명단을 확인하지 못했어요. 잠시 후 다시 시도해주세요.' });
            }
            return true;
        }

        if (url.pathname === '/api/band-membership/session' && req.method === 'POST') {
            try {
                const input = await readSmallJson(req);
                const payload = verifyToken(input.token, config.sessionSecret, now());
                sendJson(res, 200, sessionResponse(payload));
            } catch {
                sendJson(res, 401, { error: '회원 확인 시간이 만료됐어요.' });
            }
            return true;
        }

        sendJson(res, 404, { error: 'Not found' });
        return true;
    }

    return { config, handle, lookupMember, upsertMember, resolveMemberSubject };
}

module.exports = {
    SESSION_TYPE,
    createBandMembership,
    loadConfig,
    normalizePhone,
    profileNameCandidates,
    signToken,
    verifyToken
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
    SESSION_TYPE,
    createBandMembership,
    normalizePhone,
    verifyToken
} = require('../band-membership');

const NOW = Date.parse('2026-08-01T00:00:00.000Z');
const SESSION_SECRET = 'member-session-secret-that-is-longer-than-thirty-two-characters';
const ENV = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    BAND_MEMBER_SESSION_SECRET: SESSION_SECRET,
    BAND_MEMBER_TARGET_BAND_URL: 'https://www.band.us/band/101992972/post',
    BAND_MEMBER_ALLOWED_ORIGINS: 'https://creok.example.com'
};

class CapturedResponse {
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; }
    end(body = '') { this.body = String(body || ''); }
}

function request(method, body = '', headers = {}) {
    const req = Readable.from(body ? [body] : []);
    req.method = method;
    req.headers = headers;
    req.socket = { remoteAddress: '127.0.0.1' };
    return req;
}

function jsonResponse(value, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return value; }
    };
}

test('Korean mobile numbers are normalized without retaining formatting', () => {
    assert.equal(normalizePhone('010-1234-5678'), '01012345678');
    assert.equal(normalizePhone('+82 10 1234 5678'), '01012345678');
    assert.equal(normalizePhone('02-1234-5678'), '');
    assert.equal(normalizePhone('0101234567'), '');
});

test('member lookup stays server-side and returns a pseudonymous short session', async () => {
    let lookupUrl;
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        fetchImpl: async (url, options) => {
            lookupUrl = new URL(url);
            assert.equal(options.headers.apikey, ENV.SUPABASE_SERVICE_ROLE_KEY);
            assert.equal(options.headers.Authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
            return jsonResponse([{ phone_normalized: '01012345678' }]);
        },
        logger: { error() {} }
    });
    const response = new CapturedResponse();
    await membership.handle(
        request('POST', JSON.stringify({ phone: '010-1234-5678' }), {
            origin: 'https://creok.example.com',
            host: 'creok.example.com'
        }),
        response,
        new URL('https://creok.example.com/api/band-membership/verify')
    );
    assert.equal(response.status, 200);
    assert.equal(lookupUrl.pathname, '/rest/v1/band_members');
    assert.equal(lookupUrl.searchParams.get('phone_normalized'), 'eq.01012345678');
    assert.equal(lookupUrl.searchParams.get('is_active'), 'eq.true');

    const payload = JSON.parse(response.body);
    assert.equal(payload.member, true);
    assert.equal(payload.user.isTargetMember, true);
    assert.equal(response.body.includes('01012345678'), false);
    const tokenPayload = verifyToken(payload.token, SESSION_SECRET, NOW);
    assert.equal(tokenPayload.typ, SESSION_TYPE);
    assert.match(tokenPayload.sub, /^member_[A-Za-z0-9_-]{32}$/);
});

test('an unknown number returns only the join destination', async () => {
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        fetchImpl: async () => jsonResponse([]),
        logger: { error() {} }
    });
    const response = new CapturedResponse();
    await membership.handle(
        request('POST', JSON.stringify({ phone: '01099998888' }), { host: 'creok.example.com' }),
        response,
        new URL('https://creok.example.com/api/band-membership/verify')
    );
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), {
        member: false,
        targetBandUrl: ENV.BAND_MEMBER_TARGET_BAND_URL
    });
});

test('the same phone receives unlinkable random membership sessions', async () => {
    const membership = createBandMembership({
        env: { ...ENV, BAND_MEMBER_RATE_LIMIT_ATTEMPTS: '20' },
        now: () => NOW,
        fetchImpl: async () => jsonResponse([{ phone_normalized: '01012345678' }]),
        logger: { error() {} }
    });
    const subjects = [];
    for (let index = 0; index < 2; index += 1) {
        const response = new CapturedResponse();
        await membership.handle(
            request('POST', JSON.stringify({ phone: '01012345678' }), { host: 'creok.example.com' }),
            response,
            new URL('https://creok.example.com/api/band-membership/verify')
        );
        const payload = JSON.parse(response.body);
        subjects.push(verifyToken(payload.token, SESSION_SECRET, NOW).sub);
        assert.equal(response.body.includes('01012345678'), false);
    }
    assert.notEqual(subjects[0], subjects[1]);
});

test('a zero attempt limit disables throttling during testing', async () => {
    const membership = createBandMembership({
        env: { ...ENV, BAND_MEMBER_RATE_LIMIT_ATTEMPTS: '0' },
        now: () => NOW,
        fetchImpl: async () => jsonResponse([]),
        logger: { error() {} }
    });

    for (let index = 0; index < 12; index += 1) {
        const response = new CapturedResponse();
        await membership.handle(
            request('POST', JSON.stringify({ phone: '01099998888' }), { host: 'creok.example.com' }),
            response,
            new URL('https://creok.example.com/api/band-membership/verify')
        );
        assert.equal(response.status, 200);
    }
});

test('an explicit zero attempt limit also disables throttling on Render', async () => {
    const membership = createBandMembership({
        env: { ...ENV, RENDER: 'true', BAND_MEMBER_RATE_LIMIT_ATTEMPTS: '0' },
        now: () => NOW,
        fetchImpl: async () => jsonResponse([]),
        logger: { error() {} }
    });

    for (let index = 0; index < 121; index += 1) {
        const phone = `010${String(index).padStart(8, '0')}`;
        const response = new CapturedResponse();
        await membership.handle(
            request('POST', JSON.stringify({ phone }), { host: 'creok.example.com' }),
            response,
            new URL('https://creok.example.com/api/band-membership/verify')
        );
        assert.equal(response.status, 200);
    }
});

test('repeated checks for one phone reuse the short membership cache', async () => {
    let fetchCount = 0;
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        fetchImpl: async () => {
            fetchCount += 1;
            return jsonResponse([]);
        },
        logger: { error() {} }
    });

    for (let index = 0; index < 5; index += 1) {
        const response = new CapturedResponse();
        await membership.handle(
            request('POST', JSON.stringify({ phone: '01099998888' }), { host: 'creok.example.com' }),
            response,
            new URL('https://creok.example.com/api/band-membership/verify')
        );
        assert.equal(response.status, 200);
    }
    assert.equal(fetchCount, 1);
});

test('foreign browser origins and missing server credentials are rejected', async () => {
    const configured = createBandMembership({ env: ENV, now: () => NOW, fetchImpl: async () => jsonResponse([]) });
    const foreign = new CapturedResponse();
    await configured.handle(
        request('POST', '{}', { origin: 'https://evil.example.com', host: 'creok.example.com' }),
        foreign,
        new URL('https://creok.example.com/api/band-membership/verify')
    );
    assert.equal(foreign.status, 403);

    const unconfigured = createBandMembership({ env: {}, now: () => NOW, fetchImpl: async () => jsonResponse([]) });
    const response = new CapturedResponse();
    await unconfigured.handle(
        request('POST', '{}'),
        response,
        new URL('https://creok.example.com/api/band-membership/verify')
    );
    assert.equal(response.status, 503);
});

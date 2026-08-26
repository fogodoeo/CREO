'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHmac } = require('node:crypto');
const {
    SESSION_TYPE,
    createBandMembership,
    normalizePhone,
    profileNameCandidates,
    verifyToken
} = require('../band-membership');

const NOW = Date.parse('2026-08-01T00:00:00.000Z');
const SESSION_SECRET = 'member-session-secret-that-is-longer-than-thirty-two-characters';
const ENV = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    BAND_MEMBER_SESSION_SECRET: SESSION_SECRET,
    BAND_MEMBER_TARGET_BAND_URL: 'https://www.band.us/band/101878670/post',
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
    assert.equal(normalizePhone('12345678'), '01012345678');
    assert.equal(normalizePhone('02-1234-5678'), '');
    assert.equal(normalizePhone('0101234567'), '');
});

test('BAND profile candidates preserve the full profile and recover slash-separated names', () => {
    assert.deepEqual(profileNameCandidates('홍길동/서울/12345678'), [
        '홍길동/서울/12345678', '홍길동/서울', '홍길동 서울', '홍길동', '서울'
    ]);
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
    assert.equal(payload.user.memberScoped, true);
    assert.equal(response.body.includes('01012345678'), false);
    const tokenPayload = verifyToken(payload.token, SESSION_SECRET, NOW);
    assert.equal(tokenPayload.typ, SESSION_TYPE);
    assert.match(tokenPayload.sub, /^member_[A-Za-z0-9_-]{32}$/);
    assert.match(tokenPayload.mid, /^member_[A-Za-z0-9_-]{32}$/);
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

test('an authenticated admin can repair a member missed at a deploy boundary', async () => {
    const calls = [];
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        fetchImpl: async (url, options) => {
            calls.push({ url: new URL(url), options });
            return jsonResponse(null, 201);
        },
        logger: { error() {} }
    });

    const unauthorized = new CapturedResponse();
    await membership.handle(
        request('POST', JSON.stringify({ phone: '01022222222', displayName: '테스트' })),
        unauthorized,
        new URL('https://creok.example.com/api/band-membership/admin-sync')
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(calls.length, 0);

    const synced = new CapturedResponse();
    await membership.handle(
        request('POST', JSON.stringify({ phone: '01022222222', displayName: '테스트' }), {
            'x-creo-admin': 'secret'
        }),
        synced,
        new URL('https://creok.example.com/api/band-membership/admin-sync')
    );
    assert.equal(synced.status, 200);
    assert.deepEqual(JSON.parse(synced.body), { ok: true, synced: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.searchParams.get('on_conflict'), 'phone_normalized');
    assert.equal(calls[0].options.method, 'POST');
    const stored = JSON.parse(calls[0].options.body);
    assert.equal(stored.phone_normalized, '01022222222');
    assert.equal(stored.display_name, '테스트');
    assert.equal(stored.is_active, true);

    const verified = new CapturedResponse();
    await membership.handle(
        request('POST', JSON.stringify({ phone: '01022222222' }), { host: 'creok.example.com' }),
        verified,
        new URL('https://creok.example.com/api/band-membership/verify')
    );
    assert.equal(JSON.parse(verified.body).member, true);
    assert.equal(calls.length, 1, 'successful sync should prime the positive lookup cache');
});

test('the same phone keeps a stable anonymous member scope across random sessions', async () => {
    const membership = createBandMembership({
        env: { ...ENV, BAND_MEMBER_RATE_LIMIT_ATTEMPTS: '20' },
        now: () => NOW,
        fetchImpl: async () => jsonResponse([{ phone_normalized: '01012345678' }]),
        logger: { error() {} }
    });
    const subjects = [];
    const memberIds = [];
    for (let index = 0; index < 2; index += 1) {
        const response = new CapturedResponse();
        await membership.handle(
            request('POST', JSON.stringify({ phone: '01012345678' }), { host: 'creok.example.com' }),
            response,
            new URL('https://creok.example.com/api/band-membership/verify')
        );
        const payload = JSON.parse(response.body);
        const session = verifyToken(payload.token, SESSION_SECRET, NOW);
        subjects.push(session.sub);
        memberIds.push(session.mid);
        assert.equal(response.body.includes('01012345678'), false);
    }
    assert.notEqual(subjects[0], subjects[1]);
    assert.equal(memberIds[0], memberIds[1]);
});

test('BAND chat user keys resolve to the same private member scope as phone verification', async () => {
    let fetchCount = 0;
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        fetchImpl: async (url) => {
            fetchCount += 1;
            const query = new URL(url);
            if (query.searchParams.has('display_name')) return jsonResponse([]);
            assert.equal(query.searchParams.get('band_member_key'), 'eq.band-user-123');
            return jsonResponse([{ phone_normalized: '01012345678', band_member_key: 'band-user-123' }]);
        },
        logger: { error() {} }
    });

    const first = await membership.resolveMemberSubject({ bandMemberKey: 'band-user-123', displayName: '홍길동' });
    const second = await membership.resolveMemberSubject({ bandMemberKey: 'band-user-123', displayName: '홍길동' });
    const expected = `member_${createHmac('sha256', SESSION_SECRET)
        .update('band-phone:01012345678')
        .digest('base64url')
        .slice(0, 32)}`;

    assert.equal(first, expected);
    assert.equal(second, expected);
    assert.equal(fetchCount, 2);
    assert.doesNotMatch(first, /01012345678/);
});

test('slash-separated auction profiles resolve through the BAND display name before a fallback key', async () => {
    const lookedUpNames = [];
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        fetchImpl: async (url) => {
            const query = new URL(url);
            const name = query.searchParams.get('display_name')?.replace(/^eq\./, '') || '';
            lookedUpNames.push(name);
            return name === '홍길동'
                ? jsonResponse([{ phone_normalized: '01012345678', display_name: '홍길동' }])
                : jsonResponse([]);
        },
        logger: { error() {} }
    });

    const subject = await membership.resolveMemberSubject({ displayName: '홍길동/서울' });
    const expected = `member_${createHmac('sha256', SESSION_SECRET)
        .update('band-phone:01012345678')
        .digest('base64url')
        .slice(0, 32)}`;
    assert.equal(subject, expected);
    assert.deepEqual(lookedUpNames, ['홍길동/서울', '홍길동 서울', '홍길동']);
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

test('member identity resolves one profile to a phone and fails closed for duplicate profiles', async () => {
    const membership = createBandMembership({
        env: ENV,
        now: () => NOW,
        fetchImpl: async (url) => {
            const query = new URL(url);
            const name = String(query.searchParams.get('display_name') || '').replace(/^eq\./, '');
            if (name === '한명') return jsonResponse([{ phone_normalized: '01012345679', display_name: '한명', band_member_key: 'one' }]);
            if (name === '동명이인') return jsonResponse([
                { phone_normalized: '01011112222', display_name: '동명이인', band_member_key: 'a' },
                { phone_normalized: '01033334444', display_name: '동명이인', band_member_key: 'b' }
            ]);
            return jsonResponse([]);
        },
        logger: { error() {} }
    });
    assert.equal((await membership.resolveMemberIdentity({ displayName: '한명/대구' })).phone, '01012345679');
    assert.equal(await membership.resolveMemberIdentity({ displayName: '동명이인' }), null);
    assert.equal((await membership.resolveMemberIdentity({ phone: '12345678' })).phone, '01012345678');
});

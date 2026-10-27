'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BandMemberDirectory, contactOf } = require('../band-member-directory');
const { createBandMembership } = require('../band-membership');
const NOW = 1793110000000;
const KEY = 'exact_member_key_12345678';
const TOKEN = 'test-token-with-at-least-thirty-two-characters';
const make = options => new BandMemberDirectory({ enabled: true, dbPath: ':memory:', now: () => NOW, token: TOKEN, ...options });
const member = (sources, extra = {}) => ({ bandNo: '104432443', memberKey: KEY, observedAt: NOW, displayName: '업체 이름', sources, ...extra });

test('profile, application answer, verified phone priority; ambiguous source falls back', () => {
    const sources = { profile: { text: '업체 이름' }, answer: { text: '연락처 010-1234-5678 입니다.' }, verified: { text: '01099998888', verified: true } };
    assert.deepEqual(contactOf({ sources }), { phone: '01012345678', source: 'answer' });
    sources.profile.text = '업체 / 010-5555-6666';
    assert.equal(contactOf({ sources }).source, 'profile');
    sources.profile.text = '01011112222 또는 01033334444';
    assert.equal(contactOf({ sources }).source, 'answer');
    sources.answer.text = '';
    assert.equal(contactOf({ sources }).source, 'verified');
    sources.verified.verified = false;
    assert.equal(contactOf({ sources }).phone, '');
    assert.equal(contactOf({ sources: { answer: { text: '가입일 20261028' } } }).phone, '');
    assert.equal(contactOf({ sources: { profile: { text: '김철수01012345678' } } }).phone, '01012345678');
    sources.verified = { text: '12345678', verified: true };
    assert.equal(contactOf({ sources }).phone, '');
});

test('roster and approvals share exact identity; sparse and stale writes preserve evidence', t => {
    const d = make(); t.after(() => d.close());
    d.upsert(member({ answer: { text: '01012345678' } }));
    d.upsert(member({ profile: { text: '판매업체' } }));
    d.upsert(member({ answer: { text: '' } }, { observedAt: NOW - 1000 }));
    assert.equal(d.list().total, 1);
    assert.equal(d.resolve({ bandMemberKey: KEY }).phone, '01012345678');
    assert.equal(d.resolve({ displayName: '판매업체' }), null);
    assert.equal(d.resolve({ bandMemberKey: KEY, bandNo: '101878670' }), null);
    assert.throws(() => d.upsert(member({}, { bandNo: '101878670' })), /wrong_band/);
    d.upsert(member({ answer: { text: '' } }));
    assert.equal(d.resolve({ bandMemberKey: KEY }), null);
});

test('durable claim saves contact before approval; duplicate, uncertain and restart do not resend', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'band-directory-'));
    const options = { dbPath: path.join(dir, 'test.sqlite') };
    let d = make(options);
    t.after(() => { d.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    const request = { applicationId: 'join-1', member: member({ answer: { text: '01012345678' } }) };
    assert.equal(d.claim(request).claimed, true);
    assert.equal(d.list().items[0].phoneSource, 'answer');
    assert.equal(d.resolve({ bandMemberKey: KEY }), null);
    assert.equal(d.claim(request).claimed, false);
    d.close(); d = make(options);
    assert.equal(d.claim(request).claimed, false);
    assert.equal(d.finish({ applicationId: 'join-1', success: false }).state, 'uncertain');
    assert.equal(d.claim(request).claimed, false);
    d.finish({ applicationId: 'join-1', success: true });
    d.finish({ applicationId: 'join-1', success: false });
    assert.equal(d.resolve({ bandMemberKey: KEY }).phone, '01012345678');
    d.claim(request);
    assert.equal(d.resolve({ bandMemberKey: KEY }).phone, '01012345678');
});

test('transaction rollback never leaves a partial member batch or approval claim', t => {
    const d = make(); t.after(() => d.close());
    assert.throws(() => d.transaction(() => { d.upsert(member({ profile: { text: '01012345678' } })); d.upsert(member({}, { bandNo: 'other' })); }));
    assert.equal(d.list().total, 0);
    assert.equal(d.claim({ applicationId: 'no-phone', member: member({ profile: { text: '업체' } }) }).claimed, false);
});

async function call(d, method, pathname, body, authorization = '') {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.method = method; req.headers = { authorization };
    const res = { writeHead(status) { this.status = status; }, end(text) { this.body = JSON.parse(text); } };
    await d.handle(req, res, new URL(pathname, 'https://example.test'));
    return res;
}

test('private directory and scoped bot API reject anonymous access; health never exposes evidence', async t => {
    const d = make({ isAdmin: async () => false }); t.after(() => d.close());
    d.upsert(member({ profile: { text: '01012345678' }, answer: { text: 'private answer' } }));
    assert.equal((await call(d, 'GET', '/api/band-directory/members')).status, 401);
    assert.equal((await call(d, 'GET', '/api/band-directory/members', null, `Bearer ${TOKEN}`)).status, 401);
    assert.equal((await call(d, 'POST', '/api/band-directory/bot/members', { members: [] })).status, 401);
    assert.equal((await call(d, 'POST', '/api/band-directory/bot/members', { members: [] }, `Bearer ${TOKEN}`)).status, 200);
    await call(d, 'POST', '/api/band-directory/bot/heartbeat', { connected: true, state: '01012345678', detail: 'private answer' }, `Bearer ${TOKEN}`);
    assert.doesNotMatch(JSON.stringify(d.status()), /01012345678|private answer|exact_member/);
});

test('auction member resolver uses directory answer phone without name matching or Supabase dependency', async t => {
    const d = make(); t.after(() => d.close());
    d.upsert(member({ answer: { text: '01012345678' } }));
    const service = createBandMembership({ env: { BAND_MEMBER_SESSION_SECRET: TOKEN }, directory: d });
    assert.equal((await service.resolveMemberIdentity({ bandMemberKey: KEY, requireMemberKey: true })).phone, '01012345678');
    assert.equal(await service.resolveMemberIdentity({ displayName: '업체 이름', requireMemberKey: true }), null);
});

test('bot session is encrypted at rest and unavailable to directory readers', async t => {
    const d = make(); t.after(() => d.close());
    d.saveSession({ cookies: [{ domain: '.band.us', name: 'session', value: 'private-cookie' },
        { domain: '.other.test', name: 'exclude', value: 'other-cookie' }], revision: 'v1' });
    assert.doesNotMatch(JSON.stringify(d.getMeta('session')), /private-cookie|other-cookie/);
    assert.equal(d.readSession().cookies.length, 1);
    assert.equal(d.readSession().cookies[0].value, 'private-cookie');
    assert.equal((await call(d, 'GET', '/api/band-directory/bot/session')).status, 401);
    assert.doesNotMatch(JSON.stringify(d.status()), /cookie|session/);
});

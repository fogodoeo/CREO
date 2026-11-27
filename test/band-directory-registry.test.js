'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { BandDirectoryRegistry } = require('../band-directory-registry');
const A = '104432443', B = '105217754';
const TA = 'primary-test-token-01234567890123456789', TB = 'secondary-test-token-01234567890123456789';
const NOW = 1795760000000;
const member = bandNo => ({ bandNo, memberKey: 'same_member_key_12345', observedAt: NOW,
    displayName: 'same name', sources: { answer: { text: '01012345678' } } });
function registry(options = {}) {
    return new BandDirectoryRegistry({ enabled: true, dbPath: ':memory:', now: () => NOW,
        token: TA, secondaryToken: TB, isAdmin: async () => true, ...options });
}
async function call(r, method, url, body, token) {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.method = method; req.headers = { authorization: token ? `Bearer ${token}` : '' };
    const res = { writeHead(status) { this.status = status; }, end(s) { this.body = JSON.parse(s); } };
    await r.handle(req, res, new URL(url, 'https://test.invalid'));
    return res;
}
test('band records, metadata, encrypted sessions and duplicate claims remain isolated across restart', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'band-registry-'));
    const options = { dbPath: path.join(dir, 'test.sqlite') };
    let r = registry(options);
    t.after(() => { r.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    const a = r.directories.get(A), b = r.directories.get(B);
    a.setMeta('rosterProgress', { complete: true });
    b.setMeta('rosterProgress', { complete: false });
    a.saveSession({ revision: 'v1', cookies: [{ domain: '.band.us', name: 'test', value: 'first' }] });
    assert.deepEqual(b.readSession(), {});
    b.saveSession({ revision: 'v1', cookies: [{ domain: '.band.us', name: 'test', value: 'second' }] });
    for (const d of [a,b]) {
        const req = { applicationId: 'same-application', member: member(d.bandNo) };
        assert.equal(d.claim(req).claimed, true);
        assert.equal(d.claim(req).claimed, false);
    }
    a.finish({ applicationId: 'same-application', success: true });
    assert.ok(r.resolve({ bandMemberKey: member(A).memberKey }));
    assert.equal(r.resolve({ bandNo: B, bandMemberKey: member(B).memberKey }), null);
    r.close(); r = registry(options);
    assert.equal(r.directories.get(A).getMeta('rosterProgress').complete, true);
    assert.equal(r.directories.get(B).getMeta('rosterProgress').complete, false);
    assert.equal(r.directories.get(A).readSession().cookies[0].value, 'first');
    assert.equal(r.directories.get(B).readSession().cookies[0].value, 'second');
    assert.equal(r.directories.get(B).claim({ applicationId: 'same-application', member: member(B) }).claimed, false);
    assert.equal(r.directories.get(A).list().total, 1);
    assert.equal(r.directories.get(B).list().total, 1);
});
test('band routes require their own token and reject unknown bands and mixed batches', async t => {
    const r = registry({ isAdmin: async () => false }); t.after(() => r.close());
    assert.equal((await call(r, 'GET', '/api/band-directory/bands')).status, 401);
    assert.equal((await call(r, 'POST', `/api/band-directory/bot/members?bandNo=${B}`, { members: [member(B)] }, TA)).status, 401);
    assert.equal((await call(r, 'POST', '/api/band-directory/bot/members', { members: [member(A)] }, TB)).status, 401);
    assert.equal((await call(r, 'POST', `/api/band-directory/bot/members?bandNo=${B}`, { members: [member(B),member(A)] }, TB)).status, 400);
    assert.equal(r.directories.get(B).list().total, 0);
    assert.equal((await call(r, 'POST', `/api/band-directory/bot/members?bandNo=${B}`, { members: [member(B)] }, TB)).status, 200);
    assert.equal((await call(r, 'GET', '/api/band-directory/status?bandNo=999')).status, 404);
    assert.equal((await call(r, 'GET', `/api/band-directory/members?bandNo=${B}`, null, TB)).status, 401);
});
test('simultaneous reads stay scoped and the legacy default remains the original band', async t => {
    const r = registry(); t.after(() => r.close());
    r.directories.get(B).upsert(member(B));
    const [a,b,list] = await Promise.all([
        call(r,'GET','/api/band-directory/members'),
        call(r,'GET',`/api/band-directory/members?bandNo=${B}`),
        call(r,'GET','/api/band-directory/bands')
    ]);
    assert.equal(a.body.total, 0); assert.equal(a.body.bandNo, A);
    assert.equal(b.body.total, 1); assert.equal(b.body.bandNo, B);
    assert.equal(list.body.bands.length, 2);
    assert.equal(r.status().bandNo, A);
});
test('unconfigured additional worker never inherits the original worker token', async t => {
    const r = registry({ secondaryToken: '', env: { BAND_DIRECTORY_BOT_TOKEN: TA } });
    t.after(() => r.close());
    assert.equal(r.directories.get(B).token, '');
    assert.equal((await call(r, 'POST', `/api/band-directory/bot/members?bandNo=${B}`, { members: [member(B)] }, TA)).status, 401);
});

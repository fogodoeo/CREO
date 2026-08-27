'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createBroadcastAssetApi, parseRange } = require('../broadcast-asset-api');
const { BroadcastAssetStorage } = require('../broadcast-asset-storage');

class ResponseCapture {
    writeHead(status, headers) { this.status = status; this.headers = headers; }
    end(body = '') { this.body = Buffer.isBuffer(body) ? body.toString('utf8') : String(body); }
    json() { return JSON.parse(this.body || '{}'); }
}

function request(method, body, authenticated = true) {
    const stream = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    stream.method = method;
    stream.headers = authenticated ? { 'x-creo-admin': 'secret' } : {};
    return stream;
}

async function call(api, method, pathname, body, authenticated = true) {
    const response = new ResponseCapture();
    await api.handle(request(method, body, authenticated), response, new URL(`https://creo.test${pathname}`));
    return response;
}

test('admin uploads an MP4 banner and receives its public URL', async () => {
    const saved = [];
    const storage = {
        async put(channelId, fileName, buffer, mimeType) {
            saved.push({ channelId, fileName, buffer: Buffer.from(buffer), mimeType });
            return { backend: 'supabase', url: `https://cdn.test/${channelId}/${fileName}` };
        },
        async localFile() { return null; }
    };
    const api = createBroadcastAssetApi({
        storage,
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { error() {} }
    });
    const bytes = Buffer.from('small-mp4-test');

    const response = await call(api, 'POST', '/api/broadcast-assets/crewart', {
        mimeType: 'video/mp4',
        dataBase64: bytes.toString('base64')
    });

    assert.equal(response.status, 201);
    assert.match(response.json().url, /^https:\/\/cdn\.test\/crewart\/.+\.mp4$/);
    assert.equal(response.json().bytes, bytes.length);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].channelId, 'crewart');
    assert.equal(saved[0].mimeType, 'video/mp4');
    assert.deepEqual(saved[0].buffer, bytes);
});

test('banner uploads require admin auth and accept MOV while rejecting unsupported media', async () => {
    const storage = { async put() { throw new Error('must not upload'); }, async localFile() { return null; } };
    const api = createBroadcastAssetApi({ storage, isAdmin: async () => false, logger: { error() {} } });
    let response = await call(api, 'POST', '/api/broadcast-assets/crewart', {
        mimeType: 'video/mp4', dataBase64: Buffer.from('x').toString('base64')
    }, false);
    assert.equal(response.status, 401);

    const saved = [];
    const adminApi = createBroadcastAssetApi({ storage: { async put(...args) { saved.push(args); return { url: 'https://cdn.test/sample.mov' }; }, async localFile() { return null; } }, isAdmin: async () => true, logger: { error() {} } });
    response = await call(adminApi, 'POST', '/api/broadcast-assets/crewart', {
        mimeType: 'video/quicktime', dataBase64: Buffer.from('x').toString('base64')
    });
    assert.equal(response.status, 201);
    assert.match(saved[0][1], /\.mov$/);
    assert.equal(saved[0][3], 'video/quicktime');
    response = await call(adminApi, 'POST', '/api/broadcast-assets/crewart', {
        mimeType: 'application/pdf', dataBase64: Buffer.from('x').toString('base64')
    });
    assert.equal(response.status, 400);
});

test('local banner storage persists by channel and supports byte ranges', async (t) => {
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-banners-'));
    t.after(() => fs.rm(localDir, { recursive: true, force: true }));
    const storage = new BroadcastAssetStorage({ supabaseUrl: '', serviceKey: '', localDir });
    const bytes = Buffer.from('0123456789');
    const saved = await storage.put('crewart', 'sample.mp4', bytes, 'video/mp4');
    assert.equal(saved.url, '/api/broadcast-assets/crewart/sample.mp4');
    const found = await storage.localFile('crewart', 'sample.mp4');
    assert.equal(found.stat.size, bytes.length);
    assert.deepEqual(parseRange('bytes=2-5', bytes.length), { start: 2, end: 5 });
    assert.deepEqual(parseRange('bytes=-3', bytes.length), { start: 7, end: 9 });
});

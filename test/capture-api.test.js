'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createCaptureApi, captureIdFor } = require('../capture-api');

class MemoryRepository {
    constructor() { this.records = new Map(); this.active = 'cdcup'; }
    key(channel, type, id) { return `${channel}:${type}:${id}`; }
    async getRecord(channel, type, id) { return structuredClone(this.records.get(this.key(channel, type, id)) || null); }
    async listRecords(channel, type) {
        return [...this.records.entries()]
            .filter(([key]) => key.startsWith(`${channel}:${type}:`))
            .map(([, value]) => structuredClone(value));
    }
    async upsertRecord(channel, type, value) {
        const now = new Date().toISOString();
        const record = { ...value, channelId: channel, updatedAt: now, createdAt: value.createdAt || now };
        this.records.set(this.key(channel, type, value.id), record);
        return structuredClone(record);
    }
    async deleteRecord(channel, type, id) { this.records.delete(this.key(channel, type, id)); }
    async getActiveChannel() { return this.active; }
}

class MemoryStorage {
    constructor() { this.objects = new Map(); }
    health() { return { backend: 'memory' }; }
    async put(path, buffer, mimeType) { this.objects.set(path, { buffer: Buffer.from(buffer), mimeType }); }
    async get(path) { return this.objects.get(path)?.buffer || null; }
    async delete(path) { this.objects.delete(path); }
}

class ResponseCapture {
    writeHead(status, headers) { this.status = status; this.headers = headers; }
    end(body = '') { this.rawBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body)); }
    json() { return JSON.parse((this.rawBody || Buffer.from('{}')).toString('utf8')); }
}

function request(method, body, authenticated = true) {
    const stream = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    stream.method = method;
    stream.headers = { host: 'creo.test', 'x-forwarded-proto': 'https', ...(authenticated ? { 'x-creo-admin': 'secret' } : {}) };
    return stream;
}

async function call(api, method, pathname, body, authenticated = true) {
    const response = new ResponseCapture();
    await api.handleApi(request(method, body, authenticated), response, new URL(`https://creo.test${pathname}`));
    return response;
}

test('capture job is leased, uploaded, listed and served by item id', async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    const api = createCaptureApi({
        repository,
        storage,
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { warn() {} }
    });

    let response = await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'cdcup', itemId: 'item_17', itemNumber: 17, itemName: '테스트 개체', vendorName: '테스트 업체', eventKey: 'event-1'
    });
    assert.equal(response.status, 201);
    const jobId = response.json().job.id;
    assert.equal(jobId, captureIdFor('cdcup', 'item_17'));

    response = await call(api, 'POST', '/api/capture/jobs/next', { channelId: 'cdcup', agentId: 'main-pc' });
    assert.equal(response.status, 200);
    assert.equal(response.json().job.status, 'capturing');
    assert.equal(response.json().job.itemId, 'item_17');

    const bytes = Buffer.from('fake-webp-image');
    response = await call(api, 'POST', `/api/capture/jobs/${jobId}/upload`, {
        channelId: 'cdcup', mimeType: 'image/webp', imageBase64: bytes.toString('base64'), width: 1280, height: 720
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().capture.status, 'complete');
    assert.equal(response.json().capture.bytes, bytes.length);
    assert.match(response.json().capture.shareUrl, /^https:\/\/creo\.test\/capture\/cdcup\//);

    const listed = await call(api, 'GET', '/api/capture/channel/cdcup', null, false);
    assert.equal(listed.status, 200);
    assert.equal(listed.json().captures[0].itemId, 'item_17');
    const imageUrl = new URL(listed.json().captures[0].imageUrl);
    const image = await call(api, 'GET', imageUrl.pathname, null, false);
    assert.equal(image.status, 200);
    assert.equal(image.headers['Content-Type'], 'image/webp');
    assert.deepEqual(image.rawBody, bytes);

    const removed = await call(api, 'DELETE', `/api/capture/channel/cdcup/${jobId}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.json().deleted, true);
    assert.equal((await repository.listRecords('cdcup', 'capture')).length, 0);
    assert.equal(storage.objects.size, 0);
});

test('capture endpoints reject unauthenticated job creation and support idempotent events', async () => {
    const repository = new MemoryRepository();
    const api = createCaptureApi({
        repository,
        storage: new MemoryStorage(),
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { warn() {} }
    });
    const body = { channelId: 'cdcup', itemId: '42', itemName: '개체', eventKey: 'same-event' };
    const denied = await call(api, 'POST', '/api/capture/jobs', body, false);
    assert.equal(denied.status, 401);
    const first = await call(api, 'POST', '/api/capture/jobs', body);
    const duplicate = await call(api, 'POST', '/api/capture/jobs', body);
    assert.equal(first.status, 201);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.json().duplicate, true);
    assert.equal((await repository.listRecords('cdcup', 'capture')).length, 1);
});

test('sold capture skips an existing manual capture instead of overwriting it', async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    const api = createCaptureApi({
        repository,
        storage,
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { warn() {} }
    });

    let response = await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'cdcup', itemId: 'manual_7', itemName: '수동 캡처 개체', eventKey: 'manual-1'
    });
    const jobId = response.json().job.id;
    await call(api, 'POST', '/api/capture/jobs/next', { channelId: 'cdcup', agentId: 'main-pc' });
    response = await call(api, 'POST', `/api/capture/jobs/${jobId}/upload`, {
        channelId: 'cdcup', mimeType: 'image/webp', imageBase64: Buffer.from('manual-image').toString('base64')
    });
    assert.equal(response.json().capture.status, 'complete');

    response = await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'cdcup', itemId: 'manual_7', itemName: '수동 캡처 개체', eventKey: 'sold-1', skipIfCaptured: true
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().skipped, true);
    assert.equal(response.json().reason, 'existing-capture');
    assert.equal(response.json().job.status, 'complete');
    assert.equal((await storage.get('cdcup/' + jobId + '.webp')).toString(), 'manual-image');
});

test('auto channel follows the active auction and only the selected computer leases jobs', async () => {
    const repository = new MemoryRepository();
    repository.active = 'event-night';
    const api = createCaptureApi({
        repository,
        storage: new MemoryStorage(),
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { warn() {} }
    });

    let response = await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'auto', itemId: 'event_1', itemName: '첫 개체', eventKey: 'event-1'
    });
    assert.equal(response.status, 201);
    assert.equal(response.json().job.channelId, 'event-night');

    response = await call(api, 'POST', '/api/capture/jobs/next', {
        channelId: 'auto', agentId: 'pc-a-id', agentName: '방송 본체 A'
    });
    assert.equal(response.json().active, true);
    assert.equal(response.json().job.channelId, 'event-night');

    await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'auto', itemId: 'event_2', itemName: '둘째 개체', eventKey: 'event-2'
    });
    response = await call(api, 'POST', '/api/capture/jobs/next', {
        channelId: 'auto', agentId: 'pc-b-id', agentName: '예비 본체 B'
    });
    assert.equal(response.json().active, false);
    assert.equal(response.json().job, null);

    response = await call(api, 'POST', '/api/capture/agents/activate', {
        channelId: 'auto', agentId: 'pc-b-id', agentName: '예비 본체 B'
    });
    assert.equal(response.json().active, true);
    assert.equal(response.json().channelId, 'event-night');
    response = await call(api, 'POST', '/api/capture/jobs/next', {
        channelId: 'auto', agentId: 'pc-b-id', agentName: '예비 본체 B'
    });
    assert.equal(response.json().job.itemId, 'event_2');
    assert.equal(response.json().activeAgentId, 'pc-b-id');
});

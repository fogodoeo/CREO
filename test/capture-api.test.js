'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createCaptureApi, captureIdFor } = require('../capture-api');

class MemoryRepository {
    constructor() {
        this.records = new Map();
        this.active = 'cdcup';
        this.catalog = { version: 1, channels: [
            { id: 'cdcup', status: 'active' },
            { id: 'event-night', status: 'active' }
        ] };
    }
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
    async getCatalog() { return structuredClone(this.catalog); }
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

test('R2 capture redirect is available only after channel and share-token validation', async () => {
    const repository = new MemoryRepository(), reads = [];
    await repository.upsertRecord('cdcup', 'capture', { id: 'private-capture', status: 'complete',
        shareToken: 'existing-share-token-12345', objectPath: 'cdcup/private.webp', itemNumber: 7 });
    const api = createCaptureApi({ repository, storage: {
        async view(object, options) { reads.push({ object, options }); return 'https://media.example.test/private?signature=temporary'; },
        async get() { throw Error('must not proxy image bytes'); }
    }, isAdmin: () => false });
    for (const path of ['/api/capture/image/cdcup/wrong-token', '/api/capture/image/event-night/existing-share-token-12345']) {
        assert.equal((await call(api, 'GET', path, null, false)).status, 404);
    }
    assert.equal(reads.length, 0);
    const response = await call(api, 'GET', '/api/capture/image/cdcup/existing-share-token-12345?download=1', null, false);
    assert.equal(response.status, 307); assert.match(response.headers.Location, /signature=temporary/);
    assert.equal(reads[0].options.download, 'capture-7-private-capture.webp');
    assert.equal(response.rawBody.length, 0);
});

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

async function confirmationFixture() {
    const repository = new MemoryRepository(), storage = new MemoryStorage();
    await repository.upsertRecord('cdcup', 'item', { id: 'item_1', lotNumber: 1, name: '확인 개체', status: 'live' });
    await repository.upsertRecord('cdcup', 'broadcast', { id: 'state', mode: 'live', activeItemId: 'item_1', buyerPhone: 'private-data' });
    const api = createCaptureApi({ repository, storage, isAdmin: req => req.headers['x-creo-admin'] === 'secret', logger: { warn() {} } });
    const image = await require('sharp')({ create: { width: 16, height: 12, channels: 3, background: '#96cc7c' } }).webp().toBuffer();
    const body = { channelId: 'cdcup', itemId: 'item_1', confirmationId: 'confirmation-id-0001', mimeType: 'image/webp', imageBase64: image.toString('base64') };
    return { repository, storage, api, body };
}

test('capture context is compact, authenticated and follows active item/channel lifecycle', async () => {
    const f = await confirmationFixture();
    assert.equal((await call(f.api, 'GET', '/api/capture/context', null, false)).status, 401);
    const response = await call(f.api, 'GET', '/api/capture/context');
    assert.equal(response.json().context.itemId, 'item_1'); assert.equal(response.json().context.running, true);
    assert.ok(response.rawBody.length < 1000); assert.ok(!response.rawBody.toString().includes('private-data'));
    await f.repository.upsertRecord('cdcup', 'broadcast', { id: 'state', mode: 'sold', activeItemId: 'item_1' });
    assert.equal((await call(f.api, 'GET', '/api/capture/context')).json().context.running, false);
    f.repository.active = 'event-night';
    assert.equal((await call(f.api, 'GET', '/api/capture/context')).json().context.itemId, '');
    assert.equal((await call(f.api, 'GET', '/api/capture/agent-check')).json().confirmationProtocol, 1);
});

test('confirmed capture is idempotent concurrently and late legacy writes cannot overwrite it', async () => {
    const f = await confirmationFixture();
    const responses = await Promise.all([call(f.api, 'POST', '/api/capture/confirmed', f.body), call(f.api, 'POST', '/api/capture/confirmed', f.body)]);
    assert.deepEqual(responses.map(row => row.status), [200, 200]); assert.equal(responses[1].json().duplicate, true);
    assert.equal(f.storage.objects.size, 1);
    const capture = responses[0].json().capture; assert.equal(capture.confirmed, true); assert.equal(capture.width, 16);
    const legacy = await call(f.api, 'POST', `/api/capture/jobs/${capture.id}/upload`, { channelId: 'cdcup', mimeType: 'image/webp', imageBase64: Buffer.from('late frame').toString('base64') });
    assert.equal(legacy.json().reason, 'confirmed-capture');
    const failed = await call(f.api, 'POST', `/api/capture/jobs/${capture.id}/fail`, { channelId: 'cdcup', error: 'late failure' });
    assert.equal(failed.json().capture.status, 'complete');
    const sold = await call(f.api, 'POST', '/api/capture/jobs', { channelId: 'cdcup', itemId: 'item_1', eventKey: 'sold-event' });
    assert.equal(sold.json().reason, 'confirmed-capture');
    const stored = await f.repository.getRecord('cdcup', 'capture', capture.id);
    assert.equal(stored.confirmationId, f.body.confirmationId); assert.equal(f.storage.objects.size, 1);
});

test('retake requires previous confirmation and stale retries cannot overwrite newer confirmation after restart', async () => {
    const f = await confirmationFixture();
    await call(f.api, 'POST', '/api/capture/confirmed', f.body);
    const next = { ...f.body, confirmationId: 'confirmation-id-0002' };
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', next)).status, 409);
    next.previousConfirmationId = f.body.confirmationId;
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', next)).status, 200); assert.equal(f.storage.objects.size, 1);
    const restarted = createCaptureApi({ repository: f.repository, storage: f.storage, isAdmin: () => true, logger: { warn() {} } });
    assert.equal((await call(restarted, 'POST', '/api/capture/confirmed', f.body)).status, 409);
    assert.equal((await call(restarted, 'POST', '/api/capture/confirmed', next)).json().duplicate, true);
});

test('confirmed image validation and fixed channel protect against malformed or misassigned frames', async () => {
    const f = await confirmationFixture();
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', f.body, false)).status, 401);
    for (const patch of [{ channelId: 'auto' }, { itemId: '' }, { confirmationId: 'short' }, { mimeType: 'image/jpeg' }, { imageBase64: Buffer.from('bad-image').toString('base64') }]) {
        assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', { ...f.body, ...patch })).status, 400);
    }
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', { ...f.body, channelId: 'event-night' })).status, 404);
    f.repository.active = 'event-night';
    const result = await call(f.api, 'POST', '/api/capture/confirmed', f.body);
    assert.equal(result.status, 200); assert.equal(result.json().capture.channelId, 'cdcup');
});

test('failed replacement storage or repository write preserves the prior confirmed frame and allows recovery', async () => {
    const f = await confirmationFixture();
    const first = (await call(f.api, 'POST', '/api/capture/confirmed', f.body)).json().capture;
    const next = { ...f.body, confirmationId: 'confirmation-id-0002', previousConfirmationId: f.body.confirmationId };
    const put = f.storage.put.bind(f.storage); f.storage.put = async () => { throw Error('storage offline'); };
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', next)).status, 500); f.storage.put = put;
    const upsert = f.repository.upsertRecord.bind(f.repository); f.repository.upsertRecord = async () => { throw Error('disk full'); };
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', next)).status, 500); f.repository.upsertRecord = upsert;
    assert.equal((await f.repository.getRecord('cdcup', 'capture', first.id)).confirmationId, f.body.confirmationId);
    assert.equal(f.storage.objects.size, 1);
    assert.equal((await call(f.api, 'POST', '/api/capture/confirmed', next)).status, 200); assert.equal(f.storage.objects.size, 1);
});

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
    const download = await call(api, 'GET', `${imageUrl.pathname}?download=1`, null, false);
    assert.match(download.headers['Content-Disposition'], /^attachment; filename="capture-17-/);

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

test('capture mutations reject unknown channels instead of creating orphan channel data', async () => {
    const repository = new MemoryRepository();
    const api = createCaptureApi({
        repository,
        storage: new MemoryStorage(),
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { warn() {} }
    });
    const response = await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'deleted-channel', itemId: 'orphan_1', itemName: '고아 작업'
    });
    assert.equal(response.status, 400);
    assert.equal(repository.records.size, 0);
});

test('capture completion stays bound to the leased channel across an active-channel switch', async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    const api = createCaptureApi({
        repository,
        storage,
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        logger: { warn() {} }
    });
    let response = await call(api, 'POST', '/api/capture/jobs', {
        channelId: 'cdcup', itemId: 'switch_1', itemName: '전환 작업', eventKey: 'switch-event'
    });
    const jobId = response.json().job.id;
    await call(api, 'POST', '/api/capture/jobs/next', { channelId: 'cdcup', agentId: 'main-pc' });

    repository.active = 'event-night';
    response = await call(api, 'POST', `/api/capture/jobs/${jobId}/upload`, {
        channelId: 'cdcup', mimeType: 'image/webp', imageBase64: Buffer.from('bound-image').toString('base64')
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().capture.channelId, 'cdcup');
    assert.ok(storage.objects.has(`cdcup/${jobId}.webp`));
    assert.equal((await repository.listRecords('event-night', 'capture')).length, 0);

    response = await call(api, 'POST', `/api/capture/jobs/${jobId}/fail`, { channelId: 'auto', error: 'late failure' });
    assert.equal(response.status, 400);
    assert.equal((await repository.getRecord('cdcup', 'capture', jobId)).status, 'complete');
});

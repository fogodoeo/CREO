'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createGateway } = require('../gateway-server');

async function listen(server, port = 0) {
    server.listen(port, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { if (server.listening) await new Promise(resolve => server.close(resolve)); }
async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-gateway-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    for (const name of ['index.html', 'buyer-shipping.html', 'vendor-checkout.html', 'organizer-shipping.html', 'checkout-changes.html']) {
        await fs.writeFile(path.join(root, name), name);
    }
    const received = [];
    const core = http.createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        received.push({ url: req.url, method: req.method, body: Buffer.concat(chunks).toString(), headers: req.headers });
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'test=1; HttpOnly' });
        res.end(JSON.stringify({ stored: received.length }));
    });
    const backendUrl = await listen(core); t.after(() => close(core));
    const options = { publicDir: root, backendUrl, publicOrigin: 'https://creok.onrender.com' };
    const gateway = createGateway(options);
    const url = await listen(gateway); t.after(() => close(gateway));
    return { root, core, gateway, url, options, received };
}

test('gateway preserves existing shortlinks and does not expose backend credentials', async t => {
    const { url, received } = await fixture(t);
    for (const [route, file] of [['/', 'index.html'], ['/d/abcdefghijk', 'buyer-shipping.html'],
        ['/s/abcdefghijk', 'buyer-shipping.html'], ['/v/abcdefghijk', 'vendor-checkout.html'],
        ['/w/abcdefghijk', 'vendor-checkout.html'], ['/w/op_abcdefghijklmnop', 'checkout-changes.html'],
        ['/o/abcdefghijklmnopqrstuvwx', 'organizer-shipping.html']]) {
        const response = await fetch(url + route);
        assert.equal(await response.text(), file);
        assert.equal(response.headers.get('cache-control'), 'no-cache');
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    }
    assert.equal(received.length, 0);
    assert.equal((await fetch(url + '/.env')).status, 400);
    assert.equal((await fetch(url + '/%5c..%5c.env')).status, 400);
});

test('API writes, authentication and public origin survive the gateway exactly once', async t => {
    const { url, received } = await fixture(t);
    const response = await fetch(url + '/api/platform/channels/qa/items/one?version=2', {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-creo-admin': 'test-secret',
            'x-forwarded-host': 'untrusted.example' }, body: JSON.stringify({ name: '수정 개체' })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), 'test=1; HttpOnly');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(received.length, 1);
    assert.equal(received[0].body, JSON.stringify({ name: '수정 개체' }));
    assert.equal(received[0].headers['x-creo-admin'], 'test-secret');
    assert.equal(received[0].headers['x-forwarded-host'], 'creok.onrender.com');
    assert.equal(received[0].headers['x-forwarded-proto'], 'https');
    assert.equal(received[0].url, '/api/platform/channels/qa/items/one?version=2');
});

test('web-only restart leaves the core running and new UI reuses the same API records', async t => {
    const { root, gateway, options, url, core, received } = await fixture(t);
    await fetch(url + '/api/qa/result', { method: 'POST', body: 'first' });
    const port = gateway.address().port;
    await close(gateway);
    await fs.writeFile(path.join(root, 'index.html'), 'web release 2');
    assert.equal(core.listening, true);
    assert.equal((await fetch(options.backendUrl + '/health')).status, 200);
    const replacement = createGateway(options); t.after(() => close(replacement));
    await listen(replacement, port);
    assert.equal(await (await fetch(url + '/')).text(), 'web release 2');
    await fetch(url + '/api/qa/result', { method: 'POST', body: 'second' });
    assert.deepEqual(received.filter(r => r.method === 'POST').map(r => r.body), ['first', 'second']);
});

test('core outage gives an explicit API error, keeps page shells available and never retries a write', async t => {
    const { core, url, received } = await fixture(t);
    await close(core);
    assert.equal((await fetch(url + '/d/abcdefghijk')).status, 200);
    const response = await fetch(url + '/api/qa/result', { method: 'POST', body: 'not-confirmed' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'BACKEND_UNAVAILABLE');
    assert.equal(received.length, 0);
});

test('banner byte ranges and cache validation work without loading auction data', async t => {
    const { url, root, received } = await fixture(t);
    await fs.writeFile(path.join(root, 'banner.mp4'), '0123456789');
    const response = await fetch(url + '/banner.mp4', { headers: { Range: 'bytes=2-5' } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await response.text(), '2345');
    const cached = await fetch(url + '/banner.mp4', { headers: { 'If-None-Match': response.headers.get('etag') } });
    assert.equal(cached.status, 304);
    assert.equal((await fetch(url + '/banner.mp4', { headers: { Range: 'bytes=100-200' } })).status, 416);
    assert.equal(received.length, 0);
});

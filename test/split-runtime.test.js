'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createGateway } = require('../gateway-server');

async function listen(server, port = 0) {
    server.listen(port, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { if (server.listening) await new Promise(resolve => server.close(resolve)); }
async function freePort() {
    const server = http.createServer(); await listen(server);
    const port = server.address().port; await close(server); return port;
}
async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, 'exit'); child.kill(); await ended;
}
async function ready(url, child) {
    for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw new Error('Isolated core exited before readiness');
        try { const response = await fetch(url + '/health'); if (response.ok) return response.json(); } catch { /* startup */ }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Isolated core readiness timeout');
}

test('real core and web gateway preserve short links, admin sessions and stored data through UI restart and rollback', async t => {
    const root = path.join(__dirname, '..');
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-split-isolated-'));
    const corePort = await freePort(), webPort = await freePort();
    const coreUrl = `http://127.0.0.1:${corePort}`, webUrl = `http://127.0.0.1:${webPort}`;
    // Blank every project/env setting before loading server.js: never use real secrets or records.
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(CREO_|SUPABASE_|ALIGO_|BAND_|GOOGLE_)/.test(key)) env[key] = '';
    const localEnv = await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => '');
    for (const line of localEnv.split(/\r?\n/)) {
        const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line); if (match) env[match[1]] = '';
    }
    Object.assign(env, { PORT: String(corePort), HOST: '127.0.0.1', CREO_DATA_DIR: data,
        CREO_SUPABASE_MIRROR_ENABLED: 'false', CREO_ADMIN_SECRET: 'isolated-split-secret',
        ALIGO_TEST_MODE: 'Y', BAND_MONITOR_ENABLED: 'false', CREO_FRONTEND_ORIGIN: webUrl });
    let child, web;
    const startCore = () => spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'ignore' });
    t.after(async () => { if (web) await close(web); if (child) await stop(child); await fs.rm(data, { recursive: true, force: true }); });
    child = startCore();
    const health = await ready(coreUrl, child);
    assert.equal(health.checkoutNotifications.testMode, true);
    assert.equal(health.platform.durable, true);
    const options = { backendUrl: coreUrl, publicOrigin: 'https://creok.onrender.com' };
    web = createGateway(options); await listen(web, webPort);

    for (const route of ['/d/abcdefghijk?v=2', '/w/abcdefghijk', '/o/abcdefghijklmnopqrstuvwx', '/?channel=crewart']) {
        const redirect = await fetch(coreUrl + route, { redirect: 'manual' });
        assert.equal(redirect.status, 307);
        assert.equal(redirect.headers.get('location'), webUrl + route);
        const page = await fetch(coreUrl + route);
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-type'), /text\/html/);
    }
    const login = await fetch(webUrl + '/api/platform/auth/login', { method: 'POST',
        headers: { 'content-type': 'application/json', origin: webUrl }, body: JSON.stringify({ password: 'isolated-split-secret' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { cookie, 'content-type': 'application/json', origin: webUrl };
    assert.match(await (await fetch(webUrl+'/main')).text(),/operator-login/);
    assert.match(await (await fetch(webUrl+'/main',{headers})).text(),/quick-workspace/);
    assert.equal((await fetch(webUrl + '/api/platform/admin-check', { headers })).status, 200);
    const configPath = '/api/platform/channels/crewart/broadcast-config';
    const save = await fetch(webUrl + configPath, { method: 'PUT', headers, body: JSON.stringify({ patch: { splitRuntimeTest: 'verified' } }) });
    assert.equal(save.status, 200);
    assert.equal((await save.json()).config.splitRuntimeTest, 'verified');

    const pid = child.pid;
    await close(web);
    assert.equal((await fetch(coreUrl + '/health')).status, 200);
    web = createGateway(options); await listen(web, webPort);
    assert.equal(child.pid, pid);
    assert.equal((await fetch(webUrl + '/api/platform/admin-check', { headers })).status, 200);
    assert.equal((await (await fetch(webUrl + configPath)).json()).config.splitRuntimeTest, 'verified');
    const media = await fetch(webUrl + '/assets/crewarts-sealing-wax.mp4', { headers: { range: 'bytes=0-99' } });
    assert.equal(media.status, 206); assert.equal((await media.arrayBuffer()).byteLength, 100);
    const wasm = await fetch(webUrl + '/roulette/');
    assert.equal(wasm.status, 200);

    // Unset the single switch: the old core serves pages and the same SQLite state.
    await stop(child); env.CREO_FRONTEND_ORIGIN = ''; child = startCore(); await ready(coreUrl, child);
    assert.equal((await fetch(coreUrl + '/d/abcdefghijk', { redirect: 'manual' })).status, 200);
    assert.equal((await (await fetch(coreUrl + configPath)).json()).config.splitRuntimeTest, 'verified');
});

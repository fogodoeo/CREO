'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForHealth(url, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw lastError || new Error('server did not become ready');
}

test('HTTP server exposes the landing page, health, and OAuth config', async (t) => {
    const port = await freePort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    t.after(() => child.kill());

    const healthResponse = await waitForHealth(`http://127.0.0.1:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.service, 'creo');

    const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(homeResponse.status, 200);
    assert.match(await homeResponse.text(), /CREO/);

    const configResponse = await fetch(`http://127.0.0.1:${port}/api/band-oauth/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.configured, false);
    assert.equal(config.targetBandNo, '101005857');
});

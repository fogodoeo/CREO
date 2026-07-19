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

test('HTTP server exposes the CREO hub, survey assets, health, and OAuth config', async (t) => {
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
    assert.equal(health.publicSiteReady, true);

    const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(homeResponse.status, 200);
    assert.match(await homeResponse.text(), /CREO/);

    const surveyResponse = await fetch(`http://127.0.0.1:${port}/crewart-survey.html`);
    assert.equal(surveyResponse.status, 200);
    assert.match(surveyResponse.headers.get('content-type'), /^text\/html/);
    assert.match(await surveyResponse.text(), /CREWARTS PERSONALITY TEST/);

    const scriptResponse = await fetch(`http://127.0.0.1:${port}/crewart-survey.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get('content-type'), /^text\/javascript/);
    assert.match(scriptResponse.headers.get('cache-control'), /max-age=86400/);

    const videoResponse = await fetch(`http://127.0.0.1:${port}/assets/crewarts-sealing-wax.mp4`, {
        headers: { Range: 'bytes=0-99' }
    });
    assert.equal(videoResponse.status, 206);
    assert.equal(videoResponse.headers.get('content-length'), '100');
    assert.match(videoResponse.headers.get('content-range'), /^bytes 0-99\//);
    assert.equal((await videoResponse.arrayBuffer()).byteLength, 100);

    const configResponse = await fetch(`http://127.0.0.1:${port}/api/band-oauth/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.configured, false);
    assert.equal(config.targetBandNo, '101992972');
});

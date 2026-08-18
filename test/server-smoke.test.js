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

test('HTTP server exposes the CREO hub, survey assets, health, and membership config', async (t) => {
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
    assert.match(await surveyResponse.text(), /크레와트 성향 테스트/);

    const rouletteResponse = await fetch(`http://127.0.0.1:${port}/roulette/`);
    assert.equal(rouletteResponse.status, 200);
    assert.match(rouletteResponse.headers.get('content-type'), /^text\/html/);
    const rouletteHtml = await rouletteResponse.text();
    assert.match(rouletteHtml, /MARBLE DRAW/);
    assert.doesNotMatch(rouletteHtml, /umami|google-analytics|marblerouletteshop/i);

    const rouletteLicenseResponse = await fetch(`http://127.0.0.1:${port}/roulette/LICENSE.txt`);
    assert.equal(rouletteLicenseResponse.status, 200);
    assert.match(await rouletteLicenseResponse.text(), /MIT License[\s\S]*Copyright \(c\) 2023 LazyGyu/);

    const rouletteIndexFiles = require('node:fs').readdirSync(path.join(__dirname, '..', 'public', 'roulette'));
    const rouletteWasm = rouletteIndexFiles.find((file) => file.endsWith('.wasm'));
    assert.ok(rouletteWasm);
    const rouletteWasmResponse = await fetch(`http://127.0.0.1:${port}/roulette/${rouletteWasm}`);
    assert.equal(rouletteWasmResponse.status, 200);
    assert.equal(rouletteWasmResponse.headers.get('content-type'), 'application/wasm');

    const retiredManagerResponse = await fetch(
        `http://127.0.0.1:${port}/crewart-survey-manager.html`,
        { redirect: 'manual' }
    );
    assert.equal(retiredManagerResponse.status, 308);
    assert.equal(retiredManagerResponse.headers.get('location'), '/crewart-survey.html');

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
    assert.equal(config.targetBandNo, '101878670');

    const memberConfigResponse = await fetch(`http://127.0.0.1:${port}/api/band-membership/config`);
    assert.equal(memberConfigResponse.status, 200);
    const memberConfig = await memberConfigResponse.json();
    assert.equal(memberConfig.configured, false);
    assert.equal(memberConfig.targetBandUrl, 'https://www.band.us/band/101878670/post');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

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

test('HTTP server separates the public home and protected hub while preserving survey, health and membership config', async (t) => {
    const port = await freePort();
    const statusDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-band-status-'));
    const statusFile = path.join(statusDirectory, 'runtime.json');
    await fs.writeFile(statusFile, JSON.stringify({
        version: 'test',
        updated_at: new Date().toISOString(),
        state: 'CONNECTED',
        connected: true,
        monitor_enabled: true,
        applications: { queued: 2 }
    }), 'utf8');
    const isolatedEnv={...process.env};
    for(const key of Object.keys(isolatedEnv))if(/^(CREO_|SUPABASE_|ALIGO_|BAND_|GOOGLE_)/.test(key))isolatedEnv[key]='';
    const localEnv=await fs.readFile(path.join(__dirname,'..','.env'),'utf8').catch(()=>'');
    for(const line of localEnv.split(/\r?\n/)){const match=/^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line);if(match)isolatedEnv[match[1]]='';}
    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...isolatedEnv,
            PORT: String(port),
            HOST: '127.0.0.1',
            CREO_DATA_DIR: path.join(statusDirectory,'data'),
            CREO_SUPABASE_MIRROR_ENABLED: 'false',
            CREO_ADMIN_SECRET: 'isolated-smoke-secret',
            ALIGO_TEST_MODE: 'Y',
            BAND_MONITOR_ENABLED: 'false',
            BAND_MONITOR_STATUS_FILE: statusFile,
            GOOGLE_OAUTH_CLIENT_ID: 'test-client.apps.googleusercontent.com'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    t.after(async()=>{
        if(child.exitCode===null&&child.signalCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
        const target=path.resolve(statusDirectory);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('creo-band-status-'));
        await fs.rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    });

    const healthResponse = await waitForHealth(`http://127.0.0.1:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.service, 'creo');
    assert.equal(health.publicSiteReady, true);
    assert.equal(health.bandMonitor.state, 'CONNECTED');
    assert.equal(health.bandMonitor.applications.queued, 2);

    const monitorStatusResponse = await fetch(`http://127.0.0.1:${port}/api/band-monitor/status`);
    assert.equal(monitorStatusResponse.status, 200);
    const monitorStatus = await monitorStatusResponse.json();
    assert.equal(monitorStatus.monitor.state, 'CONNECTED');
    assert.equal(monitorStatus.monitor.applications.queued, 2);

    const sheetsConfigResponse = await fetch(`http://127.0.0.1:${port}/api/google-sheets/config`);
    assert.equal(sheetsConfigResponse.status, 200);
    const sheetsConfig = await sheetsConfigResponse.json();
    assert.equal(sheetsConfig.configured, true);
    assert.equal(sheetsConfig.clientId, 'test-client.apps.googleusercontent.com');

    const monitorPageResponse = await fetch(`http://127.0.0.1:${port}/band-monitor.html`);
    assert.equal(monitorPageResponse.status, 200);
    assert.match(monitorPageResponse.url, /\/band-members\.html$/);
    assert.match(await monitorPageResponse.text(), /통합 회원 명단/);
    const embeddedMonitor = await fetch(`http://127.0.0.1:${port}/band-monitor.html?embedded=1&adminShell=1`, {redirect:'manual'});
    assert.equal(embeddedMonitor.status, 302);
    assert.equal(embeddedMonitor.headers.get('location'), '/band-members.html?embedded=1&adminShell=1');

    const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(homeResponse.status, 200);
    const homeHtml=await homeResponse.text();assert.match(homeHtml,/받으신 전용 링크/);assert.doesNotMatch(homeHtml,/quick-workspace/);
    const mainResponse=await fetch(`http://127.0.0.1:${port}/main`);assert.equal(mainResponse.status,200);assert.match(await mainResponse.text(),/operator-login/);

    const cameraResponse = await fetch(`http://127.0.0.1:${port}/cam.html`);
    assert.equal(cameraResponse.status, 200);
    assert.equal(cameraResponse.headers.get('permissions-policy'), 'camera=(self), microphone=(self), geolocation=()');
    const cameraHtml = await cameraResponse.text();
    assert.match(cameraHtml, /폰 카메라 송출/);
    assert.match(cameraHtml, /\?view=\$\{getCh\(\)\}_cam&autoplay/);
    assert.equal(homeResponse.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');

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

    const staleStudioResponse = await fetch(
        `http://127.0.0.1:${port}/broadcast-studio.html?channel=missing-old-channel&view=layout-1`,
        { redirect: 'manual' }
    );
    assert.equal(staleStudioResponse.status, 404);
    assert.equal((await staleStudioResponse.json()).code, 'CHANNEL_NOT_AVAILABLE');

    const draftId='national-cre-20261021';
    const draftResponse=await fetch(`http://127.0.0.1:${port}/api/platform/channels`,{method:'POST',headers:{'X-Creo-Admin':'isolated-smoke-secret','Content-Type':'application/json'},body:JSON.stringify({channel:{id:draftId,name:'가상 준비 회차',status:'draft',nationalRound:{parentId:'national-cre',date:'2026-10-21'}}})});
    assert.equal(draftResponse.status,201);
    const draftStudio=await fetch(`http://127.0.0.1:${port}/broadcast-studio.html?channel=${draftId}`);
    assert.equal(draftStudio.status,200);assert.match(await draftStudio.text(),/control-frame/);
    const draftShipping=await fetch(`http://127.0.0.1:${port}/shipping.html?channel=${draftId}`);
    assert.equal(draftShipping.status,404);
    const draftSwitch=await fetch(`http://127.0.0.1:${port}/api/platform/active-channel`,{method:'PUT',headers:{'X-Creo-Admin':'isolated-smoke-secret','Content-Type':'application/json'},body:JSON.stringify({channelId:draftId})});
    assert.equal(draftSwitch.status,422);

    const staleShippingResponse = await fetch(
        `http://127.0.0.1:${port}/shipping.html?channel=missing-old-channel&changeCompany=1`,
        { redirect: 'manual' }
    );
    assert.equal(staleShippingResponse.status, 404);
    assert.equal((await staleShippingResponse.json()).code, 'CHANNEL_NOT_AVAILABLE');

    // Browsers get a recovery path; API consumers retain the JSON error contract.
    for(const channelId of ['missing-old-channel',draftId]){
        const response=await fetch(`http://127.0.0.1:${port}/shipping.html?channel=${channelId}`,{headers:{Accept:'text/html'}});
        assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/^text\/html/);
        const html=await response.text();assert.match(html,/회차를 다시 선택해 주세요/);assert.match(html,/href="\/main"/);assert.doesNotMatch(html,/CHANNEL_NOT_AVAILABLE/);
    }
    // Archiving the broadcast must not close outstanding shipping work.
    for(const [id,shipping] of [['archived-round',true],['archived-no-shipping',false]]){
        const created=await fetch(`http://127.0.0.1:${port}/api/platform/channels`,{method:'POST',headers:{'X-Creo-Admin':'isolated-smoke-secret','Content-Type':'application/json'},body:JSON.stringify({channel:{id,name:'가상 보관 회차',status:'archived',features:{shipping}}})});
        assert.equal(created.status,201);
        for(const page of ['shipping.html','shipping-status.html','shipping-rates.html']){
            const response=await fetch(`http://127.0.0.1:${port}/${page}?channel=${id}`);
            assert.equal(response.status,shipping?200:404,`${id} ${page}`);
        }
        const studio=await fetch(`http://127.0.0.1:${port}/broadcast-studio.html?channel=${id}`);assert.equal(studio.status,404);
        const protectedWorkspace=await fetch(`http://127.0.0.1:${port}/api/platform/channels/${id}/workspace`);assert.equal(protectedWorkspace.status,401);
    }

    const scriptResponse = await fetch(`http://127.0.0.1:${port}/crewart-survey.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get('content-type'), /^text\/javascript/);
    assert.equal(scriptResponse.headers.get('cache-control'), 'no-cache');

    const contractResponse = await fetch(`http://127.0.0.1:${port}/auction-contract.js`);
    assert.equal(contractResponse.status, 200);
    assert.match(contractResponse.headers.get('content-type'), /^text\/javascript/);
    assert.match(await contractResponse.text(), /CreoAuctionContract/);

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

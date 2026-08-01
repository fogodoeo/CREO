'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGES = [
    'index.html',
    'channel-manager.html',
    'channel-workspace.html',
    'auction-control.html',
    'auction-live.html',
    'channel-shipping.html',
    'broadcast-router.html',
    'broadcast.html',
    'crewart-broadcast.html'
];

test('platform pages contain valid inline JavaScript and required viewport metadata', () => {
    for (const file of PAGES) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
        assert.match(source, /<meta[^>]+name=["']viewport["']/i, `${file} needs a viewport`);
        const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
            .filter((match) => !/\bsrc\s*=/.test(match[0].slice(0, match[0].indexOf('>') + 1)))
            .map((match) => match[1])
            .filter((script) => script.trim());
        assert.ok(inlineScripts.length, `${file} should have inline behavior`);
        inlineScripts.forEach((script, index) => {
            assert.doesNotThrow(() => new vm.Script(script, { filename: `${file}#${index + 1}` }));
        });
    }
});

test('platform client script is valid JavaScript', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'platform-client.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: 'platform-client.js' }));
});

test('the universal broadcast route preserves CDCUP legacy output and uses the new renderer elsewhere', () => {
    const router = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-router.html'), 'utf8');
    assert.doesNotMatch(router, /supabase-bridge|active_event_module|getRuntimeConfigMap/i);
    assert.match(router, /\/api\/platform\/active-channel/);
    assert.match(router, /auction-live\.html\?channel=/);
    assert.match(router, /channel==='cdcup'/);
    assert.match(router, /broadcast\.html\?page=/);
    assert.match(router, /module=cdcup&direct=1/);
    assert.doesNotMatch(router, /crewart-broadcast\.html\?page=/);
});

test('hub preserves established management and CDCUP broadcast control links', () => {
    const hub = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.match(hub, /c\.links\.workspace/);
    assert.match(hub, /c\.links\.control/);
    assert.match(hub, /legacy\?\.managementUrl/);
    assert.match(hub, /c\.links\.shipping/);
});

test('CDCUP platform links use the established control while other channels use the unified control', () => {
    const { channelLinks } = require('../platform-core');
    assert.equal(channelLinks('cdcup').control, '/settings.html?module=cdcup');
    assert.equal(channelLinks('sample').control, '/auction-control.html?channel=sample');
    const workspace = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-workspace.html'), 'utf8');
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-shipping.html'), 'utf8');
    assert.match(workspace, /c\?\.links\?\.control/);
    assert.match(shipping, /c\?\.links\?\.control/);
});

test('the new broadcast implements three independent camera overlays', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    assert.match(live, /1P · HOST/);
    assert.match(live, /2P · ITEM/);
    assert.match(live, /EXTRA INFORMATION/);
    assert.match(live, /function pageOne/);
    assert.match(live, /function pageTwo/);
    assert.match(live, /function pageThree/);
    assert.match(live, /page1BannerOn/);
    assert.match(live, /page2SoldOn/);
    assert.match(live, /if\(!s\.page3On\)return''/);
    assert.match(live, /background:transparent/);
    assert.match(live, /broadcast-pulse/);
    assert.match(live, /setInterval\(pollPulse,350\)/);
    assert.match(live, /document\.hidden/);
    assert.doesNotMatch(live, /setInterval\(refresh,1000\)/);
});

test('established CDCUP registration, list, print, and round archive remain intact', () => {
    const operations = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-index.html'), 'utf8');
    for (const label of ['개체 등록', '개체 목록', '인쇄', '회차 기록']) assert.match(operations, new RegExp(label));
    assert.match(operations, /channel-shipping\.html\?channel=cdcup/);
});

test('new CDCUP overlays and shipping retain compatibility with the established item list', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-shipping.html'), 'utf8');
    for (const source of [live, control, shipping]) {
        assert.match(source, /getBroadcastItemsCached/);
        assert.match(source, /channelId==='cdcup'/);
    }
    assert.match(shipping, /itemLotNumber/);
    assert.match(shipping, /itemVendorName/);
});

test('legacy broadcast bridge survives Supabase quota exhaustion with cached or standby data', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    const cdcup = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
    assert.match(bridge, /SUPABASE_QUOTA_COOLDOWN_MS/);
    assert.match(bridge, /_readBroadcastStorage\('items', \[\]\)/);
    assert.match(bridge, /_readBroadcastStorage\('config', \{\}\)/);
    assert.match(cdcup, /await _refreshBroadcastFromItems\(\[\]\)/);
});

test('broadcast control manages reusable banners, sponsors, and vendor logos', () => {
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    for (const marker of ['배너·로고', '회전 배너', '협찬 로고', '업체 로고', 'importLegacyAssets']) {
        assert.match(control, new RegExp(marker));
    }
    assert.match(live, /function pageAssets/);
    assert.match(live, /function vendorLogo/);
    assert.match(live, /ticker-sponsors/);
    assert.match(live, /Math\.floor\(Date\.now\(\)\/6000\)/);
});

test('CREWARTS verifies BAND membership by phone before revealing results', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey-v3.css'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(script, { filename: 'crewart-survey.js' }));
    assert.match(html, /전화번호로 BAND 회원 확인/);
    assert.match(html, /id="member-phone"/);
    assert.match(html, /가입 여부 확인하고 결과 보기/);
    assert.match(html, /BAND 가입하기/);
    assert.doesNotMatch(html, /supabase-bridge\.js/);
    assert.match(css, /\.cw-choice-button[\s\S]*min-height:\s*72px/);
    assert.match(script, /function verifyMembershipPhone/);
    assert.match(script, /\/api\/crewart-survey\/bootstrap/);
    assert.match(script, /\/api\/crewart-survey\/responses/);
    assert.doesNotMatch(script, /getConfigMap|saveCrewartSurveyEntry/);
    assert.match(script, /window\.open\('', '_blank',[\s\S]*if \(!payload\.member\)[\s\S]*bandPopup\.location\.replace\(bandTargetUrl\)/);
    assert.doesNotMatch(script, /window\.location\.assign\(bandTargetUrl\)/);
    assert.match(script, /function recheckPendingMembership[\s\S]*completeMembershipAccess\(payload, verifiedPhone\)/);
    assert.match(script, /visibilitychange[\s\S]*recheckPendingMembership\(\{ visibleOnly: true \}\)/);
    assert.match(script, /BAND 가입·승인 후 설문으로 돌아오면 자동으로 이어져요/);
    assert.match(script, /if \(!hasDetailedAccess\(\)\)[\s\S]*openMemberCheck\(\{ revealResult: true \}\)/);
    assert.doesNotMatch(script, /BAND_OAUTH_API|beginBandLogin/);
});

test('CREWARTS home shows the saved result and only a masked authenticated phone', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    for (const id of ['auth-phone-chip', 'auth-phone-number', 'home-result-card', 'home-result-open', 'home-retest']) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
    }
    assert.match(html, /내 크레MBTI/);
    assert.match(script, /crewart_band_member_phone_mask_v1/);
    assert.match(script, /function maskPhone[\s\S]*\*\*\*\*/);
    assert.match(script, /if \(bandAuthToken && !bandAuthPhoneMask\)[\s\S]*removeItem\(MEMBERSHIP_STORAGE_KEY\)/);
    assert.match(script, /function saveLastResult/);
    assert.match(script, /function restoreLastResult/);
    const savedResultBody = script.match(/function saveLastResult\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.doesNotMatch(savedResultBody, /phone|bandAuth/i);
});

test('CREWARTS keeps a fixed member-check handoff throughout the questionnaire', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey-v3.css'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    assert.match(css, /Always-available BAND handoff/);
    assert.match(css, /\.cw-persistent-footer\s*\{[\s\S]*position:\s*fixed/);
    assert.match(script, /전화번호로 BAND 회원 확인/);
    assert.match(script, /결과를 열기 전에 가입 여부를 확인해요/);
    assert.match(script, /function handlePersistentBand\(\)[\s\S]*openMemberCheck/);
});

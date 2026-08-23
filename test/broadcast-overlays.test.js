'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const broadcast = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
const channelBridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-broadcast-bridge.js'), 'utf8');
const preview = fs.readFileSync(path.join(__dirname, '..', 'public', 'preview.html'), 'utf8');
const creyonCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-creyon.css'), 'utf8');
const crewartCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-crewart.css'), 'utf8');
const crewartLiveBanner = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'crewart-broadcast', 'crewart-live-banner.svg'), 'utf8');
const crewartHouseBanner = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'crewart-broadcast', 'crewart-house-banner.svg'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '..', 'public', 'settings.html'), 'utf8');

test('broadcast cache-busts the bridge that carries CREWART audience events', () => {
    assert.match(broadcast, /channel-broadcast-bridge\.js\?v=20260823-crewart-audience-v5/);
});

test('public page two renders the seller as a separate tag left of the item name', () => {
    assert.match(broadcast, /id="info-company"[\s\S]{0,160}id="info-name"/);
    assert.match(broadcast, /configuredBlindMode === '0' \? 'public' : 'blind'/);
    assert.match(broadcast, /infoCompany\.hidden = isHost \|\| !showCompanyInline/);
    assert.match(broadcast, /infoCompany\.textContent = `\[\$\{publicCompanyName\}\]`/);
    assert.match(broadcast, /\.top-bar \.company-tag \{[\s\S]{0,360}font-size: var\(--sb-name-size, 33px\)/);
    assert.doesNotMatch(broadcast, /\.top-bar \.company-tag \{[\s\S]{0,360}(?:border:|background:|padding:)/);
    assert.match(broadcast, /gap: clamp\(11px, 1\.1vw, 17px\)/);
});

test('live bidder background opacity is configurable and lower ranks remain readable', () => {
    assert.match(preview, /id="live-bidders-opacity-input"/);
    assert.match(preview, /configMap\.live_bidders_opacity/);
    assert.match(broadcast, /cfg\.live_bidders_opacity \?\? '94'/);
    assert.match(broadcast, /\[1, \.90, \.86, \.78, \.70, \.64, \.58, \.52\]/);
    assert.doesNotMatch(broadcast, /isCdcup\s*&&\s*isPage2/);
    assert.doesNotMatch(preview, /isCreyon\s*\?\s*'none'\s*:\s*''/);
});

test('CREWART page two colors each live bidder card with the resolved viewer house', () => {
    assert.match(broadcast, /body\[data-event-module="crewart"\] \.p2-live-bidder-row\[data-house\]/);
    assert.match(broadcast, /CREWART_BIDDER_HOUSE_PALETTE/);
    assert.match(broadcast, /bid\.crewart_house_key \|\| bid\.crewartHouseKey/);
    assert.match(broadcast, /rowEl\.dataset\.house = houseKey/);
    assert.match(broadcast, /Y: \{ color: '#d2a33a', rgb: '210,163,58', ink: '#ffffff' \}/);
});

test('CREWART broadcast plates use an isolated modern-antique skin', () => {
    assert.match(broadcast, /broadcast-crewart\.css\?v=20260823-premium-reel-v2/);
    assert.match(crewartCss, /body\[data-event-module="crewart"\] \{[\s\S]{0,500}--cw-brass:/);
    assert.match(crewartCss, /body\[data-event-module="crewart"\] \.host-nametag \.nt-inner/);
    assert.match(crewartCss, /body\[data-event-module="crewart"\] \.hc-bottom-bar/);
    assert.match(crewartCss, /body\[data-event-module="crewart"\] \.p2-live-bidder-row\[data-house\]/);
    assert.doesNotMatch(crewartCss, /(^|\n)\s*(?:\.|#)[a-z0-9_-]+/i);
});

test('CREWART default image banners follow the same restrained vector system', () => {
    assert.match(crewartLiveBanner, /Modern antique CREWART broadcast banner/);
    assert.match(crewartLiveBanner, /font-family="Pretendard,Arial,sans-serif"/);
    assert.match(crewartHouseBanner, /Modern minimal four-house banner/);
    assert.match(crewartHouseBanner, /#642f39[\s\S]*#2f6b4c[\s\S]*#355f95[\s\S]*#b78b2f/);
    assert.doesNotMatch(crewartLiveBanner + crewartHouseBanner, /crewarts-crest|Georgia,serif|medieval/i);
});

test('CREWART new bidder assignment is directed to the shared P3 FIFO, never the P2 overlay', () => {
    assert.doesNotMatch(broadcast, /processCrewartAudienceReveals\(window\.__creoAudience \|\| null\)/);
    assert.match(broadcast, /function runCrewartAssignmentOnP3\(event, done\)/);
    assert.match(broadcast, /kind: 'assignment'/);
    assert.match(broadcast, /kind: 'contribution'/);
    assert.match(broadcast, /p3AssignmentStorageKey\(sessionId\)/);
    assert.match(broadcast, /writeP3AssignmentCursor\(sessionId, event\.sequence\)/);
    assert.match(broadcast, /state\.queue\.sort/);
    assert.match(broadcast, /event\.kind === 'assignment'/);
    assert.match(broadcast, /const duration = window\.matchMedia[^\n]+\? 0 : 2000/);
});

test('CREWART P3 contribution roulette uses one premium frame, a two-second reel, and two clean result scenes', () => {
    assert.match(broadcast, /id="p3-contribution-roulette-overlay"/);
    assert.ok(
        broadcast.indexOf('id="p3-contribution-roulette-overlay"') > broadcast.indexOf('id="bracket-page-container"'),
        'the P3 roulette must live outside the hidden page 1/2 broadcast container'
    );
    assert.match(broadcast, /#p3-contribution-roulette-overlay \{[\s\S]{0,120}z-index: 10020/);
    assert.match(broadcast, /class="p3-contribution-roulette-window"/);
    assert.match(broadcast, /state\.queue\.push\(\{ \.\.\.event, kind: 'contribution', sequence \}\)/);
    assert.match(broadcast, /const duration = 2000/);
    assert.match(broadcast, /const values = \[0\.25, 0\.5, 2, 3, 4\]/);
    assert.match(broadcast, /writeP3RouletteCursor\(sessionId, event\.sequence\)/);
    assert.match(broadcast, /refreshCrewartContributionBoard\(\)/);
    assert.match(channelBridge, /target\.__creoBroadcastState = broadcastCache\?\.state \|\| null/);
    assert.doesNotMatch(broadcast, /broadcastMode && broadcastMode !== 'sold'/);
    assert.match(broadcast, /showCrewartRouletteReady\(\)/);
    assert.match(broadcast, /showCrewartRouletteResult\(event\)/);
    assert.match(broadcast, /id="p3-contribution-result-popup"/);
    assert.match(broadcast, /showCrewartRouletteResultPopup\(event\)/);
    assert.match(broadcast, /p3-contribution-result-equation is-current/);
    assert.match(broadcast, /p3-contribution-result-final/);
    assert.match(broadcast, /R: 'RED팀'/);
    assert.match(broadcast, /formatCrewartScore\(event\.baseAmount\)/);
    assert.match(broadcast, /×\$\{multiplier\}/);
    assert.match(broadcast, /formatCrewartScore\(event\.contributionAmount\)/);
    assert.match(broadcast, /setTimeout\(\(\) => activate\(1\), 1120\)/);
    assert.doesNotMatch(broadcast, /activate\(2\)/);
    assert.match(broadcast, /p3-contribution-roulette-shell" aria-hidden="true"/);
    assert.doesNotMatch(broadcast, /직전 낙찰자의 입력을 기다리는 중|p3-contribution-result-name|p3-contribution-result-amount/);
    assert.match(broadcast, /processCrewartContributionRoulette\(window\.__creoAudience \|\| null\)/);
    assert.match(broadcast, /function startCrewartAudiencePolling\(\)/);
    assert.match(broadcast, /await window\.getCrewartAudience\(\)/);
    assert.match(channelBridge, /channels\/\$\{encodeURIComponent\(channelId\)\}\/audience/);
    assert.doesNotMatch(broadcast, /룰렛.*sendMessage|sendMessage.*룰렛/);
    assert.match(crewartCss, /one premium frame shared by house and contribution reels/);
    assert.match(crewartCss, /\.p2-house-reveal-shell,[\s\S]{0,120}\.p3-contribution-roulette-shell/);
    assert.match(crewartCss, /\.p3-contribution-result-equation,[\s\S]{0,120}\.p3-contribution-result-final/);
});

test('CREWART P3 contribution roulette has an independent saved placement target', () => {
    assert.match(preview, /id="draggable-contribution-roulette"/);
    assert.match(preview, /data-type="contribution_roulette"/);
    assert.match(preview, /configMap\.p3_contribution_roulette_top/);
    assert.match(preview, /configMap\.p3_contribution_roulette_width/);
    assert.match(preview, /p3_contribution_roulette_font_size/);
    assert.match(preview, /id="contribution-roulette-font-input"/);
    assert.match(preview, /resizeTarget === 'contribution_roulette'/);
    assert.match(broadcast, /map\.p3_contribution_roulette_top \|\| '36%'/);
    assert.match(broadcast, /map\.p3_contribution_roulette_width \|\| '76%'/);
    assert.match(broadcast, /map\.p3_contribution_roulette_height \|\| '13%'/);
    assert.match(broadcast, /map\.p3_contribution_roulette_font_size \|\| '36'/);
    assert.match(broadcast, /events\.filter\(\(event\) => event\?\.replay !== true\)/);
});

test('CREWART P3 recovers recent assignment and contribution events after a source reload', () => {
    assert.match(broadcast, /startedAt >= Date\.now\(\) - 120000/);
    assert.match(broadcast, /assignedAt >= Date\.now\(\) - 120000/);
});

test('CREWART P3 idle roulette plate shows the current highest bidder and assigned house', () => {
    assert.match(broadcast, /function currentCrewartP3HighestBid\(\)/);
    assert.match(broadcast, /live_bidders_mode: 'top'/);
    assert.match(broadcast, /formatLiveBidAmount\(bid\.amount\).*만원 입찰/);
    assert.match(broadcast, /const houseLabel = \(\{ R: 'RED', G: 'GREEN', B: 'BLUE', Y: 'YELLOW' \}\)\[houseKey\] \|\| '배정 중'/);
    assert.match(broadcast, /if \(Array\.isArray\(items\)\) window\.latestItemsList = items;[\s\S]{0,100}processCrewartContributionRoulette/);
    assert.match(broadcast, /'p3-live-bid'/);
});

test('all shared legacy layouts support three nametags', () => {
    assert.match(settings, /id="cfg-host-name3"/);
    assert.match(settings, /host_name3:/);
    assert.match(preview, /id="draggable-nametag3"/);
    assert.match(preview, /configMap\.nametag3_left/);
    assert.match(broadcast, /id="host-nametag-3"/);
    assert.match(broadcast, /for \(let i = 1; i <= 3; i\+\+\)/);
});

test('all public single-auction page two layouts hide the public-auction label', () => {
    assert.match(broadcast, /competition === 'single' && visibility === 'public' && !isQuiz[\s\S]{0,80}label = ''/);
    assert.doesNotMatch(broadcast, /moduleId === 'creyon'[\s\S]{0,180}label = ''/);
    assert.doesNotMatch(creyonCss, /#p2-live-bidders-overlay[\s\S]{0,100}display:\s*none\s*!important/);
    assert.match(broadcast, /renderPage2LiveBidders\(item, window\.latestConfigMap \|\| \{\}\)/);
});

test('page two hides debug status on success and enlarges the common item progress counter', () => {
    const router = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-router.html'), 'utf8');
    assert.match(router, /body\.has-error \.status\{display:block\}/);
    assert.doesNotMatch(router, /params\.get\('debug'\).*classList\.add\('debug'\)/);
    assert.equal((broadcast.match(/font-size: clamp\(40px, 2\.6vw, 54px\)/g) || []).length, 2);
    assert.equal((broadcast.match(/Math\.max\(40, Number\(cfg\.scoreboard_label_fontsize\) \+ 10\)/g) || []).length, 2);
    assert.match(broadcast, /labelEl\.style\.display = 'none'/);
});

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
    assert.match(broadcast, /broadcast-crewart\.css\?v=20260822-modern-antique-v1/);
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

test('CREWART new bidders use a two-second persistent FIFO reel without blocking bid rows', () => {
    assert.match(broadcast, /id="p2-house-reveal-overlay"/);
    assert.match(broadcast, /class="p2-house-reveal-window"/);
    assert.match(broadcast, /state\.queue\.push\(\{ \.\.\.event, sequence \}\)/);
    assert.match(broadcast, /state\.queue\.shift\(\)/);
    assert.match(broadcast, /const duration = reducedMotion \? 0 : 2000/);
    assert.match(broadcast, /const hold = 360/);
    assert.match(broadcast, /latestAssignedAt >= state\.pageStartedAt - 15000/);
    assert.match(broadcast, /writeP2RevealCursor\(state\.sessionId, event\.sequence\)/);
    assert.match(broadcast, /sessionStorage\.setItem\(p2RevealStorageKey\(sessionId\)/);
    assert.match(broadcast, /pendingBidderKeys\.has\(key\)/);
    assert.match(broadcast, /bid\.crewart_assignment_pending === true/);
    assert.match(broadcast, /state\.generation !== generation \|\| state\.sessionId !== sessionId/);
    assert.match(broadcast, /resetCrewartRevealState\(sessionId\)/);
    assert.match(broadcast, /processCrewartAudienceReveals\(window\.__creoAudience \|\| null\)/);
});

test('CREWART P3 contribution roulette is a two-second FIFO reveal with a persistent result panel', () => {
    assert.match(broadcast, /id="p3-contribution-roulette-overlay"/);
    assert.ok(
        broadcast.indexOf('id="p3-contribution-roulette-overlay"') > broadcast.indexOf('id="bracket-page-container"'),
        'the P3 roulette must live outside the hidden page 1/2 broadcast container'
    );
    assert.match(broadcast, /#p3-contribution-roulette-overlay \{[\s\S]{0,120}z-index: 10020/);
    assert.match(broadcast, /class="p3-contribution-roulette-window"/);
    assert.match(broadcast, /state\.queue\.push\(\{ \.\.\.event, sequence \}\)/);
    assert.match(broadcast, /const duration = 2000/);
    assert.match(broadcast, /const values = \[0\.25, 0\.5, 2, 3, 4\]/);
    assert.match(broadcast, /writeP3RouletteCursor\(sessionId, event\.sequence\)/);
    assert.match(broadcast, /refreshCrewartContributionBoard\(\)/);
    assert.match(channelBridge, /target\.__creoBroadcastState = broadcastCache\?\.state \|\| null/);
    assert.match(broadcast, /broadcastMode && broadcastMode !== 'sold'/);
    assert.match(broadcast, /showCrewartRouletteReady\(\)/);
    assert.match(broadcast, /showCrewartRouletteResult\(event\)/);
    assert.match(broadcast, /String\(latest\.itemId \|\| ''\) === activeItemId/);
    assert.match(broadcast, /직전 낙찰자의 입력을 기다리는 중/);
    assert.match(broadcast, /formatCrewartWon\(event\.baseAmount\)\} → \$\{formatCrewartWon\(event\.contributionAmount\)/);
    assert.match(broadcast, /processCrewartContributionRoulette\(window\.__creoAudience \|\| null\)/);
    assert.doesNotMatch(broadcast, /룰렛.*sendMessage|sendMessage.*룰렛/);
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

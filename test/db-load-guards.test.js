'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function publicFile(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
}

test('legacy broadcast is read-only and polls rapidly only while an auction is hot', () => {
    const html = publicFile('broadcast.html');
    const hotPoll = Number(html.match(/const AUCTION_HOT_POLL_MS = (\d+)/)?.[1] || 0);
    const idlePoll = Number(html.match(/const AUCTION_IDLE_POLL_MS = (\d+)/)?.[1] || 0);
    assert.equal(hotPoll, 350);
    assert.ok(idlePoll >= 3000);
    assert.match(html, /now < _auctionHotUntil \? AUCTION_HOT_POLL_MS : AUCTION_IDLE_POLL_MS/);
    assert.doesNotMatch(html, /updateConfigs\(\{\s*battle_current_match/);
    assert.match(html, /const isDirectBroadcastSource = urlParams\.get\('direct'\) === '1'/);
    assert.match(html, /if \(document\.hidden && !isDirectBroadcastSource\)[\s\S]*_scheduleAuctionPoll\(5000\)/);
});

test('legacy item list pauses hidden and overlapping refreshes', () => {
    const html = publicFile('cdcup-index.html');
    assert.match(html, /document\.hidden \|\| listRefreshInFlight/);
    assert.match(html, /finally \{ listRefreshInFlight = false; \}/);
    assert.match(html, /}, 30000\);/);
});

test('CREWART membership checks quickly only while the survey has focus', () => {
    const script = publicFile('crewart-survey.js');
    const visible = Number(script.match(/MEMBERSHIP_RECHECK_VISIBLE_MS = (\d+)/)?.[1] || 0);
    const hidden = Number(script.match(/MEMBERSHIP_RECHECK_HIDDEN_MS = (\d+)/)?.[1] || 0);
    assert.equal(visible, 1000);
    assert.ok(hidden >= 10000);
    assert.match(script, /document\.visibilityState === 'visible' && document\.hasFocus\(\)/);
});

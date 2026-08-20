'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const broadcast = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
const preview = fs.readFileSync(path.join(__dirname, '..', 'public', 'preview.html'), 'utf8');
const creyonCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-creyon.css'), 'utf8');
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

test('all shared legacy layouts support three nametags', () => {
    assert.match(settings, /id="cfg-host-name3"/);
    assert.match(settings, /host_name3:/);
    assert.match(preview, /id="draggable-nametag3"/);
    assert.match(preview, /configMap\.nametag3_left/);
    assert.match(broadcast, /id="host-nametag-3"/);
    assert.match(broadcast, /for \(let i = 1; i <= 3; i\+\+\)/);
});

test('CREYON page two hides the public-auction label but shows synchronized live bidders', () => {
    assert.match(broadcast, /moduleId === 'creyon'[\s\S]{0,180}label = ''/);
    assert.doesNotMatch(creyonCss, /#p2-live-bidders-overlay[\s\S]{0,100}display:\s*none\s*!important/);
    assert.match(broadcast, /renderPage2LiveBidders\(item, window\.latestConfigMap \|\| \{\}\)/);
});

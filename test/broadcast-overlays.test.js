'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const broadcast = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
const preview = fs.readFileSync(path.join(__dirname, '..', 'public', 'preview.html'), 'utf8');

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
    assert.match(broadcast, /\[1, \.94, \.86, \.78, \.70, \.64, \.58, \.52\]/);
    assert.doesNotMatch(broadcast, /isCdcup\s*&&\s*isPage2/);
    assert.doesNotMatch(preview, /isCreyon\s*\?\s*'none'\s*:\s*''/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/auction-live.html'), 'utf8');

test('video banners crop within their box even when custom placement allows overflow', () => {
    const rule = source.match(/video\.banner\{([^}]+)\}/)[1];
    assert.match(rule, /width:/);
    assert.match(rule, /height:/);
    assert.match(rule, /object-fit:cover/);
    assert.match(rule, /overflow:hidden!important/);
});

test('contribution overlay has no opaque full-screen backdrop', () => {
    assert.match(source, /\.contribution-page\{background:transparent\}/);
});

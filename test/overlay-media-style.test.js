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

test('custom host width overrides responsive and profile minimum widths', () => {
    assert.match(source, /\.host-card\[data-layout-custom="1"\]\{min-width:0!important\}/);
});

test('modern host alignment and custom scoreboard height override intrinsic sizing', () => {
    const css=fs.readFileSync(require.resolve('../public/broadcast-modern.css'),'utf8');
    assert.match(css,/\.host-card strong\{align-items:center!important;flex-wrap:nowrap!important/);
    assert.match(css,/grid-template-rows:minmax\(0,1fr\);min-height:0/);
    assert.match(css,/\.contribution-team\{min-height:0;height:100%/);
    assert.match(css,/font-size:min\(4.5vw,60cqh\)/);
});

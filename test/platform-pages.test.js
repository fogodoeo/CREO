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
    'broadcast-router.html'
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

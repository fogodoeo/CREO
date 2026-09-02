'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pipeline = require('../public/operator-pipeline');

const ROOT = path.join(__dirname, '..');

test('one operator pipeline keeps every core step on the selected channel', () => {
    const state = Pipeline.model('future-live', 'broadcast', '신규 라이브');
    assert.equal(state.channelId, 'future-live');
    assert.equal(state.channelName, '신규 라이브');
    assert.equal(state.steps.length, 4);
    assert.deepEqual(state.steps.map(step => step.id), ['workspace', 'broadcast', 'shipping', 'print']);
    assert.equal(state.steps.filter(step => step.active).map(step => step.id).join(','), 'broadcast');
    for (const step of state.steps) assert.match(step.href, /channel=future-live/);
    assert.equal(state.home, '/?channel=future-live');
    assert.equal(state.settings, '/channel-manager.html?channel=future-live');
});

test('operator pipeline aliases map old page language onto the four canonical steps', () => {
    assert.equal(Pipeline.currentId('manage'), 'workspace');
    assert.equal(Pipeline.currentId('control'), 'broadcast');
    assert.equal(Pipeline.currentId('checkout'), 'shipping');
    assert.equal(Pipeline.currentId('settlement'), 'print');
    assert.equal(Pipeline.model('x', 'shipping'), null);
});

test('every operator page uses the shared pipeline while buyer and vendor links stay clean', () => {
    const pages = {
        'channel-workspace.html': 'workspace',
        'broadcast-studio.html': 'broadcast',
        'shipping.html': 'shipping',
        'shipping-status.html': 'shipping',
        'print.html': 'print'
    };
    for (const [file, current] of Object.entries(pages)) {
        const source = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
        assert.match(source, /operator-pipeline\.js/);
        assert.match(source, new RegExp(`<creo-operator-pipeline current="${current}"`));
    }
    for (const file of ['buyer-shipping.html', 'vendor-checkout.html']) {
        const source = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
        assert.doesNotMatch(source, /operator-pipeline/);
    }
});

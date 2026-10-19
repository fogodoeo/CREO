'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pipeline = require('../public/operator-pipeline');

const ROOT = path.join(__dirname, '..');

test('national rounds have a persistent selector and archive links retain their scope',t=>{
    const old=global.location;t.after(()=>{global.location=old});global.location={search:'?channel=national-cre&archive=old-round'};
    const state=Pipeline.model('national-cre','print','전국크레자랑');assert.equal(state.rounds,'/main?channel=national-cre&archive=old-round');assert.deepEqual(state.steps.map(s=>s.id),['shipping','print']);
    assert.match(state.channelName,/이전 회차/);for(const s of state.steps.filter(s=>['shipping','print'].includes(s.id)))assert.match(s.href,/archive=old-round/);
    assert.equal(Pipeline.model('national-cre-20261021','print').rounds,'/main?channel=national-cre-20261021&archive=old-round');assert.equal(Pipeline.model('other','print').rounds,'/main?channel=other&archive=old-round');
});

test('one operator pipeline keeps every core step on the selected channel', () => {
    const state = Pipeline.model('future-live', 'broadcast', '신규 라이브');
    assert.equal(state.channelId, 'future-live');
    assert.equal(state.channelName, '신규 라이브');
    assert.equal(state.steps.length, 4);
    assert.deepEqual(state.steps.map(step => step.id), ['workspace', 'broadcast', 'shipping', 'print']);
    assert.equal(state.steps.filter(step => step.active).map(step => step.id).join(','), 'broadcast');
    for (const step of state.steps) assert.match(step.href, /channel=future-live/);
    assert.equal(state.home, '/main?channel=future-live');
    assert.equal(state.settings, '/channel-manager.html?channel=future-live');
});

test('operator pipeline aliases map old page language onto the four canonical steps', () => {
    assert.equal(Pipeline.currentId('manage'), 'workspace');
    assert.equal(Pipeline.currentId('control'), 'broadcast');
    assert.equal(Pipeline.currentId('checkout'), 'shipping');
    assert.equal(Pipeline.currentId('settlement'), 'print');
    assert.equal(Pipeline.model('x', 'shipping'), null);
});

test('pipeline follows channel lifecycle and feature permissions without losing archive identity',t=>{
    const old=global.location;t.after(()=>{global.location=old});
    const c={id:'national-cre-20261021',name:'가상 회차',status:'draft',nationalRound:{parentId:'national-cre'}};
    assert.deepEqual(Pipeline.model(c.id,'print',c.name,c).steps.map(s=>s.id),['workspace','broadcast','print']);
    assert.deepEqual(Pipeline.model(c.id,'print',c.name,{...c,status:'active'}).steps.map(s=>s.id),['workspace','broadcast','shipping','print']);
    const archived={...c,status:'archived'};
    assert.deepEqual(Pipeline.model(c.id,'print',c.name,archived).steps.map(s=>s.id),['shipping','print']);
    assert.deepEqual(Pipeline.model(c.id,'print',c.name,{...archived,features:{shipping:false,auction:false}}).steps,[]);
    global.location={search:'?channel='+c.id+'&archive=older'};
    const state=Pipeline.model(c.id,'print',c.name,archived);
    assert.equal(state.steps.length,2);assert.ok(state.steps.every(s=>new URL(s.href,'https://example.test').searchParams.get('archive')==='older'));
});

test('every operator page uses the shared pipeline while buyer and vendor links stay clean', () => {
    const pages = {
        'channel-workspace.html': 'workspace',
        'broadcast-studio.html': 'broadcast',
        'shipping-status.html': 'shipping',
        'print.html': 'print'
    };
    for (const [file, current] of Object.entries(pages)) {
        const source = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
        assert.match(source, /operator-pipeline\.js/);
        assert.match(source, new RegExp(`<creo-operator-pipeline current="${current}"`));
    }
    for (const file of ['shipping.html', 'buyer-shipping.html', 'vendor-checkout.html']) {
        const source = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
        assert.doesNotMatch(source, /operator-pipeline/);
    }
});

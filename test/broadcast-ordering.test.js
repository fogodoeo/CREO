const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Bridge = require('../public/channel-broadcast-bridge');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const response = payload => ({ ok: true, json: async () => payload });
const snapshot = (revision, id = 'alpha') => ({ channel: { id }, broadcastEpoch: 'boot-one', revision, state: { channelId: id, activeItemId: `item-${revision}` }, items: [] });

test('late broadcast response cannot replay the previous item or sold state', async () => {
    const pending = [];
    const target = { location: { search: '?channel=alpha' }, fetch: () => { const d = deferred(); pending.push(d); return d.promise; } };
    const bridge = Bridge.install(target);
    const old = bridge.loadBroadcast(true);
    const fresh = bridge.loadBroadcast(true);
    pending[1].resolve(response(snapshot(2)));
    await fresh;
    pending[0].resolve(response(snapshot(1)));
    assert.equal((await old).revision, 2);
    assert.equal(target.__creoBroadcastState.activeItemId, 'item-2');
    const regressed = bridge.loadBroadcast(true);
    pending[2].resolve(response(snapshot(1)));
    assert.equal((await regressed).revision, 2);
    const restarted = bridge.loadBroadcast(true);
    pending[3].resolve(response({ ...snapshot(0), broadcastEpoch: 'boot-two' }));
    assert.equal((await restarted).revision, 0);
});

test('wrong-channel payload is rejected without contaminating broadcast cache', async () => {
    let payload = snapshot(2);
    const target = { location: { search: '?channel=alpha' }, fetch: async () => response(payload) };
    const bridge = Bridge.install(target);
    await bridge.loadBroadcast(true);
    payload = snapshot(3, 'beta');
    await assert.rejects(bridge.loadBroadcast(true), /채널/);
    assert.equal(target.__creoBroadcastState.activeItemId, 'item-2');
});

test('router ignores a previous active-channel response after a newer channel was selected', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/broadcast-router.html'), 'utf8');
    const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const pending = [];
    const frame = { src: '', getAttribute() { return this.src; }, removeAttribute() { this.src = ''; } };
    const context = vm.createContext({ URLSearchParams, Map, location: { search: '' },
        document: { hidden: false, getElementById: id => id === 'broadcast-frame' ? frame : {}, body: { classList: { add() {}, remove() {} } }, addEventListener() {} },
        CreoBroadcastProfiles: { broadcastTarget: c => `/live?channel=${c.id}` }, setTimeout() {}, clearTimeout() {},
        fetch: url => { if (url.includes('/channels/')) return Promise.resolve(response({ channel: { id: url.split('/').pop() } })); const d = deferred(); pending.push(d); return d.promise; }
    });
    vm.runInContext(source, context);
    const newer = vm.runInContext('refresh()', context);
    pending[1].resolve(response({ channelId: 'beta' }));
    await newer;
    pending[0].resolve(response({ channelId: 'alpha' }));
    await new Promise(setImmediate);
    assert.equal(frame.src, '/live?channel=beta');
});

test('missing explicit active item never falls back to a different stale live item', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/auction-live.html'), 'utf8');
    const source = html.match(/function activeItem\(s,items\)\{[^\n]+/)[0];
    const select = vm.runInNewContext(`(${source})`);
    assert.equal(select({ activeItemId: 'current' }, [{ id: 'old', status: 'live' }]), null);
    assert.equal(select({ activeItemId: '', mode: 'standby' }, [{ id: 'old', status: 'live' }]), null);
});

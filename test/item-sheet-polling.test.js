'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
    let now = 100000, seq = 0;
    const tasks = new Map(), listeners = new Map(), calls = [], refreshes = [];
    const h = { channel: 'alpha', tab: 'items', editing: false, hidden: false, calls, refreshes };
    const nodes = Object.fromEntries(['item-sheet-bar', 'item-sheet-open', 'item-sheet-status'].map(id => [id, { style: {}, hidden: false }]));
    const add = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
    const remove = (type, fn) => listeners.get(type)?.delete(fn);
    const schedule = (fn, delay, interval = 0) => { const id = ++seq; tasks.set(id, { fn, at: now + delay, interval }); return id; };
    const document = { get hidden() { return h.hidden; }, getElementById: id => nodes[id], addEventListener: add, removeEventListener: remove };
    const window = { addEventListener: add, removeEventListener: remove, CreoPlatform: { api: async path => { calls.push(path); return h.response(path); } } };
    h.response = async () => ({ configured: true, enabled: true, spreadsheetUrl: 'https://example.test/sheet', lastSuccessAt: 'r1' });
    h.refresh = async () => { refreshes.push(h.channel); };
    vm.runInNewContext(fs.readFileSync(require.resolve('../public/item-sheet-link.js'), 'utf8'), {
        document, window, Date: { now: () => now },
        setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => tasks.delete(id),
        setInterval: (fn, delay) => schedule(fn, delay, delay), clearInterval: id => tasks.delete(id),
    });
    h.mount = () => window.CreoItemSheetLink.mount({ getChannelId: () => h.channel, getTab: () => h.tab, isEditing: () => h.editing, refresh: () => h.refresh() });
    h.flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
    h.event = async type => { for (const fn of listeners.get(type) || []) fn(); await h.flush(); };
    h.advance = async ms => {
        const target = now + ms;
        let budget = 1000;
        while (true) {
            const next = [...tasks].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            assert.ok(--budget > 0, 'polling must not form a busy loop');
            const [id, task] = next; now = task.at;
            if (task.interval) task.at += task.interval; else tasks.delete(id);
            task.fn(); await h.flush();
        }
        now = target; await h.flush();
    };
    h.nodes = nodes; h.tasks = tasks;
    return h;
}

test('sheet status does not poll outside the items tab or in a hidden document', async () => {
    const h = harness(); h.tab = 'vendors'; h.mount(); await h.advance(30000);
    assert.equal(h.calls.length, 0);
    assert.equal(h.nodes['item-sheet-bar'].hidden, true);
    h.tab = 'items'; await h.event('creo:workspace-render'); assert.equal(h.calls.length, 1);
    h.hidden = true; await h.event('visibilitychange'); await h.advance(30000);
    assert.equal(h.calls.length, 1); assert.equal(h.tasks.size, 0);
    h.hidden = false; await h.event('visibilitychange'); assert.equal(h.calls.length, 2);
});

test('visible sheet polling uses one ten-second timer without repeated workspace refreshes', async () => {
    const h = harness(); h.mount(); await h.flush(); await h.advance(30000);
    assert.equal(h.calls.length, 4); assert.equal(h.refreshes.length, 1);
    assert.equal(h.tasks.size, 1);
});

test('browser back-forward restoration resumes polling and pagehide suspends it', async () => {
    const h = harness(); h.mount(); await h.flush();
    await h.event('pagehide'); await h.advance(30000); assert.equal(h.calls.length, 1);
    await h.event('pageshow'); assert.equal(h.calls.length, 2);
    await h.advance(10000); assert.equal(h.calls.length, 3);
});

test('the initial pageshow event does not duplicate the initial request', async () => {
    const h = harness(); h.mount(); await h.event('pageshow'); await h.advance(1);
    assert.equal(h.calls.length, 1);
});

test('a response from before pagehide is discarded after browser restoration', async () => {
    const h = harness(); let resolve;
    h.response = () => new Promise(done => { resolve = done; }); h.mount(); await h.flush();
    await h.event('pagehide'); await h.event('pageshow');
    h.response = async () => ({ configured: true, enabled: true, lastSuccessAt: 'new', spreadsheetUrl: 'https://example.test/new' });
    resolve({ configured: true, lastSuccessAt: 'old' }); await h.flush(); await h.advance(1);
    assert.deepEqual(h.refreshes, ['alpha']);
    assert.equal(h.nodes['item-sheet-open'].href, 'https://example.test/new');
    assert.equal(h.calls.length, 2);
});

test('a delayed old-channel response cannot render or refresh a new channel', async () => {
    const h = harness(); let resolve;
    h.response = () => new Promise(done => { resolve = done; });
    h.mount(); await h.flush();
    h.channel = 'beta'; await h.event('creo:workspace-render');
    h.response = async () => ({ configured: true, enabled: true, spreadsheetUrl: 'https://example.test/beta', lastSuccessAt: 'b1' });
    resolve({ configured: true, spreadsheetUrl: 'https://example.test/alpha', lastSuccessAt: 'a1' });
    await h.flush(); await h.advance(1);
    assert.deepEqual(h.refreshes, ['beta']);
    assert.equal(h.nodes['item-sheet-open'].href, 'https://example.test/beta');
    assert.equal(h.calls.length, 2);
});

test('a response arriving after leaving items cannot refresh the workspace', async () => {
    const h = harness(); let resolve;
    h.response = () => new Promise(done => { resolve = done; }); h.mount(); await h.flush();
    h.tab = 'shipping'; await h.event('creo:workspace-render');
    resolve({ configured: true, lastSuccessAt: 'a1' }); await h.flush(); await h.advance(20000);
    assert.equal(h.refreshes.length, 0); assert.equal(h.calls.length, 1); assert.equal(h.tasks.size, 0);
});

test('edits defer refresh; failed refresh is retried without losing the sheet revision', async () => {
    const h = harness(); h.editing = true; h.mount(); await h.flush();
    assert.equal(h.refreshes.length, 0);
    h.editing = false; let attempts = 0;
    h.refresh = async () => { attempts++; if (attempts === 1) throw Error('temporary failure'); };
    await h.advance(10000); await h.advance(10000); await h.advance(10000);
    assert.equal(attempts, 2);
});

test('poll failures retry at the normal interval and concurrent render events do not overlap requests', async () => {
    const h = harness(); let reject;
    h.response = () => new Promise((_, fail) => { reject = fail; }); h.mount(); await h.flush();
    for (let i = 0; i < 5; i++) await h.event('creo:workspace-render');
    assert.equal(h.calls.length, 1);
    reject(Error('offline')); await h.flush(); await h.advance(9999); assert.equal(h.calls.length, 1);
    h.response = async () => ({ configured: false }); await h.advance(1); assert.equal(h.calls.length, 2);
});

test('disposing a mounted link removes timers and listeners', async () => {
    const h = harness(); const dispose = h.mount(); await h.flush();
    assert.equal(typeof dispose, 'function'); dispose();
    await h.event('pageshow'); await h.event('visibilitychange'); await h.event('creo:workspace-render'); await h.advance(60000);
    assert.equal(h.calls.length, 1); assert.equal(h.tasks.size, 0);
});

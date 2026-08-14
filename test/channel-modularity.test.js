'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Runtime = require('../public/channel-runtime');
const Adapters = require('../public/channel-adapters');
const Profiles = require('../public/broadcast-profiles');
const BroadcastBridge = require('../public/channel-broadcast-bridge');

function channel(id, overrides = {}) {
    return {
        id,
        name: id.toUpperCase(),
        dataAdapter: 'platform',
        broadcastProfile: 'standard',
        features: { auction: true, shipping: true, broadcast: true },
        terminology: {},
        theme: {},
        ...overrides
    };
}

test('one route registry preserves the selected channel on every shared page', () => {
    const routes = Runtime.channelRoutes('summer-cup');
    for (const [name, href] of Object.entries(routes)) {
        const parameter = ['preview', 'live'].includes(name) ? 'event=summer-cup' : 'channel=summer-cup';
        assert.match(href, new RegExp(parameter));
    }
    assert.equal(Runtime.preserveChannel('/shipping.html?mode=all', 'winter-cup'), '/shipping.html?mode=all&channel=winter-cup');
});

test('1P and 2P use one contract while 3P is selected by broadcast profile', () => {
    const standard = channel('standard-cup');
    const tournament = channel('team-cup', { broadcastProfile: 'cdcup-tournament' });
    const academy = channel('academy-cup', { broadcastProfile: 'crewart-academy' });

    assert.strictEqual(Profiles.pageContract(standard, 1), Profiles.pageContract(tournament, 1));
    assert.strictEqual(Profiles.pageContract(tournament, 2), Profiles.pageContract(academy, 2));
    assert.equal(Profiles.pageContract(standard, 3).id, 'scoreboard');
    assert.equal(Profiles.pageContract(tournament, 3).id, 'tournament');
    assert.equal(Profiles.pageContract(academy, 3).id, 'academy');
});

test('shared settings keep channel content overrides separate from profile structure', () => {
    const academy = channel('academy-copy', {
        broadcastProfile: 'crewart-academy',
        broadcastDefaults: { notice: 'Academy live', page1Ticker: 'RGBY', page3Title: 'House cup' }
    });
    const contract = Profiles.settingsContract(academy);
    assert.deepEqual(contract.shared.pages, ['1', '2']);
    assert.ok(contract.shared.sections.some(section => section.id === 'page1'));
    assert.equal(contract.page3.id, 'academy');
    const state = Profiles.defaultState(academy);
    assert.equal(state.notice, 'Academy live');
    assert.equal(state.page1Ticker, 'RGBY');
    assert.equal(state.page3Title, 'House cup');
});

test('CDCUP compatibility is tied to its adapter, not copied channel ids', () => {
    const liveCdcup = channel('cdcup', { dataAdapter: 'legacy-cdcup', broadcastProfile: 'cdcup-tournament' });
    const copiedCdcup = channel('summer-team', { dataAdapter: 'platform', broadcastProfile: 'cdcup-tournament' });

    assert.match(Profiles.studioFrame(liveCdcup, 'layout-1'), /^preview\.html\?/);
    assert.match(Profiles.broadcastTarget(liveCdcup, 2), /^broadcast\.html\?/);
    assert.match(Profiles.studioFrame(copiedCdcup, 'layout-1'), /^preview\.html\?/);
    assert.match(Profiles.broadcastTarget(copiedCdcup, 2), /^broadcast\.html\?/);
    assert.equal(Profiles.usesLegacyData(liveCdcup), true);
    assert.equal(Profiles.usesLegacyData(copiedCdcup), false);
    assert.match(Profiles.studioFrame(copiedCdcup, 'layout-1'), /module=cdcup&channel=summer-team/);
    assert.match(Profiles.broadcastTarget(copiedCdcup, 2), /module=cdcup&channel=summer-team/);
    assert.equal(Profiles.pageContract(copiedCdcup, 3).id, 'tournament');
});

test('CREWART uses the shared CDCUP layout and settings surfaces without changing its live renderer', () => {
    const academy = channel('crewart', { dataAdapter: 'platform', broadcastProfile: 'crewart-academy' });
    assert.match(Profiles.studioFrame(academy, 'layout-1'), /^preview\.html\?module=crewart&channel=crewart&page=1&embedded=1$/);
    assert.match(Profiles.studioFrame(academy, 'layout-2'), /^preview\.html\?module=crewart&channel=crewart&page=2&embedded=1$/);
    assert.match(Profiles.studioFrame(academy, 'layout-3'), /^preview\.html\?module=crewart&channel=crewart&page=3&embedded=1$/);
    assert.match(Profiles.studioFrame(academy, 'settings'), /^settings\.html\?module=crewart&channel=crewart&embedded=1$/);
    assert.match(Profiles.broadcastTarget(academy, 1), /^broadcast\.html\?page=1&module=crewart&channel=crewart&direct=1$/);
});

test('standard channels use the maintained platform controller and renderer', () => {
    const standard = channel('plain-auction');
    assert.match(Profiles.studioFrame(standard, 'layout-2'), /^auction-control\.html\?channel=plain-auction&page=2&embedded=1$/);
    assert.match(Profiles.broadcastTarget(standard, 3), /^auction-live\.html\?channel=plain-auction&page=3$/);
    assert.equal(Profiles.usesLegacyEngine(standard), false);
});

test('legacy CDCUP rows and platform workspaces expose a common isolated model', async (t) => {
    const legacy = Adapters.legacyWorkspace(channel('cdcup'), [
        { row: 7, company: 'A 업체', num: 12, name: '테스트', sold_price: 25, winner: '홍길동', status: '낙찰-대기' }
    ]);
    assert.equal(legacy.items[0].soldPrice, 250000);
    assert.equal(legacy.items[0].vendorId, legacy.vendors[0].id);
    assert.equal(legacy.adapter, 'legacy-cdcup');

    const previous = global.CreoPlatform;
    t.after(() => { global.CreoPlatform = previous; });
    const calls = [];
    global.CreoPlatform = {
        api: async path => {
            calls.push(path);
            return { vendors: [], items: [{ id: path, status: 'sold', soldPrice: 10000 }], shipments: [], assets: [], broadcast: {} };
        }
    };
    const adapter = Adapters.resolve(channel('alpha'));
    const alpha = await adapter.loadWorkspace({ channel: channel('alpha') });
    const beta = await adapter.loadWorkspace({ channel: channel('beta') });
    assert.equal(alpha.items[0].id, 'channels/alpha/workspace');
    assert.equal(beta.items[0].id, 'channels/beta/workspace');
    assert.deepEqual(calls, ['channels/alpha/workspace', 'channels/beta/workspace']);
});

test('legacy-layout bridge keeps renderer identity separate from platform channel data', async () => {
    const calls = [];
    const responses = {
        '/api/platform/channels/academy-copy': { channel: channel('academy-copy', { broadcastProfile: 'crewart-academy', groups: [{ id: 'r', name: 'R', color: '#aa0000' }] }) },
        '/api/platform/channels/academy-copy/broadcast-config': { config: { ticker: '채널 전용 자막' }, revision: 2 },
        '/api/platform/channels/academy-copy/broadcast': { items: [{ id: 'item_1', lotNumber: 7, name: '개체', vendorName: '업체', startPrice: 100000, soldPrice: 250000, status: 'sold', winnerAlias: '낙찰자', groupId: 'r' }] },
        '/api/platform/channels/academy-copy/broadcast-pulse': { revision: 3 }
    };
    const target = {
        location: { search: '?channel=academy-copy&module=crewart' },
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            if (options.method === 'PUT') return { ok: true, json: async () => ({ config: { ticker: '수정 자막' }, revision: 4 }) };
            return { ok: true, json: async () => responses[url] || {} };
        },
        getItems: async () => [{ row: 'legacy' }],
        getConfigMap: async () => ({ legacy: true }),
        getRuntimeConfigMap: async () => ({ legacy: true }),
        updateConfigs: async () => ({}),
        getBroadcastItems: async () => [],
        getBroadcastItemsLite: async () => [],
        getBroadcastItemsCached: async () => [],
        getActiveItem: async () => null,
        enrichBroadcastItem: async item => item,
        getAuctionPulse: async () => ({})
    };
    const bridge = BroadcastBridge.install(target);
    const items = await target.getItems();
    const config = await target.getConfigMap();
    await target.updateConfigs({ ticker: '수정 자막', admin_pw: '제외' });
    assert.equal(bridge.channelId, 'academy-copy');
    assert.equal(bridge.rendererModule, 'crewart');
    assert.equal(items[0].row, 'item_1');
    assert.equal(items[0].sold_price, 25);
    assert.equal(items[0].auctionType, 'crewart');
    assert.equal(config.active_event_module, 'crewart');
    assert.equal(config.crewart_houses, 'R|#aa0000|#aa0000');
    const update = calls.find(call => call.options.method === 'PUT');
    assert.equal(JSON.parse(update.options.body).patch.admin_pw, undefined);
    assert.equal(JSON.parse(update.options.body).patch.active_event_module, 'crewart');
});

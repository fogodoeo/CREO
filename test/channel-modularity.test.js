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
    assert.equal(routes.captures, '/capture-gallery.html?channel=summer-cup');
    assert.equal(routes.print, '/print.html?channel=summer-cup');
});

test('1P and 2P use one contract while 3P is selected by broadcast profile', () => {
    const standard = channel('standard-cup');
    const tournament = channel('team-cup', { broadcastProfile: 'cdcup-tournament' });
    const academy = channel('academy-cup', { broadcastProfile: 'crewart-academy' });

    assert.strictEqual(Profiles.pageContract(standard, 1), Profiles.pageContract(tournament, 1));
    assert.strictEqual(Profiles.pageContract(tournament, 2), Profiles.pageContract(academy, 2));
    assert.deepEqual(Profiles.pageContract(standard, 2).slots, ['item', 'vendorTag', 'liveBidders', 'photo', 'price', 'sold', 'ticker', 'banner']);
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

test('CREYON uses the shared placement editor with an isolated metal renderer', () => {
    const creyon = channel('auction-260810', { dataAdapter: 'platform', broadcastProfile: 'creyon-metal' });
    assert.equal(Profiles.resolve(creyon).rendererModule, 'creyon');
    assert.equal(Profiles.pageContract(creyon, 3).id, 'status');
    assert.match(Profiles.studioFrame(creyon, 'layout-1'), /^preview\.html\?module=creyon&channel=auction-260810&page=1&embedded=1$/);
    assert.match(Profiles.studioFrame(creyon, 'layout-2'), /^preview\.html\?module=creyon&channel=auction-260810&page=2&embedded=1$/);
    assert.match(Profiles.studioFrame(creyon, 'layout-3'), /^preview\.html\?module=creyon&channel=auction-260810&page=3&embedded=1$/);
    assert.match(Profiles.studioFrame(creyon, 'settings'), /^settings\.html\?module=creyon&channel=auction-260810&embedded=1$/);
    assert.match(Profiles.broadcastTarget(creyon, 2), /^broadcast\.html\?page=2&module=creyon&channel=auction-260810&direct=1$/);
    assert.equal(Profiles.resolve(creyon).defaultState.notice, 'CREYON');
    assert.doesNotMatch(JSON.stringify(Profiles.resolve(creyon).defaultState), /CREYON LIVE/);
    const hosts = Profiles.settingsContract(creyon).shared.sections.find(section => section.id === 'hosts');
    assert.deepEqual(hosts.fields, ['hostName1', 'hostRole1', 'hostName2', 'hostRole2', 'hostName3', 'hostRole3']);

    const bridged = BroadcastBridge.toLegacyItem({
        id: 'live_item', name: 'A12', vendorName: '쭌이네', status: 'live', bidLog: [{ name: '입찰자', bidder_key: 'bidder-1', amount: 42, region: '서울' }],
        attributes: {
            checklist: 'gender:M|weight:42', photo_sire: '/sire.webp', start_time: '2026-08-20T10:00:00Z',
            crewart_house_key: 'G', crewart_house_source: 'survey',
            crewart_contribution_amount: 0, crewart_contribution_effective_at: '2026-08-20T10:00:02Z'
        }
    }, 'creyon');
    assert.equal(bridged.status, '진행중');
    assert.deepEqual(JSON.parse(bridged.bid_log), [{ name: '입찰자', bidder_key: 'bidder-1', amount: 42, region: '서울' }]);
    assert.equal(bridged.company, '쭌이네');
    assert.equal(bridged.vendorName, '쭌이네');
    assert.equal(bridged.auctionType, 'extra');
    assert.equal(bridged.visibilityMode, 'public');
    assert.equal(bridged.checklist, 'gender:M|weight:42|_auction:extra|_visibility:public');
    assert.equal(bridged.photoSire, '/sire.webp');
    assert.equal(bridged.start_time, '2026-08-20T10:00:00Z');
    assert.equal(bridged.crewartHouseKey, 'G');
    assert.equal(bridged.crewartHouseSource, 'survey');
    assert.equal(bridged.attributes.crewart_contribution_amount, 0);
    assert.equal(bridged.attributes.crewart_contribution_effective_at, '2026-08-20T10:00:02Z');

    const explicitTournament = BroadcastBridge.toLegacyItem({
        id: 'tournament_item',
        attributes: { checklist: 'gender:F|_auction:tournament' }
    }, 'creyon');
    assert.equal(explicitTournament.checklist, 'gender:F|_auction:tournament');

    const explicitBlind = BroadcastBridge.toLegacyItem({
        id: 'blind_item',
        attributes: { checklist: '_auction:extra|_visibility:blind' }
    }, 'creyon');
    assert.equal(explicitBlind.visibilityMode, 'blind');
    assert.equal(explicitBlind.checklist, '_auction:extra|_visibility:blind');

    const malformedMetadata = BroadcastBridge.toLegacyItem({
        id: 'malformed_item', name: 'B22', vendorName: '쭌이네',
        attributes: { checklist: '_auction:unknown|_visibility:unknown' }
    }, 'creyon');
    assert.equal(malformedMetadata.auctionType, 'extra');
    assert.equal(malformedMetadata.visibilityMode, 'public');
    assert.match(malformedMetadata.checklist, /_auction:extra\|_visibility:public$/);
});

test('non-CDCUP legacy-layout URLs fail closed when their channel is missing', async () => {
    const target = { location: { search: '?module=creyon' }, fetch: async () => ({ ok: true, json: async () => ({}) }) };
    const bridge = BroadcastBridge.install(target);
    assert.equal(bridge.guarded, true);
    await assert.rejects(target.getBroadcastItemsLite(), /송출 채널이 지정되지 않았습니다/);
});

test('standard channels use the maintained platform controller and renderer', () => {
    const standard = channel('plain-auction');
    assert.match(Profiles.studioFrame(standard, 'layout-2'), /^auction-control\.html\?channel=plain-auction&page=2&embedded=1$/);
    assert.match(Profiles.broadcastTarget(standard, 3), /^auction-live\.html\?channel=plain-auction&page=3$/);
    assert.equal(Profiles.usesLegacyEngine(standard), false);
    assert.deepEqual(Profiles.SHARED_PAGE2_DEFAULTS, {
        page2VendorTagOn: true,
        page2BiddersOn: true,
        page2BiddersOpacity: 94,
        page2BiddersFontSize: 20,
        page2ItemFontSize: 33,
        page2BiddersPosition: 'top-left'
    });
    for (const profile of ['standard', 'cdcup-tournament', 'crewart-academy', 'creyon-metal']) {
        const state = Profiles.defaultState(channel(`shared-${profile}`, { broadcastProfile: profile }));
        assert.equal(state.page2VendorTagOn, true);
        assert.equal(state.page2BiddersOn, true);
        assert.equal(state.page2BiddersOpacity, 94);
        assert.equal(state.page2BiddersFontSize, 20);
        assert.equal(state.page2ItemFontSize, 33);
        assert.equal(state.page2BiddersPosition, 'top-left');
    }
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

test('platform shipping items do not infer tournament teams from A01/B01-style names', () => {
    const rows = Adapters.platformShippingItems({
        vendors: [{ id: 'vendor_jjunine', name: '쭌이네' }],
        shipments: [],
        items: [
            { id: 'item_b01', lotNumber: 22, name: 'B01', vendorId: 'vendor_jjunine', status: 'sold', soldPrice: 100000 },
            { id: 'item_explicit', lotNumber: 23, name: 'B02', vendorId: 'vendor_jjunine', status: 'sold', soldPrice: 100000, attributes: { checklist: 'weight:42|_auction:tournament|_team:B' } }
        ]
    }, channel('crewart', { broadcastProfile: 'crewart-academy', features: { tournament: false } }));

    assert.equal(rows[0].company, '쭌이네');
    assert.equal(rows[0].checklist, '_auction:crewart|_visibility:public');
    assert.equal(rows[1].checklist, 'weight:42|_auction:crewart|_visibility:public');
});

test('CREWART broadcast strips copied CDCUP metadata even when the item is named A01', () => {
    const bridged = BroadcastBridge.toLegacyItem({
        id: 'item_a01',
        lotNumber: 1,
        name: 'A01',
        groupId: 'A',
        teamName: 'A팀',
        attributes: { checklist: 'weight:42|_auction:tournament|_visibility:blind|_stage:4|_slot:A1|_team:A' }
    }, 'crewart');

    assert.equal(bridged.auctionType, 'crewart');
    assert.equal(bridged.visibilityMode, 'public');
    assert.equal(bridged.teamCode, '');
    assert.equal(bridged.teamName, '');
    assert.equal(bridged.groupId, '');
    assert.equal(bridged.checklist, 'weight:42|_auction:crewart|_visibility:public');
});

test('CREWART bridge preserves the public won amount beside the legacy manwon field', () => {
    const bridged = BroadcastBridge.toLegacyItem({
        id: 'item_one_manwon',
        soldPrice: 10_000,
        status: 'sold',
        attributes: { crewart_house_key: 'Y' }
    }, 'crewart');

    assert.equal(bridged.sold_price, 1);
    assert.equal(bridged.soldPrice, 1);
    assert.equal(bridged.sold_price_won, 10_000);
    assert.equal(bridged.soldPriceWon, 10_000);
});

test('legacy-layout bridge keeps renderer identity separate from platform channel data', async () => {
    const calls = [];
    const responses = {
        '/api/platform/channels/academy-copy': { channel: channel('academy-copy', { broadcastProfile: 'crewart-academy', groups: [{ id: 'r', name: 'R', color: '#aa0000' }] }) },
        '/api/platform/channels/academy-copy/broadcast-config': { config: { ticker: '채널 전용 자막' }, revision: 2 },
        '/api/platform/channels/academy-copy/broadcast': { items: [{ id: 'item_1', lotNumber: 7, name: '개체', vendorName: '업체', startPrice: 100000, soldPrice: 250000, status: 'sold', winnerAlias: '낙찰자', groupId: 'r', bidLog: [{ name: '입찰자', amount: 30, phone: '01012345678' }] }] },
        '/api/platform/channels/academy-copy/audience': { audience: { sessionId: 'session-1', events: [], roulette: { events: [] } } },
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
    const audience = await target.getCrewartAudience();
    await target.updateConfigs({ ticker: '수정 자막', admin_pw: '제외' });
    assert.equal(bridge.channelId, 'academy-copy');
    assert.equal(bridge.rendererModule, 'crewart');
    assert.equal(items[0].row, 'item_1');
    assert.equal(items[0].sold_price, 25);
    assert.equal(items[0].auctionType, 'crewart');
    assert.deepEqual(JSON.parse(items[0].bid_log), [{ name: '입찰자', amount: 30, phone: '01012345678' }]);
    assert.equal(config.active_event_module, 'crewart');
    assert.equal(config.crewart_houses, 'R|#aa0000|#aa0000');
    assert.equal(config.live_bidders_show, '1');
    assert.equal(config.live_bidders_opacity, '94');
    assert.equal(audience.sessionId, 'session-1');
    assert.equal(target.__creoAudience.sessionId, 'session-1');
    const update = calls.find(call => call.options.method === 'PUT');
    assert.equal(JSON.parse(update.options.body).patch.admin_pw, undefined);
    assert.equal(JSON.parse(update.options.body).patch.active_event_module, 'crewart');
});

test('legacy-layout P2 follows authoritative broadcast state instead of stale item statuses', () => {
    const rows = BroadcastBridge.toLegacyBroadcastItems({
        state: { mode: 'live', activeItemId: 'item_new' },
        items: [
            { id: 'item_old', name: '이전 개체', status: 'live' },
            { id: 'item_new', name: '현재 개체', status: 'waiting' }
        ]
    }, 'crewart');
    assert.equal(rows.find(item => item.id === 'item_old').status, '대기');
    assert.equal(rows.find(item => item.id === 'item_new').status, '진행중');

    const standby = BroadcastBridge.toLegacyBroadcastItems({
        state: { mode: 'standby', activeItemId: '' },
        items: [{ id: 'stale_live', name: '오래된 진행값', status: 'live' }]
    }, 'crewart');
    assert.equal(standby[0].status, '대기');
});

test('platform pickup shipping keeps the selected channel pickup location', async (t) => {
    const previous = global.CreoPlatform;
    t.after(() => { global.CreoPlatform = previous; });
    let savedRecord = null;
    global.CreoPlatform = {
        api: async (path, options) => {
            savedRecord = JSON.parse(options.body).record;
            return { record: { ...savedRecord, id: 'shipment_one' } };
        }
    };
    const adapter = Adapters.resolve(channel('creyon'));
    const context = {
        channel: channel('creyon'),
        workspace: {
            vendors: [{ id: 'vendor_one', name: '크레용 본점' }],
            items: [{ id: 'item_one', lotNumber: 1, name: '테스트 개체', vendorId: 'vendor_one', winnerName: '낙찰자' }],
            shipments: []
        }
    };

    await adapter.saveShippingItem(context, 'item_one', {
        shipping_type: '직접수령',
        shipping_region: '크레용 대구지점',
        shipping_company: '사용하지 않음',
        shipping_cost: 19000
    });

    assert.equal(savedRecord.method, 'pickup');
    assert.equal(savedRecord.address, '크레용 대구지점');
    assert.equal(savedRecord.carrier, '');
    assert.equal(savedRecord.cost, 0);
});

test('embedded layout editors notify the studio when their admin session expires', async () => {
    const messages = [];
    const parent = { postMessage: (...args) => messages.push(args) };
    const target = {
        location: { search: '?channel=alpha&module=creyon', origin: 'https://creo.test' },
        parent,
        fetch: async () => ({ status: 401, ok: false, json: async () => ({ error: '관리자 인증이 필요합니다.' }) })
    };
    BroadcastBridge.install(target);
    await assert.rejects(target.getConfigMap(), /관리자 인증이 필요합니다/);
    assert.deepEqual(messages, [[{ type: 'creo-admin-required' }, 'https://creo.test']]);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createPlatformApi } = require('../platform-api');
const { normalizeChannel } = require('../platform-core');

class MemoryRepository {
    constructor() {
        this.catalog = { version: 1, channels: [normalizeChannel({ id: 'alpha', name: '알파', status: 'active' }), normalizeChannel({ id: 'beta', name: '베타', status: 'active' })] };
        this.records = new Map();
        this.active = 'alpha';
        this.catalogReads = 0;
    }
    key(channel, type, id) { return `${channel}:${type}:${id}`; }
    async verifyAdmin(value) { return value === 'secret'; }
    async getCatalog() { this.catalogReads += 1; return structuredClone(this.catalog); }
    async saveCatalog(channels) { this.catalog = { version: this.catalog.version + 1, channels: structuredClone(channels) }; return this.getCatalog(); }
    async listRecords(channel, type) { return [...this.records.entries()].filter(([key]) => key.startsWith(`${channel}:${type}:`)).map(([, value]) => structuredClone(value)); }
    async getRecord(channel, type, id) { return structuredClone(this.records.get(this.key(channel, type, id)) || null); }
    async upsertRecord(channel, type, value) { const record = { ...value, channelId: channel }; this.records.set(this.key(channel, type, value.id), record); return structuredClone(record); }
    async deleteRecord(channel, type, id) { this.records.delete(this.key(channel, type, id)); }
    async upsertRows(rows) { for (const row of rows) this.records.set(`config:${row.key}`, { ...row }); }
    async health() { return { ok: true }; }
    async getActiveChannel() { return this.active; }
    async setActiveChannel(value) { this.active = value; return value; }
}

test('shipping rate refresh persists the collected public data before replying', async () => {
    const repository = new MemoryRepository();
    const payload = { updated: '2026-08-19', source: 'test', data: { 수도권: [{ shop: '테스트 거점', cost: 19000 }] } };
    const api = createPlatformApi({
        repository,
        logger: { error() {} },
        refreshShippingRateFn: async (company, options) => {
            assert.equal(company, '파르게');
            assert.equal(options.force, true);
            return { company, count: 1, payload, cached: false };
        }
    });

    const response = await call(api, 'POST', '/api/platform/shipping-rates/refresh', { company: '파르게', force: true });
    assert.equal(response.status, 200);
    assert.equal(response.json().persisted, true);
    assert.deepEqual(JSON.parse(repository.records.get('config:shipping_rate_parge').value), payload);
    assert.ok(repository.records.get('config:runtime_config_version').value);
});

class ResponseCapture {
    writeHead(status, headers) { this.status = status; this.headers = headers; }
    end(body = '') { this.body = String(body); }
    json() { return JSON.parse(this.body || '{}'); }
}

function req(method, body, admin = 'secret', headers = {}) {
    const request = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    request.method = method;
    request.headers = { ...headers, ...(admin ? { 'x-creo-admin': admin } : {}) };
    return request;
}

async function call(api, method, pathname, body, admin = 'secret', headers = {}) {
    const response = new ResponseCapture();
    await api.handle(req(method, body, admin, headers), response, new URL(`https://creo.test${pathname}`));
    return response;
}

test('admin login exchanges the password for an HttpOnly session and logout revokes it', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const requestHeaders = { 'x-forwarded-for': '203.0.113.8', 'x-forwarded-proto': 'https' };

    const rejected = await call(api, 'POST', '/api/platform/auth/login', { password: 'wrong' }, '', requestHeaders);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['Set-Cookie'], undefined);

    const login = await call(api, 'POST', '/api/platform/auth/login', { password: 'secret' }, '', requestHeaders);
    assert.equal(login.status, 200);
    assert.equal(login.json().authenticated, true);
    assert.match(login.headers['Set-Cookie'], /^creo_admin_session=/);
    assert.match(login.headers['Set-Cookie'], /HttpOnly/);
    assert.match(login.headers['Set-Cookie'], /SameSite=Strict/);
    assert.match(login.headers['Set-Cookie'], /Secure/);

    const cookie = login.headers['Set-Cookie'].split(';')[0];
    const sessionHeaders = { ...requestHeaders, cookie };
    const session = await call(api, 'GET', '/api/platform/admin-check', null, '', sessionHeaders);
    assert.equal(session.json().authenticated, true);
    const protectedChannels = await call(api, 'GET', '/api/platform/channels', null, '', sessionHeaders);
    assert.equal(protectedChannels.json().channels.length, 2);

    const logout = await call(api, 'POST', '/api/platform/auth/logout', {}, '', sessionHeaders);
    assert.equal(logout.status, 200);
    assert.match(logout.headers['Set-Cookie'], /Max-Age=0/);
    const expired = await call(api, 'GET', '/api/platform/admin-check', null, '', sessionHeaders);
    assert.equal(expired.json().authenticated, false);
});

test('operational channel lists hide archived channels unless the admin manager requests them', async () => {
    const repository = new MemoryRepository();
    repository.catalog.channels[1].status = 'archived';
    const api = createPlatformApi({ repository, logger: { error() {} } });

    const operational = await call(api, 'GET', '/api/platform/channels');
    assert.deepEqual(operational.json().channels.map(channel => channel.id), ['alpha']);

    const manager = await call(api, 'GET', '/api/platform/channels?includeArchived=1');
    assert.deepEqual(manager.json().channels.map(channel => channel.id), ['alpha', 'beta']);

    const publicAttempt = await call(api, 'GET', '/api/platform/channels?includeArchived=1', null, '');
    assert.deepEqual(publicAttempt.json().channels.map(channel => channel.id), ['alpha']);
});

test('signed admin sessions survive an API restart but reject another secret or a tampered token', async () => {
    const repository = new MemoryRepository();
    const options = { repository, logger: { error() {} }, adminSessionSecret: 'stable-deploy-secret' };
    const firstApi = createPlatformApi(options);
    const headers = { 'x-forwarded-for': '203.0.113.10', 'x-forwarded-proto': 'https' };
    const login = await call(firstApi, 'POST', '/api/platform/auth/login', { password: 'secret' }, '', headers);
    const cookie = login.headers['Set-Cookie'].split(';')[0];

    const restartedApi = createPlatformApi(options);
    const restarted = await call(restartedApi, 'GET', '/api/platform/admin-check', null, '', { ...headers, cookie });
    assert.equal(restarted.json().authenticated, true);

    const otherApi = createPlatformApi({ ...options, adminSessionSecret: 'different-secret' });
    const rejected = await call(otherApi, 'GET', '/api/platform/admin-check', null, '', { ...headers, cookie });
    assert.equal(rejected.json().authenticated, false);

    const tamperedCookie = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`;
    const tampered = await call(restartedApi, 'GET', '/api/platform/admin-check', null, '', { ...headers, cookie: tamperedCookie });
    assert.equal(tampered.json().authenticated, false);
});

test('admin login throttles repeated incorrect passwords', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    for (let index = 0; index < 6; index += 1) {
        const response = await call(api, 'POST', '/api/platform/auth/login', { password: 'wrong' }, '', headers);
        assert.equal(response.status, 401);
    }
    const blocked = await call(api, 'POST', '/api/platform/auth/login', { password: 'secret' }, '', headers);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers['Retry-After']) > 0);
});

test('vendor records with identical ids remain isolated by channel', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    let response = await call(api, 'POST', '/api/platform/channels/alpha/vendors', { record: { id: 'same', name: '알파 업체' } });
    assert.equal(response.status, 201);
    response = await call(api, 'POST', '/api/platform/channels/beta/vendors', { record: { id: 'same', name: '베타 업체' } });
    assert.equal(response.status, 201);
    const alpha = await call(api, 'GET', '/api/platform/channels/alpha/workspace');
    const beta = await call(api, 'GET', '/api/platform/channels/beta/workspace');
    assert.equal(alpha.json().vendors[0].name, '알파 업체');
    assert.equal(beta.json().vendors[0].name, '베타 업체');
});

test('duplicating a legacy channel keeps its broadcast profile but starts on isolated platform data', async () => {
    const repository = new MemoryRepository();
    repository.catalog.channels[0] = normalizeChannel({
        ...repository.catalog.channels[0],
        dataAdapter: 'legacy-cdcup',
        broadcastProfile: 'cdcup-tournament',
        pages: { archives: '/legacy-archives.html' },
        legacy: { items: true, managementUrl: '/legacy.html', controlUrl: '/legacy-control.html' }
    });
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-state', { hostName1: '공통 진행자', page1Ticker: '복제 자막' });
    await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-config', { patch: { ticker: '복제 자막', bracket_full_show: '1' } });
    const response = await call(api, 'POST', '/api/platform/channels/alpha/duplicate', {
        channel: { id: 'alpha-copy', name: '알파 복제' },
        expectedVersion: repository.catalog.version
    });
    assert.equal(response.status, 201);
    assert.equal(response.json().channel.dataAdapter, 'platform');
    assert.equal(response.json().channel.broadcastProfile, 'cdcup-tournament');
    assert.deepEqual(response.json().channel.pages, {});
    assert.equal(response.json().channel.legacy.items, false);
    const workspace = await call(api, 'GET', '/api/platform/channels/alpha-copy/workspace');
    assert.deepEqual(workspace.json().items, []);
    assert.deepEqual(workspace.json().vendors, []);
    assert.equal(workspace.json().broadcast.hostName1, '공통 진행자');
    const copiedConfig = await call(api, 'GET', '/api/platform/channels/alpha-copy/broadcast-config', null, '');
    assert.equal(copiedConfig.json().config.ticker, '복제 자막');
    assert.equal(copiedConfig.json().config.bracket_full_show, '1');
});

test('channel broadcast layout config is public-read, admin-write, isolated, and sanitized', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const denied = await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-config', { patch: { ticker: '거부' } }, '');
    assert.equal(denied.status, 401);
    let response = await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-config', {
        patch: { ticker: '알파 자막', bracket_full_show: 1, admin_pw: '노출 금지', 'bad key': '제외' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().config.ticker, '알파 자막');
    assert.equal(response.json().config.bracket_full_show, '1');
    assert.equal(response.json().config.admin_pw, undefined);
    response = await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-config', { patch: { ticker: null } });
    assert.equal(response.json().config.ticker, undefined);
    const alpha = await call(api, 'GET', '/api/platform/channels/alpha/broadcast-config', null, '');
    const beta = await call(api, 'GET', '/api/platform/channels/beta/broadcast-config', null, '');
    assert.equal(alpha.status, 200);
    assert.equal(alpha.json().config.bracket_full_show, '1');
    assert.deepEqual(beta.json().config, {});
});

test('an item cannot reference a vendor from another channel', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/vendors', { record: { id: 'alpha_vendor', name: '알파 업체' } });
    const response = await call(api, 'POST', '/api/platform/channels/beta/items', { record: { lotNumber: 1, name: '개체', vendorId: 'alpha_vendor' } });
    assert.equal(response.status, 422);
    assert.match(response.json().error, /등록되지 않은 업체/);
});

test('public broadcast payload excludes shipping and winner contacts', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await repository.upsertRecord('alpha', 'item', { id: 'item_1', lotNumber: 1, name: '개체', winnerPhone: '01000000000' });
    const response = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    assert.equal(response.status, 200);
    assert.equal(response.json().items[0].winnerPhone, undefined);
});

test('group assignments are channel-configured and enrich public scoreboard data', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const catalog = await repository.getCatalog();
    const alpha = normalizeChannel({ ...catalog.channels.find((channel) => channel.id === 'alpha'), groups: [{ id: 'red', name: 'RED', color: '#aa0000' }] });
    await repository.saveCatalog(catalog.channels.map((channel) => channel.id === 'alpha' ? alpha : channel));
    await call(api, 'POST', '/api/platform/channels/alpha/vendors', { record: { id: 'vendor_red', name: 'RED 업체', groupId: 'red' } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_red', lotNumber: 1, name: '개체', vendorId: 'vendor_red', soldPrice: 50000, status: 'sold', points: 5 } });
    const response = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    assert.equal(response.status, 200);
    assert.equal(response.json().items[0].groupId, 'red');
    assert.equal(response.json().items[0].points, 5);
});

test('separate rankings channel aggregates live data without archive duplication', async () => {
    const repository = new MemoryRepository();
    repository.catalog.channels[0] = normalizeChannel({
        ...repository.catalog.channels[0],
        scoreboards: [{ id: 'vendors', name: 'Vendor totals', dimension: 'vendor', metric: 'soldAmount', unit: 'KRW', topN: 8 }]
    });
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/vendors', { record: { id: 'alpha_vendor', name: 'Alpha vendor' } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'alpha_item', lotNumber: 1, name: 'Alpha item', vendorId: 'alpha_vendor', status: 'sold', soldPrice: 120000, winnerPhone: '01012345678' } });
    const response = await call(api, 'GET', '/api/platform/channels/alpha/rankings', null, '');
    assert.equal(response.status, 200);
    assert.equal(response.json().scoreboards[0].rows[0].total, 120000);
    assert.equal(JSON.stringify(response.json()).includes('01012345678'), false);
});

test('round archives preserve the episode snapshot and ranking detail per channel', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/vendors', { record: { id: 'alpha_vendor', name: 'alpha vendor' } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'alpha_item', lotNumber: 1, name: 'alpha item', vendorId: 'alpha_vendor', status: 'sold', soldPrice: 120000, winnerName: 'winner' } });
    await call(api, 'POST', '/api/platform/channels/beta/vendors', { record: { id: 'beta_vendor', name: 'beta vendor' } });
    await call(api, 'POST', '/api/platform/channels/beta/items', { record: { id: 'beta_item', lotNumber: 1, name: 'beta item', vendorId: 'beta_vendor', status: 'sold', soldPrice: 90000 } });

    let response = await call(api, 'POST', '/api/platform/channels/alpha/archives', { title: 'alpha round' });
    assert.equal(response.status, 201);
    assert.equal(response.json().archive.title, 'alpha round');
    const archiveId = response.json().archive.id;

    response = await call(api, 'GET', '/api/platform/channels/alpha/archives');
    assert.equal(response.json().archives.length, 1);
    const listed = response.json().archives[0];
    assert.equal(listed.itemCount, 1);
    assert.equal(listed.soldCount, 1);
    assert.equal(listed.totalSoldAmount, 120000);
    const stored = await repository.getRecord('alpha', 'archive', archiveId);
    assert.equal(stored.items.length, 1);
    assert.ok(Array.isArray(stored.scoreboards));
    const detail = await call(api, 'GET', `/api/platform/channels/alpha/archives/${archiveId}`);
    const archive = detail.json().archive;
    assert.equal(archive.items[0].name, 'alpha item');
    assert.ok(Array.isArray(archive.scoreboards));
    const beta = await call(api, 'GET', '/api/platform/channels/beta/archives');
    assert.equal(beta.json().archives.length, 0);
});
test('public broadcast hides a quiz answer until the operator closes the quiz', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-state', {
        page3On: true, quizOn: true, quizStatus: 'open', quizQuestion: '문제', quizAnswer: '비밀 정답'
    });
    let response = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    assert.equal(response.json().state.quizAnswer, '');
    await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-state', {
        page3On: true, quizOn: true, quizStatus: 'closed', quizQuestion: '문제', quizAnswer: '비밀 정답'
    });
    response = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    assert.equal(response.json().state.quizAnswer, '비밀 정답');
});

test('universal broadcast channel can only switch to a catalog channel', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    let response = await call(api, 'PUT', '/api/platform/active-channel', { channelId: 'beta' });
    assert.equal(response.status, 409);
    assert.equal(response.json().code, 'ACTIVE_CHANNEL_CHANGED');
    assert.equal(repository.active, 'alpha');
    response = await call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'beta', expectedCurrentChannelId: 'alpha', confirmChannelId: 'beta'
    });
    assert.equal(response.status, 200);
    assert.equal(repository.active, 'beta');
    response = await call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'alpha', expectedCurrentChannelId: 'alpha', confirmChannelId: 'alpha'
    });
    assert.equal(response.status, 409);
    assert.equal(response.json().code, 'ACTIVE_CHANNEL_CHANGED');
    assert.equal(repository.active, 'beta');
    response = await call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'missing', expectedCurrentChannelId: 'beta', confirmChannelId: 'missing'
    });
    assert.equal(response.status, 422);
    assert.equal(repository.active, 'beta');
});

test('active platform auction locks the global channel until the auction ends', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', {
        record: { id: 'item_live', lotNumber: 1, name: '진행 개체' }
    });
    let response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_live', status: 'live', mode: 'live', state: { page: 2 }
    });
    assert.equal(response.status, 200);
    response = await call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'beta', expectedCurrentChannelId: 'alpha', confirmChannelId: 'beta'
    });
    assert.equal(response.status, 409);
    assert.equal(response.json().code, 'ACTIVE_AUCTION_LOCKED');
    assert.equal(repository.active, 'alpha');
    response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_live', status: 'sold', mode: 'sold', item: { soldPrice: 100000 }
    });
    assert.equal(response.status, 200);
    response = await call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'beta', expectedCurrentChannelId: 'alpha', confirmChannelId: 'beta'
    });
    assert.equal(response.status, 200);
    assert.equal(repository.active, 'beta');
});

test('simultaneous channel switches serialize and reject the stale operator', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    let markFirstEntered;
    let releaseFirst;
    const firstEntered = new Promise((resolve) => { markFirstEntered = resolve; });
    const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
    const setActiveChannel = repository.setActiveChannel.bind(repository);
    repository.setActiveChannel = async (value) => {
        if (value === 'beta') {
            markFirstEntered();
            await firstRelease;
        }
        return setActiveChannel(value);
    };
    const firstPromise = call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'beta', expectedCurrentChannelId: 'alpha', confirmChannelId: 'beta'
    });
    await firstEntered;
    const stalePromise = call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'alpha', expectedCurrentChannelId: 'alpha', confirmChannelId: 'alpha'
    });
    releaseFirst();
    const [first, stale] = await Promise.all([firstPromise, stalePromise]);
    assert.equal(first.status, 200);
    assert.equal(stale.status, 409);
    assert.equal(stale.json().code, 'ACTIVE_CHANNEL_CHANGED');
    assert.equal(repository.active, 'beta');
});

test('public active-channel lookup heals a stale deleted pointer', async () => {
    const repository = new MemoryRepository();
    repository.catalog.channels.push(normalizeChannel({ id: 'draft-copy', name: 'Draft copy', status: 'draft' }));
    repository.active = 'draft-copy';
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const response = await call(api, 'GET', '/api/platform/active-channel', null, '');
    assert.equal(response.status, 200);
    assert.equal(response.json().channelId, 'alpha');
    assert.equal(repository.active, 'alpha');
});

test('operator context binds the monitor to one authenticated active-channel contract', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_one', lotNumber: 1, name: '첫 개체' } });
    const rejected = await call(api, 'GET', '/api/platform/operator-context', null, '');
    assert.equal(rejected.status, 401);
    const response = await call(api, 'GET', '/api/platform/operator-context');
    assert.equal(response.status, 200);
    assert.equal(response.json().activeChannelId, 'alpha');
    assert.equal(response.json().adapter, 'platform');
    assert.equal(response.json().workspace.items[0].id, 'item_one');
});

test('auction transition keeps item status, active channel, and broadcast state in sync', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_one', lotNumber: 1, name: '첫 개체' } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_two', lotNumber: 2, name: '둘째 개체' } });

    let response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_one', status: 'live', mode: 'live', state: { page: 2 }
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().item.status, 'live');
    assert.equal(response.json().state.activeItemId, 'item_one');
    assert.equal(response.json().state.mode, 'live');

    response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_two', status: 'live', mode: 'live', state: { page: 2 }
    });
    assert.equal(response.status, 200);
    assert.equal((await repository.getRecord('alpha', 'item', 'item_one')).status, 'waiting');
    assert.equal((await repository.getRecord('alpha', 'item', 'item_two')).status, 'live');

    response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_two', status: 'sold', mode: 'sold', item: { soldPrice: 180000, winnerAlias: '낙찰자' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().item.soldPrice, 180000);
    assert.equal(response.json().item.winnerAlias, '낙찰자');
    assert.equal(response.json().state.mode, 'sold');
    assert.equal(repository.active, 'alpha');

    response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_two', status: 'waiting', mode: 'standby'
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().item.status, 'waiting');
    assert.equal(response.json().state.mode, 'standby');

    response = await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        mode: 'standby', state: { activeItemId: '' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().state.activeItemId, '');
});

test('ordinary item edits cannot downgrade a live auction with stale cached status', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', {
        record: { id: 'item_one', lotNumber: 1, name: '첫 개체', status: 'waiting' }
    });
    await call(api, 'PUT', '/api/platform/channels/alpha/auction-transition', {
        itemId: 'item_one', status: 'live', mode: 'live', state: { page: 2 }
    });

    const response = await call(api, 'PUT', '/api/platform/channels/alpha/items/item_one', {
        record: { id: 'item_one', lotNumber: 1, name: '수정된 개체', status: 'waiting' }
    });

    assert.equal(response.status, 200);
    assert.equal(response.json().record.name, '수정된 개체');
    assert.equal(response.json().record.status, 'live');
    assert.equal((await repository.getRecord('alpha', 'item', 'item_one')).status, 'live');
});

test('auction transitions remain isolated when two channels reuse the same item id', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const catalog = await call(api, 'GET', '/api/platform/channels');
    const revision = catalog.json().revision;
    await call(api, 'PUT', '/api/platform/channels', {
        revision,
        channels: [
            ...catalog.json().channels,
            { id: 'beta', name: '두 번째 채널', dataAdapter: 'platform', status: 'ready' }
        ]
    });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'shared_item', lotNumber: 1, name: '알파 개체' } });
    await call(api, 'POST', '/api/platform/channels/beta/items', { record: { id: 'shared_item', lotNumber: 1, name: '베타 개체' } });

    let rejected = await call(api, 'PUT', '/api/platform/channels/beta/auction-transition', {
        itemId: 'shared_item', status: 'live', mode: 'live', state: { page: 2 }
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.json().code, 'ACTIVE_CHANNEL_CHANGED');
    assert.equal((await repository.getRecord('beta', 'item', 'shared_item')).status, 'waiting');

    let switchResponse = await call(api, 'PUT', '/api/platform/active-channel', {
        channelId: 'beta', expectedCurrentChannelId: 'alpha', confirmChannelId: 'beta'
    });
    assert.equal(switchResponse.status, 200);

    const response = await call(api, 'PUT', '/api/platform/channels/beta/auction-transition', {
        itemId: 'shared_item', status: 'live', mode: 'live', state: { page: 2 }
    });
    assert.equal(response.status, 200);
    assert.equal((await repository.getRecord('beta', 'item', 'shared_item')).status, 'live');
    assert.equal((await repository.getRecord('alpha', 'item', 'shared_item')).status, 'waiting');
    assert.equal(repository.active, 'beta');
});

test('referenced vendors and items cannot be deleted out from under shipments', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/vendors', { record: { id: 'vendor_one', name: '업체' } });
    await call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_one', lotNumber: 1, name: '개체', vendorId: 'vendor_one' } });
    await call(api, 'POST', '/api/platform/channels/alpha/shipments', { record: { id: 'ship_one', itemId: 'item_one', vendorId: 'vendor_one' } });
    const vendorDelete = await call(api, 'DELETE', '/api/platform/channels/alpha/vendors/vendor_one');
    const itemDelete = await call(api, 'DELETE', '/api/platform/channels/alpha/items/item_one');
    assert.equal(vendorDelete.status, 409);
    assert.equal(itemDelete.status, 409);
});

test('channel shipping can snapshot a legacy CDCUP item without weakening channel isolation', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const response = await call(api, 'POST', '/api/platform/channels/alpha/shipments', {
        record: { id: 'legacy_ship', itemId: 'legacy_17', itemName: '기존 개체', itemLotNumber: 17, itemVendorName: '기존 업체' }
    });
    assert.equal(response.status, 201);
    assert.equal(response.json().record.itemName, '기존 개체');
    assert.equal(response.json().record.itemLotNumber, 17);
    const beta = await call(api, 'GET', '/api/platform/channels/beta/workspace');
    assert.equal(beta.json().shipments.length, 0);
});

test('broadcast state stores independent 1P, 2P, and 3P overlay controls', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const response = await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-state', {
        activeItemId: 'item_1', mode: 'sold', page: 2,
        hostName1: '진행자', hostName3: '게스트', hostRole3: '전문가', page1TickerOn: false, page1BannerOn: true,
        page1BannerUrl: 'https://example.com/banner.png', page1HostsPosition: 'bottom-left',
        page1TickerPosition: 'top', page2SoldOn: true, page2PhotoPosition: 'middle-right',
        page2PricePosition: 'bottom-left', page2VendorTagOn: true, page2BiddersOn: true,
        page2BiddersOpacity: 87, page2BiddersFontSize: 26, page2ItemFontSize: 44, page2BiddersPosition: 'middle-left', page3On: true, extraMode: 'team', page3Title: '팀별 낙찰금액',
        page3BoardPosition: 'right', page3QuizPosition: 'bottom',
        quizOn: true, quizStatus: 'open', quizQuestion: '첫 번째 문제',
        quizWinner: '참가자 A', quizAnswer: '정답',
        ignoredSecret: 'must-not-persist'
    });
    assert.equal(response.status, 200);
    const state = response.json().state;
    assert.equal(state.hostName1, '진행자');
    assert.equal(state.hostName3, '게스트');
    assert.equal(state.hostRole3, '전문가');
    assert.equal(state.page1TickerOn, false);
    assert.equal(state.page1BannerOn, true);
    assert.equal(state.page1HostsPosition, 'bottom-left');
    assert.equal(state.page1TickerPosition, 'top');
    assert.equal(state.page2SoldOn, true);
    assert.equal(state.page2PhotoPosition, 'middle-right');
    assert.equal(state.page2PricePosition, 'bottom-left');
    assert.equal(state.page2VendorTagOn, true);
    assert.equal(state.page2BiddersOn, true);
    assert.equal(state.page2BiddersOpacity, 87);
    assert.equal(state.page2BiddersFontSize, 26);
    assert.equal(state.page2ItemFontSize, 44);
    assert.equal(state.page2BiddersPosition, 'middle-left');
    assert.equal(state.page3On, true);
    assert.equal(state.page3BoardPosition, 'right');
    assert.equal(state.page3QuizPosition, 'bottom');
    assert.equal(state.extraMode, 'team');
    assert.equal(state.quizOn, true);
    assert.equal(state.quizStatus, 'open');
    assert.equal(state.quizQuestion, '첫 번째 문제');
    assert.equal(state.quizWinner, '참가자 A');
    assert.equal(state.ignoredSecret, undefined);
});

test('350 ms broadcast pulse is memory-only and changes after a public mutation', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'GET', '/api/platform/channels', null, '');
    const beforeReads = repository.catalogReads;
    const initial = await call(api, 'GET', '/api/platform/channels/alpha/broadcast-pulse', null, '');
    assert.equal(initial.status, 200);
    assert.equal(initial.json().revision, 0);
    assert.equal(repository.catalogReads, beforeReads);

    const unknown = await call(api, 'GET', '/api/platform/channels/not-a-channel/broadcast-pulse', null, '');
    assert.equal(unknown.status, 404);
    assert.equal(repository.catalogReads, beforeReads);

    await call(api, 'PUT', '/api/platform/channels/alpha/broadcast-state', {
        activeItemId: 'item_1', mode: 'live', page: 2
    });
    const afterMutationReads = repository.catalogReads;
    const pulse = await call(api, 'GET', '/api/platform/channels/alpha/broadcast-pulse', null, '');
    assert.ok(pulse.json().revision > 0);
    assert.equal(repository.catalogReads, afterMutationReads);

    const full = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    assert.equal(full.json().revision, pulse.json().revision);
});

test('temporary channels can only be deleted when inactive and empty', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    let catalog = await repository.getCatalog();
    await repository.saveCatalog([...catalog.channels, normalizeChannel({ id: 'temporary', name: '임시', status: 'draft' })]);
    await call(api, 'POST', '/api/platform/channels/temporary/vendors', { record: { id: 'vendor_one', name: '업체' } });
    let response = await call(api, 'DELETE', '/api/platform/channels/temporary');
    assert.equal(response.status, 409);
    await call(api, 'DELETE', '/api/platform/channels/temporary/vendors/vendor_one');
    response = await call(api, 'DELETE', '/api/platform/channels/temporary');
    assert.equal(response.status, 200);
    assert.equal((await repository.getCatalog()).channels.some((channel) => channel.id === 'temporary'), false);
    response = await call(api, 'DELETE', '/api/platform/channels/alpha');
    assert.equal(response.status, 409);
});

test('simultaneous writes cannot create duplicate lot numbers in one channel', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    const [first, second] = await Promise.all([
        call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_a', lotNumber: 7, name: '개체 A' } }),
        call(api, 'POST', '/api/platform/channels/alpha/items', { record: { id: 'item_b', lotNumber: 7, name: '개체 B' } })
    ]);
    assert.deepEqual([first.status, second.status].sort(), [201, 422]);
    assert.equal((await repository.listRecords('alpha', 'item')).length, 1);
});

test('brand assets are channel-scoped and only active assets reach the public overlay', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    let response = await call(api, 'POST', '/api/platform/channels/alpha/assets', {
        record: { id: 'banner_one', name: '메인 배너', kind: 'banner', page: '1', imageUrl: 'https://example.com/banner.webp', sortOrder: 2, active: true }
    });
    assert.equal(response.status, 201);
    response = await call(api, 'POST', '/api/platform/channels/alpha/assets', {
        record: { id: 'banner_off', name: '비활성 배너', kind: 'banner', page: 'all', imageUrl: 'https://example.com/off.webp', active: false }
    });
    assert.equal(response.status, 201);
    const alpha = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    const beta = await call(api, 'GET', '/api/platform/channels/beta/broadcast', null, '');
    assert.deepEqual(alpha.json().assets.map((asset) => asset.id), ['banner_one']);
    assert.equal(alpha.json().assets[0].imageUrl, 'https://example.com/banner.webp');
    assert.equal(beta.json().assets.length, 0);
});

test('vendor logos follow the vendor id into public item data without exposing vendor contacts', async () => {
    const repository = new MemoryRepository();
    const api = createPlatformApi({ repository, logger: { error() {} } });
    await call(api, 'POST', '/api/platform/channels/alpha/vendors', {
        record: { id: 'vendor_logo', name: '로고 업체', phone: '01012345678', logoUrl: 'https://example.com/vendor.webp' }
    });
    await call(api, 'POST', '/api/platform/channels/alpha/items', {
        record: { id: 'item_logo', lotNumber: 3, name: '테스트 개체', vendorId: 'vendor_logo' }
    });
    const response = await call(api, 'GET', '/api/platform/channels/alpha/broadcast', null, '');
    assert.equal(response.json().items[0].vendorName, '로고 업체');
    assert.equal(response.json().items[0].vendorLogoUrl, 'https://example.com/vendor.webp');
    assert.equal(response.json().items[0].phone, undefined);
});

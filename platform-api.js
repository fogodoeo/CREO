'use strict';

const {
    DEFAULT_CHANNELS,
    channelLinks,
    cleanText,
    normalizeChannel,
    normalizeChannelId,
    publicItem,
    recordId,
    validateChannel
} = require('./platform-core');

const BODY_LIMIT = 512 * 1024;
const TYPES = new Set(['vendor', 'item', 'shipment', 'asset']);

function replyJson(res, status, value, headers = {}) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(body);
}

async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
            const error = new Error('요청 내용이 너무 큽니다.');
            error.status = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch {
        const error = new Error('JSON 형식이 올바르지 않습니다.');
        error.status = 400;
        throw error;
    }
}

function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function sanitizeBroadcastState(input = {}) {
    const extraMode = ['bracket', 'ranking', 'status'].includes(input.extraMode) ? input.extraMode : 'bracket';
    return {
        id: 'state',
        activeItemId: cleanText(input.activeItemId, 64),
        mode: ['standby', 'live', 'sold'].includes(input.mode) ? input.mode : 'standby',
        page: Math.max(1, Math.min(3, Number.parseInt(input.page, 10) || 1)),
        hostName1: cleanText(input.hostName1, 60),
        hostRole1: cleanText(input.hostRole1, 40),
        hostName2: cleanText(input.hostName2, 60),
        hostRole2: cleanText(input.hostRole2, 40),
        notice: cleanText(input.notice || input.headline, 160),
        noticeDetail: cleanText(input.noticeDetail, 200),
        page1NoticeOn: booleanValue(input.page1NoticeOn),
        page1HostsOn: booleanValue(input.page1HostsOn),
        page1TickerOn: booleanValue(input.page1TickerOn),
        page1BannerOn: booleanValue(input.page1BannerOn, false),
        page1Ticker: cleanText(input.page1Ticker || input.ticker, 220),
        page1BannerUrl: cleanText(input.page1BannerUrl, 600),
        page2InfoOn: booleanValue(input.page2InfoOn),
        page2PhotoOn: booleanValue(input.page2PhotoOn),
        page2PriceOn: booleanValue(input.page2PriceOn),
        page2SoldOn: booleanValue(input.page2SoldOn),
        page2TickerOn: booleanValue(input.page2TickerOn),
        page2BannerOn: booleanValue(input.page2BannerOn, false),
        page2Ticker: cleanText(input.page2Ticker || input.ticker, 220),
        page2BannerUrl: cleanText(input.page2BannerUrl, 600),
        page3On: booleanValue(input.page3On, false),
        extraMode,
        page3Title: cleanText(input.page3Title || input.headline, 120)
    };
}

function sanitizeRecord(type, input = {}, current = {}) {
    const candidateId = cleanText(input.id || current.id || recordId(type.slice(0, 3)), 64)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 64);
    const base = {
        id: candidateId || recordId(type.slice(0, 3)),
        createdAt: current.createdAt || input.createdAt || null
    };
    if (type === 'vendor') {
        return {
            ...base,
            code: cleanText(input.code, 24).toUpperCase(),
            name: cleanText(input.name, 80),
            manager: cleanText(input.manager, 60),
            phone: cleanText(input.phone, 30),
            logoUrl: cleanText(input.logoUrl, 600),
            address: cleanText(input.address, 240),
            note: cleanText(input.note, 500),
            active: input.active !== false
        };
    }
    if (type === 'item') {
        return {
            ...base,
            lotNumber: Math.max(0, Number.parseInt(input.lotNumber, 10) || 0),
            vendorId: cleanText(input.vendorId, 64),
            vendorName: cleanText(input.vendorName, 80),
            name: cleanText(input.name, 100),
            startPrice: Math.max(0, numberValue(input.startPrice)),
            soldPrice: Math.max(0, numberValue(input.soldPrice)),
            status: cleanText(input.status || 'waiting', 24),
            note: cleanText(input.note, 1000),
            photoUrl: cleanText(input.photoUrl, 600),
            winnerName: cleanText(input.winnerName, 80),
            winnerPhone: cleanText(input.winnerPhone, 30),
            attributes: input.attributes && typeof input.attributes === 'object' ? input.attributes : {}
        };
    }
    if (type === 'shipment') {
        return {
            ...base,
            itemId: cleanText(input.itemId, 64),
            itemName: cleanText(input.itemName, 100),
            itemLotNumber: Math.max(0, Number.parseInt(input.itemLotNumber, 10) || 0),
            itemVendorName: cleanText(input.itemVendorName, 80),
            vendorId: cleanText(input.vendorId, 64),
            recipientName: cleanText(input.recipientName, 80),
            recipientPhone: cleanText(input.recipientPhone, 30),
            address: cleanText(input.address, 300),
            method: cleanText(input.method || 'delivery', 30),
            carrier: cleanText(input.carrier, 80),
            trackingNumber: cleanText(input.trackingNumber, 100),
            cost: Math.max(0, numberValue(input.cost)),
            status: cleanText(input.status || 'pending', 30),
            note: cleanText(input.note, 500)
        };
    }
    if (type === 'asset') {
        return {
            ...base,
            name: cleanText(input.name, 80),
            kind: ['banner', 'sponsor', 'vendor'].includes(input.kind) ? input.kind : 'banner',
            page: ['1', '2', 'all'].includes(String(input.page)) ? String(input.page) : 'all',
            targetName: cleanText(input.targetName, 80),
            imageUrl: cleanText(input.imageUrl, 600),
            linkUrl: cleanText(input.linkUrl, 600),
            sortOrder: Math.max(0, Math.min(9999, Number.parseInt(input.sortOrder, 10) || 0)),
            active: booleanValue(input.active)
        };
    }
    throw new Error('Unsupported record type');
}

function validateRecord(type, record, workspace) {
    const errors = [];
    if (type === 'vendor') {
        if (!record.name) errors.push('업체명을 입력해 주세요.');
        if (record.code && workspace.vendors.some((vendor) => vendor.code === record.code && vendor.id !== record.id)) {
            errors.push('이 채널에서 이미 사용 중인 업체 코드입니다.');
        }
    }
    if (type === 'item') {
        if (!record.name) errors.push('개체명을 입력해 주세요.');
        if (!record.lotNumber) errors.push('경매 번호를 입력해 주세요.');
        if (record.vendorId && !workspace.vendors.some((vendor) => vendor.id === record.vendorId)) {
            errors.push('이 채널에 등록되지 않은 업체입니다.');
        }
        if (workspace.items.some((item) => item.lotNumber === record.lotNumber && item.id !== record.id)) {
            errors.push('이 채널에서 이미 사용 중인 경매 번호입니다.');
        }
    }
    if (type === 'shipment') {
        const item = workspace.items.find((entry) => entry.id === record.itemId);
        if (!item && !record.itemName) errors.push('이 채널에 등록된 개체를 선택해 주세요.');
        if (record.vendorId && !workspace.vendors.some((vendor) => vendor.id === record.vendorId)) {
            errors.push('이 채널에 등록되지 않은 업체입니다.');
        }
        if (record.itemId && workspace.shipments.some((shipment) => shipment.itemId === record.itemId && shipment.id !== record.id)) {
            errors.push('이 개체의 배송 정보가 이미 등록되어 있습니다.');
        }
    }
    if (type === 'asset') {
        if (!record.name) errors.push('자산 이름을 입력해 주세요.');
        if (!record.imageUrl) errors.push('이미지 URL을 입력해 주세요.');
        if (record.kind === 'vendor' && !record.targetName) errors.push('로고를 연결할 업체명을 입력해 주세요.');
    }
    return errors;
}

function createPlatformApi({ repository, logger = console } = {}) {
    if (!repository) throw new Error('repository is required');
    const mutationLocks = new Map();

    async function withMutationLock(key, callback) {
        const lockKey = String(key || 'global');
        const previous = mutationLocks.get(lockKey) || Promise.resolve();
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const tail = previous.then(() => gate);
        mutationLocks.set(lockKey, tail);
        await previous;
        try { return await callback(); }
        finally {
            release();
            if (mutationLocks.get(lockKey) === tail) mutationLocks.delete(lockKey);
        }
    }
    async function isAdmin(req) {
        return repository.verifyAdmin(req.headers['x-creo-admin']);
    }

    async function requireAdmin(req, res) {
        if (await isAdmin(req)) return true;
        replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
        return false;
    }

    async function workspace(channelId) {
        const [vendors, items, shipments, assets, broadcast] = await Promise.all([
            repository.listRecords(channelId, 'vendor'),
            repository.listRecords(channelId, 'item'),
            repository.listRecords(channelId, 'shipment'),
            repository.listRecords(channelId, 'asset'),
            repository.getRecord(channelId, 'broadcast', 'state')
        ]);
        return { vendors, items, shipments, assets, broadcast: broadcast || { id: 'state', mode: 'standby', page: 1 } };
    }

    async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/platform/')) return false;
        try {
            const segments = url.pathname.slice('/api/platform/'.length).split('/').filter(Boolean).map(decodeURIComponent);
            const method = req.method || 'GET';

            if (segments.length === 1 && segments[0] === 'health' && method === 'GET') {
                replyJson(res, 200, await repository.health());
                return true;
            }

            if (segments.length === 1 && segments[0] === 'admin-check' && method === 'GET') {
                replyJson(res, 200, { authenticated: await isAdmin(req) });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'active-channel' && method === 'GET') {
                replyJson(res, 200, { channelId: await repository.getActiveChannel() });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'active-channel' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const catalog = await repository.getCatalog();
                const channelId = normalizeChannelId(body.channelId);
                if (!catalog.channels.some((channel) => channel.id === channelId && channel.status !== 'archived')) {
                    replyJson(res, 422, { error: '운영 가능한 채널을 선택해 주세요.' });
                    return true;
                }
                replyJson(res, 200, { channelId: await repository.setActiveChannel(channelId) });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'channels' && method === 'GET') {
                const catalog = await repository.getCatalog();
                const admin = await isAdmin(req);
                const channels = catalog.channels
                    .filter((channel) => admin || channel.status === 'active')
                    .map((channel) => ({ ...channel, links: channelLinks(channel.id) }));
                replyJson(res, 200, { ...catalog, channels });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'channels' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const catalog = await repository.getCatalog();
                const checked = validateChannel(body.channel, catalog.channels);
                if (!checked.valid) {
                    replyJson(res, 422, { error: checked.errors.join(' '), errors: checked.errors });
                    return true;
                }
                const now = new Date().toISOString();
                checked.value.createdAt = now;
                checked.value.updatedAt = now;
                const saved = await repository.saveCatalog([...catalog.channels, checked.value], body.expectedVersion ?? catalog.version);
                replyJson(res, 201, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments[0] !== 'channels' || !segments[1]) {
                replyJson(res, 404, { error: 'Not found' });
                return true;
            }

            const channelId = normalizeChannelId(segments[1]);
            const catalog = await repository.getCatalog();
            const channelIndex = catalog.channels.findIndex((channel) => channel.id === channelId);
            const channel = catalog.channels[channelIndex];
            if (!channel) {
                replyJson(res, 404, { error: '채널을 찾을 수 없습니다.' });
                return true;
            }

            if (segments.length === 2 && method === 'GET') {
                replyJson(res, 200, { channel: { ...channel, links: channelLinks(channel.id) } });
                return true;
            }

            if (segments.length === 2 && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const checked = validateChannel({ ...channel, ...body.channel, id: channelId }, catalog.channels, channelId);
                if (!checked.valid) {
                    replyJson(res, 422, { error: checked.errors.join(' '), errors: checked.errors });
                    return true;
                }
                checked.value.createdAt = channel.createdAt;
                checked.value.updatedAt = new Date().toISOString();
                const next = catalog.channels.slice();
                next[channelIndex] = checked.value;
                const saved = await repository.saveCatalog(next, body.expectedVersion ?? catalog.version);
                replyJson(res, 200, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 2 && method === 'DELETE') {
                if (!await requireAdmin(req, res)) return true;
                if (DEFAULT_CHANNELS.some((entry) => entry.id === channelId) || channel.legacy?.items) {
                    replyJson(res, 409, { error: '기본 운영 채널은 삭제할 수 없습니다. 보관 상태로 변경해 주세요.' });
                    return true;
                }
                if (await repository.getActiveChannel() === channelId) {
                    replyJson(res, 409, { error: '현재 방송 중인 채널은 삭제할 수 없습니다. 다른 채널로 전환해 주세요.' });
                    return true;
                }
                const data = await workspace(channelId);
                if (data.vendors.length || data.items.length || data.shipments.length || data.assets.length) {
                    replyJson(res, 409, { error: '업체·개체·배송·브랜드 자산을 먼저 삭제해 주세요.' });
                    return true;
                }
                if (data.broadcast?.id === 'state') await repository.deleteRecord(channelId, 'broadcast', 'state');
                const saved = await repository.saveCatalog(
                    catalog.channels.filter((entry) => entry.id !== channelId),
                    url.searchParams.has('expectedVersion') ? url.searchParams.get('expectedVersion') : catalog.version
                );
                replyJson(res, 200, { deleted: true, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'workspace' && method === 'GET') {
                if (!await requireAdmin(req, res)) return true;
                replyJson(res, 200, { channel, ...(await workspace(channelId)) });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'broadcast' && method === 'GET') {
                const data = await workspace(channelId);
                const vendors = new Map(data.vendors.map((vendor) => [vendor.id, vendor]));
                replyJson(res, 200, {
                    channel,
                    state: data.broadcast,
                    assets: data.assets
                        .filter((asset) => asset.active !== false)
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'))
                        .map(({ id, name, kind, page, targetName, imageUrl, linkUrl, sortOrder }) => ({ id, name, kind, page, targetName, imageUrl, linkUrl, sortOrder })),
                    items: data.items.map((item) => {
                        const vendor = vendors.get(item.vendorId);
                        return publicItem({
                            ...item,
                            vendorName: vendor?.name || item.vendorName,
                            vendorLogoUrl: vendor?.logoUrl || item.vendorLogoUrl
                        });
                    })
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'duplicate' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const proposed = normalizeChannel({
                    ...channel,
                    ...body.channel,
                    id: body.channel?.id,
                    name: body.channel?.name || `${channel.name} 복사본`,
                    status: 'draft',
                    legacy: { items: false, managementUrl: '', controlUrl: '' }
                });
                const checked = validateChannel(proposed, catalog.channels);
                if (!checked.valid) {
                    replyJson(res, 422, { error: checked.errors.join(' '), errors: checked.errors });
                    return true;
                }
                const now = new Date().toISOString();
                checked.value.createdAt = now;
                checked.value.updatedAt = now;
                const saved = await repository.saveCatalog([...catalog.channels, checked.value], body.expectedVersion ?? catalog.version);
                if (body.copyVendors) {
                    const sourceVendors = await repository.listRecords(channelId, 'vendor');
                    for (const vendor of sourceVendors) {
                        await repository.upsertRecord(checked.value.id, 'vendor', { ...vendor, id: recordId('ven'), channelId: checked.value.id });
                    }
                }
                replyJson(res, 201, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'broadcast-state' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const record = await repository.upsertRecord(channelId, 'broadcast', {
                    ...sanitizeBroadcastState(body),
                    revision: Date.now()
                });
                replyJson(res, 200, { state: record });
                return true;
            }

            const type = segments[2]?.replace(/s$/, '');
            if (!TYPES.has(type)) {
                replyJson(res, 404, { error: 'Not found' });
                return true;
            }
            if (!await requireAdmin(req, res)) return true;

            if (segments.length === 3 && method === 'POST') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const body = await readJson(req);
                    const data = await workspace(channelId);
                    const record = sanitizeRecord(type, body.record);
                    const errors = validateRecord(type, record, data);
                    if (errors.length) {
                        replyJson(res, 422, { error: errors.join(' '), errors });
                        return;
                    }
                    replyJson(res, 201, { record: await repository.upsertRecord(channelId, type, record) });
                });
                return true;
            }

            if (segments.length === 4 && method === 'PUT') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const body = await readJson(req);
                    const current = await repository.getRecord(channelId, type, segments[3]);
                    if (!current) {
                        replyJson(res, 404, { error: '항목을 찾을 수 없습니다.' });
                        return;
                    }
                    const data = await workspace(channelId);
                    const record = sanitizeRecord(type, { ...body.record, id: current.id }, current);
                    const errors = validateRecord(type, record, data);
                    if (errors.length) {
                        replyJson(res, 422, { error: errors.join(' '), errors });
                        return;
                    }
                    replyJson(res, 200, { record: await repository.upsertRecord(channelId, type, record) });
                });
                return true;
            }

            if (segments.length === 4 && method === 'DELETE') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const data = await workspace(channelId);
                    if (type === 'vendor') {
                        const usedByItem = data.items.some((item) => item.vendorId === segments[3]);
                        const usedByShipment = data.shipments.some((shipment) => shipment.vendorId === segments[3]);
                        if (usedByItem || usedByShipment) {
                            replyJson(res, 409, { error: '연결된 개체나 배송이 있어 업체를 삭제할 수 없습니다.' });
                            return;
                        }
                    }
                    if (type === 'item' && data.shipments.some((shipment) => shipment.itemId === segments[3])) {
                        replyJson(res, 409, { error: '연결된 배송 정보가 있어 개체를 삭제할 수 없습니다.' });
                        return;
                    }
                    await repository.deleteRecord(channelId, type, segments[3]);
                    replyJson(res, 200, { deleted: true });
                });
                return true;
            }

            replyJson(res, 404, { error: 'Not found' });
            return true;
        } catch (error) {
            logger.error?.('[platform-api]', error.message);
            const status = error.status || (error.code === 'VERSION_CONFLICT' ? 409 : 500);
            replyJson(res, status, { error: status === 500 ? '운영 데이터 처리 중 오류가 발생했습니다.' : error.message });
            return true;
        }
    }

    return { handle, workspace };
}

module.exports = { createPlatformApi, readJson, sanitizeRecord, validateRecord };

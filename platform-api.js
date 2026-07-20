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
const TYPES = new Set(['vendor', 'item', 'shipment']);

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
        if (!item) errors.push('이 채널에 등록된 개체를 선택해 주세요.');
        if (record.vendorId && !workspace.vendors.some((vendor) => vendor.id === record.vendorId)) {
            errors.push('이 채널에 등록되지 않은 업체입니다.');
        }
        if (record.itemId && workspace.shipments.some((shipment) => shipment.itemId === record.itemId && shipment.id !== record.id)) {
            errors.push('이 개체의 배송 정보가 이미 등록되어 있습니다.');
        }
    }
    return errors;
}

function createPlatformApi({ repository, logger = console } = {}) {
    if (!repository) throw new Error('repository is required');

    async function isAdmin(req) {
        return repository.verifyAdmin(req.headers['x-creo-admin']);
    }

    async function requireAdmin(req, res) {
        if (await isAdmin(req)) return true;
        replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
        return false;
    }

    async function workspace(channelId) {
        const [vendors, items, shipments, broadcast] = await Promise.all([
            repository.listRecords(channelId, 'vendor'),
            repository.listRecords(channelId, 'item'),
            repository.listRecords(channelId, 'shipment'),
            repository.getRecord(channelId, 'broadcast', 'state')
        ]);
        return { vendors, items, shipments, broadcast: broadcast || { id: 'state', mode: 'standby', page: 1 } };
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
                if (data.vendors.length || data.items.length || data.shipments.length) {
                    replyJson(res, 409, { error: '업체·개체·배송 자료를 먼저 삭제해 주세요.' });
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
                const vendors = new Map(data.vendors.map((vendor) => [vendor.id, vendor.name]));
                replyJson(res, 200, {
                    channel,
                    state: data.broadcast,
                    items: data.items.map((item) => publicItem({ ...item, vendorName: vendors.get(item.vendorId) || item.vendorName }))
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
                    id: 'state',
                    activeItemId: cleanText(body.activeItemId, 64),
                    mode: cleanText(body.mode || 'standby', 24),
                    page: Math.max(1, Math.min(3, Number.parseInt(body.page, 10) || 1)),
                    headline: cleanText(body.headline, 120),
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
                const body = await readJson(req);
                const data = await workspace(channelId);
                const record = sanitizeRecord(type, body.record);
                const errors = validateRecord(type, record, data);
                if (errors.length) {
                    replyJson(res, 422, { error: errors.join(' '), errors });
                    return true;
                }
                replyJson(res, 201, { record: await repository.upsertRecord(channelId, type, record) });
                return true;
            }

            if (segments.length === 4 && method === 'PUT') {
                const body = await readJson(req);
                const current = await repository.getRecord(channelId, type, segments[3]);
                if (!current) {
                    replyJson(res, 404, { error: '항목을 찾을 수 없습니다.' });
                    return true;
                }
                const data = await workspace(channelId);
                const record = sanitizeRecord(type, { ...body.record, id: current.id }, current);
                const errors = validateRecord(type, record, data);
                if (errors.length) {
                    replyJson(res, 422, { error: errors.join(' '), errors });
                    return true;
                }
                replyJson(res, 200, { record: await repository.upsertRecord(channelId, type, record) });
                return true;
            }

            if (segments.length === 4 && method === 'DELETE') {
                const data = await workspace(channelId);
                if (type === 'vendor') {
                    const usedByItem = data.items.some((item) => item.vendorId === segments[3]);
                    const usedByShipment = data.shipments.some((shipment) => shipment.vendorId === segments[3]);
                    if (usedByItem || usedByShipment) {
                        replyJson(res, 409, { error: '연결된 개체나 배송이 있어 업체를 삭제할 수 없습니다.' });
                        return true;
                    }
                }
                if (type === 'item' && data.shipments.some((shipment) => shipment.itemId === segments[3])) {
                    replyJson(res, 409, { error: '연결된 배송 정보가 있어 개체를 삭제할 수 없습니다.' });
                    return true;
                }
                await repository.deleteRecord(channelId, type, segments[3]);
                replyJson(res, 200, { deleted: true });
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

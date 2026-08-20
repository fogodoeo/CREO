(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoChannelAdapters = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const AuctionContract = root.CreoAuctionContract || (typeof require === 'function' ? require('./auction-contract') : null);
    if (!AuctionContract) throw new Error('auction-contract.js must load before channel-adapters.js');
    const registry = new Map();
    const api = () => {
        if (!root.CreoPlatform?.api) throw new Error('CREO platform client is not available');
        return root.CreoPlatform.api;
    };
    const endpoint = (channel, type, id = '') => `channels/${encodeURIComponent(channel.id)}/${type}${id ? `/${encodeURIComponent(id)}` : ''}`;

    function stableId(prefix, value) {
        const text = String(value || 'unknown');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return `${prefix}_${(hash >>> 0).toString(36)}`;
    }

    function legacyStatus(value) {
        return AuctionContract.normalizeStatus(value);
    }

    function legacyWorkspace(channel, rows) {
        const vendors = [];
        const vendorMap = new Map();
        (rows || []).forEach(row => {
            const name = String(row.company || '').trim() || '업체 미지정';
            if (!vendorMap.has(name)) {
                const vendor = { id: stableId('legacy_vendor', name), channelId: channel.id, name, code: '', manager: '', phone: '', address: '', source: 'legacy-cdcup' };
                vendorMap.set(name, vendor);
                vendors.push(vendor);
            }
        });
        const items = (rows || []).map(row => ({
            id: String(row.row), channelId: channel.id, lotNumber: Number(row.num) || 0, name: row.name || '개체',
            vendorId: vendorMap.get(String(row.company || '').trim() || '업체 미지정')?.id || '', vendorName: row.company || '',
            startPrice: (Number(row.startPrice || row.price) || 0) * 10000, soldPrice: (Number(row.soldPrice || row.sold_price) || 0) * 10000,
            winnerName: row.winner || '', winnerPhone: row.winner_phone || '', status: legacyStatus(row.status), photoUrl: row.photoItem || '',
            groupId: row.teamCode || '', teamName: row.teamName || row.team || row.teamCode || '',
            note: row.note || '', source: 'legacy-cdcup', legacy: row
        }));
        const shipments = (rows || []).filter(row => row.shipping_type || row.shipping_company || row.shipping_region || row.shipping_cost).map(row => ({
            id: stableId('legacy_shipment', row.row), channelId: channel.id, itemId: String(row.row),
            vendorId: vendorMap.get(String(row.company || '').trim() || '업체 미지정')?.id || '', recipientName: row.winner || '', recipientPhone: row.winner_phone || '',
            method: row.shipping_type === '직접수령' ? 'pickup' : 'delivery', address: row.shipping_region || '', carrier: row.shipping_company || '', cost: Number(row.shipping_cost) || 0,
            status: String(row.status || '').includes('입금완료') ? 'complete' : String(row.status || '').includes('연락완료') ? 'ready' : 'pending', source: 'legacy-cdcup'
        }));
        return { channel, vendors, items, shipments, assets: [], broadcast: { id: 'state', mode: 'standby', page: 1 }, adapter: 'legacy-cdcup', readOnly: { vendors: true, items: true } };
    }

    function platformShippingItems(workspace) {
        const vendors = new Map((workspace.vendors || []).map(vendor => [vendor.id, vendor]));
        const shipments = new Map((workspace.shipments || []).map(shipment => [shipment.itemId, shipment]));
        return (workspace.items || []).filter(item => AuctionContract.isSoldStatus(item.status) || Number(item.soldPrice) > 0).map(item => {
            const shipment = shipments.get(item.id);
            return {
                ...item, row: item.id, num: item.lotNumber, company: vendors.get(item.vendorId)?.name || item.vendorName || '', name: item.name || '개체',
                winner: item.winnerName || item.winnerAlias || '', winner_phone: item.winnerPhone || '', sold_price: (Number(item.soldPrice) || 0) / 10000,
                soldPrice: (Number(item.soldPrice) || 0) / 10000, status: shipment?.status === 'complete' ? '낙찰-입금완료' : ['ready', 'shipped'].includes(shipment?.status) ? '낙찰-연락완료' : '낙찰-대기',
                shipping_type: shipment ? (shipment.method === 'pickup' ? '직접수령' : '배송') : '', shipping_company: shipment?.carrier || '', shipping_region: shipment?.address || '', shipping_cost: Number(shipment?.cost) || 0,
                _platformItemId: item.id, _platformShipmentId: shipment?.id || ''
            };
        });
    }

    const platform = {
        id: 'platform',
        async loadWorkspace(context) {
            return api()(endpoint(context.channel, 'workspace'));
        },
        async saveRecord(context, type, record, id = '') {
            const result = await api()(endpoint(context.channel, type, id), { method: id ? 'PUT' : 'POST', body: JSON.stringify({ record }) });
            return result.record;
        },
        async deleteRecord(context, type, id) {
            return api()(endpoint(context.channel, type, id), { method: 'DELETE' });
        },
        async loadShippingItems(context) {
            context.workspace = await this.loadWorkspace(context);
            return platformShippingItems(context.workspace);
        },
        async saveShippingItem(context, itemId, shippingData) {
            if (!context.workspace) context.workspace = await this.loadWorkspace(context);
            const item = (context.workspace.items || []).find(entry => entry.id === itemId);
            if (!item) throw new Error('이 채널에서 낙찰 항목을 찾을 수 없습니다.');
            const vendor = (context.workspace.vendors || []).find(entry => entry.id === item.vendorId);
            const current = (context.workspace.shipments || []).find(entry => entry.itemId === item.id);
            const pickup = shippingData.shipping_type === '직접수령';
            const record = {
                ...(current || {}), itemId: item.id, itemName: item.name || '', itemLotNumber: Number(item.lotNumber) || 0,
                itemVendorName: vendor?.name || item.vendorName || '', vendorId: item.vendorId || '', recipientName: item.winnerName || item.winnerAlias || '', recipientPhone: item.winnerPhone || '',
                method: pickup ? 'pickup' : 'delivery', address: shippingData.shipping_region || '', carrier: pickup ? '' : (shippingData.shipping_company || ''),
                cost: pickup ? 0 : (Number(shippingData.shipping_cost) || 0), status: current?.status || 'pending', note: current?.note || ''
            };
            const saved = await this.saveRecord(context, 'shipments', record, current?.id || '');
            context.workspace.shipments = current ? context.workspace.shipments.map(entry => entry.id === saved.id ? saved : entry) : [...context.workspace.shipments, saved];
            return { success: true, data: saved };
        }
    };

    const legacyCdcup = {
        id: 'legacy-cdcup',
        async loadWorkspace(context) {
            if (typeof root.getItems !== 'function') throw new Error('CDCUP 호환 데이터를 불러올 수 없습니다.');
            return legacyWorkspace(context.channel, await root.getItems());
        },
        async saveRecord(context, type, record) {
            if (type !== 'shipments' || typeof root.updateItemShipping !== 'function') throw new Error('CDCUP 업체·개체 편집은 기존 등록 화면에서 진행해 주세요.');
            const result = await root.updateItemShipping(record.itemId, {
                shipping_type: record.method === 'pickup' ? '직접수령' : '배송', shipping_company: record.carrier || '', shipping_region: record.address || '', shipping_cost: Number(record.cost) || 0
            });
            if (result?.success === false) throw new Error(result.error || '배송 정보를 저장하지 못했습니다.');
            return record;
        },
        async deleteRecord() {
            throw new Error('CDCUP 자료 삭제는 기존 등록 화면에서 진행해 주세요.');
        },
        async loadShippingItems() {
            if (typeof root.getItems !== 'function') throw new Error('CDCUP 배송 데이터를 불러올 수 없습니다.');
            return root.getItems();
        },
        async saveShippingItem(context, itemId, shippingData, auditMeta = {}) {
            if (typeof root.updateItemShipping !== 'function') throw new Error('CDCUP 배송 저장 기능을 불러올 수 없습니다.');
            return root.updateItemShipping(itemId, shippingData, auditMeta);
        }
    };

    function register(adapter) {
        if (!adapter?.id || typeof adapter.loadWorkspace !== 'function') throw new Error('Invalid channel adapter');
        registry.set(adapter.id, adapter);
        return adapter;
    }

    function resolve(channel) {
        const id = channel?.dataAdapter || (channel?.legacy?.items ? 'legacy-cdcup' : 'platform');
        return registry.get(id) || registry.get('platform');
    }

    register(platform);
    register(legacyCdcup);
    return Object.freeze({ legacyWorkspace, platformShippingItems, register, resolve });
});

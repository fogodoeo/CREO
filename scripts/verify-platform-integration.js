'use strict';

const { SupabaseConfigRepository } = require('../platform-repository');
const { channelKey } = require('../platform-core');

async function main() {
    const repository = new SupabaseConfigRepository();
    const adminRow = await repository.getRow('admin_pw');
    const admin = process.env.CREO_ADMIN_SECRET || adminRow?.value || 'unconfigured-local-verification';
    const base = String(process.env.CREO_VERIFY_URL || 'http://127.0.0.1:43920').replace(/\/$/, '') + '/api/platform';
    const idA = `verify-a-${Date.now().toString(36)}`;
    const idB = `verify-b-${Date.now().toString(36)}`;
    let originalActive = 'cdcup';

    async function request(path, options = {}) {
        const response = await fetch(`${base}/${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-Creo-Admin': admin,
                ...(options.headers || {})
            }
        });
        const body = await response.json();
        if (!response.ok) throw new Error(`${response.status} ${body.error}`);
        return body;
    }

    try {
        originalActive = (await request('active-channel')).channelId || 'cdcup';
        let catalog = await request('channels');
        await request('channels', {
            method: 'POST',
            body: JSON.stringify({ channel: { id: idA, name: '검증 A', status: 'draft' }, expectedVersion: catalog.version })
        });
        catalog = await request('channels');
        await request('channels', {
            method: 'POST',
            body: JSON.stringify({ channel: { id: idB, name: '검증 B', status: 'draft' }, expectedVersion: catalog.version })
        });
        await request(`channels/${idA}/vendors`, { method: 'POST', body: JSON.stringify({ record: { id: 'same_vendor', name: 'A 업체' } }) });
        await request(`channels/${idB}/vendors`, { method: 'POST', body: JSON.stringify({ record: { id: 'same_vendor', name: 'B 업체' } }) });
        await request(`channels/${idA}/items`, { method: 'POST', body: JSON.stringify({ record: { id: 'item_one', lotNumber: 1, name: 'A 개체', vendorId: 'same_vendor' } }) });
        await request(`channels/${idA}/shipments`, { method: 'POST', body: JSON.stringify({ record: { id: 'ship_one', itemId: 'item_one', vendorId: 'same_vendor', recipientName: '검증' } }) });

        const alpha = await request(`channels/${idA}/workspace`);
        const beta = await request(`channels/${idB}/workspace`);
        const passed = alpha.vendors[0]?.name === 'A 업체'
            && beta.vendors[0]?.name === 'B 업체'
            && alpha.items.length === 1
            && beta.items.length === 0
            && alpha.shipments.length === 1
            && beta.shipments.length === 0;
        if (!passed) throw new Error('channel isolation verification failed');
        await request('active-channel', { method: 'PUT', body: JSON.stringify({ channelId: idA }) });
        await request(`channels/${idA}/broadcast-state`, {
            method: 'PUT',
            body: JSON.stringify({ activeItemId: 'item_one', mode: 'live', page: 1, headline: '검증' })
        });
        const broadcast = await request(`channels/${idA}/broadcast`);
        if (broadcast.state.activeItemId !== 'item_one' || broadcast.items[0]?.name !== 'A 개체') {
            throw new Error('broadcast state verification failed');
        }
        console.log('integration=PASS channels=2 vendors-isolated items-isolated shipments-isolated broadcast-switched');
    } finally {
        try { await request('active-channel', { method: 'PUT', body: JSON.stringify({ channelId: originalActive }) }); } catch (_) {}
        for (const key of [
            channelKey(idA, 'vendor', 'same_vendor'),
            channelKey(idB, 'vendor', 'same_vendor'),
            channelKey(idA, 'item', 'item_one'),
            channelKey(idA, 'shipment', 'ship_one'),
            channelKey(idA, 'broadcast', 'state')
        ]) {
            try { await repository.deleteRow(key); } catch (_) {}
        }
        const catalog = await repository.getCatalog();
        if (catalog.channels.some((channel) => channel.id === idA || channel.id === idB)) {
            await repository.saveCatalog(catalog.channels.filter((channel) => channel.id !== idA && channel.id !== idB));
        }
        console.log('cleanup=PASS');
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

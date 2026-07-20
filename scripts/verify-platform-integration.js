'use strict';

require('../load-local-env')();

async function main() {
    const admin = String(process.env.CREO_ADMIN_SECRET || '');
    if (!admin) throw new Error('CREO_ADMIN_SECRET is required');
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
        for (const [channel, collection, id] of [
            [idA, 'shipments', 'ship_one'],
            [idA, 'items', 'item_one'],
            [idA, 'vendors', 'same_vendor'],
            [idB, 'vendors', 'same_vendor']
        ]) try { await request(`channels/${channel}/${collection}/${id}`, { method: 'DELETE' }); } catch (_) {}
        for (const channel of [idA, idB]) try { await request(`channels/${channel}`, { method: 'DELETE' }); } catch (_) {}
        console.log('cleanup=PASS');
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

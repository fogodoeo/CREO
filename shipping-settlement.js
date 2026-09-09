'use strict';
function summarizeShipping(items, shipments, vendors) {
    const sold = new Map(items.filter(i => i.status === 'sold').map(i => [i.id, i]));
    const latest = new Map();
    for (const s of shipments) {
        const item = sold.get(s.itemId);
        if (!item || s.vendorId !== item.vendorId) continue;
        const prev = latest.get(s.itemId);
        if (!prev || String(s.updatedAt || '') > String(prev.updatedAt || '')) latest.set(s.itemId, s);
    }
    return vendors.map(v => {
        const rows = [...latest.values()].filter(s => s.vendorId === v.id && s.method === 'delivery' && !['cancelled','refunded'].includes(s.paymentStatus));
        const cost = s => Math.max(0, Math.round(Number(s.cost) || 0));
        return {vendorId:v.id, vendorName:v.name,
            totalAmount:rows.reduce((n,s) => n + cost(s), 0),
            collectedAmount:rows.filter(s => s.paymentStatus === 'paid').reduce((n,s) => n + cost(s), 0),
            pendingAmount:rows.filter(s => s.paymentStatus !== 'paid').reduce((n,s) => n + cost(s), 0),
            itemCount:rows.length};
    });
}
module.exports = {summarizeShipping};

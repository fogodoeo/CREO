'use strict';
function latestItemShipments(items, shipments) {
    const sold = new Map(items.filter(i => i.status === 'sold').map(i => [i.id, i]));
    const latest = new Map();
    for (const s of shipments) {
        const item = sold.get(s.itemId);
        if (!item || s.vendorId !== item.vendorId) continue;
        const prev = latest.get(s.itemId);
        if (!prev || String(s.updatedAt || '') > String(prev.updatedAt || '')) latest.set(s.itemId, s);
    }
    return latest;
}
function shippingRows(items, shipments) {
    return [...latestItemShipments(items,shipments).values()].filter(s => s.method === 'delivery' && !['cancelled','refunded'].includes(s.paymentStatus));
}
function summarizeShipping(items, shipments, vendors) {
    const eligible = shippingRows(items, shipments);
    return vendors.map(v => {
        const rows = eligible.filter(s => s.vendorId === v.id);
        const cost = s => Math.max(0, Math.round(Number(s.cost) || 0));
        return {vendorId:v.id, vendorName:v.name,
            totalAmount:rows.reduce((n,s) => n + cost(s), 0),
            collectedAmount:rows.filter(s => s.paymentStatus === 'paid').reduce((n,s) => n + cost(s), 0),
            pendingAmount:rows.filter(s => s.paymentStatus !== 'paid').reduce((n,s) => n + cost(s), 0),
            itemCount:rows.length};
    });
}
function summarizeCarriers(items, shipments, vendors) {
    const vendorIds = new Set(vendors.map(v=>v.id));
    const groups = new Map();
    for (const s of shippingRows(items, shipments)) {
        if (!vendorIds.has(s.vendorId)) continue;
        const carrier = String(s.carrier || '').trim() || '배송업체 미지정';
        if (!groups.has(carrier)) groups.set(carrier,{carrier,totalAmount:0,itemCount:0,vendorAmounts:Object.create(null)});
        const row = groups.get(carrier),amount=Math.max(0,Math.round(Number(s.cost)||0));
        row.totalAmount+=amount;row.itemCount++;
        row.vendorAmounts[s.vendorId]=(row.vendorAmounts[s.vendorId]||0)+amount;
    }
    return [...groups.values()].sort((a,b)=>a.carrier.localeCompare(b.carrier,'ko'));
}
function summarizeMissingDestinations(items, shipments, vendors) {
    const latest = latestItemShipments(items,shipments);
    return vendors.map(v=>({vendorId:v.id,missingDestinationItems:items.filter(item=>{
        if(item.status!=='sold'||item.vendorId!==v.id)return false;
        const s=latest.get(item.id);
        if(s&&['cancelled','refunded'].includes(s.paymentStatus))return false;
        if(!s)return true;
        // A saved pickup location is complete; payment timestamps and zero fees are irrelevant.
        if(s.method==='pickup')return !String(s.address||s.destinationId||'').trim();
        if(s.method==='delivery')return !(String(s.address||'').trim()||(String(s.pargeRegion||'').trim()&&String(s.pargeShop||'').trim()));
        return true;
    }).sort((a,b)=>(Number(a.lotNumber)||0)-(Number(b.lotNumber)||0)||String(a.id).localeCompare(String(b.id))).map(item=>({id:item.id,name:item.name||'',lotNumber:Number(item.lotNumber)||0}))}));
}
module.exports = {summarizeShipping,summarizeCarriers,summarizeMissingDestinations};

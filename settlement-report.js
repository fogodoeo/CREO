'use strict';
const Checkout = require('./checkout-core');
const Discount = require('./public/settlement-discount');
const {normalizePhone} = require('./band-membership');
const amount = value => Math.max(0, Math.round(Number(value) || 0));
const text = value => String(value ?? '').trim();
const sum = (rows, key) => rows.reduce((n, row) => n + amount(row[key]), 0);
const cancelled = row => ['cancelled', 'refunded'].includes(row?.paymentStatus);
const dateOf = item => Checkout.broadcastDate(item);

// A read-only, administrator-only report. Financial values come from the same
// fee/payment rules as checkout. No live records or notification queues change.
function buildReport({channel, items, shipments, vendors, organizer, generatedAt = new Date().toISOString()}) {
    const uniqueItems = [...new Map(items.map(item => [item.id, item])).values()].sort(Checkout.itemOrder);
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const itemMap = new Map(uniqueItems.map(item => [item.id, item]));
    const latest = new Map();
    for (const shipment of shipments) {
        const item = itemMap.get(shipment.itemId);
        if (!item || item.status !== 'sold' || shipment.vendorId !== item.vendorId) continue;
        const old = latest.get(item.id);
        if (!old || text(shipment.updatedAt).localeCompare(text(old.updatedAt)) > 0
            || (text(shipment.updatedAt) === text(old.updatedAt) && text(shipment.id) > text(old.id))) latest.set(item.id, shipment);
    }
    const fees = new Map(organizer.vendors.flatMap(v => v.feeItems || []).map(row => [row.id, row]));
    for (const item of uniqueItems) {
        if (!['waiting', 'live', 'sold', 'passed'].includes(item.status)) continue;
        if (!vendorMap.has(item.vendorId)) throw Object.assign(new Error('업체가 연결되지 않은 개체가 있어요. 개체 관리에서 업체를 확인해 주세요.'), {status:422});
        const shipment=latest.get(item.id), winner=normalizePhone(item.winnerPhone), recipient=normalizePhone(shipment?.recipientPhone);
        if (winner && recipient && winner!==recipient) throw Object.assign(new Error('낙찰자와 결제 내역의 전화번호가 달라요. 배송·결제 관리에서 확인해 주세요.'), {status:422});
    }
    const rows = uniqueItems.filter(item => ['waiting', 'live', 'sold', 'passed'].includes(item.status)).map(item => {
        const shipment = latest.get(item.id);
        const inactive = cancelled(shipment);
        const fee = fees.get(item.id);
        const sold = item.status === 'sold';
        const phone = sold ? normalizePhone(item.winnerPhone) : '';
        const shippingKnown = sold && !!shipment && ['pickup', 'delivery'].includes(shipment.method);
        const shippingAmount = shippingKnown ? (shipment.method === 'delivery' && !inactive ? amount(shipment.cost) : 0) : null;
        const shippingSupportAmount = shippingKnown ? (shipment.method === 'delivery' && !inactive ? amount(shipment.shippingSupportAmount) : 0) : null;
        return {
            id: item.id, broadcastDate: dateOf(item), code: text(item.attributes?.displayNumber || item.name),
            vendorId: item.vendorId || '', vendorName: vendorMap.get(item.vendorId)?.name || item.vendorName || '업체 미지정',
            status: item.status, event: item.attributes?.auctionKind === 'event',
            soldAmount: sold ? amount(item.soldPrice) : 0, netSoldAmount: sold && !inactive ? amount(item.soldPrice) : 0,
            entryFee: amount(fee?.entryFee), commission: amount(fee?.commission), feeAmount: amount(fee?.totalAmount),
            buyerName: sold ? text(item._buyerName || item.winnerName || item.winnerAlias) : '',
            phone, phoneSource: sold ? phone ? item._phoneSource || 'stored' : 'missing' : '',
            paymentStatus: sold ? shipment?.paymentStatus || 'awaiting_information' : '',
            method: shipment?.method || '', carrier: shipment?.carrier || '',
            destination: text(shipment?.address) || [shipment?.pargeRegion, shipment?.pargeShop].filter(Boolean).join(' · '),
            shippingAmount, shippingSupportAmount,
            grossShippingAmount: shippingKnown ? shippingAmount + shippingSupportAmount : null,
            inactive
        };
    });
    const groups = new Map();
    for (const row of rows.filter(row => row.status === 'sold' && !row.inactive)) {
        // Never combine people solely because their display names are identical.
        const key = JSON.stringify([row.vendorId, row.phone || `item:${row.id}`]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    const discountItem = item => ({...item, soldAmountWon: amount(item.soldPrice), company: vendorMap.get(item.vendorId)?.name || item.vendorId, winner: item.winnerName || item.winnerAlias || ''});
    const allSold = uniqueItems.filter(item => item.status === 'sold' && !cancelled(latest.get(item.id))).map(discountItem);
    const buyers = [...groups.values()].map(group => {
        const groupItems = group.map(row => itemMap.get(row.id));
        const saved = group.map(row => latest.get(row.id)).filter(Boolean);
        const settlement = Discount.calculate(channel.settlementDiscount, groupItems.map(discountItem), allSold);
        const shippingKnown = group.every(row => row.shippingAmount !== null);
        const shippingAmount = sum(group, 'shippingAmount');
        const totalAmount = shippingKnown ? settlement.payableAuctionAmount + shippingAmount : null;
        const payment = Checkout.derivePaymentState({shipments: saved, itemCount: group.length, totalAmount: settlement.payableAuctionAmount + shippingAmount});
        const identityKnown = !!group[0].phone;
        return {
            vendorId: group[0].vendorId, vendorName: group[0].vendorName,
            buyerName: group[0].buyerName, phone: group[0].phone,
            broadcastDates: [...new Set(group.map(row => row.broadcastDate).filter(Boolean))].sort().join(', '),
            codes: group.map(row => row.code).join(', '), itemCount: group.length,
            soldAmount: settlement.originalAmount, discountAmount: settlement.discountAmount,
            shippingAmount: shippingKnown ? shippingAmount : null,
            shippingSupportAmount: shippingKnown ? sum(group, 'shippingSupportAmount') : null,
            totalAmount,
            // Payment-confirmed amounts are cumulative per buyer/vendor, not per item.
            // Unknown identities cannot safely receive that cumulative balance.
            confirmedAmount: identityKnown ? payment.confirmedAmount : null,
            remainingAmount: identityKnown && shippingKnown ? payment.additionalDue : null,
            status: !identityKnown ? 'phone_required' : !shippingKnown ? 'awaiting_information' : payment.status,
            paymentMethod: payment.latest?.paymentMethod || '',
            destination: [...new Set(group.map(row => row.destination).filter(Boolean))].join(' / '),
            carrier: [...new Set(group.map(row => row.carrier).filter(Boolean))].join(', ')
        };
    });
    const summary = organizer.vendors.map(vendor => {
        const own = rows.filter(row => row.vendorId === vendor.vendorId);
        return {
            vendorId: vendor.vendorId, vendorName: vendor.vendorName,
            regularCount: own.filter(row => !row.event).length, eventCount: own.filter(row => row.event).length,
            soldCount: own.filter(row => row.status === 'sold' && !row.inactive).length,
            waitingCount: own.filter(row => ['waiting', 'live'].includes(row.status)).length,
            soldAmount: sum(own, 'netSoldAmount'), entryFeeAmount: amount(vendor.entryFeeAmount), commissionAmount: amount(vendor.commissionAmount),
            feeAmount: amount(vendor.feeAmount), shippingAmount: amount(vendor.shippingAmount ?? vendor.totalAmount),
            shippingSupportAmount: amount(vendor.shippingSupportAmount), totalAmount: amount(vendor.totalAmount),
            receivedAmount: amount(vendor.receivedAmount), remainingAmount: amount(vendor.remainingAmount), overpaidAmount: amount(vendor.overpaidAmount),
            missingPhoneCount: own.filter(row => row.status === 'sold' && !row.inactive && !row.phone).length,
            missingShippingCount: own.filter(row => row.status === 'sold' && !row.inactive && row.shippingAmount === null).length
        };
    });
    const receipts = organizer.vendors.flatMap(v => (v.history || []).map(r => ({
        id: r.id, vendorName: v.vendorName, paidOn: r.paidOn || '', amount: amount(r.amount), status: r.status,
        reportedAt: r.reportedAt || '', reviewedAt: r.reviewedAt || '', memo: r.memo || ''
    })));
    return {
        channel: {id: channel.id, name: channel.name}, generatedAt, scope: 'channel',
        vendors: summary, items: rows, buyers, receipts, unassignedReceiptCount:organizer.unassignedReceiptCount||0,
        totals: Object.fromEntries(['soldAmount', 'entryFeeAmount', 'commissionAmount', 'feeAmount', 'shippingAmount', 'shippingSupportAmount', 'totalAmount', 'receivedAmount', 'remainingAmount', 'overpaidAmount', 'waitingCount', 'missingPhoneCount', 'missingShippingCount'].map(key => [key, sum(summary, key)]))
    };
}
module.exports = {buildReport};

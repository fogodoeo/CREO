(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoSettlementDiscount = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const RULES = new Set(['none', 'winner-house', 'top-vendor', 'top-buyer']);

    function amountWon(item) {
        const exact = Number(item?.soldAmountWon);
        if (Number.isFinite(exact) && exact >= 0) return Math.round(exact);
        const manwon = Number.parseFloat(item?.soldPrice ?? item?.sold_price);
        return Number.isFinite(manwon) && manwon >= 0 ? Math.round(manwon * 10_000) : 0;
    }

    function houseKey(item) {
        const value = String(item?.attributes?.crewart_house_key || item?.crewart_house_key || '').trim().toUpperCase();
        return ['R', 'G', 'B', 'Y'].includes(value) ? value : '';
    }

    function vendorKey(item) {
        return String(item?.company || item?.vendorName || item?.vendorId || '').trim();
    }

    function buyerKey(item) {
        return String(item?.winner_key || item?.winnerPhone || item?.winner_phone || item?.winner || item?.winnerName || item?.winnerAlias || '').trim();
    }

    function normalizePolicy(value = {}) {
        const rule = RULES.has(String(value.rule || '').trim()) ? String(value.rule).trim() : 'none';
        const ratePercent = Math.max(0, Math.min(100, Number(value.ratePercent) || 0));
        return {
            enabled: value.enabled === true && rule !== 'none' && ratePercent > 0,
            rule,
            ratePercent,
            excludeShipping: value.excludeShipping !== false
        };
    }

    function keyFor(rule, item) {
        if (rule === 'winner-house') return houseKey(item);
        if (rule === 'top-vendor') return vendorKey(item);
        if (rule === 'top-buyer') return buyerKey(item);
        return '';
    }

    function winningKey(policy, allItems, groupOrder = ['R', 'G', 'B', 'Y']) {
        const totals = new Map();
        for (const item of allItems || []) {
            const key = keyFor(policy.rule, item);
            if (!key) continue;
            totals.set(key, (totals.get(key) || 0) + amountWon(item));
        }
        const order = new Map((groupOrder || []).map((key, index) => [String(key).toUpperCase(), index]));
        return [...totals.entries()].sort((left, right) =>
            right[1] - left[1]
            || (order.get(String(left[0]).toUpperCase()) ?? 999) - (order.get(String(right[0]).toUpperCase()) ?? 999)
            || String(left[0]).localeCompare(String(right[0]), 'ko')
        )[0]?.[0] || '';
    }

    function labelFor(policy, key) {
        if (!key) return '';
        if (policy.rule === 'winner-house') return `${key} 기숙사 1위 할인`;
        if (policy.rule === 'top-vendor') return `${key} 업체 1위 할인`;
        if (policy.rule === 'top-buyer') return `${key} 낙찰자 1위 할인`;
        return '';
    }

    function calculate(value, selectedItems, allItems, options = {}) {
        const policy = normalizePolicy(value);
        const originalAmount = (selectedItems || []).reduce((sum, item) => sum + amountWon(item), 0);
        if (!policy.enabled) return { policy, winningKey: '', label: '', eligibleAmount: 0, discountAmount: 0, originalAmount, payableAuctionAmount: originalAmount };
        const winner = winningKey(policy, allItems, options.groupOrder);
        const eligibleAmount = (selectedItems || []).reduce((sum, item) =>
            keyFor(policy.rule, item) === winner ? sum + amountWon(item) : sum, 0);
        const discountAmount = Math.floor(eligibleAmount * policy.ratePercent / 100);
        return {
            policy,
            winningKey: winner,
            label: labelFor(policy, winner),
            eligibleAmount,
            discountAmount,
            originalAmount,
            payableAuctionAmount: Math.max(0, originalAmount - discountAmount)
        };
    }

    return Object.freeze({ amountWon, calculate, normalizePolicy, winningKey });
});

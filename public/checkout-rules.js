(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoCheckoutRules = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const PAYMENT_METHODS = Object.freeze(['bank_transfer', 'card']);
    const PAYMENT_STATUSES = Object.freeze([
        'awaiting_information',
        'bank_transfer_pending',
        'bank_transfer_reported',
        'card_link_pending',
        'card_payment_pending',
        'card_payment_reported',
        'additional_payment',
        'paid',
        'on_site'
    ]);

    function clean(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function vendorKey(item = {}) {
        return clean(item.vendorId || item.vendorName).slice(0, 80);
    }

    function itemOrder(left = {}, right = {}) {
        return (Number(left.lotNumber) || 0) - (Number(right.lotNumber) || 0)
            || String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
            || String(left.id || '').localeCompare(String(right.id || ''));
    }

    function groupItemsByVendor(items = [], vendors = []) {
        const vendorMap = new Map(vendors.map((vendor) => [vendor.id, vendor]));
        const groups = new Map();
        items.slice().sort(itemOrder).forEach((item) => {
            const key = vendorKey(item);
            if (!key) return;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    vendor: vendorMap.get(item.vendorId) || vendors.find((vendor) => vendor.name === item.vendorName) || {
                        id: item.vendorId || '',
                        name: item.vendorName || '업체'
                    },
                    items: []
                });
            }
            groups.get(key).items.push(item);
        });
        return [...groups.values()];
    }

    function normalizeVendorPaymentMethods(vendor = {}) {
        const stored = Array.isArray(vendor.paymentMethods) ? vendor.paymentMethods : [];
        const allowed = [...new Set(stored.filter((method) => PAYMENT_METHODS.includes(method)))];
        if (allowed.length) return allowed;
        const fallback = [];
        if (clean(vendor.bankName) && clean(vendor.bankAccount) && clean(vendor.bankHolder)) fallback.push('bank_transfer');
        if (vendor.cardPaymentEnabled !== false) fallback.push('card');
        return fallback.length ? fallback : ['card'];
    }

    function selectedRate(pargeRates = [], region = '', shop = '') {
        return pargeRates.find((group) => group.region === region)?.shops?.find((entry) => entry.name === shop) || null;
    }

    function allocateShipping(items = [], selection = null, channel = {}, pargeRates = []) {
        const ordered = items.slice().sort(itemOrder);
        const allocations = new Map(ordered.map((item) => [item.id, 0]));
        if (!selection || selection.destinationType !== 'parge' || !ordered.length) return { total: 0, allocations };
        const rate = selectedRate(pargeRates, selection.pargeRegion, selection.pargeShop);
        if (!rate) return { total: 0, allocations };
        const isJeju = String(selection.pargeRegion || '').includes('제주');
        const additionalFee = isJeju
            ? Number(channel?.shippingDefaults?.pargeJejuAdditionalFee) || 4000
            : Number(channel?.shippingDefaults?.pargeAdditionalFee) || 7000;
        allocations.set(ordered[0].id, Math.max(0, Number(rate.baseCost) || 0));
        ordered.slice(1).forEach((item) => allocations.set(item.id, Math.max(0, additionalFee)));
        return {
            total: [...allocations.values()].reduce((sum, amount) => sum + amount, 0),
            allocations
        };
    }

    function newestShipment(shipments = []) {
        return shipments.slice().sort((left, right) => String(right.buyerSubmittedAt || right.updatedAt || '')
            .localeCompare(String(left.buyerSubmittedAt || left.updatedAt || '')))[0] || null;
    }

    function confirmedAmount(shipments = []) {
        return shipments.reduce((maximum, shipment) => Math.max(maximum, Number(shipment.paymentConfirmedAmount) || 0), 0);
    }

    function derivePaymentState({ shipments = [], itemCount = 0, totalAmount = 0 } = {}) {
        const latest = newestShipment(shipments);
        const confirmed = confirmedAmount(shipments);
        const due = Math.max(0, Number(totalAmount) - confirmed);
        const missingShipment = Number(itemCount) > shipments.length;
        if (Number(totalAmount) > 0 && confirmed >= Number(totalAmount) && !missingShipment) {
            return { status: 'paid', confirmedAmount: confirmed, additionalDue: 0, latest };
        }
        if (confirmed > 0 && due > 0) {
            return { status: 'additional_payment', confirmedAmount: confirmed, additionalDue: due, latest };
        }
        if (!latest?.buyerSubmittedAt || !latest?.paymentMethod) {
            return { status: 'awaiting_information', confirmedAmount: confirmed, additionalDue: due, latest };
        }
        const storedStatus = PAYMENT_STATUSES.includes(latest.paymentStatus) ? latest.paymentStatus : '';
        if (latest.paymentMethod === 'card') {
            if (storedStatus === 'card_payment_reported') return { status: storedStatus, confirmedAmount: confirmed, additionalDue: due, latest };
            if (latest.cardPaymentUrl) return { status: 'card_payment_pending', confirmedAmount: confirmed, additionalDue: due, latest };
            return { status: 'card_link_pending', confirmedAmount: confirmed, additionalDue: due, latest };
        }
        if (storedStatus === 'bank_transfer_reported') return { status: storedStatus, confirmedAmount: confirmed, additionalDue: due, latest };
        return { status: 'bank_transfer_pending', confirmedAmount: confirmed, additionalDue: due, latest };
    }

    function validateCardPaymentUrl(value) {
        const raw = String(value ?? '').trim();
        if (!raw || raw.length > 1000) return '';
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' || url.username || url.password) return '';
            if (!url.hostname || ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) return '';
            return url.toString();
        } catch {
            return '';
        }
    }

    return Object.freeze({
        PAYMENT_METHODS,
        PAYMENT_STATUSES,
        allocateShipping,
        confirmedAmount,
        derivePaymentState,
        groupItemsByVendor,
        itemOrder,
        newestShipment,
        normalizeVendorPaymentMethods,
        selectedRate,
        validateCardPaymentUrl,
        vendorKey
    });
});

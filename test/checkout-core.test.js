'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Checkout = require('../checkout-core');
const BrowserCheckout = require('../public/checkout-rules');

test('server and buyer page import one checkout rules implementation', () => {
    assert.strictEqual(Checkout, BrowserCheckout);
});

test('global shipping allocation charges the base once and later items by sequence across vendors', () => {
    const items = [
        { id: 'b', lotNumber: 2, vendorId: 'vendor-b' },
        { id: 'a', lotNumber: 1, vendorId: 'vendor-a' },
        { id: 'c', lotNumber: 3, vendorId: 'vendor-a' }
    ];
    const result = Checkout.allocateShipping(items, {
        destinationType: 'parge', pargeRegion: '수도권', pargeShop: '대구 크레오'
    }, { shippingDefaults: { pargeAdditionalFee: 7000 } }, [{
        region: '수도권', shops: [{ name: '대구 크레오', baseCost: 19000 }]
    }]);

    assert.equal(result.total, 33000);
    assert.deepEqual(Object.fromEntries(result.allocations), { a: 19000, b: 7000, c: 7000 });
});

test('payment state keeps confirmed items and detects a later additional amount', () => {
    const paid = Checkout.derivePaymentState({
        itemCount: 2,
        totalAmount: 326000,
        shipments: [{ paymentConfirmedAmount: 326000, paymentConfirmedAt: '2026-09-02T00:00:00Z', paymentStatus: 'paid', buyerSubmittedAt: '2026-09-01T23:00:00Z' }, { paymentConfirmedAmount: 326000, paymentStatus: 'paid' }]
    });
    const additional = Checkout.derivePaymentState({
        itemCount: 3,
        totalAmount: 383000,
        shipments: [{ paymentConfirmedAmount: 326000, paymentStatus: 'paid', buyerSubmittedAt: '2026-09-01T23:00:00Z' }, { paymentConfirmedAmount: 326000, paymentStatus: 'paid' }]
    });

    assert.equal(paid.status, 'paid');
    assert.equal(additional.status, 'additional_payment');
    assert.equal(additional.additionalDue, 57000);
});

test('bank reports and card link lifecycle resolve to explicit states', () => {
    const bank = Checkout.derivePaymentState({ itemCount: 1, totalAmount: 100000, shipments: [{ buyerSubmittedAt: '1', paymentMethod: 'bank_transfer', paymentStatus: 'bank_transfer_reported' }] });
    const waitingCard = Checkout.derivePaymentState({ itemCount: 1, totalAmount: 100000, shipments: [{ buyerSubmittedAt: '1', paymentMethod: 'card' }] });
    const readyCard = Checkout.derivePaymentState({ itemCount: 1, totalAmount: 100000, shipments: [{ buyerSubmittedAt: '1', paymentMethod: 'card', cardPaymentUrl: 'https://pay.example.com/x' }] });

    assert.equal(bank.status, 'bank_transfer_reported');
    assert.equal(waitingCard.status, 'card_link_pending');
    assert.equal(readyCard.status, 'card_payment_pending');
});

test('card URLs require a public HTTPS URL without embedded credentials', () => {
    assert.equal(Checkout.validateCardPaymentUrl('http://pay.example.com/x'), '');
    assert.equal(Checkout.validateCardPaymentUrl('https://user:pass@pay.example.com/x'), '');
    assert.equal(Checkout.validateCardPaymentUrl('https://localhost/x'), '');
    assert.equal(Checkout.validateCardPaymentUrl('https://pay.example.com/x'), 'https://pay.example.com/x');
});

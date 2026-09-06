'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Rules = require('../public/checkout-rules');
test('explicitly disabled payment methods never re-enable card fallback', () => {
    assert.deepEqual(Rules.normalizeVendorPaymentMethods({paymentMethods: [], cardPaymentEnabled: true}), []);
    assert.deepEqual(Rules.normalizeVendorPaymentMethods({paymentMethods: ['bank_transfer']}), ['bank_transfer']);
});
test('shipping includes registered vendors before sales and preserves editor during refresh', () => {
    const source = fs.readFileSync(require.resolve('../public/shipping.html'), 'utf8');
    assert.match(source, /registeredShippingVendors\.filter/);
    assert.match(source, /vendor-settings-form/);
    assert.doesNotMatch(source, /creo-operator-pipeline|operator-pipeline\.js/);
    assert.match(source, /paymentMethods \}/);
    assert.match(source, /!activeEditorWinner/);
    assert.match(source, /value !== lastShippingPulse/);
    assert.doesNotMatch(source, /bankEnabled/);
    assert.match(source, /낙찰자가 요청 시 결제 링크를 등록하셔야 합니다\./);
    assert.match(source, /const paymentMethods = \['bank_transfer'/);
});

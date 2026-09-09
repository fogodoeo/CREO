const test = require('node:test');
const assert = require('node:assert/strict');
const { labelBundles } = require('../public/print-shipping-summary');
const item = (name, overrides = {}) => ({name, channelId:'qa', winner:'테스트/01012345678', company:name,
    shipping_type:'배송', shipping_company:'파르게', shipping_region:'서울 거점',
    sold_amount_won:10000, shipping_cost:3500, payment_status:'paid', ...overrides});
test('shipping label groups vendors by buyer and destination and sums allocated fees once', () => {
    const a = item('A01'), b = item('B01', {payment_status:'card_payment_pending'});
    const result = labelBundles([a,b]);
    assert.deepEqual(result.get(a), {itemAmount:10000,count:2,items:'A01 · B01',soldAmount:20000,shippingCost:7000,unpaidCount:1});
    assert.equal(result.get(b).count,2);
    assert.equal(a._labelBundle,undefined);
});
test('shipping label does not merge different channels, recipients or destinations', () => {
    const rows = [item('A01'), item('A02',{shipping_region:'부산 거점'}), item('A03',{channelId:'other'}),
        item('A04',{winner:'테스트/01098765432'}), item('A05',{winner:'이름만'}), item('A06',{winner:'이름만'})];
    const result = labelBundles(rows);
    for (const row of rows) assert.equal(result.get(row).count,1);
});

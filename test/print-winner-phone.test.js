'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const summary = require('../public/print-shipping-summary');
const source = fs.readFileSync(require.resolve('../public/print.html'), 'utf8');
function context() {
    const scope = vm.createContext({
        CreoPrintShippingSummary: summary, window: {},
        shippingLabelDestination: item => item.shipping_region,
        auctionNumber: item => item.name
    });
    for (const name of ['parseWinner', 'd10ShippingLabelPayload']) {
        const start = source.indexOf('        function ' + name + '(');
        const end = source.indexOf('\n        function ', start + 1);
        // Stop before the next async function as well.
        const asyncEnd = source.indexOf('\n        async function ', start + 1);
        vm.runInContext(source.slice(start, Math.min(...[end, asyncEnd].filter(i => i >= 0))), scope);
    }
    return scope;
}
test('manual sold record with a separate phone reaches the physical label payload', () => {
    const scope = context();
    const item = {name:'2부 B07',winner:'테스트 구매자',winner_name:'테스트 구매자',winner_phone:'010-1234-5678',shipping_region:'테스트 수령점'};
    const before = structuredClone(item);
    const payload = scope.d10ShippingLabelPayload(item);
    assert.equal(payload.winner_name, '테스트 구매자');
    assert.equal(payload.winner_phone, '01012345678');
    assert.equal(payload.lot_number, '2부 B07');
    assert.deepEqual(item, before);
});
test('explicit phone takes precedence while legacy embedded phones still work', () => {
    const scope = context();
    assert.equal(scope.parseWinner({winner:'테스트/01099998888',winnerPhone:'01012345678'}).phone, '01012345678');
    assert.equal(scope.parseWinner('테스트/경기/01099998888').phone, '01099998888');
    assert.equal(scope.parseWinner({winner:'테스트'}).phone, '');
    assert.equal(scope.parseWinner(null).phone, '');
});
test('all print views pass the full record so display and grouping retain explicit phones', () => {
    assert.doesNotMatch(source, /parseWinner\(it\.winner\)/);
    assert.equal((source.match(/parseWinner\(it\)/g) || []).length, 9);
});

test('packing labels keep up to eight companion lots and separate the count from the original shipping fee', () => {
    const scope = context();
    const item = {name:'A01', winner_name:'테스트', winner_phone:'01012345678', shipping_region:'가상 수령점'};
    const lots = ['A01','A02','A03','A04','B01','B02','B03','E01'];
    scope.window._shippingLabelBundles = new Map([[item, {count:8, items:lots.join(' · '), shippingCost:33000}]]);
    const payload = scope.d10ShippingLabelPayload(item);
    assert.equal(payload.bundle_summary, '합배송 8마리 · ' + lots.join(' · '));
    assert.equal(payload.amount_summary, '배송비 33,000원');
    scope.window._shippingLabelBundles.set(item, {count:9, items:[...lots,'E02'].join(' · '), shippingCost:33000});
    assert.match(scope.d10ShippingLabelPayload(item).bundle_summary, /외 1마리$/);
});

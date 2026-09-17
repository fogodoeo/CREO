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

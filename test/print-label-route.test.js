'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {labelRoute} = require('../public/print-shipping-summary');

test('shipping label separates region and shop without losing nested locality', () => {
    const cases = [
        ['파르게 · 서울/경기/인천 (테스트샵 (남양주 덕소))', ['파르게', '서울/경기/인천', '테스트샵 (남양주 덕소)']],
        ['도도시 · 경기 · 테스트샵 (김포)', ['도도시', '경기', '테스트샵 (김포)']],
        ['직접수령 · 대구 크레오', ['직수령', '대구', '크레오']],
        ['파르게 · 테스트샵 (하남)', ['파르게', '배송지', '테스트샵 (하남)']],
        ['파르게 · 충청/대전 (테스트샵)', ['파르게', '충청/대전', '테스트샵']],
        ['', ['', '배송지', '배송지 미입력']],
    ];
    for (const [source, [carrier, region, shop]] of cases) assert.deepEqual(labelRoute(source), {carrier, region, shop});
});

test('shipping label payload excludes fees while bundle accounting remains available', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/print.html'), 'utf8');
    const start = html.indexOf('function d10ShippingLabelPayload(');
    const end = html.indexOf('\n        async function', start);
    const context = {window: {_shippingLabelBundles: new Map()}, parseWinner: () => ({name:'테스트',phone:'01012345678'}), shippingLabelDestination: ()=>'파르게 · 서울 (테스트샵)'};
    const vm = require('node:vm');
    vm.createContext(context);
    vm.runInContext(html.slice(start, end), context);
    const item = {name:'A01'};
    context.window._shippingLabelBundles.set(item, {shippingCost:33000,itemCount:2,items:'A01 · B01'});
    const payload = context.d10ShippingLabelPayload(item);
    assert.equal(payload.amount_summary, '');
    assert.equal(context.window._shippingLabelBundles.get(item).shippingCost, 33000);
    assert.doesNotMatch(html, /class="label-paper-amount"/);
});

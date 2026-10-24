'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../public/print-shipping-summary');
test('label date belongs to its record across archived and current rounds',()=>{
 for(const date of ['2026-10-14','2026-10-19','2026-10-21'])assert.equal(S.labelDate({attributes:{broadcastDate:date}}),date);
 assert.equal(S.labelDate({attributes:{vendor_entry:{broadcastDate:'2026-10-26'}}}),'2026-10-26');
 for(const date of ['', '2026-02-30','invalid'])assert.equal(S.labelDate({attributes:{broadcastDate:date}}),'');
 assert.equal(S.labelDate({updatedAt:'2026-10-24T00:00:00Z'}),'');
});
test('packing destinations move locality out of shop without losing branch identity',()=>{
 assert.deepEqual(S.compactLabelRoute('파르게 · 서울/경기/인천 (노블레스게코 (청라))'),{carrier:'파르게',region:'청라',shop:'노블레스게코'});
 assert.deepEqual(S.compactLabelRoute('직수령 · 대구 크레오'),{carrier:'직수령',region:'대구',shop:'크레오'});
 assert.deepEqual(S.compactLabelRoute('도도시 · 경기 · 테스트샵 (김포)'),{carrier:'도도시',region:'김포',shop:'테스트샵'});
 assert.equal(S.compactLabelRoute('파르게 · 트라이디거 경주점').shop,'트라이디거 경주점');
});

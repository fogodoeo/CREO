'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Summary = require('../public/print-shipping-summary');

function sold(overrides = {}) {
    return {
        name: 'A01', company: '라이언게코', sold_amount_won: 100000,
        _winner: { name: '김미옥', phone: '01012345678' },
        shipping_type: '배송', shipping_company: '파르게', shipping_region: '수도권 (화성점)',
        shipping_cost: 0, buyer_submitted_at: '2026-08-31T00:00:00.000Z',
        payment_status: 'awaiting_payment', payment_method: 'bank_transfer',
        payment_requested_amount: 326000, payment_confirmed_amount: 0,
        ...overrides
    };
}

test('estimated destination stays unsubmitted, unpriced and explicit in exported rows',()=>{
 const item=sold({shipping_type:'',shipping_company:'',shipping_region:'',shipping_cost:0,buyer_submitted_at:'',payment_status:'',payment_method:'',payment_requested_amount:0,_shippingSuggestion:{label:'파르게 · 서울 · 수령점',estimated:true}});
 const before=structuredClone(item),row=Summary.groupBundles([item])[0];
 assert.equal(row.destination,'');assert.equal(row.estimatedDestination,'파르게 · 서울 · 수령점');assert.equal(row.inputState,'waiting');assert.equal(row.paymentState,'awaiting_information');assert.equal(row.shippingCost,0);assert.equal(row.requestedAmount,0);
 assert.match(Summary.sheetRows([row])[1][13],/^예상 · /);assert.deepEqual(item,before);
 assert.equal(Summary.groupBundles([sold({_shippingSuggestion:item._shippingSuggestion})])[0].estimatedDestination,'');
});

test('estimated destination cannot enter the label print selection',()=>{
 const fs=require('fs'),vm=require('vm'),source=fs.readFileSync(require.resolve('../public/print.html'),'utf8');
 const list={},context=vm.createContext({window:{},document:{getElementById:()=>list},CreoAuctionContract:{isSoldStatus:()=>true},CreoPrintShippingSummary:Summary,parseWinner:()=>({name:'예시',phone:'01012345678'}),fmtPhone:String,escapePrintHtml:String,auctionNumber:()=> 'A01',updateShippingLabelSelection(){}});
 for(const name of ['shippingLabelDestination','renderShippingLabels','estimatedShippingRows']){
  const begin=source.indexOf('        function '+name+'('),end=source.indexOf('\n        function ',begin+1);vm.runInContext(source.slice(begin,end),context);
 }
 const item={name:'A01',status:'sold',_shippingSuggestion:{label:'파르게 · 서울 · 수령점',estimated:true}};
 context.renderShippingLabels([item]);assert.equal(context.window._shippingLabelItems.length,0);assert.match(list.innerHTML,/예상 · 파르게/);assert.doesNotMatch(list.innerHTML,/shipping-label-check/);
});

test('print shipping propagation requires an exact full phone, never the name or suffix',()=>{
 const fs=require('fs'),vm=require('vm'),source=fs.readFileSync(require.resolve('../public/print.html'),'utf8');
 const context=vm.createContext({CreoPrintShippingSummary:Summary,parseSavedShippingRegion:()=>({region:'',hub:''})});
 const begin=source.indexOf('        function populateCalculatedShipping('),end=source.indexOf('\n        function ',begin+1);vm.runInContext(source.slice(begin,end),context);
 const items=[
  {winner_name:'동명이인',winner_phone:'01012345678',shipping_type:'직접수령',shipping_region:'확정 행사장'},
  {winner_name:'다른 표시명',winner_phone:'010-1234-5678'},
  {winner_name:'동명이인',winner_phone:'01099995678'},
  {winner_name:'동명이인'},
  {winner_name:'번호미상',shipping_type:'직접수령',shipping_region:'다른 행사장'},
  {winner_name:'번호미상'},
  {winner_name:'부분번호',winner_phone:'12345678',shipping_type:'직접수령',shipping_region:'또 다른 행사장'},
  {winner_name:'부분번호',winner_phone:'12345678'}
 ];
 context.populateCalculatedShipping(items);
 assert.equal(items[1].shipping_region,'확정 행사장');
 for(const i of [2,3,5,7]){assert.equal(items[i].shipping_region,undefined);assert.equal(items[i].shipping_type,undefined);}
});

test('print loads channel-scoped estimates without mutating canonical items and survives history failure',async()=>{
 const fs=require('fs'),vm=require('vm'),source=fs.readFileSync(require.resolve('../public/print.html'),'utf8');
 const items=[{_platformItemId:'a',status:'sold',winner_phone:'01012345678'}];
 let response={channelId:'alpha',suggestions:[{itemId:'a',label:'파르게 · 예시점',estimated:true}]},failure;
 const context=vm.createContext({console:{warn(){}},resolvePrintChannelId:async()=> 'alpha',syncPrintChannel(){},printOperation:{ready:async()=>({channel:{id:'alpha',dataAdapter:'platform'}}),loadShippingItems:async()=>items},CreoPlatform:{api:async path=>{assert.equal(path,'channels/alpha/shipping-suggestions');if(failure)throw failure;return response}}});
 const begin=source.indexOf('        async function loadPrintData('),end=source.indexOf('\n        async function ',begin+1);vm.runInContext(source.slice(begin,end),context);
 const loaded=await context.loadPrintData();assert.equal(loaded[0]._shippingSuggestion.label,'파르게 · 예시점');assert.equal(items[0]._shippingSuggestion,undefined);
 response={...response,channelId:'beta'};assert.equal((await context.loadPrintData())[0]._shippingSuggestion,undefined);
 failure=Object.assign(new Error('temporary outage'),{status:503});assert.equal(await context.loadPrintData(),items);
 failure=Object.assign(new Error('authentication expired'),{status:401});await assert.rejects(context.loadPrintData(),error=>error.status===401);
});

test('print settlement groups one buyer and vendor into one combined-shipping row', () => {
    const rows = Summary.groupBundles([
        sold({ name: 'A01', sold_amount_won: 100000, shipping_cost: 26000, payment_status: 'paid', payment_confirmed_amount: 326000 }),
        sold({ name: 'A02', sold_amount_won: 200000, payment_status: 'paid', payment_confirmed_amount: 326000 })
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].combined, true);
    assert.equal(rows[0].itemSummary, 'A01 · A02');
    assert.equal(rows[0].soldAmountWon, 300000);
    assert.equal(rows[0].shippingCost, 26000);
    assert.equal(rows[0].paymentState, 'paid');
    assert.equal(rows[0].inputLabel, '입력 완료');
});

test('same buyer remains separated by vendor and missing shipping is obvious', () => {
    const rows = Summary.groupBundles([
        sold(),
        sold({ company: '다른업체', name: 'B01', shipping_type: '', shipping_company: '', shipping_region: '', buyer_submitted_at: '', payment_status: '', payment_method: '' })
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].company, '다른업체');
    assert.equal(rows[0].inputState, 'waiting');
    assert.equal(rows[0].paymentLabel, '배송 미입력');
});

test('additional payment has priority and sheet export keeps raw numeric amounts', () => {
    const rows = Summary.groupBundles([
        sold({ shipping_cost: 26000, payment_status: 'paid', payment_confirmed_amount: 300000 }),
        sold({ name: 'A02', payment_status: 'additional_payment', payment_confirmed_amount: 300000 })
    ]);
    assert.equal(rows[0].paymentState, 'additional_payment');
    const sheet = Summary.sheetRows(rows);
    assert.equal(sheet[0][7], '배송비');
    assert.equal(sheet[1][7], 26000);
    assert.equal(sheet[1][11], '추가 결제');
    assert.equal(sheet[1][14], '2026-08-31 09:00');
});

test('sheet input time is always formatted in Korea Standard Time', () => {
    assert.equal(Summary.formatKoreanDateTime('2026-08-31T14:59:00.000Z'), '2026-08-31 23:59');
    assert.equal(Summary.formatKoreanDateTime('2026-08-31T15:01:00.000Z'), '2026-09-01 00:01');
    assert.equal(Summary.formatKoreanDateTime(''), '');
});

test('new checkout payment states remain visible in print settlement', () => {
    const reported = Summary.groupBundles([sold({ payment_status: 'bank_transfer_reported' })]);
    assert.equal(reported[0].paymentState, 'payment_reported');
    assert.equal(reported[0].paymentLabel, '업체 확인 요청');

    for (const payment_status of ['bank_transfer_pending', 'card_link_pending', 'card_payment_pending']) {
        const rows = Summary.groupBundles([sold({ payment_status })]);
        assert.equal(rows[0].paymentState, 'awaiting_payment');
        assert.equal(rows[0].paymentLabel, '결제 대기');
    }
});

test('winner identity is shared across explicit, profile, and embedded phone formats', () => {
    assert.deepEqual(
        Summary.winnerIdentity({ winner_name: '박찬영', winner_phone: '010-1234-5678' }),
        { key: 'phone:01012345678', name: '박찬영', phone: '01012345678' }
    );
    assert.deepEqual(
        Summary.winnerIdentity({ winner: '최혜선/경기/01077887884' }),
        { key: 'phone:01077887884', name: '최혜선', phone: '01077887884' }
    );
    assert.deepEqual(
        Summary.winnerIdentity({ winner: '김상정/대구/84268438' }),
        { key: 'phone:84268438', name: '김상정', phone: '84268438' }
    );
});

test('settlement grouping uses the same winner identity without pre-enrichment', () => {
    const rows = Summary.groupBundles([
        sold({ _winner: undefined, winner_name: '', winner_phone: '', winner: '김미옥/대구/01012345678', name: 'A01' }),
        sold({ _winner: undefined, winner_name: '김미옥', winner_phone: '010-1234-5678', winner: '', name: 'A02' })
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].buyerName, '김미옥');
    assert.equal(rows[0].phone, '01012345678');
    assert.equal(rows[0].itemSummary, 'A01 · A02');
});

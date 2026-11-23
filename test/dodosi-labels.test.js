const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../public/dodosi-labels');
const item={name:'A01',shipping_type:'배송',shipping_company:'도도시',_platformItemId:'i1',shipping_region:'old',_checkoutShipment:{recipientName:'old'}};
const state={fresh:true,originName:'크레용(대구)',sender:{name:'발송인',phone:'010-0000-0001'},groups:[{quantity:2,name:'수령인',phone:'01000000002',shop:'[서울/강동] 정거샵',items:[{id:'i1',lot:'B02'}],schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}}]};
test('Dodosi uses fresh recipient and lot, two physical pages, and never auction date as shipping date',()=>{
 const {payload,errors}=D.ticket({...item,attributes:{broadcastDate:'2026-11-23'}},state);
 assert.deepEqual(errors,[]);assert.equal(payload.lot_number,'B02');assert.equal(payload.winner_name,'수령인');assert.equal(payload.dropoff_date,'2026-11-24');assert.equal(payload.arrival_date,'2026-11-28');
 assert.equal(D.physicalCount([item,{...item,shipping_company:'파르게'},{...item,shipping_type:'직접수령'}]),4);
 assert.equal(D.shortDate('2026-11-28'),'11/28(토)');assert.equal(D.shortDate('2026-02-30'),'일정 확인');
});
test('Missing, expired, duplicate, other-channel and incomplete source data fail closed',()=>{
 for(const s of [null,{...state,fresh:false},{...state,sender:{}},{...state,groups:[]},{...state,groups:[...state.groups,...state.groups]}])assert.ok(D.ticket(item,s).errors.length);
 assert.ok(D.ticket({...item,_platformItemId:'other-channel'},state).errors.length);
 const invalid=structuredClone(state);invalid.groups[0].schedule.arrivalDate='2026-11-22';assert.ok(D.ticket(item,invalid).errors.length);
});
test('Ticket preview escapes untrusted names; only known carrier yields two pages',()=>{
 const s=structuredClone(state);s.groups[0].name='<img onerror=evil()>';
 const html=D.preview(D.ticket(item,s));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.equal((html.match(/class="dodosi-label-paper"/g)||[]).length,2);
 assert.equal(D.physicalCount([{shipping_company:'unknown'}]),1);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readiness}=require('../organizer-remittance');
const {fixture}=require('../tools/national-settlement-fixture.cjs');
test('whole remittance waits for end, every destination and payment, and pending delivery review',()=>{
 const channel={status:'active'},vendor={id:'v'},now=Date.parse('2026-10-23T00:00:00Z');
 const items=[1,2].map(n=>({id:'i'+n,vendorId:'v',status:'sold',winnerPhone:'0100000000'+n,attributes:{broadcastDate:'2026-10-21'}}));
 const rows=items.map(i=>({id:'s'+i.id,itemId:i.id,vendorId:'v',recipientPhone:i.winnerPhone,method:'pickup',address:'가상 직수령',paymentStatus:'paid'}));
 assert.equal(readiness(channel,items,rows,vendor,[],now).ready,true);
 for(const status of ['pending','bank_transfer_reported','card_payment_reported']){const r=readiness(channel,items,[rows[0],{...rows[1],paymentStatus:status}],vendor,[],now);assert.equal(r.ready,false);assert.equal(r.unpaidCount,1);}
 assert.equal(readiness(channel,items,[rows[0],{...rows[1],address:''}],vendor,[],now).missingDestinationCount,1);
 assert.equal(readiness(channel,items,rows,vendor,[{state:'pending',itemIds:['i2']}],now).ready,false);
 assert.equal(readiness(channel,items,rows,vendor,[{state:'pending',itemIds:['other-round']}],now).ready,true);
 assert.equal(readiness(channel,[...items,{id:'live',status:'live',vendorId:'else'}],rows,vendor,[],now).ready,false);
 assert.equal(readiness(channel,items.map(i=>({...i,attributes:{broadcastDate:'2026-10-28'}})),rows,vendor,[],now).ready,false);
 assert.equal(readiness(channel,items,[rows[0],{...rows[1],paymentStatus:'refunded',address:''}],vendor,[],now).ready,true);
 assert.equal(readiness(channel,items,[rows[0],{...rows[1],recipientPhone:'01099999999'}],vendor,[],now).ready,false,'stale former winner payment cannot release settlement');
});
test('vendor cannot report a partial preparation; final report is whole-round residual with existing deposits preserved',async t=>{
 const f=await fixture();t.after(f.close);f.advance(30*86400000);
 const route='/channels/national-cre/organizer-shipping';
 const bank=(await f.request('PUT',route,{bankName:'가상은행',bankAccount:'000000',bankHolder:'가상 주관사',notificationPhone:'01000000009'})).json().bank;
 const link=(await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:'v1'})).json();
 const read=()=>f.request('GET','/vendor-checkout?code='+link.code,null,false);
 const report=body=>f.request('POST','/vendor-checkout/report-shipping',{code:link.code,requestId:'whole-round-report',expectedBankUpdatedAt:bank.updatedAt,...body},false);
 let data=(await read()).json(),row=data.shippingSettlement.vendors[0];assert.equal(row.remittance.ready,false);assert.equal(row.remittance.missingDestinationCount,2);
 const before=await f.repository.listRecords('national-cre','notification');
 assert.equal((await report({expectedAmount:row.remainingAmount})).status,409);
 assert.deepEqual(await f.repository.listRecords('national-cre','notification'),before);
 assert.equal((await f.request('POST','/buyer-shipping',f.saveBody,false)).status,200);
 data=(await read()).json();row=data.shippingSettlement.vendors[0];assert.equal(row.remittance.missingDestinationCount,0);assert.equal(row.remittance.unpaidCount,1);assert.equal((await report({expectedAmount:row.remainingAmount})).status,409);
 const buyer=data.buyers[0],confirmed=await f.request('POST','/vendor-checkout/confirm-payment',{code:link.code,buyerId:buyer.id,requestId:'whole-confirm',expectedVersion:buyer.payment.editVersion,expectedAmount:buyer.totals.totalAmount},false);assert.equal(confirmed.status,200,confirmed.body);
 await f.repository.upsertRows([{key:'creo_organizer_shipping_ledger::national-cre',value:JSON.stringify([{id:'prior-partial',vendorId:'v1',amount:10000,status:'confirmed',itemIds:['a01','a02']}])}]);
 data=(await read()).json();row=data.shippingSettlement.vendors[0];assert.equal(row.remittance.ready,true);assert.equal(row.receivedAmount,10000);assert.equal(row.remainingAmount,row.totalAmount-10000);
 assert.equal((await report({expectedAmount:1000})).status,409);
 const results=await Promise.all([report({expectedAmount:row.remainingAmount}),report({expectedAmount:row.remainingAmount})]);for(const r of results)assert.equal(r.status,200,r.body);assert.equal(results.filter(r=>r.json().duplicate).length,1);
 f.restart();const after=(await read()).json().shippingSettlement.vendors[0];assert.equal(after.pendingReport.amount,row.remainingAmount);assert.equal(after.history.length,2);assert.equal(after.history.find(r=>r.id==='prior-partial').amount,10000);assert.deepEqual(after.pendingReport.itemIds.sort(),['a01','a02']);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Rules=require('../public/checkout-rules'),Fees=require('../auction-settlement'),Shipping=require('../shipping-settlement');
const {fixture,channel,item,day}=require('../tools/national-settlement-fixture.cjs');
const rates=[{region:'서울',shops:[{name:'가상점',baseCost:19000}]}],selection={destinationType:'parge',pargeRegion:'서울',pargeShop:'가상점'};
const quote=(items,saved=[],config=channel())=>Rules.allocateShipping(items,selection,config,rates,saved);
const snapshot=(items,q)=>items.map(i=>({itemId:i.id,vendorId:i.vendorId,method:'delivery',carrier:'파르게',cost:q.allocations.get(i.id),shippingSupportAmount:q.supportAllocations.get(i.id),shippingSupportDate:q.supportDates.get(i.id),buyerSubmittedAt:'1',updatedAt:'1'}));
test('one buyer shares one 30000 support cap across vendors; event winning prices are unchanged',()=>{
 const items=[item('a01'),item('a02'),item('e03','v2',{attributes:{broadcastDate:day,auctionKind:'event'}})];
 const q=quote(items);assert.equal(q.grossTotal,33000);assert.equal(q.supportTotal,30000);assert.equal(q.total,3000);assert.equal(items[2].soldPrice,100000);
 assert.deepEqual([...q.allocations.values()],[0,0,3000]);
});
test('new buyer never inherits another buyer base fee or subsidy; pickup and other dates do not receive support',()=>{
 const unrelated=snapshot([item('x01')],quote([item('x01')]));
 const q=quote([item('a01')],unrelated);assert.equal(q.grossTotal,19000);assert.equal(q.supportTotal,19000);
 assert.equal(Rules.allocateShipping([item('a01')],{destinationType:'pickup'},channel(),rates).total,0);
 assert.equal(quote([item('a01','v1',{attributes:{broadcastDate:'2026-10-19'}})]).total,19000);
 assert.equal(quote([item('a01')],[],{}).total,19000);
});
test('reordered additional wins preserve frozen quotes and do not refresh the cap, including after support is disabled',()=>{
 const old=[item('a02'),item('a03')],saved=snapshot(old,quote(old)),items=[item('a01'),...old];
 const q=quote(items,saved);assert.equal(q.grossTotal,33000);assert.equal(q.supportTotal,30000);assert.equal(q.total,3000);assert.equal(q.grossAllocations.get('a01'),7000);
 const final=snapshot(items,q),disabled=channel();disabled.shippingSupport.enabled=false;
 assert.equal(quote(items,final,disabled).total,3000);assert.equal(quote(items,final,disabled).supportTotal,30000);
 assert.deepEqual([...quote(items.slice().reverse(),final).allocations],[...q.allocations]);
});
test('another broadcast has its own base shipping fee and never consumes the supported round allowance',()=>{
 const items=[item('a01'),item('a02','v1',{attributes:{broadcastDate:'2026-10-19'}})];
 const q=quote(items);assert.equal(q.grossTotal,38000);assert.equal(q.supportTotal,19000);assert.equal(q.total,19000);assert.equal(q.supportDates.get('a02'),'');
});
test('carrier gross equals buyer net plus organizer support, including fully subsidized shipping',()=>{
 const items=[item('a01'),item('b02','v2'),item('b03','v2')],q=quote(items),rows=snapshot(items,q),vendors=[{id:'v1'},{id:'v2'}];
 assert.equal(Shipping.summarizeShipping(items,rows,vendors).reduce((n,v)=>n+v.totalAmount,0),3000);
 assert.equal(Shipping.summarizeShipping(items,rows,vendors).reduce((n,v)=>n+(v.shippingSupportAmount||0),0),30000);
 assert.equal(Shipping.summarizeCarriers(items,rows,vendors).reduce((n,v)=>n+v.totalAmount,0),33000);
});
test('regular unsold and sold entries each pay 10000; events pay neither fee, with per-entry snapshot and deduplication',()=>{
 const items=[item('a01'),item('a02','v1',{status:'passed'}),item('e03','v1',{attributes:{auctionKind:'event'}}),item('a04','v1',{status:'submitted'}),item('a01')];
 const c=channel();c.vendorSettlement.entryFee=99999;
 const r=Fees.summarize(items,[],[{id:'v1'}],c)[0];assert.equal(r.entryFeeAmount,20000);assert.equal(r.commissionAmount,10000);assert.equal(r.feeAmount,30000);assert.equal(r.feeItems.length,3);assert.equal(r.feeItems.find(i=>i.event).totalAmount,0);
 assert.equal(Fees.summarize(items,[{itemId:'a01',paymentStatus:'refunded'}],[{id:'v1'}],c)[0].commissionAmount,0);
});
test('operator E numbers automatically mark event fees, while normal channel items and frozen policy stay unchanged',()=>{
 const c=channel(),event=Fees.stamp({name:'E01',attributes:{}},c);assert.equal(event.attributes.auctionKind,'event');assert.match(event.attributes.broadcastDate,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(Fees.summarize([{...event,id:'e',vendorId:'v',status:'sold',soldPrice:900000}],[],[{id:'v'}],c)[0].feeAmount,0);
 const normal={name:'E01',attributes:{}};assert.deepEqual(Fees.stamp(normal,{}),normal);
 c.vendorSettlement.entryFee=99999;assert.equal(Fees.stamp({name:'E02',attributes:{}},c,event).attributes.organizerFeePolicy.entryFee,10000);
});
test('API subsidy is atomic, durable, buyer scoped and stable through paid additional wins and failure',async t=>{
 const f=await fixture();t.after(()=>f.close());
 const saves=await Promise.all([1,2].map(()=>f.request('POST','/buyer-shipping',f.saveBody,false)));
 for(const r of saves)assert.equal(r.status,200,r.body);
 assert.deepEqual(saves.map(r=>r.json().duplicate).sort(),[false,true]);
 let p=(await f.read()).json();assert.equal(p.totals.shippingSupportAmount,30000);assert.equal(p.totals.shippingAmount,3000);assert.equal(p.totals.totalAmount,303000);assert.equal(p.shippingQuotes.length,3);assert.doesNotMatch(JSON.stringify(p.shippingQuotes),/01000000003/);
 const confirm=await f.request('POST','/channels/national-cre/buyer-shipping-payment',{itemId:'a01',requestId:'confirm-supported'});assert.equal(confirm.status,200,confirm.body);
 await f.repository.upsertRecord('national-cre','item',item('a00','v1',{lotNumber:0}));f.restart();
 p=(await f.read()).json();assert.equal(p.totals.shippingSupportAmount,30000);assert.equal(p.totals.shippingAmount,10000);assert.equal(p.vendors.find(v=>v.key==='v1').payment.additionalDue,107000);
 const before=JSON.stringify(await f.repository.listRecords('national-cre','shipment')),write=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async()=>{throw Error('isolated failure')};
 const failed=await f.request('POST','/buyer-shipping',{...f.saveBody,requestId:'quote-failure-0002'},false);assert.equal(failed.status,500);assert.equal(JSON.stringify(await f.repository.listRecords('national-cre','shipment')),before);f.repository.upsertRows=write;
 assert.equal((await f.request('POST','/buyer-shipping',{...f.saveBody,requestId:'quote-added-0003'},false)).status,200);
 assert.equal((await f.repository.listRecords('national-cre','shipment')).reduce((n,r)=>n+(r.shippingSupportAmount||0),0),30000);
 const old=await f.repository.getRecord('national-cre','item','a01');await f.request('PUT','/channels/national-cre/auction-transition',{itemId:'a01',status:'passed',item:{attributes:{}}});
 assert.deepEqual((await f.repository.getRecord('national-cre','item','a01')).attributes.organizerFeePolicy,old.attributes.organizerFeePolicy);
 assert.deepEqual(await f.repository.listRecords('creyon','shipment'),[]);
});
test('organizer fees include unsold and zero-fee event details; reporting is idempotent, restart-safe and never sends shipping-only text',async t=>{
 const f=await fixture();t.after(()=>f.close());
 await f.repository.upsertRecord('national-cre','item',item('a04','v1',{status:'passed'}));await f.repository.upsertRecord('national-cre','item',item('e05','v1',{attributes:{broadcastDate:day,auctionKind:'event'}}));
 f.advance(30*86400000);
 for(const row of (await f.repository.listRecords('national-cre','item')).filter(i=>i.vendorId==='v1'&&i.status==='sold'))await f.repository.upsertRecord('national-cre','shipment',{id:'paid-'+row.id,itemId:row.id,vendorId:'v1',method:'pickup',address:'가상 직수령',paymentStatus:'paid'});
 const route='/channels/national-cre/organizer-shipping';
 let r=await f.request('PUT',route,{bankName:'가상은행',bankAccount:'000000',bankHolder:'가상주관사',notificationPhone:'01000000009'});assert.equal(r.status,200,r.body);
 const bank=r.json().bank,code=(await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:'v1'})).json().code;
 const before=(await f.request('GET',route)).json().vendors.find(v=>v.vendorId==='v1');assert.equal(before.entryFeeAmount,30000);assert.equal(before.commissionAmount,20000);assert.equal(before.totalAmount,50000);assert.equal(before.feeItems.find(i=>i.event).totalAmount,0);
 const body={code,requestId:'fees-remit-0001',expectedAmount:50000,expectedBankUpdatedAt:bank.updatedAt};
 const write=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async()=>{throw Error('isolated failure')};assert.equal((await f.request('POST','/vendor-checkout/report-shipping',body,false)).status,500);f.repository.upsertRows=write;
 assert.equal((await f.request('GET',route)).json().vendors.find(v=>v.vendorId==='v1').pendingReport,null);
 const results=await Promise.all([1,2].map(i=>f.request('POST','/vendor-checkout/report-shipping',{...body,requestId:'fees-remit-000'+i},false)));for(const r of results)assert.equal(r.status,200,r.body);assert.equal(results.filter(r=>r.json().duplicate).length,1);
 f.restart();const v=(await f.request('GET',route)).json().vendors.find(v=>v.vendorId==='v1');assert.equal(v.pendingReport.amount,50000);assert.equal(v.history.length,1);assert.equal(v.pendingReport.kind,'vendor-settlement');
 const notices=await f.repository.listRecords('national-cre','notification');assert.equal(notices.length,1);assert.equal(notices[0].templateKey,'vendor_settlement_reported');assert.equal(notices[0].transport,'sms');assert.equal(notices[0].recipientPhone,'01000000009');assert.equal(notices[0].status,'queued');assert.match(notices[0].fallbackText,/가상 업체 A 정산금 50,000원 입금 신고/);assert.ok(Buffer.byteLength(notices[0].fallbackText,'utf8')<=90);assert.equal(v.pendingReport.notificationId,notices[0].id);
 assert.equal((await f.request('POST',route+'/review',{vendorId:'v1',reportId:v.pendingReport.id,expectedAmount:50000,action:'confirmed'})).status,200);
 assert.equal((await f.request('GET',route)).json().vendors.find(v=>v.vendorId==='v1').remainingAmount,0);
});

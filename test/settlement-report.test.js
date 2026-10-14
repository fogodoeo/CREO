'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,item,channel}=require('../tools/national-settlement-fixture.cjs');
const {buildReport}=require('../settlement-report');
const Workbook=require('../public/settlement-workbook');
const XLSX=require('../public/assets/vendor/xlsx.mini.min.js');
const Fees=require('../auction-settlement'),Shipping=require('../shipping-settlement');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');

function report({items=[],shipments=[],receipts=[]}={}) {
    const vendors=[{id:'v1',name:'가상 업체'}],fees=Fees.summarize(items,shipments,vendors,channel());
    const organizer={vendors:Shipping.summarizeShipping(items,shipments,vendors).map(v=>({...v,...fees.find(f=>f.vendorId===v.vendorId),shippingAmount:v.totalAmount,totalAmount:v.totalAmount+fees[0].feeAmount,receivedAmount:5000,remainingAmount:Math.max(0,v.totalAmount+fees[0].feeAmount-5000),overpaidAmount:0,history:receipts}))};
    return buildReport({channel:channel(),items,shipments,vendors,organizer,generatedAt:'2026-10-14T10:00:00Z'});
}
const shipment=(id,extra={})=>({id:'s-'+id,itemId:id,vendorId:'v1',method:'delivery',carrier:'파르게',cost:0,shippingSupportAmount:15000,shippingSupportDate:'2026-10-14',recipientPhone:'01000000003',buyerSubmittedAt:'2026-10-14T09:00:00Z',updatedAt:'2026-10-14T09:00:00Z',paymentStatus:'paid',paymentMethod:'bank_transfer',paymentConfirmedAmount:200000,...extra});

test('export counts regular unsold fees, event exemption and shipping support once; cumulative confirmations are not summed per item',()=>{
    const data=report({items:[item('a01'),item('a02'),item('a03','v1',{status:'passed',soldPrice:0}),item('e04','v1',{attributes:{auctionKind:'event'},winnerPhone:''})],shipments:[shipment('a01'),shipment('a02')]});
    assert.equal(data.totals.entryFeeAmount,30000);assert.equal(data.totals.commissionAmount,20000);assert.equal(data.totals.shippingSupportAmount,30000);
    assert.equal(data.items.find(r=>r.event).feeAmount,0);
    const buyer=data.buyers.find(r=>r.phone);assert.equal(buyer.confirmedAmount,200000);assert.equal(buyer.remainingAmount,0);assert.equal(buyer.itemCount,2);
    assert.equal(data.buyers.find(r=>!r.phone).status,'phone_required');assert.equal(data.totals.missingPhoneCount,1);
});
test('same nickname without an identity never merges; unregistered delivery is unknown rather than free',()=>{
    const data=report({items:[item('a01','v1',{winnerPhone:''}),item('a02','v1',{winnerPhone:''})]});
    assert.equal(data.buyers.length,2);assert.equal(data.buyers[0].totalAmount,null);assert.equal(data.buyers[0].confirmedAmount,null);
    assert.equal(data.totals.missingShippingCount,2);assert.equal(data.items[0].shippingAmount,null);
});
test('a missing vendor or another winner payment record cannot silently produce an understated or misassigned settlement',()=>{
    assert.throws(()=>report({items:[item('a01','missing')]}),error=>error.status===422);
    assert.throws(()=>report({items:[item('a01')],shipments:[shipment('a01',{recipientPhone:'01000000009'})]}),error=>error.status===422);
});
test('latest shipment wins regardless of input order; cancelled sale keeps entry fee but loses commission and collectible sale',()=>{
    const a=item('a01'),old=shipment('a01'),last=shipment('a01',{id:'latest',paymentStatus:'refunded',updatedAt:'2026-10-14T10:00:00Z'});
    const left=report({items:[a,a],shipments:[old,last]}),right=report({items:[a],shipments:[last,old]});
    assert.deepEqual(left.items,right.items);assert.equal(left.items.length,1);assert.equal(left.totals.entryFeeAmount,10000);assert.equal(left.totals.commissionAmount,0);assert.equal(left.totals.soldAmount,0);assert.equal(left.buyers.length,0);
});
test('workbook roundtrip preserves four sheets, numeric currency, dates, literal strings, leading zeroes, totals and cancelled receipts',()=>{
    const data=report({items:[item('a01','v1',{winnerName:'=HYPERLINK("bad")'})],shipments:[shipment('a01')],receipts:[{id:'r',amount:5000,status:'cancelled',paidOn:'2026-10-14'}]});
    const bytes=Workbook.xlsxBytes(data,XLSX),read=XLSX.read(bytes,{type:'buffer',cellNF:true});
    assert.equal(read.SheetNames.length,4);
    const detail=read.Sheets['개체 내역'];assert.equal(detail.L6.v,'01000000003');assert.equal(detail.L6.t,'s');assert.equal(detail.K6.f,undefined);assert.equal(detail.F6.v,100000);assert.equal(detail.A6.z,'yyyy-mm-dd');
    assert.equal(read.Sheets['업체 총정산'].F7.f,'SUBTOTAL(109,F6:F6)');
    assert.equal(read.Sheets['주관사 입금 내역'].D6.v,'취소');
    const zip=XLSX.CFB.read(bytes,{type:'buffer'}),xml=Buffer.from(XLSX.CFB.find(zip,'/xl/worksheets/sheet1.xml').content).toString('utf8');
    assert.match(xml,/ySplit="5"/);assert.match(xml,/showGridLines="0"/);assert.match(xml,/<autoFilter ref="A5:Q6"/);
    assert.match(Buffer.from(XLSX.CFB.find(zip,'/xl/styles.xml').content).toString('utf8'),/FF243B61/);
    const tsv=Workbook.tsv(Workbook.sheets(data)[1]);assert.match(tsv,/'01000000003/);assert.match(tsv,/'=HYPERLINK/);
    assert.doesNotMatch(JSON.stringify(Workbook.sheets(data)),/bidder_key|cardPaymentUrl|bankAccount|accessSession/);
});
test('administrator export is read-only, restart-safe, channel-isolated and rejects public/vendor/organizer access',async t=>{
    const f=await fixture();t.after(()=>f.close());
    const route='/channels/national-cre/settlement-report';
    assert.equal((await f.request('GET',route,null,false)).status,401);
    const link=(await f.request('POST','/channels/national-cre/organizer-link',{})).json();
    assert.equal((await f.call(f.client(),'GET','/api/platform'+route,null,{'x-creo-organizer':new URL(link.url).pathname.split('/').pop()})).status,401);
    const before=JSON.stringify(await f.repository.listRecords('national-cre','item'));
    const results=await Promise.all([f.request('GET',route),f.request('GET',route)]);
    results.forEach(r=>assert.equal(r.status,200,r.body));assert.deepEqual(results[0].json().vendors,results[1].json().vendors);
    f.restart();const again=(await f.request('GET',route)).json();assert.deepEqual(again.vendors,results[0].json().vendors);
    assert.equal(JSON.stringify(await f.repository.listRecords('national-cre','item')),before);assert.equal(f.sms.length,0);
    const other=(await f.request('GET','/channels/creyon/settlement-report')).json();assert.equal(other.items.length,0);
});
test('phone lookup uses the matched winning member, does not guess a manually replaced winner, and cannot expose names-only matches',async t=>{
    const calls=[];
    const f=await createFixture({apiOptions:{bandMembership:{resolveMemberIdentity:async input=>{calls.push(input);return input.bandMemberKey==='member-A'?{phone:'01000000007'}:null;}}}});t.after(()=>f.close());
    for(const row of [item('a01','v1',{winnerPhone:'',winnerName:'회원A',attributes:{bid_log:[{name:'회원A',bidder_key:'member-A',amount:10}]}}),item('a02','v1',{winnerPhone:'',winnerName:'수동 변경',attributes:{bid_log:[{name:'회원A',phone:'01000000007',bidder_key:'member-A',amount:10}]}})])await f.repository.upsertRecord('national-cre','item',row);
    await f.repository.upsertRecord('national-cre','vendor',{id:'v1',name:'가상'});
    const req=()=>f.call(f.client(),'GET','/api/platform/channels/national-cre/settlement-report',null,{'x-creo-admin':f.secret});
    const response=await req();assert.equal(response.status,200,response.body);const rows=response.json().items;
    assert.equal(rows.find(r=>r.id==='a01').phone,'01000000007');assert.equal(rows.find(r=>r.id==='a01').phoneSource,'member');assert.equal(rows.find(r=>r.id==='a02').phone,'');assert.ok(calls.every(c=>c.requireMemberKey===true));
    assert.equal((await f.repository.getRecord('national-cre','item','a01')).winnerPhone,'');
});

test('directory failure leaves an actionable missing phone; archived rounds never query the current membership directory',async t=>{
    let queries=0;
    const f=await createFixture({apiOptions:{bandMembership:{resolveMemberIdentity:async()=>{queries++;throw Error('directory offline');}}}});t.after(()=>f.close());
    await f.repository.upsertRecord('national-cre','vendor',{id:'v1',name:'가상'});
    await f.repository.upsertRecord('national-cre','item',item('a01','v1',{winnerPhone:'',winnerName:'회원A',attributes:{bid_log:[{name:'회원A',bidder_key:'member-A'}]}}));
    const get=()=>f.call(f.client(),'GET','/api/platform/channels/national-cre/settlement-report',null,{'x-creo-admin':f.secret});
    let r=await get();assert.equal(r.status,200);assert.equal(r.json().totals.missingPhoneCount,1);assert.equal(queries,1);
    await f.repository.saveCatalog([{...channel(),status:'archived'}]);f.restart();r=await get();assert.equal(r.status,200);assert.equal(queries,1);
    const original=f.repository.getRowsByKeys.bind(f.repository);f.repository.getRowsByKeys=async keys=>keys.some(k=>k.includes('organizer_shipping_ledger'))?[{key:keys.find(k=>k.includes('organizer_shipping_ledger')),value:'broken-json'}]:original(keys);
    assert.equal((await get()).status,500); // No successful spreadsheet full of false zeroes.
});

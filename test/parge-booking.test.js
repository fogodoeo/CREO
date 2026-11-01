'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {fixture}=require('../tools/national-settlement-fixture.cjs'),Core=require('../public/parge-dispatch-core');
const route='/channels/national-cre/parge-dispatch';
async function setup(t){
 const f=await fixture();t.after(()=>f.close());
 f.provider.readiness=()=>({ready:true,missing:[]});
 for(const [id,phone]of [['one','01000000011'],['two','01000000022']]){
  await f.repository.upsertRecord('national-cre','item',{id,name:id,status:'sold',soldPrice:10000,winnerName:'구매자 '+id,winnerPhone:phone,buyerSaleId:'sale-'+id});
  await f.repository.upsertRecord('national-cre','shipment',{id:'s-'+id,itemId:id,destinationType:'parge',recipientName:'수령인 '+id,recipientPhone:phone,pargeShop:'가상 매장',paymentStatus:'paid',buyerSaleId:'sale-'+id});
 }
 const w={items:await f.repository.listRecords('national-cre','item'),shipments:await f.repository.listRecords('national-cre','shipment')};
 const plan=Core.manifest(Core.build(w,{channelId:'national-cre'}).groups,{channelId:'national-cre',date:'2099-11-02'});
 const response=await f.request('POST',route,{action:'prepare',requestId:'booking-fixture-request-01',plan});assert.equal(response.status,200,response.body);
 f.record=response.json().record;
 f.orders=plan.groups.map((g,i)=>({...g,orderNumber:'TEST-'+i,arrivalDate:'2099-11-05',dispatchDate:'2099-11-03'})).reverse();
 f.link=extra=>f.request('POST',route,{action:'link-orders',id:f.record.id,expectedUpdatedAt:f.record.updatedAt,confirmed:true,orders:f.orders,...extra});
 f.preview=()=>f.request('POST',route,{action:'preview-notices',id:f.record.id});
 f.send=preview=>f.request('POST',route,{action:'send-notices',id:f.record.id,confirmed:true,preview});
 f.notices=async()=>(await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='buyer_parge_booking_confirmed');
 return f;
}
test('matches reversed order rows by identity and explicit arrival wins; buyer differs from recipient name',async t=>{
 const f=await setup(t),shipments=await f.repository.listRecords('national-cre','shipment');const linked=await f.link();assert.equal(linked.status,200,linked.body);
 const preview=(await f.preview()).json().record.preview;assert.equal(preview.length,2);assert.equal(preview[0].variables.낙찰자명,'구매자 one');assert.equal(preview[0].variables.주문번호,undefined);assert.equal(preview[0].variables.수령예정일,'2099-11-05');
 assert.deepEqual(await f.notices(),[]);assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),shipments);
});
for(const [name,change]of [['wrong phone',o=>o[0].phone='01099999999'],['wrong hub',o=>o[0].shop='다른 매장'],['wrong quantity',o=>o[0].quantity=9],['duplicate number',o=>o[0].orderNumber=o[1].orderNumber],['invalid arrival',o=>o[0].arrivalDate='2099-02-30']])test(name+' rejected without save',async t=>{const f=await setup(t);change(f.orders);assert.equal((await f.link()).status,409);assert.equal((await f.request('GET',route)).json().records[0].status,'checking');});
test('unapproved template blocks enqueue without SMS fallback',async t=>{const f=await setup(t);await f.link();f.provider.readiness=(_k,transport)=>({ready:transport==='sms',missing:['template']});const p=(await f.preview()).json().record;assert.equal(p.noticeReady,false);assert.equal((await f.send(p.preview)).status,409);assert.deepEqual(await f.notices(),[]);});
test('concurrent send and restart create one durable notice per delivery',async t=>{const f=await setup(t);await f.link();const p=(await f.preview()).json().record.preview;const results=await Promise.all([f.send(p),f.send(p)]);results.forEach(r=>assert.equal(r.status,200,r.body));assert.equal((await f.notices()).length,2);assert((await f.notices()).every(n=>!n.allowSmsFallback&&!n.failureSmsFallback));f.restart();assert.equal((await f.send(p)).status,200);assert.equal((await f.notices()).length,2);assert.equal((await f.link()).status,409);});
test('failed atomic write leaves neither notices nor request marker; retry succeeds',async t=>{const f=await setup(t);await f.link();const p=(await f.preview()).json().record.preview,write=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.includes('::notification::')))throw Error('test write failure');return write(rows);};assert.equal((await f.send(p)).status,500);assert.deepEqual(await f.notices(),[]);assert.equal((await f.request('GET',route)).json().records[0].noticeRequestedAt,undefined);f.repository.upsertRows=write;assert.equal((await f.send(p)).status,200);});
test('stale preview, resend sale and changed recipient fail closed',async t=>{const f=await setup(t);await f.link();const p=(await f.preview()).json().record.preview;assert.equal((await f.send([])).status,409);const item=await f.repository.getRecord('national-cre','item','one');await f.repository.upsertRecord('national-cre','item',{...item,buyerSaleId:'new-sale'});assert.equal((await f.send(p)).status,409);assert.deepEqual(await f.notices(),[]);});
test('before-send rejects changed buyer and archived scope',async t=>{const f=await setup(t);await f.link();const p=(await f.preview()).json().record.preview;await f.send(p);const notice=(await f.notices()).find(n=>n.recipientPhone==='01000000011');await f.api.assertBuyerNotificationLink('national-cre',notice);const item=await f.repository.getRecord('national-cre','item','one');await f.repository.upsertRecord('national-cre','item',{...item,winnerPhone:'01000000099'});await assert.rejects(()=>f.api.assertBuyerNotificationLink('national-cre',notice),e=>e.code==='BUYER_LINK_INACTIVE');});
test('booking stale editor cannot overwrite newer save',async t=>{const f=await setup(t);assert.equal((await f.link({expectedUpdatedAt:'old'})).status,409);assert.equal((await f.link()).status,200);});
test('confirm reservation requires no order number; preview, concurrent send and restart remain idempotent',async t=>{
 const f=await setup(t),deliveries=f.record.plan.groups.map(g=>({itemIds:g.items.map(i=>i.id)})).reverse();
 const body={action:'confirm-reservation',id:f.record.id,expectedUpdatedAt:f.record.updatedAt,confirmed:true,deliveries};
 assert.equal((await f.request('POST',route,{...body,confirmed:false})).status,409);
 assert.equal((await f.request('POST',route,{...body,deliveries:deliveries.slice(1)})).status,409);
 const saved=await f.request('POST',route,body);assert.equal(saved.status,200,saved.body);assert(saved.json().record.orders.every(o=>!o.orderNumber));
 const p=(await f.preview()).json().record.preview;assert.equal(p.length,2);assert(p.every(e=>!('주문번호' in e.variables)));assert(p.every(e=>e.variables.수령예정일==='일정 확인 중'));
 const sends=await Promise.all([f.send(p),f.send(p)]);sends.forEach(r=>assert.equal(r.status,200,r.body));assert.equal((await f.notices()).length,2);f.restart();assert.equal((await f.send(p)).status,200);assert.equal((await f.notices()).length,2);
});
test('reservation confirmation without numbers rejects stale sale and failed storage',async t=>{
 const f=await setup(t),deliveries=f.record.plan.groups.map(g=>({itemIds:g.items.map(i=>i.id)}));
 const body={action:'confirm-reservation',id:f.record.id,expectedUpdatedAt:f.record.updatedAt,confirmed:true,deliveries};
 const write=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.endsWith('parge-dispatch')))throw Error('failure');return write(rows);};
 assert.equal((await f.request('POST',route,body)).status,500);f.repository.upsertRows=write;assert.equal((await f.request('GET',route)).json().records[0].status,'checking');
 const item=await f.repository.getRecord('national-cre','item','one');await f.repository.upsertRecord('national-cre','item',{...item,buyerSaleId:'resale'});assert.equal((await f.request('POST',route,body)).status,409);
});
test('completion reader only returns visible number candidates and never associates by sequence',()=>{
 const {document}=parseHTML('<h2>배송 신청이 완료되었습니다!</h2><div><p>맡김일 안내</p><div>TEST-2 · 2099-11-02</div><div>TEST-1 · 화요일</div></div>');
 for(const e of document.querySelectorAll('*'))e.getClientRects=()=>[{}];const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../tools/parge-helper/orders.js'),'utf8'),{window,document,location:{origin:'https://parge.co.kr',pathname:'/booking'}});
 const result=window.CreoPargeOrders.read();assert.equal(result.requiresRecipientMatch,true);assert.deepEqual(Array.from(result.orders,o=>o.orderNumber),['TEST-2','TEST-1']);assert.equal(result.orders[0].arrivalDate,undefined);document.querySelector('h2').textContent='결제 대기';assert.match(window.CreoPargeOrders.read().error,/완료 화면/);
});

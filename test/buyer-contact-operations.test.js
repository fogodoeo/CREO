'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../tools/national-settlement-fixture.cjs');
const {phone}=require('../buyer-contact-operations');
const route='/channels/national-cre/buyer-contacts';
async function setup(t){const f=await fixture();t.after(()=>f.close());f.provider.readiness=()=>({ready:true,missing:[]});f.readContacts=async()=>{const r=await f.request('GET',route);assert.equal(r.status,200,r.body);return r.json();};f.body=async(action='send',extra={})=>{const i=await f.repository.getRecord('national-cre','item','a01');return {itemId:i.id,saleId:i.buyerSaleId||'legacy',expectedUpdatedAt:i.updatedAt,action,phone:'01000000004',confirmed:true,requestId:'request-contact-001',...extra};};return f;}
test('contact entry requires the whole phone and rejects letters, partial numbers and malformed 010 lengths',()=>{
 for(const v of ['12345678','0101234567','010123456789','010가나다5678','01012345678hello'])assert.equal(phone(v),'');
 assert.equal(phone('+82 10-1234-5678'),'01012345678');assert.equal(phone('010-1234-5678'),'01012345678');
});
test('missing phones and omitted outbox rows remain visible; authentication and channel boundary hold',async t=>{
 const f=await setup(t);await f.repository.upsertRecord('national-cre','item',{id:'missing',name:'B02',status:'sold',soldPrice:1,winnerName:'번호없는사람'});
 const r=await f.readContacts();assert.equal(r.attentionCount,4);assert.equal(r.rows.find(r=>r.itemId==='missing').status,'missing_phone');assert.equal(r.rows[0].status,'not_sent');
 assert.equal((await f.request('GET',route,null,false)).status,401);
 assert.deepEqual((await f.request('GET','/channels/creyon/buyer-contacts')).json().rows,[]);
});
test('contact and outbox save together, double-click and lost-response retry create one notice and preserve paid records',async t=>{
 const f=await setup(t);await f.request('POST','/buyer-shipping',f.saveBody,false);await f.request('POST','/channels/national-cre/buyer-shipping-payment',{itemId:'a01',requestId:'paid-contact-001'});
 const item=await f.repository.getRecord('national-cre','item','a01'),shipments=await f.repository.listRecords('national-cre','shipment');const body=await f.body();
 const results=await Promise.all([f.request('POST',route,body),f.request('POST',route,body)]);for(const r of results)assert.equal(r.status,200,r.body);assert.equal(results.filter(r=>r.json().duplicate).length,1);
 f.restart();assert.equal((await f.request('POST',route,body)).json().duplicate,true);
 const updated=await f.repository.getRecord('national-cre','item','a01');assert.equal(updated.winnerPhone,body.phone);
 for(const key of Object.keys(item).filter(k=>!['winnerPhone','updatedAt'].includes(k)))assert.deepEqual(updated[key],item[key],key);
 const after=await f.repository.listRecords('national-cre','shipment');for(const before of shipments){const a=after.find(s=>s.id===before.id);for(const key of Object.keys(before).filter(k=>k!=='recipientPhone'))assert.deepEqual(a[key],before[key],key);assert.equal(a.recipientPhone,before.itemId==='a01'?body.phone:before.recipientPhone);}
 const ns=(await f.repository.listRecords('national-cre','notification')).filter(n=>n.eventKey.startsWith('retry:'));assert.equal(ns.length,1);assert.equal(ns[0].recipientPhone,body.phone);assert.equal(ns[0].status,'queued');await f.api.assertBuyerNotificationLink('national-cre',ns[0]);
 const preview=await f.request('GET','/channels/national-cre/buyer-checkout-preview?itemId=a01');assert.equal(preview.status,200);assert.ok(preview.json().vendors.some(v=>v.payment.status==='paid'));
});
test('transaction failure leaves phone, shipment, audits and notifications unchanged and allows retry',async t=>{
 const f=await setup(t),body=await f.body(),before=await f.repository.getRecord('national-cre','item','a01');
 // Issue link first: the simulated failure must target the atomic contact commit.
 const link=await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'a01'});assert.equal(link.status,200);
 const write=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.startsWith('buyer_contact_action::')))throw Error('isolated storage failure');return write(rows);};
 assert.equal((await f.request('POST',route,body)).status,500);assert.deepEqual(await f.repository.getRecord('national-cre','item','a01'),before);assert.equal((await f.repository.listRecords('national-cre','notification')).length,0);
 f.repository.upsertRows=write;assert.equal((await f.request('POST',route,body)).status,200);
});
test('stale, unconfirmed, reused and wrong-channel requests cannot rewrite a winner',async t=>{
 const f=await setup(t),body=await f.body();
 for(const patch of [{confirmed:false},{phone:'0101234567'},{saleId:'another-sale'},{expectedUpdatedAt:'old'},{itemId:'unknown'}])assert.ok((await f.request('POST',route,{...body,...patch})).status>=400);
 assert.ok((await f.request('POST','/channels/creyon/buyer-contacts',body)).status>=400);
 assert.equal((await f.request('POST',route,body)).status,200);assert.equal((await f.request('POST',route,{...body,phone:'01000000005'})).status,409);
});
test('changed contact expires old queued delivery; reopened sales and later number corrections invalidate prepared notices',async t=>{
 const f=await setup(t),i=await f.repository.getRecord('national-cre','item','a01');
 await f.repository.upsertRecord('national-cre','notification',{id:'old',eventKey:`sale:${i.id}:old:buyer`,recipientRole:'buyer',recipientPhone:'01000000003',status:'queued',createdAt:'1'});
 assert.equal((await f.request('POST',route,await f.body())).status,200);assert.equal((await f.repository.getRecord('national-cre','notification','old')).status,'expired');
 const n=(await f.repository.listRecords('national-cre','notification')).find(n=>n.eventKey.startsWith('retry:'));
 await f.repository.upsertRecord('national-cre','item',{...await f.repository.getRecord('national-cre','item','a01'),status:'live'});await assert.rejects(f.api.assertBuyerNotificationLink('national-cre',n),/이전 알림/);
});
test('unresolved sending outcomes and already queued sends do not create duplicate messages',async t=>{
 const f=await setup(t);for(const status of ['sending','delivery_unknown','queued']){
 await f.repository.upsertRecord('national-cre','notification',{id:'old',eventKey:'sale:a01:version:buyer',recipientRole:'buyer',recipientPhone:'01000000004',status,createdAt:'1'});
 assert.equal((await f.request('POST',route,await f.body())).status,409);assert.equal((await f.repository.listRecords('national-cre','notification')).length,1);
 }
});
test('external confirmation never sends, and a missing contact cannot be marked resolved by a new number alone',async t=>{
 const f=await setup(t);assert.equal((await f.request('POST',route,await f.body('external'))).status,409);
 assert.equal((await f.request('POST',route,await f.body('external',{phone:'01000000003'}))).status,200);
 assert.equal((await f.repository.listRecords('national-cre','notification')).length,0);assert.equal((await f.readContacts()).rows.find(r=>r.itemId==='a01').status,'external');
});
test('pending checkout change blocks reassignment without destroying financial history',async t=>{
 const f=await setup(t);await f.repository.upsertRecord('national-cre','checkoutchange',{id:'change',state:'pending',itemIds:['a01']});assert.equal((await f.request('POST',route,await f.body())).status,409);
});
test('save only is visible as not sent, and corrections are private settings scoped to exact BAND member',async t=>{
 const f=await setup(t),i=await f.repository.getRecord('national-cre','item','a01');
 await f.repository.upsertRecord('national-cre','item',{...i,attributes:{bid_log:JSON.stringify([{name:'가상 낙찰자',amount:100000,bidder_key:'exact-member'}])}});
 assert.equal((await f.request('POST',route,await f.body('save'))).status,200);const rows=await f.readContacts();assert.equal(rows.rows.find(r=>r.itemId==='a01').status,'not_sent');
 assert.equal((await f.repository.listRecords('national-cre','notification')).length,0);
 const settings=await f.repository.listRecords('national-cre','setting');assert.equal(settings.filter(s=>s.id.startsWith('buyer-contact-')&&!s.id.startsWith('buyer-contact-audit-')).length,1);
 assert.equal((await f.repository.listRecords('creyon','setting')).length,0);
 await f.repository.upsertRecord('national-cre','item',{id:'next',name:'B04',lotNumber:4,vendorId:'v1',status:'waiting',soldPrice:0});
 const next=await f.request('PUT','/channels/national-cre/auction-transition',{itemId:'next',status:'sold',item:{winnerName:'가상 낙찰자',winnerPhone:'01000000003',soldPrice:100000,attributes:{bid_log:JSON.stringify([{name:'가상 낙찰자',amount:100000,bidder_key:'exact-member'}])}}});
 assert.equal(next.status,200,next.body);assert.equal(next.json().item.winnerPhone,'01000000004');
 assert.equal((await f.repository.getRecord('national-cre','item','a02')).winnerPhone,'01000000003');
});

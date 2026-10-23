'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Phase=require('../public/round-phase'),Home=require('../public/operator-home-model'),Shell=require('../public/operator-shell-model');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
test('work counts ignore the previous winner and another vendor shipment',()=>{
 const {summarize}=require('../operator-work-summary');
 const items=[{id:'a',vendorId:'v',status:'sold',winnerPhone:'01000000003'}],shipments=[{itemId:'a',vendorId:'v',recipientPhone:'01000000004',paymentStatus:'bank_transfer_reported'},{itemId:'a',vendorId:'other',recipientPhone:'01000000003',paymentStatus:'bank_transfer_reported'}];
 assert.equal(summarize({items,shipments},{vendors:[]}).shipping,0);
 shipments.push({itemId:'a',vendorId:'v',recipientPhone:'01000000003',paymentStatus:'bank_transfer_reported'});
 assert.equal(summarize({items,shipments},{vendors:[]}).shipping,1);
});
test('round phase uses Korean day, finished lots and archives, without mistaking the connected channel for a live auction',()=>{
 const now=Date.parse('2026-10-23T00:00:00+09:00');
 assert.equal(Phase.phase({date:'2026-10-22',status:'active'},now),'finished');
 assert.equal(Phase.phase({date:'2026-10-23',status:'active'},now),'preparing');
 assert.equal(Phase.phase({date:'2026-10-28',status:'draft'},now),'preparing');
 assert.equal(Phase.fromItems([{status:'sold'},{status:'passed'}],'2026-10-23','active',now),'finished');
 assert.equal(Phase.fromItems([{status:'sold'},{status:'waiting'}],'2026-10-23','active',now),'preparing');
 assert.equal(Phase.fromItems([{status:'live'}],'2026-10-22','active',now),'live','explicit reopened live work stays reachable');
 assert.equal(Phase.phase({archiveId:'old',liveCount:1},now),'finished');
 const channel={id:'national-cre',name:'가상 방송',status:'active',dataAdapter:'platform'},round={channelId:channel.id,phase:'finished',name:'가상 지난 회차'};
 const state=Home.selection({channels:[channel]},[round],channel.id,'?channel=national-cre');
 assert.equal(state.active,true);assert.equal(state.finished,true);assert.equal(Shell.menu(state)[0].id,'finance');assert.equal(Shell.entry(state,'items').label,'출품 내역 확인');
});
test('operator work counts are read-only, exact-round, private, reloadable and clear with completion',async t=>{
 const f=await createFixture();t.after(f.close);const id='national-cre',secret={'x-creo-admin':f.secret};
 const request=(path,auth=secret)=>f.call(f.client(),'GET','/api/platform/channels/'+id+'/work-summary'+path,null,auth);
 await f.repository.upsertRecord(id,'vendor',{id:'v',name:'가상 업체'});
 await f.repository.upsertRecord(id,'archive',{id:'old',closedAt:'2026-10-14T15:00:00Z'});
 for(const [key,archive]of [['old-sale','old'],['current-sale','']]){
  await f.repository.upsertRecord(id,'item',{id:key,status:'sold',vendorId:'v',winnerName:'가상 고객',winnerPhone:'01000000003',soldPrice:100000,...(archive?{auctionArchiveId:archive}:{})});
  await f.repository.upsertRecord(id,'shipment',{id:'s-'+key,itemId:key,vendorId:'v',paymentStatus:'bank_transfer_reported',updatedAt:'2026-10-23T00:00:00Z'});
 }
 await f.repository.upsertRecord(id,'checkoutchange',{id:'old-change',itemIds:['old-sale'],state:'pending'});
 await f.repository.upsertRecord(id,'carrierrequest',{id:'new-carrier',itemIds:['current-sale'],state:'pending'});
 await f.repository.upsertRecord(id,'carrierrequest',{id:'mixed',itemIds:['old-sale','current-sale'],state:'pending'});
 const before=await f.repository.listRecords(id,'shipment');
 assert.equal((await request('',{})).status,401);
 const results=await Promise.all([request(''),request('?archive=old')]);for(const r of results){assert.equal(r.status,200,r.body);assert.deepEqual(r.json().counts,{shipping:1,organizer:0,changes:1});assert.doesNotMatch(r.body,/010000|winnerName|가상 고객|bankAccount/);}
 assert.equal((await request('?archive=missing')).status,404);
 f.restart();assert.deepEqual((await request('')).json(),results[0].json());assert.deepEqual(await f.repository.listRecords(id,'shipment'),before);
 await f.repository.upsertRecord(id,'shipment',{...before.find(s=>s.itemId==='current-sale'),paymentStatus:'paid'});
 await f.repository.upsertRecord(id,'carrierrequest',{id:'new-carrier',itemIds:['current-sale'],state:'approved'});
 assert.deepEqual((await request('')).json().counts,{shipping:0,organizer:0,changes:0});assert.equal((await request('?archive=old')).json().counts.shipping,1);
});

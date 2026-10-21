'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {createVendorEntries}=require('../vendor-entries');
const {normalizeChannel}=require('../platform-core');
const ROOT='national-cre',ROUND='national-cre-20261021',OTHER='national-cre-20261028';
async function setup(t){
 const f=await createFixture();t.after(f.close);f.advance(28*86400000);
 await f.repository.upsertRecord(ROOT,'setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const client=await f.login('01000000001'),vendorId=(await f.post(client,'register',{name:'회차 사진 테스트',region:'전라·충청',phone:'01000000001'})).json().id;
 const token=(await f.post(client,'select',{id:vendorId})).json().token,directory=createVendorDirectory(f.repository);
 const profile=await directory.enroll(ROOT,vendorId),catalog=await f.repository.getCatalog();
 await f.repository.saveCatalog([...catalog.channels,...[ROUND,OTHER].map(id=>normalizeChannel({id,status:'active',nationalRound:{parentId:ROOT,date:id===ROUND?'2026-10-21':'2026-10-28'}})),normalizeChannel({id:'another-series',status:'active'})]);
 const member=await directory.attach(profile.id,ROUND);
 await directory.attach(profile.id,'another-series');
 const item={id:'same-id',name:'A01',lotNumber:1,vendorId:member.vendorId,status:'waiting',startPrice:10000,soldPrice:0,updatedAt:'2026-10-21T01:00:00.000Z',attributes:{broadcastDate:'2026-10-21',entry_traits:{sex:'male',weight:'22',hatchDate:'2025-08-23'},organizerFeePolicy:{entryFee:10000,ratePercent:10}}};
 await f.repository.upsertRecord(ROUND,'item',item);
 await f.repository.upsertRecord(ROOT,'item',{...item,vendorId,date:undefined,attributes:{...item.attributes,broadcastDate:'2026-10-19'},status:'sold',soldPrice:100000});
 await f.repository.upsertRecord(ROOT,'item',{...item,id:'moved-source',vendorId,attributes:{...item.attributes,roundTargetChannelId:ROUND}});
 await f.repository.upsertRecord(ROUND,'item',{...item,id:'foreign',vendorId:'other-vendor'});
 await f.repository.upsertRecord(OTHER,'item',{...item,vendorId});
 const unrelated=await directory.profileFor('another-series',(await directory.read()).profiles.find(p=>p.id===profile.id).members.find(m=>m.channelId==='another-series').vendorId);
 await f.repository.upsertRecord('another-series','item',{...item,vendorId:unrelated.members.find(m=>m.channelId==='another-series').vendorId});
 Object.assign(item,await f.repository.getRecord(ROUND,'item',item.id));
 const context={channel:catalog.channels[0],vendor:{id:vendorId},profile:await directory.profileFor(ROOT,vendorId),catalog:await f.repository.getCatalog()},photoId=randomUUID();
 await createVendorEntries(f.repository).addMedia(context,{id:photoId,url:'/assets/synthetic-parent.webp',thumbnailUrl:'/assets/synthetic-parent-thumb.webp',size:100,thumbnailSize:20});
 const get=()=>f.call(client,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({token,event:ROOT}));
 const send=body=>f.call(client,'POST','/api/platform/vendor-bookings',{token,event:ROOT,type:'parent-photos',requestId:randomUUID(),itemChannelId:ROUND,itemId:item.id,side:'sire',expectedUpdatedAt:item.updatedAt,...body});
 const pulse=async channel=>(await f.call(f.client(),'GET','/api/platform/channels/'+channel+'/broadcast-pulse')).json().revision;
 assert.equal((await get()).status,200);
 return {...f,client,token,vendorId,member,item,photoId,get,send,pulse};
}
test('vendor calendar exposes assigned round lots by exact membership, preserving historical read access',async t=>{
 const f=await setup(t),reply=await f.get();assert.equal(reply.status,200,reply.body);
 const items=reply.json().entryState.auctionItems;
 assert.deepEqual(items.map(i=>[i.channelId,i.id,i.canEdit]),[[ROOT,'same-id',false],[ROUND,'same-id',true]]);
 assert.equal(items[1].traits.weight,'22');assert.equal(items[0].soldAmount,100000);
 assert.equal(JSON.stringify(items).includes('other-vendor'),false);assert.equal(JSON.stringify(items).includes('organizerFeePolicy'),false);
});
test('round parent edits refresh only their broadcast, remain atomic and retry after restart',async t=>{
 const f=await setup(t),root=await f.repository.getRecord(ROOT,'item','same-id'),beforeRoot=await f.pulse(ROOT),beforeRound=await f.pulse(ROUND);
 const body={name:'페인트',photoId:f.photoId,requestId:randomUUID()};
 const replies=await Promise.all([f.send(body),f.send(body)]);for(const r of replies)assert.equal(r.status,200,r.body);
 assert.deepEqual(replies.map(r=>!!r.json().duplicate).sort(),[false,true]);
 let saved=await f.repository.getRecord(ROUND,'item','same-id');
 assert.equal(saved.attributes.parents[0].name,'페인트');assert.equal(saved.attributes.parents[0].media[0].url,'/assets/synthetic-parent.webp');
 assert.deepEqual({...saved,updatedAt:f.item.updatedAt,attributes:f.item.attributes},f.item);
 assert.deepEqual(await f.repository.getRecord(ROOT,'item','same-id'),root);assert.equal(await f.pulse(ROOT),beforeRoot);assert.ok(await f.pulse(ROUND)>beforeRound);
 f.restart();assert.equal((await f.send(body)).json().duplicate,true);
 const view=(await f.get()).json().entryState.auctionItems.find(i=>i.channelId===ROUND);assert.equal(view.parentPhotoIds.sire,f.photoId);assert.equal(view.parents[0].name,'페인트');
 const remove=await f.send({photoId:'',expectedUpdatedAt:saved.updatedAt});assert.equal(remove.status,200,remove.body);
 saved=await f.repository.getRecord(ROUND,'item','same-id');assert.equal(saved.attributes.parents[0].name,'페인트');assert.equal(saved.attributes.parents[0].media.length,0);
});
test('foreign round, foreign vendor, unrelated family, stale revisions and completed lots cannot be edited',async t=>{
 const f=await setup(t);
 for(const body of [{itemChannelId:OTHER},{itemChannelId:'another-series'},{itemId:'foreign'},{itemChannelId:ROOT,itemId:'moved-source'},{expectedUpdatedAt:'stale'},{photoId:randomUUID()}]){
  const before=await f.repository.listRecords(ROUND,'item'),reply=await f.send({...body,name:'거절 대상'});assert.ok(reply.status>=400,reply.body);assert.deepEqual(await f.repository.listRecords(ROUND,'item'),before);
 }
 for(const patch of [{status:'sold'},{status:'cancelled'},{auctionArchiveId:'old-round'}]){
  await f.repository.upsertRecord(ROUND,'item',{...f.item,...patch});const reply=await f.send({name:'거절 대상'});assert.ok(reply.status>=400,reply.body);
  assert.equal((await f.get()).json().entryState.auctionItems.find(i=>i.channelId===ROUND).canEdit,false);
 }
 await f.repository.upsertRecord(ROUND,'item',f.item);
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id===ROUND?{...c,status:'archived'}:c));f.restart();
 assert.ok((await f.send({name:'종료 회차'})).status>=400);
 assert.equal((await f.get()).json().entryState.auctionItems.find(i=>i.channelId===ROUND).canEdit,false);
});
test('competing round saves reject stale writers, and failed persistence can retry without changing the lot',async t=>{
 const f=await setup(t),results=await Promise.all([f.send({name:'먼저 저장'}),f.send({side:'dam',name:'경합 저장'})]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
 const before=await f.repository.getRecord(ROUND,'item','same-id'),write=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=async rows=>{if(rows.some(row=>row.key.includes('::'+ROUND+'::item::')))throw Error('isolated storage failure');return write(rows)};
 const body={name:'재시도',expectedUpdatedAt:before.updatedAt,requestId:randomUUID()};assert.ok((await f.send(body)).status>=400);
 assert.deepEqual(await f.repository.getRecord(ROUND,'item','same-id'),before);f.repository.upsertRows=write;
 assert.equal((await f.send(body)).status,200);
});

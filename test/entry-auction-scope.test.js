'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,ROOT,DATE,TARGET}=require('../tools/national-intake-fixture.cjs');
const {createVendorDirectory}=require('../vendor-directory'),{createVendorEntries}=require('../vendor-entries');
const base='/channels/'+ROOT+'/entries';
async function setup(t,prepared=true){
 const f=await fixture();t.after(f.close);if(prepared)assert.equal((await f.prepare()).status,200);
 const profile=await createVendorDirectory(f.repository).profileFor(ROOT,f.vendorId),key='vendor_entries_v1::'+profile.id;
 const doc=()=>f.repository.getRowsByKeys([key]).then(r=>JSON.parse(r[0].value));
 const entries=(await doc()).entries.map(e=>({id:e.id,vendorId:f.vendorId,expectedVersion:e.version}));
 const body={type:'approve-many',broadcastDate:DATE,part:'1부',entries,requestId:randomUUID()};
 return {...f,profile,key,doc,entries,body,approve:b=>f.request('POST',base+'/batch',b||body),read:date=>f.request('GET',base+'?broadcastDate='+(date||DATE))};
}
test('date approval goes directly to that round; canonical submission, old money and active broadcast stay intact across replay/restart',async t=>{
 const f=await setup(t),active=await f.repository.getActiveChannel();
 const old=await f.repository.upsertRecord(ROOT,'item',{id:'old',name:'1부 A01',lotNumber:1,status:'sold',soldPrice:100000,vendorId:f.vendorId,attributes:{broadcastDate:'2026-10-19'}});
 const shipment=await f.repository.upsertRecord(ROOT,'shipment',{id:'old-delivery',itemId:'old',paymentStatus:'bank_transfer_reported',cost:7000});
 const before=(await f.read()).json();assert.equal(before.auctionTarget.channelId,TARGET);assert.equal(before.auctionTarget.writable,true);assert.deepEqual(before.allocation,[]);
 const results=await Promise.all([f.approve(),f.approve()]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(results.filter(r=>r.json().duplicate).length,1);
 const items=await f.repository.listRecords(TARGET,'item');assert.equal(items.length,4);assert.deepEqual(items.sort((a,b)=>a.lotNumber-b.lotNumber).map(i=>i.name),['1부 A01','1부 A02','1부 A03','1부 A04']);
 assert.ok((await f.doc()).entries.every(e=>e.channelId===ROOT&&e.auctionChannelId===TARGET&&e.status==='approved'));
 assert.deepEqual(await f.repository.listRecords(ROOT,'item'),[old]);assert.deepEqual(await f.repository.getRecord(ROOT,'shipment',shipment.id),shipment);assert.equal(await f.repository.getActiveChannel(),active);
 assert.equal((await f.booking()).json().reservations[0].entries.filter(e=>e.status==='approved').length,4);
 f.restart();assert.equal((await f.approve()).json().duplicate,true);assert.equal((await f.read()).json().allocation.length,4);
 const history=(await f.read('2026-10-19')).json();assert.equal(history.auctionTarget.writable,false);assert.deepEqual(history.allocation.map(i=>i.id),['old']);
});
test('unprepared, invalid, closed, mismatched date and changed vendor membership fail without partial writes',async t=>{
 const f=await setup(t,false),before=await f.doc();assert.equal((await f.read()).json().auctionTarget.prepared,false);
 assert.equal((await f.approve()).status,409);assert.equal((await f.read('2026-02-30')).status,422);assert.deepEqual(await f.doc(),before);
 await f.prepare();await f.request('POST','/national-rounds',{action:'prepare',date:'2026-10-26'});
 assert.equal((await f.approve({...f.body,broadcastDate:'2026-10-26'})).status,409);
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id===TARGET?{...c,status:'paused'}:c));
 assert.equal((await f.approve()).status,409);await f.repository.saveCatalog(catalog.channels);
 const directory=createVendorDirectory(f.repository),doc=await directory.read();doc.profiles.find(p=>p.id===f.profile.id).members=doc.profiles.find(p=>p.id===f.profile.id).members.filter(m=>m.channelId!==TARGET);
 await f.repository.upsertRows([{key:'vendor_directory_v1',value:JSON.stringify(doc)}]);
 assert.equal((await f.approve()).status,403);assert.deepEqual(await f.doc(),before);assert.deepEqual(await f.repository.listRecords(TARGET,'item'),[]);
});
test('mixed dates, stale or duplicate entries roll back the entire batch',async t=>{
 const f=await setup(t),doc=await f.doc();doc.entries[1].broadcastDate='2026-10-26';await f.repository.upsertRows([{key:f.key,value:JSON.stringify(doc)}]);
 for(const [body,status] of [[f.body,409],[{...f.body,entries:[f.entries[0],{...f.entries[2],expectedVersion:99}]},409],[{...f.body,entries:[f.entries[0],f.entries[0]]},422]])assert.equal((await f.approve({...body,requestId:randomUUID()})).status,status);
 assert.deepEqual(await f.doc(),doc);assert.deepEqual(await f.repository.listRecords(TARGET,'item'),[]);
});
test('SQLite transaction failure keeps submission and target unchanged; retry after API restart commits once',async t=>{
 const f=await setup(t),before=await f.doc(),write=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=rows=>write(rows.some(r=>r.key.startsWith('creo_v2::'+TARGET+'::item::'))?[...rows,{key:{invalid:true},value:'fail transaction'}]:rows);
 assert.equal((await f.approve()).status,500);assert.deepEqual(await f.doc(),before);assert.deepEqual(await f.repository.listRecords(TARGET,'item'),[]);assert.equal(await f.repository.getRecord(ROOT,'setting','entry-batch-log'),null);
 f.repository.upsertRows=write;f.restart();assert.equal((await f.approve()).status,200);assert.equal((await f.approve()).json().duplicate,true);
});
test('different concurrent approvals serialize; target live boundary rejects further changes',async t=>{
 const f=await setup(t),body={...f.body,entries:f.entries.slice(0,1)};
 const results=await Promise.all([f.approve(body),f.approve({...body,requestId:randomUUID()})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const item=(await f.repository.listRecords(TARGET,'item'))[0];await f.repository.upsertRecord(TARGET,'item',{...item,status:'live'});
 const before=await f.doc();assert.equal((await f.approve({...f.body,entries:f.entries.slice(1),requestId:randomUUID()})).status,409);assert.deepEqual(await f.doc(),before);
});
test('individual approval and arrangement use only the chosen round, while legacy clients cannot overwrite it',async t=>{
 const f=await setup(t);const e=f.entries[0],command={type:'approve',...e,lot:'1부 A01',order:1,startPrice:10000,broadcastDate:DATE,requestId:randomUUID()};
 assert.equal((await f.request('POST',base+'/review',command)).status,200);
 assert.equal((await f.approve({...f.body,entries:f.entries.slice(1)})).status,200);
 const items=await f.repository.listRecords(TARGET,'item'),arrange={type:'arrange',broadcastDate:DATE,part:'1부',items:items.map(i=>({id:i.id,updatedAt:i.updatedAt})),requestId:randomUUID()};
 assert.equal((await f.approve(arrange)).status,200);assert.equal((await f.approve(arrange)).json().duplicate,true);assert.deepEqual(await f.repository.listRecords(ROOT,'item'),[]);
 const entry=(await f.doc()).entries[0];const legacy=await f.request('POST',base+'/review',{type:'renumber',vendorId:f.vendorId,id:entry.id,expectedVersion:entry.version,requestId:randomUUID(),lot:'1부 A99',order:99,startPrice:0});assert.equal(legacy.status,409);
});
test('approved canonical entry retains parent library and vendor photo edit access on its dated auction item',async t=>{
 const f=await setup(t);await f.approve();const service=createVendorEntries(f.repository),catalog=await f.repository.getCatalog(),profile=await createVendorDirectory(f.repository).profileFor(ROOT,f.vendorId);
 const context={catalog,profile,channel:catalog.channels.find(c=>c.id===ROOT),vendor:await f.repository.getRecord(ROOT,'vendor',f.vendorId)};
 const photos=await service.auctionPhotos(context);assert.equal(photos.length,4);assert.ok(photos.every(i=>i.channelId===TARGET&&i.canEdit));
 const item=photos[0];await service.updateItemParents({...context,channel:catalog.channels.find(c=>c.id===TARGET)},{itemId:item.id,side:'sire',name:'가상 부개체',requestId:randomUUID(),expectedUpdatedAt:item.updatedAt});
 f.restart();const after=await service.auctionPhotos(context);assert.equal(after.find(i=>i.id===item.id).parents.find(p=>p.role==='sire').name,'가상 부개체');assert.equal((await f.booking()).json().reservations.length,1);
});

test('legacy imported copies resolve read-only and renumber in place without recreating or modifying the root item',async t=>{
 const f=await setup(t,false),e=f.entries[0];
 const approved=await f.request('POST',base+'/review',{...e,type:'approve',lot:'1부 A01',order:1,startPrice:0,requestId:randomUUID()});assert.equal(approved.status,200);
 await f.prepare();const rootBefore=await f.repository.listRecords(ROOT,'item'),ownerBefore=await f.doc(),copy=(await f.repository.listRecords(TARGET,'item'))[0];
 const read=(await f.read()).json();assert.equal(read.groups.find(g=>g.vendor.id===f.vendorId).entries.find(i=>i.id===e.id).itemId,copy.id);assert.deepEqual(await f.doc(),ownerBefore);
 const changed=await f.request('POST',base+'/review',{...e,type:'renumber',expectedVersion:ownerBefore.entries[0].version,expectedUpdatedAt:copy.updatedAt,lot:'1부 A09',order:9,startPrice:0,broadcastDate:DATE,requestId:randomUUID()});assert.equal(changed.status,200,changed.body);
 assert.equal((await f.repository.listRecords(TARGET,'item')).length,1);assert.equal((await f.repository.getRecord(TARGET,'item',copy.id)).name,'1부 A09');assert.deepEqual(await f.repository.listRecords(ROOT,'item'),rootBefore);
 assert.equal((await f.doc()).entries[0].auctionChannelId,TARGET);assert.equal((await f.doc()).entries[0].itemId,copy.id);
});

test('dated approval holds the actual auction lock while committing, so a live transition cannot be overwritten',async t=>{
 const f=await setup(t);await f.approve({...f.body,entries:f.entries.slice(0,1)});const item=(await f.repository.listRecords(TARGET,'item'))[0];
 const write=f.repository.upsertRows.bind(f.repository);let release,entered,editDone=false;
 const gate=new Promise(resolve=>release=resolve),holding=new Promise(resolve=>entered=resolve);
 f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key===f.key)){entered();await gate;}return write(rows);};
 const approval=f.approve({...f.body,requestId:randomUUID(),entries:f.entries.slice(1,2)});await holding;
 const edit=f.request('PUT','/channels/'+TARGET+'/items/'+item.id,{record:{...item,status:'live'},expectedUpdatedAt:item.updatedAt}).then(result=>{editDone=true;return result;});
 try{await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(editDone,false);}finally{release();}
 assert.equal((await approval).status,200);const edited=await edit;assert.equal(edited.status,200,edited.body);assert.equal((await f.repository.getRecord(TARGET,'item',item.id)).status,'live');
 assert.equal((await f.approve({...f.body,requestId:randomUUID(),entries:f.entries.slice(2)})).status,409);
});

test('closing a round still acknowledges an already committed retry and rejects a new assignment',async t=>{
 const f=await setup(t);const body={...f.body,entries:f.entries.slice(0,1)};assert.equal((await f.approve(body)).status,200);
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id===TARGET?{...c,status:'archived'}:c));f.restart();
 const replay=await f.approve(body);assert.equal(replay.status,200);assert.equal(replay.json().duplicate,true);
 assert.equal((await f.approve({...f.body,entries:f.entries.slice(1),requestId:randomUUID()})).status,409);assert.equal((await f.repository.listRecords(TARGET,'item')).length,1);
});

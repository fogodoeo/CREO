'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {normalizeChannel}=require('../platform-core');
const ROOT='national-cre',DATE='2026-10-26',TARGET=ROOT+'-20261026';
async function fixture(t){
 const f=await createFixture();t.after(f.close);f.advance(30*86400000);
 await f.repository.upsertRecord(ROOT,'setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 f.request=(method,path,body)=>f.call(f.client(),method,'/api/platform'+path,body,{'x-creo-admin':f.secret});
 f.prepare=()=>f.request('POST','/national-rounds',{action:'prepare',date:DATE});
 f.directory=createVendorDirectory(f.repository);return f;
}
const registration=(more={})=>({name:'가상 경북 신규 업체',region:'대구·경북',phone:'01000000001',requestId:'new-vendor-participation-001',...more});

test('new company joins an already prepared regional show on registration, with one identity across duplicate and restart',async t=>{
 const f=await fixture(t);assert.equal((await f.prepare()).status,200);const owner=await f.login('01000000001');
 const [first,again]=await Promise.all([f.post(owner,'register',registration()),f.post(owner,'register',registration())]);
 assert.equal(first.status,200,first.body);assert.equal(again.status,200,again.body);assert.equal(first.json().id,again.json().id);
 const id=first.json().id,root=await f.directory.profileFor(ROOT,id),round=await f.directory.profileFor(TARGET,id);
 assert.equal(root.id,round.id);assert.equal(root.home.channelId,ROOT);assert.equal((await f.directory.list(TARGET)).length,1);
 assert.deepEqual(await f.repository.listRecords(TARGET,'item'),[]);assert.deepEqual(await f.repository.listRecords(TARGET,'shipment'),[]);
 const selected=await f.post(owner,'select',{id}),token=selected.json().token;
 const view=await f.call(owner,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({token,event:TARGET}));
 assert.equal(view.status,200,view.body);assert.equal(view.json().channel.id,ROOT);assert.equal(view.json().vendor.region,'대구·경북');assert.ok(view.json().dates.some(d=>d.date===DATE&&d.maxQuantityAvailable===4));
 f.restart();assert.equal((await f.post(owner,'register',registration())).json().id,id);assert.equal((await f.directory.profileFor(TARGET,id)).id,root.id);
 assert.equal((await f.prepare()).json().duplicate,true);
});

test('a Busan/Ulsan/Gyeongnam signup automatically joins October 28 and exposes entry registration without a separate booking',async t=>{
 const f=await fixture(t);await f.prepare();
 assert.equal((await f.request('POST','/national-rounds',{action:'prepare',date:'2026-10-28'})).status,200);
 const owner=await f.login('01000000001'),response=await f.post(owner,'register',registration({region:'부산·울산·경남'}));
 assert.equal(response.status,200,response.body);const id=response.json().id;
 assert.equal((await f.directory.profileFor(ROOT,id)).id,(await f.directory.profileFor(ROOT+'-20261028',id)).id);
 assert.equal(await f.directory.profileFor(TARGET,id),null);
 const token=(await f.post(owner,'select',{id})).json().token;
 const view=await f.call(owner,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({token,event:ROOT}));
 assert.equal(view.status,200,view.body);assert.equal(view.json().reservations.length,0);assert.ok(view.json().dates.some(d=>d.date==='2026-10-28'&&d.maxQuantityAvailable===4));
});

test('registration and round preparation in either concurrent order keep the same company without importing transactions',async t=>{
 for(const registrationFirst of [true,false]){
  const f=await fixture(t),owner=await f.login('01000000001');
  const actions=registrationFirst?[()=>f.post(owner,'register',registration()),f.prepare]:[f.prepare,()=>f.post(owner,'register',registration())];
  const result=await Promise.all(actions.map(run=>run()));for(const response of result)assert.equal(response.status,200,response.body);
  const id=result[registrationFirst?0:1].json().id;
  assert.equal((await f.directory.profileFor(ROOT,id)).id,(await f.directory.profileFor(TARGET,id)).id);
  assert.equal((await f.directory.list(ROOT)).length,1);assert.equal((await f.directory.list(TARGET)).length,1);
  assert.deepEqual(await f.repository.listRecords(TARGET,'item'),[]);
 }
});

test('a failed round insert rolls back login company, shared identity and participation together, then retry commits once',async t=>{
 const f=await fixture(t);await f.prepare();const owner=await f.login('01000000001'),before=await f.directory.read();
 f.repository.db.exec("CREATE TRIGGER reject_round_vendor BEFORE INSERT ON platform_kv WHEN NEW.key LIKE '%national-cre-20261026::vendor::%' BEGIN SELECT RAISE(ABORT,'isolated round insert failure'); END");
 const failed=await f.post(owner,'register',registration());assert.equal(failed.status,503,failed.body);
 assert.equal((await f.refresh(owner)).json().companies.length,0);assert.deepEqual(await f.directory.read(),before);
 assert.deepEqual(await f.directory.list(ROOT),[]);assert.deepEqual(await f.directory.list(TARGET),[]);
 f.repository.db.exec('DROP TRIGGER reject_round_vendor');f.restart();
 const retry=await f.post(owner,'register',registration());assert.equal(retry.status,200,retry.body);
 assert.equal((await f.post(owner,'register',registration())).json().id,retry.json().id);assert.equal((await f.directory.list(TARGET)).length,1);
});

test('legacy company booking repairs missing participation atomically and preserves prior financial records',async t=>{
 const f=await fixture(t);await f.prepare();const id='legacy-company';
 await f.repository.upsertRecord(ROOT,'vendor',{id,name:'가상 기존 업체',phone:'01000000001',broadcastRegion:'대구·경북',active:true});
 const profile=await f.directory.enroll(ROOT,id);
 await f.repository.upsertRecord(ROOT,'item',{id:'old-sale',vendorId:id,status:'sold',soldPrice:100000,attributes:{broadcastDate:'2026-10-19'}});
 await f.repository.upsertRecord(ROOT,'shipment',{id:'old-shipping',itemId:'old-sale',vendorId:id,paymentStatus:'bank_transfer_reported'});
 const oldItems=await f.repository.listRecords(ROOT,'item'),oldShipments=await f.repository.listRecords(ROOT,'shipment');
 const pre=await f.request('POST','/national-vendor-directory',{id,name:'가상 기존 업체',region:'대구·경북',loginPhone:'01000000001'});assert.equal(pre.status,200,pre.body);
 const owner=await f.login('01000000001');assert.equal((await f.post(owner,'claim',{id})).status,200);
 const token=(await f.post(owner,'select',{id})).json().token;
 const body={token,event:ROOT,type:'reserve',date:DATE,quantity:4,requestId:randomUUID()};
 const submit=()=>f.call(owner,'POST','/api/platform/vendor-bookings',body);
 const before=await f.repository.getRecord(ROOT,'setting','national-broadcasts');
 f.repository.db.exec("CREATE TRIGGER reject_booking_round BEFORE INSERT ON platform_kv WHEN NEW.key LIKE '%national-cre-20261026::vendor::%' BEGIN SELECT RAISE(ABORT,'isolated booking failure'); END");
 assert.equal((await submit()).status,500);assert.deepEqual(await f.repository.getRecord(ROOT,'setting','national-broadcasts'),before);assert.equal(await f.directory.profileFor(TARGET,id),null);
 f.repository.db.exec('DROP TRIGGER reject_booking_round');
 const accepted=await submit();assert.equal(accepted.status,200,accepted.body);assert.equal((await submit()).json().duplicate,true);
 assert.equal((await f.directory.profileFor(TARGET,id)).id,profile.id);assert.equal(accepted.json().reservations.length,1);
 assert.deepEqual(await f.repository.listRecords(ROOT,'item'),oldItems);assert.deepEqual(await f.repository.listRecords(ROOT,'shipment'),oldShipments);
});

test('automatic participation skips other regions, past or closed shows and never claims a colliding vendor record',async t=>{
 const f=await fixture(t),catalog=await f.repository.getCatalog();
 const extra=[['2026-10-19','active'],['2026-10-21','active'],['2026-10-26','paused'],['2026-10-28','draft']].map(([date,status])=>normalizeChannel({id:ROOT+'-'+date.replaceAll('-',''),name:date,status,nationalRound:{parentId:ROOT,date}}));
 await f.repository.saveCatalog([...catalog.channels,...extra]);
 const owner=await f.login('01000000001'),created=await f.post(owner,'register',registration());assert.equal(created.status,200,created.body);
 for(const channel of extra)assert.deepEqual(await f.directory.list(channel.id),[]);
 const current=await f.repository.getCatalog();await f.repository.saveCatalog(current.channels.map(c=>c.id===TARGET?{...c,status:'draft'}:c));
 const collision={id:'collision',name:'별개의 기존 업체',phone:'01000000009'};
 await f.repository.upsertRecord(TARGET,'vendor',collision);const before=await f.directory.read();
 const denied=await f.request('POST','/national-vendor-directory',{id:'collision',name:'가상 신규 업체',region:'대구·경북',loginPhone:'01000000002'});
 assert.equal(denied.status,409,denied.body);assert.equal(await f.repository.getRecord(ROOT,'vendor','collision'),null);assert.deepEqual(await f.directory.read(),before);assert.equal((await f.repository.getRecord(TARGET,'vendor','collision')).phone,collision.phone);
});

async function regionalVendor(t){
 const f=await fixture(t);await f.prepare();
 await f.request('POST','/national-rounds',{action:'prepare',date:'2026-10-28'});
 f.owner=await f.login('01000000001');f.vendorId=(await f.post(f.owner,'register',registration())).json().id;
 f.regionBody=async region=>({type:'region',vendorId:f.vendorId,region,expectedVersion:(await f.request('GET','/channels/'+ROOT+'/broadcast-bookings')).json().version,requestId:randomUUID()});
 f.region=body=>f.request('POST','/channels/'+ROOT+'/broadcast-bookings',body);
 return f;
}

test('regional assignment moves only unused future participation, preserving history, identity and retry after restart',async t=>{
 const f=await regionalVendor(t),south=ROOT+'-20261028',profile=await f.directory.profileFor(ROOT,f.vendorId);
 const old={id:'past-sale',vendorId:f.vendorId,status:'sold',soldPrice:100000,attributes:{broadcastDate:'2026-10-19'}};
 const shipping={id:'past-payment',itemId:old.id,vendorId:f.vendorId,paymentStatus:'bank_transfer_reported'};
 await f.repository.upsertRecord(ROOT,'item',old);await f.repository.upsertRecord(ROOT,'shipment',shipping);
 const oldStored=await f.repository.getRecord(ROOT,'item',old.id),shippingStored=await f.repository.getRecord(ROOT,'shipment',shipping.id);
 const body=await f.regionBody(4),responses=await Promise.all([f.region(body),f.region(body)]);
 assert.ok(responses.every(r=>r.status===200),responses.map(r=>r.body).join('\n'));assert.equal(responses.filter(r=>r.json().duplicate).length,1);
 assert.equal((await f.directory.find(ROOT,f.vendorId)).broadcastRegion,'부산·울산·경남');
 assert.equal((await f.directory.find(TARGET,f.vendorId)).active,false);assert.equal((await f.directory.find(south,f.vendorId)).active,true);
 assert.equal((await f.directory.profileFor(south,f.vendorId)).id,profile.id);
 const summary=(await f.request('GET','/operator-vendors')).json().vendors.find(v=>v.id===profile.id);
 assert.deepEqual(summary.broadcasts.map(b=>b.date),['2026-10-19','2026-10-28']);
 f.restart();assert.equal((await f.region(body)).json().duplicate,true);
 const back=await f.region(await f.regionBody(3));assert.equal(back.status,200,back.body);
 assert.equal((await f.directory.find(TARGET,f.vendorId)).active,true);assert.equal((await f.directory.find(south,f.vendorId)).active,false);
 assert.equal((await f.directory.profileFor(TARGET,f.vendorId)).id,profile.id);
 assert.deepEqual(await f.repository.getRecord(ROOT,'item',old.id),oldStored);
 assert.deepEqual(await f.repository.getRecord(ROOT,'shipment',shipping.id),shippingStored);
});

test('failed regional assignment commits neither region nor either participation, and stale competing region changes fail closed',async t=>{
 const f=await regionalVendor(t),before=await f.directory.read(),body=await f.regionBody(4);
 f.repository.db.exec("CREATE TRIGGER reject_region_vendor BEFORE INSERT ON platform_kv WHEN NEW.key LIKE '%national-cre-20261028::vendor::%' BEGIN SELECT RAISE(ABORT,'isolated assignment failure'); END");
 assert.equal((await f.region(body)).status,500);assert.equal((await f.directory.find(TARGET,f.vendorId)).active,true);
 assert.equal((await f.directory.find(ROOT,f.vendorId)).broadcastRegion,'대구·경북');assert.deepEqual(await f.directory.read(),before);
 f.repository.db.exec('DROP TRIGGER reject_region_vendor');
 const rival={...body,region:2,requestId:randomUUID()},result=await Promise.all([f.region(body),f.region(rival)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal((await f.directory.find(ROOT,f.vendorId)).broadcastRegion,'부산·울산·경남');
 assert.equal((await f.region(body)).json().duplicate,true);
});

test('region changes never discard prepared items, source entries, live transactions or explicit disabled access',async t=>{
 for(const kind of ['item','source','shipment','disabled']){
  const f=await regionalVendor(t),south=ROOT+'-20261028';
  if(kind==='disabled'){
   const profile=await f.directory.profileFor(ROOT,f.vendorId);
   // An explicitly stopped existing membership must not be revived by assignment.
   await f.directory.attach(profile.id,south);
   const m=(await f.directory.profileFor(ROOT,f.vendorId)).members.find(m=>m.channelId===south),v=await f.repository.getRecord(south,'vendor',m.vendorId);
   await f.repository.upsertRecord(south,'vendor',{...v,active:false});
  }else if(kind==='source')await f.repository.upsertRecord(ROOT,'item',{id:'source-entry',vendorId:f.vendorId,status:'waiting',attributes:{broadcastDate:DATE}});
  else await f.repository.upsertRecord(TARGET,kind,{id:'prepared-record',vendorId:f.vendorId,status:kind==='item'?'waiting':'complete'});
  const before=await f.directory.read(),response=await f.region(await f.regionBody(4));
  assert.equal(response.status,409,response.body);assert.equal((await f.directory.find(ROOT,f.vendorId)).broadcastRegion,'대구·경북');
  assert.equal((await f.directory.find(TARGET,f.vendorId)).active,true);assert.deepEqual(await f.directory.read(),before);
 }
});

test('item creation and regional reassignment serialize in either order, and preparing the old date cannot revive a released assignment',async t=>{
 for(const itemFirst of [true,false]){
  const f=await regionalVendor(t),body=await f.regionBody(4);
  const add=()=>f.request('POST','/channels/'+TARGET+'/items',{record:{id:'new-item',name:'가상 출품',vendorId:f.vendorId,lotNumber:1,status:'waiting'}});
  const actions=itemFirst?[add,()=>f.region(body)]:[()=>f.region(body),add],result=await Promise.all(actions.map(run=>run()));
  const itemResponse=result[itemFirst?0:1],regionResponse=result[itemFirst?1:0];
  if(regionResponse.status===200){
   assert.equal(itemResponse.status,422,itemResponse.body);assert.deepEqual(await f.repository.listRecords(TARGET,'item'),[]);
   assert.equal((await f.prepare()).status,200);assert.equal((await f.directory.find(TARGET,f.vendorId)).active,false);
  }else{
   assert.equal(regionResponse.status,409,regionResponse.body);assert.equal(itemResponse.status,201,itemResponse.body);
   assert.equal((await f.directory.find(TARGET,f.vendorId)).active,true);
  }
 }
});

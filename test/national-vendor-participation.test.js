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

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const {createVendorDirectory}=require('../vendor-directory');
async function fixture(t){
 const f=await createFixture();t.after(f.close);
 const channels=['clab-new','clab-old','clab-closed','clab-expired','national-child'].map(id=>normalizeChannel({id,name:id,status:'active',dataAdapter:'platform',...(id==='national-child'?{nationalRound:{parentId:'national-cre',date:'2026-09-24'}}:{}),shippingDefaults:{deliverySchedule:{auctionDate:id==='clab-old'?'2026-09-22':'2026-09-24'}}}));
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,...channels]);
 for(const c of channels)await f.repository.upsertRecord(c.id,'setting',{id:'entry-policy',open:c.id!=='clab-closed',...(c.id==='clab-expired'?{closesAt:'2026-09-22T00:00:00Z'}:{})});
 await f.repository.upsertRecord('clab-new','vendor',{id:'blank',name:'크레하니',active:true,phone:'',logoUrl:'/logo.png'});
 await f.repository.upsertRecord('clab-new','vendor',{id:'protected',name:'기존 업체',active:true,phone:'01000000009',bankAccount:'private-bank'});
 const owner=await f.login('01000000001'),other=await f.login('01000000002');
 const get=(route,c=owner)=>f.call(c,'GET','/api/platform/vendor-access/'+route);
 const body={channelId:'clab-new',vendorId:'blank',consent:true,requestId:randomUUID()};
 return {...f,owner,other,get,body};
}
test('new login lists only open auctions, then safe company choices without private fields or side effects',async t=>{
 const f=await fixture(t),before=await f.repository.listRecords('clab-new','vendor');
 assert.equal((await f.get('auctions',f.client())).status,401);
 assert.deepEqual((await f.get('auctions')).json().auctions.map(r=>r.id),['clab-new','national-cre']);
 const rows=(await f.get('auction-companies?channel=clab-new')).json().companies;
 assert.deepEqual(rows,[{id:'blank',name:'크레하니',connected:false,canConnect:true},{id:'protected',name:'기존 업체',connected:false,canConnect:false}]);
 assert.doesNotMatch(JSON.stringify(rows),/010|private-bank|logo/);
 assert.deepEqual(await f.repository.listRecords('clab-new','vendor'),before);
 assert.equal((await f.get('auction-companies?channel=national-cre')).status,409);
});
test('empty representative connects once under concurrency, survives restart, and permits only that number',async t=>{
 const f=await fixture(t);
 const attempts=await Promise.all([f.post(f.owner,'auction-join',f.body),f.post(f.other,'auction-join',f.body)]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,403]);
 const winner=attempts[0].status===200?f.owner:f.other,loser=winner===f.owner?f.other:f.owner;
 assert.equal((await f.post(winner,'auction-join',f.body)).json().duplicate,true);
 f.restart();assert.equal((await f.refresh(winner)).json().participations.length,1);
 assert.equal((await f.post(loser,'select',{channelId:'clab-new',vendorId:'blank'})).status,403);
 const token=(await f.post(winner,'select',{channelId:'clab-new',vendorId:'blank'})).json().token;
 const entries=await f.call(winner,'GET','/api/platform/vendor-entries?event=clab-new&token='+token);assert.equal(entries.status,200,entries.body);
 assert.equal((await f.repository.getRecord('clab-new','vendor','blank')).logoUrl,'/logo.png');
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,0);
});
test('registration is idempotent, rejects duplicate names, stale closure, missing consent and forged CSRF',async t=>{
 const f=await fixture(t),body={channelId:'clab-new',name:'새 업체',consent:true,requestId:randomUUID()};
 const created=await Promise.all([f.post(f.owner,'auction-join',body),f.post(f.owner,'auction-join',body)]);
 assert.ok(created.every(r=>r.status===200));assert.equal(created[0].json().vendorId,created[1].json().vendorId);
 assert.equal((await f.post(f.other,'auction-join',{...body,requestId:randomUUID()})).status,409);
 assert.equal((await f.post(f.owner,'auction-join',{...f.body,consent:false})).status,422);
 assert.equal((await f.call(f.owner,'POST','/api/platform/vendor-access/auction-join',f.body,{'x-vendor-csrf':'bad'})).status,403);
 await f.repository.upsertRecord('clab-new','setting',{id:'entry-policy',open:false});
 assert.equal((await f.post(f.owner,'auction-join',f.body)).status,409);
 assert.equal((await f.repository.getRecord('clab-new','vendor','blank')).phone,'');
});
test('existing contacts, inactive vendors, histories and shared profiles cannot be claimed with a new number',async t=>{
 const f=await fixture(t),directory=createVendorDirectory(f.repository);
 for(const id of ['protected','inactive','history','shared','bank','entries']){
  if(id!=='protected')await f.repository.upsertRecord('clab-new','vendor',{id,name:id,phone:'',active:id!=='inactive',...(id==='bank'?{bankAccount:'old'}:{})});
  if(id==='history')await f.repository.upsertRecord('clab-new','item',{id:'sold',vendorId:id,status:'sold'});
  if(id==='shared'){const profile=await directory.enroll('clab-new',id);await directory.attach(profile.id,'clab-old');}
  if(id==='entries'){const profile=await directory.enroll('clab-new',id);await f.repository.upsertRows([{key:'vendor_entries_v1::'+profile.id,value:'{}'}]);}
  const r=await f.post(f.owner,'auction-join',{...f.body,vendorId:id});assert.equal(r.status,403,id+':'+r.body);
 }
 assert.deepEqual((await f.refresh(f.owner)).json().participations,[]);
});
test('storage failure grants no membership and the same registration can be retried safely',async t=>{
 const f=await fixture(t),original=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key==='vendor_directory_v1'))throw Error('isolated save failure');return original(rows);};
 const failed=await f.post(f.owner,'auction-join',f.body);assert.equal(failed.status,503);
 assert.equal((await f.repository.getRecord('clab-new','vendor','blank')).phone,'');
 assert.deepEqual((await f.refresh(f.owner)).json().participations,[]);
 f.repository.upsertRows=original;assert.equal((await f.post(f.owner,'auction-join',f.body)).status,200);
});

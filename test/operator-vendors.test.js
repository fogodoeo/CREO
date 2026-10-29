'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {listOperatorVendors}=require('../operator-vendors');
const {fixture}=require('../tools/national-settlement-fixture.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {normalizeChannel}=require('../platform-core');
test('global directory groups recorded shared identities, retains same-name independent vendors and archived participation',async()=>{
 const channels=[{id:'national-cre',dataAdapter:'platform',status:'active',name:'전크자'},{id:'national-cre-20261021',dataAdapter:'platform',status:'active',name:'전라충청',nationalRound:{parentId:'national-cre'}},{id:'clab-1015',dataAdapter:'platform',status:'archived',name:'씨랩'}];
 const vendors={'national-cre':[{id:'one',name:'동일 이름',directoryId:'shared',phone:'01000000001'}],'national-cre-20261021':[{id:'two',name:'동일 이름',directoryId:'shared',phone:'01000000001'}],'clab-1015':[{id:'one',name:'동일 이름',phone:'01000000002'}]};
 const result=await listOperatorVendors(channels,{list:async id=>vendors[id]});assert.equal(result.vendors.length,2);assert.equal(result.vendors.find(v=>v.id==='shared').members.length,2);assert.equal(result.vendors.find(v=>v.id==='clab-1015:one').members[0].status,'archived');
});

test('program directory separates planned regions, submitted bookings and actual historical rounds without writes',async t=>{
 const f=await fixture();t.after(()=>f.close());
 const directory=createVendorDirectory(f.repository),root='national-cre',target=root+'-20261026';
 await f.repository.upsertRecord(root,'vendor',{id:'v1',name:'가상 업체 A',broadcastRegion:'대구·경북'});
 await f.repository.upsertRecord(root,'vendor',{id:'v2',name:'가상 업체 B',broadcastRegion:'경기'});
 const profile=await directory.enroll(root,'v1');
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id:target,name:'10/26 경북',status:'draft',nationalRound:{parentId:root,date:'2026-10-26'}})]);
 const member=await directory.attach(profile.id,target);
 await f.repository.upsertRecord(root,'archive',{id:'old',title:'10/14 서울·인천',closedAt:'2026-10-15T00:00:00Z'});
 for(const item of await f.repository.listRecords(root,'item'))await f.repository.upsertRecord(root,'item',{...item,auctionArchiveId:'old'});
 await f.repository.upsertRecord(root,'item',{id:'current',vendorId:'v2',status:'sold',attributes:{broadcastDate:'2026-10-19'}});
 await f.repository.upsertRecord(root,'item',{id:'copied-source',vendorId:'v1',status:'waiting',attributes:{broadcastDate:'2026-10-26',roundTargetChannelId:target}});
 await f.repository.upsertRecord(target,'item',{id:'copy',vendorId:member.vendorId,status:'waiting',attributes:{broadcastDate:'2026-10-26'}});
 await f.repository.upsertRecord(root,'setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 await f.repository.upsertRecord(root,'setting',{id:'national-broadcasts',schema:1,version:1,regions:{v2:4},requests:[],reservations:[{vendorId:'v2',date:'2026-10-19',status:'confirmed'},{vendorId:'v1',date:'2026-10-21',status:'cancelled'}]});
 const before=await directory.read(),catalogBefore=await f.repository.getCatalog(),itemsBefore=await f.repository.listRecords(root,'item');
 for(let repeat=0;repeat<2;repeat++){
  const response=await f.request('GET','/operator-vendors');assert.equal(response.status,200,response.body);
  const data=response.json(),a=data.vendors.find(v=>v.id===profile.id),b=data.vendors.find(v=>v.name==='가상 업체 B');
  assert.equal(data.vendors.filter(v=>v.name==='가상 업체 A').length,1);
  assert.deepEqual(a.broadcasts.map(b=>[b.date,b.itemCount]),[['2026-10-14',2],['2026-10-26',1],['2026-11-18',0]]);
  assert.equal(a.broadcasts[0].rounds[0].archiveId,'old');assert.equal(a.broadcasts[1].scheduled,true);
  assert.equal(b.members[0].region,'부산·울산·경남');
  assert.equal(b.broadcasts.find(b=>b.date==='2026-10-19').requested,true);
  assert.equal(b.broadcasts.find(b=>b.date==='2026-10-28').scheduled,true);
  assert.equal(b.broadcasts.find(b=>b.date==='2026-10-28').rounds.length,0);
 }
 assert.deepEqual(await directory.read(),before);assert.deepEqual(await f.repository.getCatalog(),catalogBefore);assert.deepEqual(await f.repository.listRecords(root,'item'),itemsBefore);
});
test('global vendor API requires admin, is read-only and returns all programs independent of requested channel',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.repository.upsertRecord('creyon','vendor',{id:'v3',name:'씨랩 가상 업체',phone:'01000000002'});
 assert.equal((await f.request('GET','/operator-vendors',null,false)).status,401);
 const before=await f.repository.getCatalog();const r=await f.request('GET','/operator-vendors?channel=national-cre&archive=old');assert.equal(r.status,200);assert.deepEqual(r.json().vendors.map(v=>v.name).sort(),['가상 업체 A','가상 업체 B','씨랩 가상 업체'].sort());
 assert.equal((await f.request('POST','/operator-vendors',{})).status,405);assert.deepEqual(await f.repository.getCatalog(),before);
});

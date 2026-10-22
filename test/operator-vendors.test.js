'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {listOperatorVendors}=require('../operator-vendors');
const {fixture}=require('../tools/national-settlement-fixture.cjs');
test('global directory groups recorded shared identities, retains same-name independent vendors and archived participation',async()=>{
 const channels=[{id:'national-cre',dataAdapter:'platform',status:'active',name:'전크자'},{id:'national-cre-20261021',dataAdapter:'platform',status:'active',name:'전라충청',nationalRound:{parentId:'national-cre'}},{id:'clab-1015',dataAdapter:'platform',status:'archived',name:'씨랩'}];
 const vendors={'national-cre':[{id:'one',name:'동일 이름',directoryId:'shared',phone:'01000000001'}],'national-cre-20261021':[{id:'two',name:'동일 이름',directoryId:'shared',phone:'01000000001'}],'clab-1015':[{id:'one',name:'동일 이름',phone:'01000000002'}]};
 const result=await listOperatorVendors(channels,{list:async id=>vendors[id]});assert.equal(result.vendors.length,2);assert.equal(result.vendors.find(v=>v.id==='shared').members.length,2);assert.equal(result.vendors.find(v=>v.id==='clab-1015:one').members[0].status,'archived');
});
test('global vendor API requires admin, is read-only and returns all programs independent of requested channel',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.repository.upsertRecord('creyon','vendor',{id:'v3',name:'씨랩 가상 업체',phone:'01000000002'});
 assert.equal((await f.request('GET','/operator-vendors',null,false)).status,401);
 const before=await f.repository.getCatalog();const r=await f.request('GET','/operator-vendors?channel=national-cre&archive=old');assert.equal(r.status,200);assert.deepEqual(r.json().vendors.map(v=>v.name).sort(),['가상 업체 A','가상 업체 B','씨랩 가상 업체'].sort());
 assert.equal((await f.request('POST','/operator-vendors',{})).status,405);assert.deepEqual(await f.repository.getCatalog(),before);
});

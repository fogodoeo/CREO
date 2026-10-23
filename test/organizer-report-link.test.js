'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Link=require('../organizer-report-link'),{createOrganizerAccess}=require('../organizer-access');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');

test('SMS contains an intact exact-report URL within the provider limit for both kinds and every supported amount',()=>{
 const url=Link.link('abcdefghijklmnopqrstuvwx','report-one');
 for(const fees of [true,false])for(const amount of [1,19000,50000,999999999,1000000000]){
  const text=Link.message(amount,url,fees);
  assert.ok(Buffer.byteLength(text,'utf8')<=90);assert.ok(text.endsWith('\n'+url));assert.match(text,/신고/);
  assert.equal(new URL(text.split('\n')[1]).hash.slice(1),Link.reference('report-one'));
 }
 assert.throws(()=>Link.message(100,'https://example.com/'+'x'.repeat(100)),{status:503});
});

test('ambiguous, malformed, missing, cross-vendor and mixed-round report references fail closed',()=>{
 const r={id:'one',vendorId:'v',itemIds:['a']},w={items:[{id:'a',vendorId:'v'}]},ref=Link.reference(r.id);
 assert.deepEqual(Link.target([r],w,ref),{reportId:'one',vendorId:'v',archiveId:''});
 assert.throws(()=>Link.target([r],w,'bad'),{status:422});
 assert.throws(()=>Link.target([],w,ref),{status:404});
 assert.throws(()=>Link.target([r,r],w,ref),{status:404});
 for(const record of [{...r,itemIds:[]},{...r,itemIds:['missing']},{...r,vendorId:'other'}])assert.throws(()=>Link.target([record],w,ref),{status:409});
 assert.throws(()=>Link.target([{...r,itemIds:['a','b']}],{items:[...w.items,{id:'b',vendorId:'v',auctionArchiveId:'old'}]},ref),{status:409});
});

test('notification access resolves only its own report, follows archival and restart, and never changes receipts',async t=>{
 const f=await fixture();t.after(f.close);
 const ledgerKey='creo_organizer_shipping_ledger::national-cre';
 const reports=[{id:'old-report',vendorId:'v1',itemIds:['a01','a02'],amount:40000,status:'pending'}];
 await f.repository.upsertRows([{key:ledgerKey,value:JSON.stringify(reports)}]);
 const access=createOrganizerAccess(f.repository),own=await access.issue('national-cre'),other=await access.issue('creyon');
 const body={code:own.code,reportRef:Link.reference(reports[0].id)},read=b=>f.request('POST','/organizer-access',b,false);
 let result=await read(body);assert.equal(result.status,200,result.body);assert.equal(result.json().reportTarget.archiveId,'');
 assert.equal((await read({code:'x'.repeat(24),reportRef:body.reportRef})).status,401);
 assert.equal((await read({...body,code:other.code})).status,404);
 assert.equal((await read({...body,reportRef:'invalid'})).status,422);
 assert.equal((await read({...body,reportRef:Link.reference('missing')})).status,404);
 assert.equal((await read({code:own.code})).json().reportTarget,undefined,'old links remain compatible');
 for(const row of await f.repository.listRecords('national-cre','item'))await f.repository.upsertRecord('national-cre','item',{...row,auctionArchiveId:'older'});
 await f.repository.upsertRecord('national-cre','archive',{id:'older',title:'이전 회차',closedAt:'2026-10-19T00:00:00Z'});
 await f.repository.upsertRecord('national-cre','item',item('new','v1',{attributes:{broadcastDate:'2026-10-21'}}));
 reports.push({id:'new-report',vendorId:'v1',itemIds:['new'],amount:20000,status:'pending'});
 await f.repository.upsertRows([{key:ledgerKey,value:JSON.stringify(reports)}]);f.restart();
 result=await read(body);assert.equal(result.status,200,result.body);assert.deepEqual(result.json().reportTarget,{reportId:'old-report',vendorId:'v1',archiveId:'older'});
 const scoped=await f.call(f.client(),'GET','/api/platform/channels/national-cre/organizer-shipping?archive=older',null,{'x-creo-organizer':own.code});
 assert.equal(scoped.status,200,scoped.body);assert.equal(scoped.json().vendors.find(v=>v.vendorId==='v1').pendingReport.id,'old-report');
 assert.equal((await read({...body,reportRef:Link.reference('new-report')})).json().reportTarget.archiveId,'');
 assert.equal((await f.repository.getRowsByKeys([ledgerKey]))[0].value,JSON.stringify(reports));
 const old=await f.repository.getRecord('national-cre','item','a02');await f.repository.upsertRecord('national-cre','item',{...old,auctionArchiveId:''});
 assert.equal((await read(body)).status,409,'mixed rounds cannot select a broader scope');
 const lookup='creo_organizer_access_lookup::'+require('node:crypto').createHash('sha256').update(own.code).digest('hex');
 await f.repository.upsertRows([{key:lookup,value:JSON.stringify({channelId:'national-cre',expiresAt:1})}]);
 assert.equal((await read(body)).status,401);
});

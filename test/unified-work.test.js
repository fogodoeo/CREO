'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs'),{normalizeChannel}=require('../platform-core');
const Work=require('../public/vendor-work-model'),Home=require('../public/operator-home-model'),Workflow=require('../auction-workflow');
test('unified work respects verified membership, isolates failures and survives reload without creating records',async t=>{
 const f=await createFixture();t.after(f.close);
 const channels=['clab-test','other-test'].map(id=>normalizeChannel({id,name:id,status:'active',dataAdapter:'platform'}));
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,...channels]);
 for(const c of channels)await f.repository.upsertRecord(c.id,'vendor',{id:'v',name:c.id,phone:c.id==='clab-test'?'01000000001':'01000000002',active:true});
 const anon=f.client();assert.equal((await f.call(anon,'GET','/api/platform/vendor-access/work')).status,401);
 const owner=await f.login('01000000001'),read=()=>f.call(owner,'GET','/api/platform/vendor-access/work');
 let response=await read();assert.equal(response.status,200,response.body);
 const row=response.json().rows[0];assert.equal(row.channelId,'clab-test');assert.equal(response.json().rows.length,1);assert.equal(row.workflow.fulfillment,'organizer');assert.equal(row.workflow.settlementContact,'크레용');assert.equal(row.hasSales,false);
 await Promise.all([read(),read(),read()]);f.restart();assert.deepEqual((await read()).json().rows,[row]);
 assert.equal((await f.repository.listRecords('clab-test','vendor')).length,1);
 const before=f.repository.getRecord.bind(f.repository);f.repository.getRecord=async(c,type,id)=>{if(type==='setting'&&id==='entry-policy')throw Error('isolated failure');return before(c,type,id);};
 assert.equal((await read()).json().rows[0].unavailable,true);f.repository.getRecord=before;
 await f.repository.upsertRecord('clab-test','vendor',{id:'v',name:'clab-test',phone:'01000000002',active:true});assert.deepEqual((await read()).json().rows,[]);
 await f.post(owner,'logout',{});assert.equal((await read()).status,401);
});
test('inbox keeps simultaneous registration and settlement, routes financial round explicitly',()=>{
 const rows=Work.ordered([{kind:'channel',name:'화요일',date:'2026-11-10',entriesOpen:true,entryCount:2},{kind:'national',companyId:'v',name:'월요일',bookingAttention:true,bookingCount:1,settlementAttention:true,settlementCount:2},{name:'실패',unavailable:true}]);
 assert.deepEqual(rows.map(r=>r.name),['실패','월요일','화요일']);assert.equal(rows[1].bookingAttention,true);
 const url=new URL(Work.destination(rows[1],'test','settlement',{channelId:'national-cre-20261109',round:'date:2026-11-09'}),'https://test');assert.equal(url.pathname,'/vendor-checkout.html');assert.equal(url.searchParams.get('round'),'date:2026-11-09');assert.equal(url.searchParams.get('portal'),'v');
 assert.equal(Work.state({hasSales:true}).label,'낙찰 내역'); // Never equate existence of sales with full completion.
});
test('workflow settings reject stale concurrent saves, survive restart, and cannot change financial configuration',async t=>{
 const f=await createFixture();t.after(f.close);const c=normalizeChannel({id:'clab-policy',status:'active',dataAdapter:'platform'});
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,c]);
 const client=f.client(),route='/api/platform/channels/clab-policy/entry-policy';
 assert.equal((await f.call(client,'PUT',route,{open:true,expectedRevision:0})).status,401);
 const body={open:true,expectedRevision:0,closesAt:'2026-11-10T19:00:00+09:00',fulfillment:'organizer',settlementContact:'크레용'},put=b=>f.call(client,'PUT',route,b,{'x-creo-admin':f.secret});
 const results=await Promise.all([put(body),put(body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 f.restart();const saved=(await f.call(client,'GET',route,undefined,{'x-creo-admin':f.secret})).json();assert.equal(saved.revision,1);assert.equal(saved.closesAt,'2026-11-10T10:00:00.000Z');
 assert.equal((await put({...body,expectedRevision:1,closesAt:'invalid'})).status,422);
 assert.deepEqual((await f.repository.getCatalog()).channels.find(row=>row.id===c.id),c);
 assert.equal((await f.repository.getRecord(c.id,'setting','entry-policy')).revision,1);
});
test('agenda includes concurrent programs and closed rounds without changing live selection',()=>{
 const rows=[{name:'월요일',date:'2026-11-09',phase:'finished',channelId:'a'},{name:'화요일',date:'2026-11-10',phase:'preparing',channelId:'b'},{name:'방송 중',date:'2026-11-09',phase:'live',channelId:'c'},{name:'충돌',scopeError:'scope required'}];
 assert.deepEqual(Home.agenda(rows).map(r=>r.channelId),['c','b']);assert.deepEqual(Home.agenda(rows,'past').map(r=>r.channelId),['a']);assert.equal(Home.agenda(rows,'all').length,3);
});
test('deadline closes only intake at the exact boundary; past drafts remain readable and operator review works',async t=>{
 const f=await createFixture();t.after(f.close);const channel=normalizeChannel({id:'clab-test',status:'active',dataAdapter:'platform'}),vendor={id:'v',name:'테스트',phone:'01000000001',bankName:'테스트',bankAccount:'0000',bankHolder:'테스트'};
 await f.repository.upsertRecord(channel.id,'setting',{id:'entry-policy',open:true,closesAt:'2026-11-10T11:00:00.000Z'});
 const context={channel,vendor,profile:{id:randomUUID(),members:[{channelId:channel.id,vendorId:'v'}]},catalog:{channels:[channel]}};
 let now=Date.parse('2026-11-10T10:59:59.999Z');const create=()=>require('../vendor-entries').createVendorEntries(f.repository,{now:()=>now}),service=create(),entry={id:randomUUID(),morph:'릴리화이트'};
 await service.command(context,{type:'submit',entry,requestId:randomUUID()});assert.equal((await service.summary(context)).entriesOpen,true);
 now++;assert.equal((await create().summary(context)).entriesOpen,false);
 await assert.rejects(service.command(context,{type:'save',entry:{id:randomUUID()},requestId:randomUUID()}),/마감/);
 assert.equal((await create().read(context)).entries.length,1);
 await service.command(context,{type:'approve',id:entry.id,expectedVersion:1,lot:'A01',order:1,requestId:randomUUID()},{operator:true});assert.equal((await f.repository.listRecords(channel.id,'item')).length,1);
 assert.throws(()=>Workflow.normalize({closesAt:'2026-11-10T20:00'}),/마감/);assert.throws(()=>Workflow.normalize({fulfillment:'someone'}),/배송/);
 assert.equal(Workflow.fromPolicy({fulfillment:'vendor'},channel).fulfillment,'vendor');
});

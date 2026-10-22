'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs'),{normalizeChannel}=require('../platform-core'),{createVendorDirectory}=require('../vendor-directory');
async function setup(t){
 const f=await createFixture();t.after(f.close);
 const channel=normalizeChannel({id:'clab-review-test',name:'씨랩 격리 검증',status:'active',dataAdapter:'platform'}),vendorId='test-vendor';
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,channel]);
 await f.repository.upsertRecord(channel.id,'vendor',{id:vendorId,name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'00000',bankHolder:'가상 업체'});
 await f.repository.upsertRecord(channel.id,'setting',{id:'entry-policy',open:true,revision:1});
 const directory=createVendorDirectory(f.repository);await directory.enroll(channel.id,vendorId);
 const profile=await directory.profileFor(channel.id,vendorId),key='vendor_entries_v1::'+profile.id;
 const admin=(method,path,body)=>f.call(f.client(),method,'/api/platform'+path,body,{'x-creo-admin':f.secret});
 const response=await admin('POST','/channels/'+channel.id+'/vendor-checkout-link',{vendorId});assert.equal(response.status,200,response.body);const code=response.json().code;
 const send=body=>f.call(f.client(),'POST','/api/platform/vendor-entries',{code,event:channel.id,requestId:randomUUID(),...body});
 const read=async()=>{const result=await f.call(f.client(),'GET','/api/platform/vendor-entries?'+new URLSearchParams({code,event:channel.id}));assert.equal(result.status,200,result.body);return result.json().state};
 const entry={id:randomUUID(),morph:'릴리화이트',sex:'female',weight:'24',hatchDate:'2026-01-10',note:'원본 비고'};
 const saved=await send({type:'submit',entry});assert.equal(saved.status,200,saved.body);
 const doc=()=>f.repository.getRowsByKeys([key]).then(rows=>JSON.parse(rows[0].value));
 const edit=(patch={})=>({type:'submit',reviewEdit:true,entry:{...entry,weight:'25'},expectedVersion:1,requestId:randomUUID(),...patch});
 const approve=expectedVersion=>admin('POST','/channels/'+channel.id+'/entries/review',{vendorId,type:'approve',id:entry.id,expectedVersion,lot:'A01',order:1,startPrice:10000,requestId:randomUUID()});
 return {...f,channel,vendorId,profile,key,code,admin,send,read,entry,edit,approve,doc};
}
test('direct submitted edit atomically replaces the snapshot once, preserves identity, and replays after restart and close',async t=>{
 const f=await setup(t),body=f.edit(),before=(await f.read()).entries[0];
 const responses=await Promise.all([f.send(body),f.send(body)]);assert.ok(responses.every(r=>r.status===200),responses.map(r=>r.body).join('\n'));assert.equal(responses.filter(r=>r.json().duplicate).length,1);
 const e=(await f.read()).entries[0];assert.equal(e.status,'submitted');assert.equal(e.version,2);assert.equal(e.code,before.code);assert.equal(e.submission.weight,'25');assert.equal(e.submission.note,before.submission.note);assert.deepEqual(await f.repository.listRecords(f.channel.id,'item'),[]);
 f.restart();await f.repository.upsertRecord(f.channel.id,'setting',{id:'entry-policy',open:false,revision:2});assert.equal((await f.send(body)).json().duplicate,true);assert.equal((await f.read()).entries[0].version,2);
 const changed=await f.send({...body,entry:{...body.entry,weight:'26'}});assert.equal(changed.status,409);assert.equal((await f.doc()).requests.length,2);
});
test('approved revision leaves the auction item and approved snapshot intact until explicit operator approval',async t=>{
 const f=await setup(t);assert.equal((await f.approve(1)).status,200);const before=(await f.read()).entries[0],item=(await f.repository.listRecords(f.channel.id,'item'))[0];
 const body=f.edit({expectedVersion:before.version});assert.equal((await f.send(body)).status,200);
 let e=(await f.read()).entries[0];assert.equal(e.status,'submitted');assert.equal(e.submission.weight,'25');assert.deepEqual(e.approved,before.approved);assert.equal(e.lot,before.lot);assert.equal(e.itemId,before.itemId);assert.deepEqual(await f.repository.getRecord(f.channel.id,'item',item.id),item);
 assert.equal((await f.send(f.edit({expectedVersion:e.version,entry:{...f.entry,weight:'26'}}))).status,200);e=(await f.read()).entries[0];assert.deepEqual(e.approved,before.approved);
 assert.equal((await f.approve(e.version)).status,200);const changed=await f.repository.getRecord(f.channel.id,'item',item.id);assert.equal(changed.attributes.entry_traits.weight,'26');assert.equal(changed.id,item.id);assert.equal(changed.name,'A01');assert.equal(changed.startPrice,10000);
});
test('concurrent edits and approval are ordered without losing a submission or approving stale contents',async t=>{
 const f=await setup(t),a=f.edit(),b=f.edit({entry:{...f.entry,weight:'27'}}),responses=await Promise.all([f.send(a),f.send(b)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const current=(await f.read()).entries[0];assert.equal(current.status,'submitted');assert.equal(current.version,2);
 const pair=await Promise.all([f.approve(2),f.send(f.edit({expectedVersion:2}))]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
 const final=(await f.read()).entries[0];assert.equal(final.version,3);assert.ok(['approved','submitted'].includes(final.status));
 const items=await f.repository.listRecords(f.channel.id,'item');if(final.status==='approved'){assert.equal(items.length,1);assert.equal(items[0].attributes.entry_traits.weight,current.submission.weight);}else assert.equal(items.length,0);
});
test('invalid input, unauthorized state and SQLite failure retain the accepted snapshot and retry safely',async t=>{
 const f=await setup(t),before=await f.doc();
 for(const body of [f.edit({type:'save'}),f.edit({expectedVersion:99}),f.edit({entry:{...f.entry,weight:'-1'}}),f.edit({entry:{...f.entry,photoIds:['missing']}}),f.edit({entry:{...f.entry,id:randomUUID()}}),f.edit({replaceSubmitted:true})]){assert.notEqual((await f.send(body)).status,200);assert.deepEqual(await f.doc(),before);}
 const body=f.edit();f.repository.db.exec("CREATE TRIGGER fail_review_write BEFORE UPDATE ON platform_kv WHEN NEW.key LIKE 'vendor_entries_v1::%' BEGIN SELECT RAISE(ABORT, 'isolated write failure'); END;");
 assert.equal((await f.send(body)).status,500);assert.deepEqual(await f.doc(),before);f.repository.db.exec('DROP TRIGGER fail_review_write');f.restart();assert.equal((await f.send(body)).status,200);assert.equal((await f.send(body)).json().duplicate,true);
});
test('progressed, archived, foreign, orphaned or closed entries cannot submit a revision',async t=>{
 const f=await setup(t);assert.equal((await f.approve(1)).status,200);const item=(await f.repository.listRecords(f.channel.id,'item'))[0],before=await f.doc();
 for(const patch of [{status:'live'},{status:'sold',soldPrice:10000},{status:'passed'},{vendorId:'someone-else'},{attributes:{...item.attributes,bid_log:[{amount:10000}]}},{auctionArchiveId:'past'}]){
  await f.repository.upsertRecord(f.channel.id,'item',{...item,...patch});assert.equal((await f.send(f.edit({expectedVersion:2}))).status,409);assert.deepEqual(await f.doc(),before);
 }
 await f.repository.upsertRecord(f.channel.id,'item',item);
 const orphan=structuredClone(before);delete orphan.entries[0].approved;delete orphan.entries[0].itemId;orphan.entries[0].status='submitted';await f.repository.upsertRows([{key:f.key,value:JSON.stringify(orphan)}]);assert.equal((await f.send(f.edit({expectedVersion:2}))).status,409);assert.deepEqual(await f.doc(),orphan);await f.repository.upsertRows([{key:f.key,value:JSON.stringify(before)}]);
 for(const status of ['paused','archived']){const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id===f.channel.id?{...c,status}:c));assert.notEqual((await f.send(f.edit({expectedVersion:2}))).status,200);assert.deepEqual(await f.doc(),before);}
});
test('a live transition waits for the review edit lock and keeps the original auction facts',async t=>{
 const f=await setup(t);assert.equal((await f.approve(1)).status,200);const item=(await f.repository.listRecords(f.channel.id,'item'))[0];
 const write=f.repository.upsertRows.bind(f.repository);let entered,release,liveDone=false;const enteredGate=new Promise(r=>entered=r),releaseGate=new Promise(r=>release=r);
 f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key===f.key)){entered();await releaseGate;}return write(rows)};
 const edit=f.send(f.edit({expectedVersion:2}));await enteredGate;
 const live=f.admin('PUT','/channels/'+f.channel.id+'/items/'+item.id,{record:{...item,status:'live'},expectedUpdatedAt:item.updatedAt}).then(r=>{liveDone=true;return r});
 await new Promise(setImmediate);assert.equal(liveDone,false);release();assert.equal((await edit).status,200);assert.equal((await live).status,200);f.repository.upsertRows=write;
 const changed=await f.repository.getRecord(f.channel.id,'item',item.id);assert.equal(changed.status,'live');assert.equal(changed.attributes.entry_traits.weight,'24');assert.equal((await f.send(f.edit({expectedVersion:3}))).status,409);
});
test('a vendor cannot use another channel or bypass the national calendar with direct review edits',async t=>{
 const f=await setup(t),before=await f.doc();assert.notEqual((await f.send({...f.edit(),event:'national-cre'})).status,200);assert.deepEqual(await f.doc(),before);
 const directory=createVendorDirectory(f.repository);await directory.attach(f.profile.id,'national-cre');
 const root=(await directory.read()).profiles.find(p=>p.id===f.profile.id).members.find(m=>m.channelId==='national-cre');
 const forged=structuredClone(before);forged.entries[0].channelId='national-cre';forged.entries[0].channelVendorId=root.vendorId;await f.repository.upsertRows([{key:f.key,value:JSON.stringify(forged)}]);
 const response=await f.send({...f.edit(),event:'national-cre'});assert.notEqual(response.status,200);assert.deepEqual(await f.doc(),forged);
});

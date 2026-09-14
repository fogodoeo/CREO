'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createVendorDirectory}=require('../vendor-directory');
function repo(){const rows=new Map(),records=new Map();return{rows,records,async getRowsByKeys(keys){return keys.map(key=>rows.get(key)).filter(Boolean)},async upsertRows(values){values.forEach(row=>rows.set(row.key,structuredClone(row)))},async getRecord(c,t,id){return structuredClone(records.get(c+':'+t+':'+id)||null)},async listRecords(c,t){return [...records.entries()].filter(([k])=>k.startsWith(c+':'+t+':')).map(([,v])=>structuredClone(v))},async upsertRecord(c,t,r){records.set(c+':'+t+':'+r.id,structuredClone(r));return r}}}
test('common profile preserves quoted bank details and rejects stale edits across channels',async()=>{
 const r=repo(),d=createVendorDirectory(r);await r.upsertRecord('a','vendor',{id:'v',name:'업체',bankName:'은행',bankAccount:'11111',bankHolder:'예금주'});
 const p=await d.enroll('a','v'),m=await d.attach(p.id,'b');
 await r.upsertRecord('b','shipment',{id:'s',vendorId:m.vendorId,buyerSubmittedAt:'2026-01-01',cost:19000,paymentStatus:'paid'});
 const before=await d.find('a','v');
 await d.update('a',{...before,bankAccount:'22222',logoUrl:'/logo.png'},before.directoryRevision);
 assert.equal((await d.find('b',m.vendorId)).bankAccount,'22222');
 const quoted=await r.getRecord('b','shipment','s');assert.equal(quoted.bankSnapshot.bankAccount,'11111');assert.equal(quoted.cost,19000);assert.equal(quoted.paymentStatus,'paid');
 await assert.rejects(d.update('b',{...before,id:m.vendorId,bankAccount:'33333'},before.directoryRevision),/변경/);
 const restarted=createVendorDirectory(r);assert.equal((await restarted.find('b',m.vendorId)).logoUrl,'/logo.png');
});
test('failed membership persistence can retry without duplicate vendor records',async()=>{
 const r=repo(),d=createVendorDirectory(r);await r.upsertRecord('a','vendor',{id:'v',name:'업체'});const p=await d.enroll('a','v');
 const write=r.upsertRows;r.upsertRows=async()=>{throw Error('disk unavailable')};await assert.rejects(d.attach(p.id,'b'),/disk/);
 r.upsertRows=write;await d.attach(p.id,'b');await d.attach(p.id,'b');assert.equal((await r.listRecords('b','vendor')).length,1);
});

async function existingParticipation(){
 const r=repo(),d=createVendorDirectory(r);
 await r.upsertRecord('new','vendor',{id:'new-v',name:'대구 지점'});
 await r.upsertRecord('old','vendor',{id:'old-v',name:'대구 지점'});
 const source=await d.enroll('new','new-v'),target=await d.enroll('old','old-v');
 const options={expectedRevision:source.revision,expectedTargetProfileId:target.id};
 return {r,d,source,target,options};
}
test('explicit existing participation link is atomic, retryable, durable and preserves channel records',async()=>{
 const {r,d,source,target,options}=await existingParticipation();
 await r.upsertRecord('old','item',{id:'i',vendorId:'old-v',status:'sold',soldPrice:350000});
 await r.upsertRecord('old','shipment',{id:'s',vendorId:'old-v',paymentStatus:'paid'});
 const records=structuredClone(r.records),write=r.upsertRows;
 r.upsertRows=async()=>{throw Error('disk unavailable')};
 await assert.rejects(d.attachExisting(source.id,'old','old-v',options),/disk/);
 assert.equal((await d.profileFor('old','old-v')).id,target.id);
 r.upsertRows=write;
 const results=await Promise.all([d.attachExisting(source.id,'old','old-v',options),d.attachExisting(source.id,'old','old-v',options)]);
 assert.deepEqual(results.map(r=>r.duplicate),[false,true]);
 const restarted=createVendorDirectory(r),directory=await restarted.read();
 assert.equal(directory.profiles.length,1);assert.equal(directory.membershipLinks.length,1);
 assert.equal(directory.membershipLinks[0].previousProfile.id,target.id);
 assert.equal((await restarted.profileFor('old','old-v')).id,source.id);
 assert.equal(directory.profiles[0].members.length,2);
 assert.deepEqual(r.records,records);
});
test('existing participation link refuses stale identities, competing memberships and conflicting profiles',async()=>{
 const {r,d,source,target,options}=await existingParticipation();
 await assert.rejects(d.attachExisting(source.id,'old','old-v',{...options,expectedRevision:0}),/변경/);
 await assert.rejects(d.attachExisting(source.id,'old','old-v',{...options,expectedTargetProfileId:''}),/변경/);
 await assert.rejects(d.attachExisting(source.id,'old','missing',options),/찾을/);
 const p=await d.find('old','old-v');await d.update('old',{...p,bankAccount:'11111'},p.directoryRevision);
 const q=await d.find('new','new-v');await d.update('new',{...q,bankAccount:'22222'},q.directoryRevision);
 await assert.rejects(d.attachExisting(source.id,'old','old-v',{...options,expectedRevision:2}),/정보가 달라/);
 assert.equal((await d.profileFor('old','old-v')).id,target.id);
 const other=await d.attach(source.id,'old');
 await assert.rejects(d.attachExisting(source.id,'old','old-v',{...options,expectedRevision:3}),/이미 다른/);
 assert.notEqual(other.vendorId,'old-v');
});
test('existing participation link never discards entries, parents, photos or uncertain owner data',async()=>{
 const {r,d,source,target,options}=await existingParticipation();
 const key='vendor_entries_v1::'+target.id,empty={schema:1,ownerId:target.id,entries:[],parents:[],parentHistory:[],media:[],requests:[]};
 for(const field of ['entries','parents','parentHistory','media','requests']){
  await r.upsertRows([{key,value:JSON.stringify({...empty,[field]:[{id:'saved'}]})}]);
  await assert.rejects(d.attachExisting(source.id,'old','old-v',options),/자료가 있어/);
 }
 await r.upsertRows([{key,value:'{broken'}]);await assert.rejects(d.attachExisting(source.id,'old','old-v',options),/읽지/);
 assert.equal((await d.profileFor('old','old-v')).id,target.id);
 await r.upsertRows([{key,value:JSON.stringify(empty)}]);
 await d.attachExisting(source.id,'old','old-v',options);
 assert.equal((await d.profileFor('old','old-v')).id,source.id);
});
test('linking an unregistered participation preserves its existing profile details and never matches names automatically',async()=>{
 const r=repo(),d=createVendorDirectory(r);
 for(const [channel,id,fields] of [['new','n',{}],['old','o',{manager:'담당자',bankName:'은행',bankAccount:'11111',bankHolder:'예금주'}],['other','x',{}]])await r.upsertRecord(channel,'vendor',{id,name:'같은 이름',...fields});
 const p=await d.enroll('new','n');
 await d.attachExisting(p.id,'old','o',{expectedRevision:1,expectedTargetProfileId:''});
 assert.equal((await d.find('new','n')).bankAccount,'11111');
 assert.equal((await d.find('old','o')).id,'o');
 assert.equal(await d.profileFor('other','x'),null);
 assert.equal((await d.find('other','x')).bankAccount,undefined);
});

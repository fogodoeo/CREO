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

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,ROOT}=require('../tools/national-intake-fixture.cjs');
async function setup(t){const f=await fixture();t.after(f.close);const view=(await f.booking()).json(),r=view.reservations[0];return {...f,r,edit:(patch={})=>({type:'save-entries',id:r.id,submit:true,requestId:randomUUID(),entries:[{slot:0,expectedVersion:r.entries[0].version,replaceSubmitted:true,entry:{sex:'female',weight:'8',hatchDate:'2026-09-01'},parents:{sire:{name:'수정된 부개체'}}}],...patch})};}
test('submitted replacement keeps all four registrations complete, updates the snapshot once, and retries after restart',async t=>{
 const f=await setup(t),body=f.edit(),replies=await Promise.all([f.booking(body),f.booking(body)]);
 assert.ok(replies.every(r=>r.status===200),replies.map(r=>r.body).join('\n'));
 assert.equal(replies.filter(r=>r.json().duplicate).length,1);
 const view=(await f.booking()).json(),r=view.reservations[0];assert.equal(r.completed,4);assert.equal(r.registrationComplete,true);
 const e=r.entries[0];assert.equal(e.status,'submitted');assert.equal(e.weight,'8');assert.equal(e.version,f.r.entries[0].version+1);assert.equal(e.submission.weight,'8');assert.equal(e.submission.parents[0].name,'수정된 부개체');
 assert.deepEqual(r.entries.slice(1),f.r.entries.slice(1));f.restart();assert.equal((await f.booking(body)).json().duplicate,true);assert.equal((await f.booking()).json().reservations[0].completed,4);
});
test('invalid replacements and storage failures preserve the accepted snapshot; a retry succeeds',async t=>{
 const f=await setup(t),body=f.edit(),before=(await f.booking()).json().reservations[0];
 const invalid=structuredClone(body);invalid.entries[0].entry.weight='';assert.equal((await f.booking(invalid)).status,422);
 assert.deepEqual((await f.booking()).json().reservations[0],before);
 const upsert=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.startsWith('vendor_entries_v1::')))throw Error('isolated write failure');return upsert(rows)};
 assert.equal((await f.booking(body)).status,500);f.repository.upsertRows=upsert;assert.deepEqual((await f.booking()).json().reservations[0],before);
 assert.equal((await f.booking(body)).status,200);
});
test('concurrent submitted edits reject the stale writer without withdrawing either submission',async t=>{
 const f=await setup(t),a=f.edit(),b=f.edit();b.entries[0].entry.weight='12';
 const replies=await Promise.all([f.booking(a),f.booking(b)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 const r=(await f.booking()).json().reservations[0];assert.equal(r.completed,4);assert.equal(r.entries[0].version,f.r.entries[0].version+1);
 assert.ok(['8','12'].includes(r.entries[0].weight));assert.equal(r.entries[0].status,'submitted');
});
test('submitted replacement cannot act as draft-save, bypass ownership, or edit an approved entry',async t=>{
 const f=await setup(t);assert.equal((await f.booking(f.edit({submit:false}))).status,409);
 assert.equal((await f.booking(f.edit({id:randomUUID()}))).status,403);
 const noFlag=f.edit();delete noFlag.entries[0].replaceSubmitted;assert.equal((await f.booking(noFlag)).status,409);
 const e=f.r.entries[0],approved=await f.request('POST','/channels/'+ROOT+'/entries/review',{type:'approve',requestId:randomUUID(),vendorId:f.vendorId,id:e.id,expectedVersion:e.version,lot:'A01',order:1,startPrice:0});assert.equal(approved.status,200,approved.body);
 const body=f.edit();body.entries[0].expectedVersion=(await f.booking()).json().reservations[0].entries[0].version;
 assert.equal((await f.booking(body)).status,409);assert.equal((await f.booking()).json().reservations[0].entries[0].status,'approved');
});

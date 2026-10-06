'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
async function fixture(t){
 const f=await createFixture();t.after(f.close);f.advance(9*86400000);
 f.admin=body=>f.call(f.client(),body?'POST':'GET','/api/platform/national-vendor-directory',body,{'x-creo-admin':f.secret});
 for(const [id,name]of [['doremi','도레미'],['celeb','셀렙']]){
  const saved=await f.admin({id,name,region:'부산·울산·경남',loginPhone:'01000000001'});assert.equal(saved.status,200,saved.body);
  const v=await f.repository.getRecord('national-cre','vendor',id);await f.repository.upsertRecord('national-cre','vendor',{...v,bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'});
 }
 f.owner=await f.login('01000000001');return f;
}
test('one verified representative sees both registered companies without exposing other companies or claiming on GET',async t=>{
 const f=await fixture(t);
 await f.admin({id:'outside',name:'다른 업체',region:'부산·울산·경남',loginPhone:'01000000002'});
 const v=await f.repository.getRecord('national-cre','vendor','outside');await f.repository.upsertRecord('national-cre','vendor',{...v,phone:'01000000001'});
 for(let i=0;i<3;i++){
  const view=(await f.refresh(f.owner)).json();assert.deepEqual(view.companies.map(c=>c.name),['도레미','셀렙']);assert.ok(view.companies.every(c=>c.canClaim));
  assert.ok(view.companies.every(c=>!('loginPhone'in c)&&!('bankAccount'in c)));
 }
 assert.ok((await f.admin()).json().companies.every(c=>!c.claimed));
 const other=await f.login('01000000003');assert.deepEqual((await f.refresh(other)).json().companies,[]);
 assert.equal((await f.post(other,'claim',{id:'celeb'})).status,403);
 assert.equal((await f.post(f.owner,'select',{id:'outside'})).status,403);
});
test('claiming and switching are idempotent, keep two identities and remain separate after restart',async t=>{
 const f=await fixture(t);
 for(const id of ['doremi','celeb']){
  const claims=await Promise.all([f.post(f.owner,'claim',{id}),f.post(f.owner,'claim',{id})]);assert.ok(claims.every(r=>r.status===200));assert.equal(claims.filter(r=>r.json().duplicate).length,1);
 }
 f.restart();assert.ok((await f.refresh(f.owner)).json().companies.every(c=>!c.canClaim));
 for(const id of ['doremi','celeb']){
  const token=(await f.post(f.owner,'select',{id})).json().token;
  const entries=(await f.call(f.owner,'GET','/api/platform/vendor-entries?'+new URLSearchParams({event:'national-cre',token}))).json().state;
  assert.equal(entries.vendor.id,id);assert.equal(entries.vendor.name,id==='doremi'?'도레미':'셀렙');
  const p=(await f.post(f.owner,'profile',{companyId:id})).json();assert.equal(p.members.length,1);assert.equal(p.role,'owner');
 }
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,2);
});
test('two companies with one owner each reserve four or five slots, without seeing or mutating the other reservation',async t=>{
 const f=await fixture(t),tokens={};f.advance(13*86400000);
 assert.equal((await f.call(f.client(),'PUT','/api/platform/channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'},{'x-creo-admin':f.secret})).status,200);
 for(const id of ['doremi','celeb']){await f.post(f.owner,'claim',{id});tokens[id]=(await f.post(f.owner,'select',{id})).json().token;}
 const command=(id,body)=>f.call(f.owner,'POST','/api/platform/vendor-bookings',{event:'national-cre',token:tokens[id],requestId:randomUUID(),...body});
 const results=await Promise.all([command('doremi',{type:'reserve',date:'2026-10-28',quantity:4}),command('celeb',{type:'reserve',date:'2026-10-28',quantity:5})]);
 for(const [i,r]of results.entries()){assert.equal(r.status,200,r.body);assert.equal(r.json().reservations.length,1);assert.equal(r.json().reservations[0].quantity,i?5:4);}
 const reservation=results[1].json().reservations[0];
 assert.equal((await command('doremi',{type:'pickup',id:reservation.id,expectedVersion:reservation.version,pickup:true})).status,404);
 f.restart();
 for(const [id,count]of [['doremi',4],['celeb',5]]){const r=await f.call(f.owner,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({event:'national-cre',token:tokens[id]}));assert.equal(r.status,200,r.body);assert.equal(r.json().reservations.length,1);assert.equal(r.json().reservations[0].entryIds.length,count);}
});
test('stale company choices and failed claims cannot grant access; staff memberships stay company-specific',async t=>{
 const f=await fixture(t);const stale=(await f.refresh(f.owner)).json().companies.find(c=>c.id==='celeb');assert.equal(stale.canClaim,true);
 const saved=(await f.admin()).json().companies.find(c=>c.id==='celeb');assert.equal((await f.admin({...saved,loginPhone:'01000000002'})).status,200);
 assert.equal((await f.post(f.owner,'claim',{id:'celeb'})).status,403);assert.equal((await f.post(f.owner,'select',{id:'celeb'})).status,403);
 const original=f.repository.compareAndSwapRows;f.repository.compareAndSwapRows=async()=>{throw Error('isolated failure');};
 assert.equal((await f.post(f.owner,'claim',{id:'doremi'})).status,503);f.repository.compareAndSwapRows=original;
 assert.equal((await f.post(f.owner,'select',{id:'doremi'})).status,403);
 await f.post(f.owner,'claim',{id:'doremi'});
 const staff=await f.login('01000000003'),request=(await f.post(staff,'join',{companyId:'doremi',name:'직원',sharingConsent:true})).json();
 await f.post(f.owner,'join-response',{id:request.id,action:'approve'});
 assert.deepEqual((await f.refresh(staff)).json().companies.map(c=>c.id),['doremi']);assert.equal((await f.post(staff,'select',{id:'celeb'})).status,403);
 const token=(await f.post(f.owner,'select',{id:'doremi'})).json().token;
 await f.post(f.owner,'logout',{});
 assert.equal((await f.call(f.owner,'GET','/api/platform/vendor-entries?'+new URLSearchParams({event:'national-cre',token}))).status,401);
});

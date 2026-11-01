'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CAMPAIGN,summary,update}=require('../vendor-season-response');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
async function fixture(t){
 const f=await createFixture();t.after(f.close);f.advance(Date.parse(CAMPAIGN.startsAt)-Date.parse('2026-09-23T09:00:00+09:00'));
 const owner=await f.login('01000000001'),other=await f.login('01000000002');
 const registered=await f.post(owner,'register',{name:'시즌 확인 업체',region:'서울·인천',phone:'01000000001'});assert.equal(registered.status,200,registered.body);
 const id=registered.json().id;
 const post=(action,extra={},client=owner)=>f.post(client,'season-response',{companyId:id,campaign:CAMPAIGN.id,action,...extra});
 const tasks=()=>f.call(owner,'GET','/api/platform/vendor-access/tasks?company='+id);
 return {...f,owner,other,id,postSeason:post,tasks};
}
test('campaign boundaries keep unanswered vendors pending, scoped to November only',()=>{
 const c={},start=Date.parse(CAMPAIGN.startsAt),end=Date.parse(CAMPAIGN.deadline);
 assert.equal(summary(c,start-1).visible,false);assert.equal(summary(c,start).open,true);assert.equal(summary(c,end).open,true);
 assert.equal(summary(c,end+1).open,false);assert.equal(summary(c,end+1).status,'pending');
 assert.equal(summary(c,Date.parse(CAMPAIGN.endsAt)).visible,false);
 assert.throws(()=>update(c,{campaign:'other',action:'accepted'},start,'a'),/안내가 변경/);
 assert.throws(()=>update(c,{campaign:CAMPAIGN.id,action:'accepted'},end+1,'a'),/기한/);
 assert.equal(summary({seasonResponses:{old:{status:'declined'}}},start).status,'pending');
});
test('authentication, owner membership, CSRF and active vendor are checked before writes',async t=>{
 const f=await fixture(t);
 assert.equal((await f.postSeason('accepted',{},f.other)).status,403);
 const csrf=f.owner.csrf;f.owner.csrf='wrong';assert.equal((await f.postSeason('accepted')).status,403);f.owner.csrf=csrf;
 const joined=await f.post(f.other,'join',{companyId:f.id,name:'직원',sharingConsent:true});assert.equal(joined.status,200,joined.body);
 const approved=await f.post(f.owner,'join-response',{id:joined.json().id,action:'approve'});assert.equal(approved.status,200,approved.body);
 assert.equal((await f.postSeason('seen',{},f.other)).status,403);
 const staffTasks=await f.call(f.other,'GET','/api/platform/vendor-access/tasks?company='+f.id);assert.equal(staffTasks.json().seasonResponse.canRespond,false);
 await f.post(f.owner,'logout',{});await f.refresh(f.owner);assert.equal((await f.postSeason('accepted')).status,401);
});
test('concurrent first visits display once and remain seen after server restart and a fresh login',async t=>{
 const f=await fixture(t),profile=(await f.post(f.owner,'profile',{companyId:f.id})).json();
 assert.equal(profile.setupRequired,true);assert.equal(profile.seasonResponse.visible,true);assert.equal(profile.seasonResponse.status,'pending');
 const responses=await Promise.all([f.postSeason('seen'),f.postSeason('seen')]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(responses.filter(r=>r.json().show).length,1);
 f.restart();assert.equal((await f.postSeason('seen')).json().show,false);
 f.advance(61000);const fresh=await f.login('01000000001');assert.equal((await f.postSeason('seen',{},fresh)).json().show,false);
 assert.equal((await f.tasks()).json().seasonResponse.status,'pending');
});
test('decline requires explicit confirmation, survives restart and retains vendor access and transactions',async t=>{
 const f=await fixture(t),before=await f.repository.getRecord('national-cre','vendor',f.id);
 await f.repository.upsertRecord('national-cre','shipment',{id:'historic-shipment',vendorId:f.id,status:'delivered'});
 assert.equal((await f.postSeason('declined')).status,422);
 assert.equal((await f.postSeason('declined',{confirmDecline:true})).status,200);
 f.restart();assert.equal((await f.tasks()).json().seasonResponse.status,'declined');
 assert.equal((await f.postSeason('declined',{confirmDecline:true})).json().duplicate,true);
 assert.equal((await f.postSeason('accepted')).status,409);
 assert.deepEqual(await f.repository.getRecord('national-cre','vendor',f.id),before);
 assert.equal((await f.repository.getRecord('national-cre','shipment','historic-shipment')).status,'delivered');
 assert.equal((await f.post(f.owner,'select',{id:f.id})).status,200);
 const directory=await f.call(f.owner,'GET','/api/platform/national-vendor-directory',undefined,{'x-creo-admin':f.secret});
 assert.equal(directory.status,200,directory.body);assert.equal(directory.json().companies.find(c=>c.id===f.id).seasonResponse.status,'declined');
 assert.doesNotMatch(JSON.stringify((await f.tasks()).json().seasonResponse),/actorId|01000000001|bankAccount/);
});
test('conflicting concurrent answers commit one decision without last-writer overwrites',async t=>{
 const f=await fixture(t),results=await Promise.all([f.postSeason('accepted'),f.postSeason('declined',{confirmDecline:true})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const status=(await f.tasks()).json().seasonResponse.status;assert.equal(status,results.find(r=>r.status===200).json().status);
 assert.equal((await f.postSeason(status,{confirmDecline:true})).json().duplicate,true);
});
test('storage failure never acknowledges a response and retries safely',async t=>{
 const f=await fixture(t),save=f.repository.compareAndSwapRows.bind(f.repository);
 f.repository.compareAndSwapRows=async()=>{throw Error('isolated storage failure');};
 assert.equal((await f.postSeason('accepted')).status,503);
 f.repository.compareAndSwapRows=save;assert.equal((await f.tasks()).json().seasonResponse.status,'pending');
 assert.equal((await f.postSeason('accepted')).status,200);
});
test('late unanswered responses stay pending and submitted decisions remain retryable',async t=>{
 const f=await fixture(t);await f.postSeason('seen');f.advance(2*86400000);
 assert.equal((await f.postSeason('accepted')).status,409);
 const s=(await f.tasks()).json().seasonResponse;assert.equal(s.status,'pending');assert.equal(s.open,false);assert.equal((await f.postSeason('seen')).json().show,false);
 const c={},body={campaign:CAMPAIGN.id,action:'accepted'};update(c,body,Date.parse(CAMPAIGN.startsAt),'actor');assert.equal(update(c,body,Date.parse(CAMPAIGN.deadline)+1,'actor').duplicate,true);
});

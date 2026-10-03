'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
async function setup(t){
 const f=await createFixture();t.after(f.close);f.owner=await f.login('01000000001');f.staff=await f.login('01000000002');
 f.id=(await f.post(f.owner,'register',{name:'권한 테스트',region:'서울',phone:'01000000001'})).json().id;
 f.profile=async()=>{const r=await f.post(f.owner,'profile',{companyId:f.id});assert.equal(r.status,200,r.body);return r.json();};
 f.join=()=>f.post(f.staff,'join',{companyId:f.id,name:'직원',sharingConsent:true});
 f.approve=async()=>{const r=await f.join();assert.equal(r.status,200,r.body);assert.equal((await f.post(f.owner,'join-response',{id:r.json().id,action:'approve'})).status,200);return r.json().id;};
 return f;
}
test('optional address persists with revision control, never blocks setup and remains owner editable',async t=>{
 const f=await setup(t);let p=await f.profile();assert.equal(p.addressMissing,true);
 assert.equal((await f.post(f.owner,'profile',{companyId:f.id,action:'bank',revision:p.revision,bankName:'123',bankAccount:'12345',bankHolder:'123'})).status,200);
 p=await f.profile();assert.equal(p.setupRequired,false);assert.equal(p.profileAttention,true);
 const save={companyId:f.id,action:'address',revision:p.revision,address:'서울특별시 테스트로 10, 2층'};
 assert.equal((await f.post(f.owner,'profile',save)).status,200);
 assert.equal((await f.post(f.owner,'profile',{...save,address:'오래된 값'})).status,409);
 f.restart();p=await f.profile();assert.equal(p.address,save.address);assert.equal(p.addressMissing,false);assert.equal(p.profileAttention,true);
 assert.equal((await f.post(f.owner,'profile',{...save,revision:p.revision,address:'a'.repeat(241)})).status,422);
 await f.approve();assert.equal((await f.post(f.staff,'profile',{...save,revision:p.revision})).status,403);
 assert.equal((await f.post(f.owner,'profile',{...save,revision:p.revision,address:''})).status,200);
 assert.equal((await f.profile()).addressMissing,true);
 const {profileStatus}=require('../vendor-profile-status');assert.equal(profileStatus({phone:'x',bankName:'x',bankAccount:'x',bankHolder:'x',logoUrl:'x',address:'x'}).profileAttention,false);
});
test('staff removal is owner-only, idempotent, durable and invalidates issued access',async t=>{
 const f=await setup(t),request=await f.approve(),p=await f.profile(),m=p.members.find(m=>!m.owner);
 const token=(await f.post(f.staff,'select',{id:f.id})).json().token;
 const access=()=>f.call(f.staff,'GET','/api/platform/vendor-bookings?event=national-cre&token='+token);
 assert.equal((await access()).status,200);
 assert.equal((await f.post(f.staff,'remove-member',{companyId:f.id,memberId:m.id})).status,403);
 assert.equal((await f.post(f.owner,'remove-member',{companyId:f.id,memberId:p.members.find(m=>m.owner).id})).status,422);
 const removed=await Promise.all([f.post(f.owner,'remove-member',{companyId:f.id,memberId:m.id}),f.post(f.owner,'remove-member',{companyId:f.id,memberId:m.id})]);
 assert.ok(removed.every(r=>r.status===200));assert.equal(removed.filter(r=>r.json().duplicate).length,1);
 assert.equal((await access()).status,401);assert.equal((await f.post(f.staff,'profile',{companyId:f.id})).status,403);
 assert.equal((await f.post(f.owner,'join-response',{id:request,action:'approve'})).status,200);assert.equal((await f.profile()).members.length,1);
 f.restart();assert.equal((await access()).status,401);
 const result=(await f.refresh(f.staff)).json().requestResults[0];assert.equal(result.status,'removed');
 assert.equal((await f.post(f.owner,'request-result',{id:result.id})).status,404);
 for(let i=0;i<2;i++)assert.equal((await f.post(f.staff,'request-result',{id:result.id})).status,200);
 assert.equal((await f.refresh(f.staff)).json().requestResults.length,0);
 f.advance(600000);await f.approve();assert.equal((await access()).status,401,'old links must not revive after reapproval');
 assert.equal((await f.post(f.owner,'remove-member',{companyId:f.id,memberId:m.id})).status,200);assert.equal((await f.profile()).members.length,2,'stale removal cannot revoke new membership');
 const next=(await f.post(f.staff,'select',{id:f.id})).json().token;assert.equal((await f.call(f.staff,'GET','/api/platform/vendor-bookings?event=national-cre&token='+next)).status,200);
});
test('failed removal is atomic and leaves other company memberships untouched',async t=>{
 const f=await setup(t);await f.approve();const second=(await f.post(f.owner,'register',{name:'두번째 업체',region:'서울',phone:'01000000001'})).json().id;
 const r=(await f.post(f.staff,'join',{companyId:second,name:'직원',sharingConsent:true})).json();await f.post(f.owner,'join-response',{id:r.id,action:'approve'});
 const m=(await f.profile()).members.find(m=>!m.owner),original=f.repository.compareAndSwapRows.bind(f.repository);
 f.repository.compareAndSwapRows=async()=>{throw Error('isolated write failure');};assert.equal((await f.post(f.owner,'remove-member',{companyId:f.id,memberId:m.id})).status,503);f.repository.compareAndSwapRows=original;
 assert.equal((await f.profile()).members.length,2);
 await f.post(f.owner,'remove-member',{companyId:f.id,memberId:m.id});
 assert.equal((await f.post(f.staff,'select',{id:second})).status,200);
});
test('cancel/reapply cannot flood notifications and rejection remains visible until acknowledged',async t=>{
 const f=await setup(t),first=await f.join();assert.equal(first.status,200);
 assert.equal((await f.join()).json().id,first.json().id);
 await f.post(f.staff,'join-response',{id:first.json().id,action:'cancel'});
 assert.equal((await f.join()).status,429);f.restart();assert.equal((await f.join()).status,429);
 assert.equal((await f.repository.listRecords('national-cre','notification')).length,1);
 f.advance(600000);const next=await f.join();assert.equal(next.status,200);
 await f.post(f.owner,'join-response',{id:next.json().id,action:'reject'});
 f.restart();const session=(await f.refresh(f.staff)).json();assert.equal(session.requests.length,0);assert.equal(session.requestResults[0].status,'rejected');
 await f.post(f.staff,'request-result',{id:next.json().id});assert.equal((await f.refresh(f.staff)).json().requestResults.length,0);
 for(let i=0;i<3;i++){f.advance(600000);const r=await f.join();assert.equal(r.status,200);await f.post(f.staff,'join-response',{id:r.json().id,action:'cancel'});}
 f.advance(600000);assert.equal((await f.join()).status,429);f.advance(86400000);assert.equal((await f.join()).status,200);
});

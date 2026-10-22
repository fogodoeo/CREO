'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const admin=(f,body)=>f.call(f.client(),body?'POST':'GET','/api/platform/national-vendor-directory',body,{'x-creo-admin':f.secret});
const request=(companyId='existing')=>({companyId,action:'request',name:'테스트 대표',consent:true,requestId:crypto.randomUUID()});
async function setup(t,contact=''){
 const f=await createFixture();t.after(f.close);
 await f.repository.upsertRecord('national-cre','vendor',{id:'existing',name:'기존 지역 업체',broadcastRegion:'대구·경북',phone:contact,active:true,bankName:'테스트 은행',bankAccount:'12345678',bankHolder:'기존 대표'});
 f.directory=createVendorDirectory(f.repository);await f.directory.enroll('national-cre','existing');
 f.owner=await f.login('01000000001');return f;
}
const search=async(f,c=f.owner)=>(await f.call(c,'GET','/api/platform/vendor-access/search?id=existing')).json().companies[0];
const approve=(f,r,overrides={})=>admin(f,{action:'approve-owner-setup',id:r.id,confirmCompanyId:r.companyId,confirmPhone:r.phone,...overrides});
test('existing vendor can initialize its verified contact without a second vendor or loss of linked records',async t=>{
 const f=await setup(t,'01000000001'),profile=await f.directory.profileFor('national-cre','existing');
 const participation=await f.directory.attach(profile.id,'national-cre-20261026');
 await f.repository.upsertRows([{key:'vendor_entries_v1::'+profile.id,value:JSON.stringify({parents:['preserve'],entries:['preserve']})}]);
 const before=await f.repository.getRowsByKeys(['vendor_directory_v1','vendor_entries_v1::'+profile.id]);
 assert.equal((await search(f)).ownerSetup,'direct');assert.equal((await search(f)).canClaim,false);
 const input=request(),results=await Promise.all([f.post(f.owner,'owner-setup',input),f.post(f.owner,'owner-setup',input)]);
 assert.ok(results.every(r=>r.status===200&&r.json().connected));assert.equal(results.filter(r=>r.json().duplicate).length,1);
 f.restart();assert.equal((await f.post(f.owner,'owner-setup',input)).json().duplicate,true);
 assert.equal((await f.post(f.owner,'select',{id:'existing'})).status,200);
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,1);
 assert.deepEqual(await f.repository.getRowsByKeys(before.map(r=>r.key)),before);
 assert.equal((await f.directory.profileFor(participation.channelId,participation.vendorId)).id,profile.id);
 assert.equal((await admin(f)).json().companies[0].loginPhone,'01000000001');
});
test('missing contact requires admin approval and initializes phone atomically across existing shared memberships',async t=>{
 const f=await setup(t),profile=await f.directory.profileFor('national-cre','existing'),m=await f.directory.attach(profile.id,'national-cre-20261026');
 assert.equal((await search(f)).ownerSetup,'review');
 const input=request(),results=await Promise.all([f.post(f.owner,'owner-setup',input),f.post(f.owner,'owner-setup',input)]);
 assert.ok(results.every(r=>r.status===200&&r.json().status==='pending'));assert.equal(results[0].json().id,results[1].json().id);
 assert.equal((await f.post(f.owner,'select',{id:'existing'})).status,403);
 assert.equal((await f.post(f.owner,'profile',{companyId:'existing'})).status,403);
 f.restart();assert.equal((await f.refresh(f.owner)).json().ownerSetups.length,1);
 const r=(await admin(f)).json().ownerSetups[0];
 assert.equal((await approve(f,r,{confirmPhone:'01000000002'})).status,422);
 const approvals=await Promise.all([approve(f,r),approve(f,r)]);assert.ok(approvals.every(r=>r.status===200));
 f.restart();assert.equal((await approve(f,r)).json().duplicate,true);
 assert.equal((await f.refresh(f.owner)).json().ownerSetups.length,0);
 const v=await f.directory.find(m.channelId,m.vendorId);assert.equal(v.phone,'01000000001');assert.equal(v.bankAccount,'12345678');assert.equal(v.directoryId,profile.id);
 const p=await f.post(f.owner,'profile',{companyId:'existing'});assert.equal(p.status,200);assert.equal(p.json().role,'owner');assert.equal(p.json().members.length,1);
});
test('another phone can request review but cannot use contact, forged phone, claim or public approval to obtain ownership',async t=>{
 const f=await setup(t,'01000000009');
 assert.equal((await search(f)).ownerSetup,'review');
 const r=await f.post(f.owner,'owner-setup',{...request(),phone:'01000000009',ownerId:'forged'});assert.equal(r.json().status,'pending');
 assert.equal((await admin(f)).json().ownerSetups[0].phone,'01000000001');
 assert.equal((await f.post(f.owner,'claim',{id:'existing'})).status,404);
 assert.equal((await f.call(f.owner,'POST','/api/platform/national-vendor-directory',{action:'approve-owner-setup',id:r.json().id})).status,401);
 const other=await f.login('01000000002');assert.deepEqual((await f.refresh(other)).json().ownerSetups,[]);
 const list=await f.call(other,'GET','/api/platform/vendor-access/search?region='+encodeURIComponent('대구·경북'));assert.ok(!list.body.includes('01000000009'));assert.ok(!list.body.includes('01000000001'));
 assert.equal((await f.post(other,'owner-setup',{action:'cancel',companyId:'existing',id:r.json().id})).status,409);
 const pending=(await admin(f)).json().ownerSetups[0];assert.equal((await approve(f,pending)).status,200);
 assert.equal((await f.directory.find('national-cre','existing')).phone,'01000000009','existing trade contact is not overwritten');
});
test('two conflicting applicants and an existing owner never both acquire ownership',async t=>{
 const f=await setup(t),other=await f.login('01000000002');
 await Promise.all([f.post(f.owner,'owner-setup',request()),f.post(other,'owner-setup',request())]);
 const requests=(await admin(f)).json().ownerSetups;assert.equal(requests.length,2);
 const results=await Promise.all(requests.map(r=>approve(f,r)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const c=(await admin(f)).json().companies[0];assert.ok(c.claimed);assert.equal((await admin(f)).json().ownerSetups.length,0);
 const outcomes=await Promise.all([f.post(f.owner,'select',{id:'existing'}),f.post(other,'select',{id:'existing'})]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,403]);
 const loser=outcomes[0].status===403?f.owner:other;assert.equal((await f.post(loser,'owner-setup',request())).status,409);
});
test('cancel, rejection, stale profile and deactivation fail closed without changing established information',async t=>{
 const f=await setup(t);let input=request();await f.post(f.owner,'owner-setup',input);
 let r=(await admin(f)).json().ownerSetups[0];assert.equal((await f.post(f.owner,'owner-setup',{action:'cancel',id:r.id,companyId:'existing'})).status,200);assert.equal((await approve(f,r)).status,409);
 input=request();await f.post(f.owner,'owner-setup',input);r=(await admin(f)).json().ownerSetups[0];
 assert.equal((await admin(f,{action:'reject-owner-setup',id:r.id})).status,200);assert.equal((await approve(f,r)).status,409);
 assert.equal((await f.refresh(f.owner)).json().requestResults[0].kind,'owner-setup');
 assert.equal((await f.post(f.owner,'request-result',{id:r.id})).status,200);assert.deepEqual((await f.refresh(f.owner)).json().requestResults,[]);
 assert.equal((await f.post(f.owner,'owner-setup',input)).json().status,'rejected');
 await f.post(f.owner,'owner-setup',request());r=(await admin(f)).json().ownerSetups[0];
 const v=await f.directory.find('national-cre','existing');await f.directory.update('national-cre',{...v,phone:'01000000009'},v.directoryRevision);
 assert.equal((await approve(f,r)).status,409);assert.equal((await admin(f)).json().companies[0].registered,false);
 await f.repository.upsertRecord('national-cre','vendor',{...await f.repository.getRecord('national-cre','vendor','existing'),active:false});
 assert.equal((await f.post(f.owner,'owner-setup',request())).status,404);assert.equal((await approve(f,r)).status,409);
});
test('a pending request survives membership-only preparation, while a changed contact cannot bypass review',async t=>{
 const f=await setup(t);await f.post(f.owner,'owner-setup',request());const r=(await admin(f)).json().ownerSetups[0];
 const profile=await f.directory.profileFor('national-cre','existing');await f.directory.attach(profile.id,'national-cre-20261026');
 assert.equal((await approve(f,r)).status,200);
 await f.repository.upsertRecord('national-cre','vendor',{id:'second',name:'다른 지역 업체',broadcastRegion:'대구·경북',phone:'01000000001',active:true});
 await f.directory.enroll('national-cre','second');const v=await f.directory.find('national-cre','second');
 const changed=f.directory.update('national-cre',{...v,phone:'01000000002'},v.directoryRevision);
 const submit=f.post(f.owner,'owner-setup',request('second'));await changed;assert.equal((await submit).json().status,'pending');
 assert.equal((await f.post(f.owner,'select',{id:'second'})).status,403);
});
test('failed direct initialization commits no owner and can be retried without duplicate vendor records',async t=>{
 const f=await setup(t,'01000000001'),input=request(),cas=f.repository.compareAndSwapRows.bind(f.repository);
 f.repository.compareAndSwapRows=async()=>{throw Error('isolated storage failure');};
 assert.equal((await f.post(f.owner,'owner-setup',input)).status,503);
 f.repository.compareAndSwapRows=cas;f.restart();assert.equal((await admin(f)).json().companies[0].registered,false);
 assert.equal((await f.post(f.owner,'owner-setup',input)).json().connected,true);
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,1);
});
test('failed approval transaction leaves no account or contact, and retry and restart commit once',async t=>{
 const f=await setup(t);await f.post(f.owner,'owner-setup',request());const r=(await admin(f)).json().ownerSetups[0],before=await f.directory.read();
 const cas=f.repository.compareAndSwapRows.bind(f.repository);f.repository.compareAndSwapRows=async()=>false;
 assert.equal((await approve(f,r)).status,409);assert.deepEqual(await f.directory.read(),before);assert.equal((await f.directory.find('national-cre','existing')).phone,'');
 f.repository.compareAndSwapRows=cas;f.restart();assert.equal((await approve(f,r)).status,200);assert.equal((await approve(f,r)).json().duplicate,true);
});
test('verified session, consent and existing registration guards cannot be bypassed',async t=>{
 const f=await setup(t,'01000000001'),anon=f.client();await f.refresh(anon);
 assert.equal((await f.post(anon,'owner-setup',request())).status,401);
 assert.equal((await f.call(f.owner,'POST','/api/platform/vendor-access/owner-setup',request(),{'x-vendor-csrf':'bad'})).status,403);
 assert.equal((await f.post(f.owner,'owner-setup',{...request(),consent:false})).status,422);
 await admin(f,{id:'existing',name:'기존 지역 업체',region:'대구·경북',loginPhone:'01000000002'});
 assert.equal((await search(f)).ownerSetup,'');assert.equal((await f.post(f.owner,'owner-setup',request())).status,409);
 assert.equal((await f.post(f.owner,'claim',{id:'existing'})).status,403);
});

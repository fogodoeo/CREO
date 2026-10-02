'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const route='/api/platform/national-vendor-directory';
async function setup(options){const f=await createFixture(options);await f.repository.upsertRecord('national-cre','setting',{id:'vendor-access-policy',mode:'preregistration-only-v1'});return f;}
const input=(overrides={})=>({id:'test-seoul',name:'서울 테스트',region:'서울',loginPhone:'01000000001',...overrides});
const admin=(f,body)=>f.call(f.client(),body?'POST':'GET',route,body,{'x-creo-admin':f.secret});
test('preregistration is administrator only, validates input, blocks public self-registration and conceals numbers',async t=>{
 const f=await setup();t.after(()=>f.close());
 assert.equal((await f.call(f.client(),'POST',route,input())).status,401);
 assert.equal((await admin(f,input({loginPhone:'123'}))).status,422);
 assert.equal((await admin(f,input())).status,200);
 const c=await f.login('01000000002');
 assert.equal((await f.refresh(c)).json().preregisteredOnly,true);
 assert.equal((await f.post(c,'register',{name:'任意',region:'서울',phone:'01000000002'})).status,403);
 const list=await f.call(c,'GET','/api/platform/vendor-access/search?region='+encodeURIComponent('서울'));
 assert.equal(list.json().companies.length,1);assert.equal(list.json().companies[0].canClaim,false);
 assert.equal(list.body.includes('01000000001'),false);assert.equal(list.body.includes('loginPhone'),false);
 assert.equal((await f.call(f.client(),'GET','/api/platform/vendor-access/search?region='+encodeURIComponent('서울'))).status,401);
 assert.equal((await f.post(c,'claim',{id:'test-seoul'})).status,403);
 assert.equal((await f.post(c,'select',{id:'test-seoul'})).status,403);
});
test('verified representative claims once, survives restart, and another actor cannot claim or select',async t=>{
 const f=await setup();t.after(()=>f.close());await admin(f,input());
 const owner=await f.login('01000000001');
 const responses=await Promise.all([f.post(owner,'claim',{id:'test-seoul'}),f.post(owner,'claim',{id:'test-seoul'})]);
 assert.ok(responses.every(r=>r.status===200));assert.equal(responses.filter(r=>r.json().duplicate).length,1);
 f.restart();assert.equal((await f.refresh(owner)).json().companies.length,1);
 const profile=(await f.post(owner,'profile',{companyId:'test-seoul'})).json();assert.equal(profile.role,'owner');assert.equal(profile.members.length,1);
 const other=await f.login('01000000002');assert.equal((await f.post(other,'claim',{id:'test-seoul'})).status,403);
 assert.equal((await f.post(other,'profile',{companyId:'test-seoul'})).status,403);
 assert.equal((await admin(f,input({loginPhone:'01000000002',revision:2}))).status,409);
});
test('parallel duplicate preregistrations cannot create duplicate companies and stale edits fail',async t=>{
 const f=await setup();t.after(()=>f.close());
 const results=await Promise.all([admin(f,input()),admin(f,input({id:'another'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await admin(f,input())).json().duplicate,true);
 assert.equal((await admin(f,input({loginPhone:'01000000002',revision:0}))).status,409);
 assert.equal((await admin(f,input({loginPhone:'01000000002',revision:1}))).status,200);
 const old=await f.login('01000000001');assert.equal((await f.post(old,'claim',{id:'test-seoul'})).status,403);
 const updated=await f.login('01000000002');assert.equal((await f.post(updated,'claim',{id:'test-seoul'})).status,200);
 assert.equal((await admin(f)).json().companies.length,1);
});
test('staff requires owner approval; duplicate approval is idempotent and staff cannot edit bank',async t=>{
 const f=await setup();t.after(()=>f.close());await admin(f,input());
 const staff=await f.login('01000000002');
 assert.equal((await f.post(staff,'join',{companyId:'test-seoul',name:'직원',sharingConsent:true})).status,409);
 const owner=await f.login('01000000001');await f.post(owner,'claim',{id:'test-seoul'});
 const joined=await f.post(staff,'join',{companyId:'test-seoul',name:'직원',sharingConsent:true});assert.equal(joined.status,200);
 assert.equal((await f.post(staff,'select',{id:'test-seoul'})).status,403);
 assert.equal((await f.post(staff,'join-response',{id:joined.json().id,action:'approve'})).status,403);
 for(let i=0;i<2;i++)assert.equal((await f.post(owner,'join-response',{id:joined.json().id,action:'approve'})).status,200);
 assert.equal((await f.post(staff,'select',{id:'test-seoul'})).status,200);
 assert.equal((await f.post(staff,'profile',{companyId:'test-seoul',action:'bank'})).status,403);
 assert.equal((await f.post(owner,'profile',{companyId:'test-seoul'})).json().members.length,2);
});
test('contact change does not change ownership; inactive vendor loses access',async t=>{
 const f=await setup();t.after(()=>f.close());await admin(f,input());
 const owner=await f.login('01000000001');await f.post(owner,'claim',{id:'test-seoul'});
 const v=await f.repository.getRecord('national-cre','vendor','test-seoul');
 await f.repository.upsertRecord('national-cre','vendor',{...v,phone:'01000000002'});
 const other=await f.login('01000000002');
 assert.equal((await f.post(other,'claim',{id:v.id})).status,403);assert.equal((await f.post(owner,'select',{id:v.id})).status,200);
 await f.repository.upsertRecord('national-cre','vendor',{...v,active:false});
 assert.equal((await f.post(owner,'select',{id:v.id})).status,403);assert.equal((await f.post(owner,'profile',{companyId:v.id})).status,403);
 assert.equal((await f.refresh(owner)).json().companies.length,0);
});
test('Kakao verified phone can claim; missing verified phone and cross-origin writes fail',async t=>{
 const f=await setup({apiOptions:{buyerAccountConfig:{enabled:true}}});t.after(()=>f.close());
 await admin(f,input());
 assert.equal((await f.call(f.client(),'POST',route,input({id:'evil'}),{'x-creo-admin':f.secret,origin:'https://foreign.invalid'})).status,403);
 const {createVendorAccess}=require('../vendor-access'),{Readable}=require('node:stream');
 let verifiedPhone='',accountId='no-phone';
 const access=createVendorAccess({repository:f.repository,secret:f.secret,origin:f.origin,channelFor:async()=>true,vendorsFor:()=>f.repository.listRecords('national-cre','vendor'),buyerAccount:{enabled:true,session:async()=>({accountId,verifiedPhone})}});
 const c=f.client();
 async function call(method,path,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={origin:f.origin,cookie:Object.entries(c.jar).map(([k,v])=>k+'='+v).join('; '),'x-vendor-csrf':c.csrf};
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
  await access.handle(req,res,new URL('/api/platform/vendor-access/'+path,f.origin));
  for(const cookie of res.headers['Set-Cookie']||[]){const [k,v]=cookie.split(';')[0].split('=');c.jar[k]=v;}
  if(path==='session')c.csrf=res.body.csrfToken;return res;
 }
 await call('GET','session');assert.equal((await call('POST','kakao',{})).status,200);await call('GET','session');
 assert.equal((await call('POST','claim',{id:'test-seoul'})).status,403);
 verifiedPhone='+82 10-0000-0001';accountId='kakao-test';
 await call('POST','kakao',{});await call('GET','session');
 assert.equal((await call('POST','claim',{id:'test-seoul'})).status,200);
 const token=(await call('POST','select',{id:'test-seoul'})).body.token;
 assert.equal((await access.authorize(access.verifyToken(token))).role,'owner');
 await call('POST','logout',{});assert.equal(await access.authorize(access.verifyToken(token)),null);
});
test('existing vendor id, bank and entries remain intact when registering login access',async t=>{
 const f=await setup();t.after(()=>f.close());
 await f.repository.upsertRecord('national-cre','vendor',{id:'existing',name:'기존 업체',phone:'01000000009',bankName:'가상은행',bankAccount:'000001',broadcastRegion:'대구·경북'});
 await f.repository.upsertRecord('national-cre','item',{id:'old-item',vendorId:'existing',name:'기존 개체'});
 assert.equal((await admin(f,input({id:'existing',name:'기존 업체',region:'대구·경북'}))).status,200);
 const saved=await f.repository.getRecord('national-cre','vendor','existing');
 assert.equal(saved.phone,'01000000009');assert.equal(saved.bankAccount,'000001');assert.equal(saved.loginPhone,undefined);
 const owner=await f.login('01000000001');assert.equal((await f.post(owner,'claim',{id:'existing'})).status,200);
 assert.equal((await f.repository.getRecord('national-cre','item','old-item')).vendorId,'existing');
 assert.equal((await f.call(owner,'POST','/api/platform/vendor-access/select',{id:'existing'},{'x-vendor-csrf':'wrong'})).status,403);
});
test('failed atomic write leaves neither directory nor vendor behind',async t=>{
 const f=await setup();t.after(()=>f.close());const original=f.repository.compareAndSwapRows.bind(f.repository);
 f.repository.compareAndSwapRows=async()=>{throw Error('storage unavailable');};
 assert.equal((await admin(f,input())).status>=500,true);
 f.repository.compareAndSwapRows=original;
 assert.equal((await admin(f)).json().companies.length,0);
 assert.equal((await admin(f,input())).status,200);
});

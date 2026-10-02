'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs'),{channelKey}=require('../platform-core');
async function setup(t){const f=await createFixture();t.after(()=>f.close());await f.repository.deleteRow(channelKey('national-cre','setting','vendor-access-policy'));return f;}
const body=(overrides={})=>({name:'신규 업체',region:'대구·경북',phone:'01000000001',requestId:crypto.randomUUID(),...overrides});
const directory=f=>f.call(f.client(),'GET','/api/platform/national-vendor-directory',undefined,{'x-creo-admin':f.secret});
test('default onboarding allows verified self-registration and existing admin preregistration together',async t=>{
 const f=await setup(t),c=await f.login('01000000001');
 assert.equal((await f.refresh(c)).json().preregisteredOnly,false);
 const created=await f.post(c,'register',body({loginPhone:'01000000099',ownerId:'forged'}));assert.equal(created.status,200,created.body);
 const v=await f.repository.getRecord('national-cre','vendor',created.json().id);assert.equal(v.phone,'01000000001');assert.equal(v.loginPhone,undefined);
 assert.equal((await directory(f)).json().companies[0].loginPhone,'01000000001');
 assert.equal((await f.post(c,'profile',{companyId:v.id})).json().role,'owner');
 assert.equal((await f.post(c,'select',{id:v.id})).status,200);
});
test('same request is idempotent across concurrent submits and restart; changed request body is rejected',async t=>{
 const f=await setup(t),c=await f.login('01000000001'),input=body();
 const results=await Promise.all([f.post(c,'register',input),f.post(c,'register',input)]);
 assert.ok(results.every(r=>r.status===200));assert.equal(results[0].json().id,results[1].json().id);
 f.restart();assert.equal((await f.post(c,'register',input)).json().duplicate,true);
 assert.equal((await f.post(c,'register',{...input,name:'다른 업체'})).status,409);
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,1);
});
test('different actors racing to register equivalent names create only one company and expose no private info',async t=>{
 const f=await setup(t),a=await f.login('01000000001'),b=await f.login('01000000002');
 const results=await Promise.all([f.post(a,'register',body({name:'ＣＲＥＯ 테스트'})),f.post(b,'register',body({name:'creo테스트',phone:'01000000002'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const denied=results.find(r=>r.status===409).json();assert.equal(denied.existingCompany.name.length>0,true);
 assert.deepEqual(Object.keys(denied.existingCompany).sort(),['id','name','region']);
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,1);
});
test('pre-existing vendor without access directory blocks duplicate registration and appears in selection',async t=>{
 const f=await setup(t),c=await f.login('01000000001');
 await f.repository.upsertRecord('national-cre','vendor',{id:'pre-existing',name:'신규 업체',broadcastRegion:'대구·경북',phone:'01000000009',active:true});
 const denied=await f.post(c,'register',body());assert.equal(denied.status,409);assert.equal(denied.json().existingCompany.id,'pre-existing');
 const list=await f.call(c,'GET','/api/platform/vendor-access/search?region='+encodeURIComponent('대구·경북'));
 assert.equal(list.json().companies[0].canClaim,false);assert.equal(list.json().companies[0].canJoin,false);
 assert.equal((await f.post(c,'claim',{id:'pre-existing'})).status,404);
});
test('owner can register a distinct company without silently redirecting to the previous company',async t=>{
 const f=await setup(t),c=await f.login('01000000001');
 const first=await f.post(c,'register',body()),second=await f.post(c,'register',body({name:'두 번째 업체'}));
 assert.equal(second.status,200);assert.notEqual(first.json().id,second.json().id);
 assert.equal((await f.refresh(c)).json().companies.length,2);
});
test('changed contact requires proof, keeps login identity, and receipt retry succeeds after proof expiration',async t=>{
 const f=await setup(t),c=await f.login('01000000001'),input=body({phone:'01000000002'});
 assert.equal((await f.post(c,'register',input)).status,422);
 const sent=await f.post(c,'otp',{phone:input.phone,purpose:'register'});
 const code=f.sms.at(-1).fallbackText.match(/\d{6}/)[0];
 const proof=await f.post(c,'verify',{challenge:sent.json().challenge,code});input.proof=proof.json().proof;
 const registered=await f.post(c,'register',input);assert.equal(registered.status,200,registered.body);
 const row=(await directory(f)).json().companies[0];assert.equal(row.loginPhone,'01000000001');
 assert.equal((await f.repository.getRecord('national-cre','vendor',row.id)).phone,'01000000002');
 f.advance(6*60000);
 assert.equal((await f.post(c,'register',input)).json().duplicate,true);
 const other=await f.login('01000000002');assert.equal((await f.post(other,'select',{id:row.id})).status,403);
 assert.equal((await f.post(other,'claim',{id:row.id})).status,403);
 const stale=await f.post(c,'register',{...input,name:'추가 업체',requestId:crypto.randomUUID()});assert.equal(stale.status,422);
});
test('registration rejects invalid region, blank normalized name, unauthenticated and wrong CSRF requests',async t=>{
 const f=await setup(t),c=await f.login('01000000001');
 for(const input of [body({region:'임의 지역'}),body({name:'\u200b'}),body({phone:'123'}),body({requestId:'bad'})])assert.equal((await f.post(c,'register',input)).status,422);
 assert.equal((await f.call(c,'POST','/api/platform/vendor-access/register',body(),{'x-vendor-csrf':'wrong'})).status,403);
 const anon=f.client();await f.refresh(anon);assert.equal((await f.post(anon,'register',body())).status,401);
 assert.equal((await f.repository.listRecords('national-cre','vendor')).length,0);
});
test('failed registration transaction can retry without ghost membership',async t=>{
 const f=await setup(t),c=await f.login('01000000001'),input=body(),save=f.repository.compareAndSwapRows.bind(f.repository);
 f.repository.compareAndSwapRows=async()=>{throw Error('temporary write failure');};
 assert.equal((await f.post(c,'register',input)).status,503);
 f.repository.compareAndSwapRows=save;assert.equal((await f.refresh(c)).json().companies.length,0);
 assert.equal((await f.post(c,'register',input)).status,200);
});
test('Kakao registration uses the current verified number, rejects missing scope and distrusts stale actor phone',async t=>{
 const f=await setup(t),{createVendorAccess}=require('../vendor-access'),{Readable}=require('node:stream');
 let verifiedPhone='01000000001';
 const access=createVendorAccess({repository:f.repository,secret:f.secret,origin:f.origin,channelFor:async()=>true,vendorsFor:()=>f.repository.listRecords('national-cre','vendor'),buyerAccount:{enabled:true,session:async()=>({accountId:'same-kakao',verifiedPhone})}});
 const c=f.client();
 async function call(method,path,body){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={origin:f.origin,cookie:Object.entries(c.jar).map(([k,v])=>k+'='+v).join('; '),'x-vendor-csrf':c.csrf};
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
  await access.handle(req,res,new URL('/api/platform/vendor-access/'+path,f.origin));
  for(const cookie of [].concat(res.headers['Set-Cookie']||[])){const [k,v]=cookie.split(';')[0].split('=');c.jar[k]=v;}
  if(path==='session')c.csrf=res.body.csrfToken;return res;
 }
 await call('GET','session');await call('POST','kakao',{});await call('GET','session');
 verifiedPhone='';await call('POST','kakao',{});await call('GET','session');
 assert.equal((await call('POST','register',body())).status,403);
 verifiedPhone='+82 10-0000-0002';await call('POST','kakao',{});await call('GET','session');
 assert.equal((await call('POST','register',body())).status,422);
 const created=await call('POST','register',body({phone:'01000000002'}));assert.equal(created.status,200);
 const result=await access.directory();assert.equal(result.companies[0].loginPhone,'01000000002');
});

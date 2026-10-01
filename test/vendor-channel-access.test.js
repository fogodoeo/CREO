'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const {createVendorDirectory}=require('../vendor-directory');
const {phone,createVendorAccess}=require('../vendor-access');
const {Readable}=require('node:stream');
async function fixture(t){
 const f=await createFixture();t.after(f.close);
 const channels=[['old-round','active'],['new-round','active'],['hidden-round','draft'],['paused-round','paused']].map(([id,status])=>normalizeChannel({id,name:id,status,dataAdapter:'platform',createdAt:id==='new-round'?'2026-10-01':'2026-09-01'}));
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,...channels]);
 for(const c of channels)await f.repository.upsertRecord(c.id,'vendor',{id:'owner',name:'기존 업체',phone:'010-0000-0001',inquiryPhone:'01000000002',active:true,bankName:'테스트은행',bankAccount:'000000',bankHolder:'테스트',paymentMethods:['bank_transfer','card']});
 await f.repository.upsertRecord('new-round','vendor',{id:'other',name:'다른 업체',phone:'01000000003',active:true});
 await f.repository.upsertRecord('new-round','vendor',{id:'empty',name:'번호 미등록',phone:'',active:true});
 await f.repository.upsertRecord('new-round','vendor',{id:'inactive',name:'비활성 업체',phone:'01000000001',active:false});
 return f;
}
test('verified business number finds existing channels without registration, duplicate vendors or inquiry-phone access',async t=>{
 const f=await fixture(t),anon=f.client();assert.equal((await f.refresh(anon)).json().participations,undefined);
 const owner=await f.login('01000000001'),view=(await f.refresh(owner)).json();
 assert.equal(view.channelLogin,true);assert.equal(view.phoneVerificationRequired,false);
 assert.deepEqual(view.participations.map(p=>p.channelId),['new-round','old-round']);
 assert.ok(view.participations.every(p=>p.vendorId==='owner'&&!('phone' in p)&&!('bankAccount' in p)));
 await Promise.all(Array.from({length:5},()=>f.refresh(owner)));f.restart();assert.deepEqual((await f.refresh(owner)).json().participations,view.participations);
 assert.equal((await f.repository.listRecords('new-round','vendor')).length,4);
 const inquiry=await f.login('01000000002');assert.deepEqual((await f.refresh(inquiry)).json().participations,[]);
 assert.equal((await f.post(inquiry,'select',{channelId:'new-round',vendorId:'owner'})).status,403);
 assert.equal((await f.post(owner,'select',{channelId:'new-round',vendorId:'other'})).status,403);
});
test('selected channel token authorizes actual entries and profile saving; tampering, other channels and logout fail closed',async t=>{
 const f=await fixture(t),owner=await f.login('01000000001');
 const token=(await f.post(owner,'select',{channelId:'new-round',vendorId:'owner'})).json().token;
 const get=path=>f.call(owner,'GET',path+'?event=new-round&token='+token);
 let entry=await get('/api/platform/vendor-entries');assert.equal(entry.status,200,entry.body);assert.deepEqual(entry.json().state.events.map(e=>e.id),['new-round']);
 const payload=(await get('/api/platform/vendor-checkout')).json();assert.equal(payload.vendor.name,'기존 업체');
 const saved=await f.call(owner,'POST','/api/platform/vendor-checkout/settings',{event:'new-round',token,directoryRevision:payload.vendor.directoryRevision,phone:'01000000001',bankName:'테스트은행',bankAccount:'000000',bankHolder:'테스트',cardEnabled:true});assert.equal(saved.status,200,saved.body);
 assert.ok(saved.json().vendor.paymentMethods.includes('card'));
 assert.equal((await f.call(owner,'GET','/api/platform/vendor-checkout?event=old-round&token='+token)).status,401);
 assert.equal((await f.call(owner,'GET','/api/platform/vendor-checkout?token='+token+'x')).status,401);
 f.restart();assert.equal((await get('/api/platform/vendor-checkout')).status,200);
 await f.post(owner,'logout',{});assert.equal((await get('/api/platform/vendor-checkout')).status,401);
});
test('shared contact changes, deactivation, expiry and storage failure revoke phone access instead of retaining stale ownership',async t=>{
 const f=await fixture(t),owner=await f.login('01000000001'),select=()=>f.post(owner,'select',{channelId:'new-round',vendorId:'owner'});
 const token=(await select()).json().token,route='/api/platform/vendor-checkout?event=new-round&token='+token;
 const directory=createVendorDirectory(f.repository);await directory.enroll('new-round','owner');const v=await directory.find('new-round','owner');
 await directory.update('new-round',{...v,phone:'01000000004'},v.directoryRevision);
 assert.equal((await f.call(owner,'GET',route)).status,401);assert.equal((await select()).status,403);
 const updated=await directory.find('new-round','owner');await directory.update('new-round',{...updated,phone:'01000000001'},updated.directoryRevision);
 assert.equal((await f.call(owner,'GET',route)).status,200);
 await f.repository.upsertRecord('new-round','vendor',{...await f.repository.getRecord('new-round','vendor','owner'),active:false});assert.equal((await f.call(owner,'GET',route)).status,401);
 const list=f.repository.listRecords.bind(f.repository);f.repository.listRecords=async()=>{throw Error('isolated storage failure')};assert.equal((await f.refresh(owner)).status,503);assert.equal((await select()).status,503);f.repository.listRecords=list;
 f.advance(31*86400000);assert.equal((await f.call(owner,'GET',route)).status,401);
});
test('Kakao uses the currently verified phone, not the account old phone, and missing scope cannot claim a vendor',async t=>{
 const f=await fixture(t);let verifiedPhone='+82 10-0000-0001';
 const access=createVendorAccess({repository:f.repository,secret:f.secret,origin:f.origin,buyerAccount:{enabled:true,session:async()=>({accountId:'same-kakao-account',verifiedPhone})},vendorsFor:async()=>[],channelFor:async()=>null,existingVendorsFor:async number=>number==='01000000001'?[{channelId:'new-round',vendorId:'owner'}]:[]});
 const c={jar:{},csrf:''};
 async function call(method,route,body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={origin:f.origin,cookie:Object.entries(c.jar).map(([k,v])=>k+'='+v).join('; '),'x-vendor-csrf':c.csrf};const res={writeHead(s,h){this.status=s;this.headers=h},end(b){this.data=JSON.parse(b)}};await access.handle(req,res,new URL('/api/platform/vendor-access/'+route,f.origin));for(const raw of res.headers['Set-Cookie']||[]){const[k,v]=raw.split(';')[0].split('=');c.jar[k]=v}if(route==='session')c.csrf=res.data.csrfToken;return res;}
 await call('GET','session');await call('POST','kakao',{});let v=await call('GET','session');assert.equal(v.data.participations.length,1);
 verifiedPhone='+82 10-0000-0003';await call('POST','kakao',{});v=await call('GET','session');assert.equal(v.data.phone,'01000000003');assert.deepEqual(v.data.participations,[]);
 verifiedPhone='';await call('POST','kakao',{});v=await call('GET','session');assert.equal(v.data.phoneVerificationRequired,true);assert.deepEqual(v.data.participations,[]);assert.equal((await call('POST','select',{channelId:'new-round',vendorId:'owner'})).status,403);
 assert.equal(phone('+82 10-0000-0001'),'01000000001');assert.equal(phone('0100000000'),'');
});

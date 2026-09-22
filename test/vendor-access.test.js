'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
async function fixture(t){const f=await createFixture();t.after(f.close);return f;}
async function register(f,c,name='테스트'){const r=await f.post(c,'register',{name,region:'대구·경북',phone:(await f.refresh(c)).json().phone});assert.equal(r.status,200,r.body);return r.json().id;}
test('SMS authentication binds browser and CSRF, persists, rejects replay, expires and rate limits',async t=>{
 const f=await fixture(t),c=f.client(),other=f.client();await f.refresh(c);await f.refresh(other);
 assert.equal((await f.call(c,'POST','/api/platform/vendor-access/otp',{phone:'01000000001'},{origin:'https://evil.invalid'})).status,403);
 const otp=await f.post(c,'otp',{phone:'01000000001'}),code=f.sms.at(-1).fallbackText.match(/\d{6}/)[0],proof={challenge:otp.json().challenge,code,remember:true};assert.equal(otp.status,200);
 assert.equal((await f.post(other,'verify',proof)).status,422);
 assert.equal((await f.post(c,'verify',{...proof,code:'bad'})).status,422);
 assert.equal((await f.post(c,'verify',proof)).status,200);await f.refresh(c);
 assert.equal((await f.post(c,'verify',proof)).status,422);assert.equal((await f.post(c,'otp',{phone:'01000000001'})).status,429);
 f.restart();assert.equal((await f.refresh(c)).json().phone,'01000000001');f.advance(31*86400000);assert.equal((await f.refresh(c)).json().authenticated,false);
});
test('one company survives concurrent registration and restart; scoped tokens revoke at logout',async t=>{
 const f=await fixture(t),c=await f.login('01000000001'),body={name:'테스트',region:'대구·경북',phone:'01000000001'};
 const results=await Promise.all([f.post(c,'register',body),f.post(c,'register',body)]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].json().id,results[1].json().id);
 const id=results[0].json().id,token=(await f.post(c,'select',{id})).json().token;
 let bookings=await f.call(c,'GET','/api/platform/vendor-bookings?event=national-cre&token='+token);assert.equal(bookings.status,200,bookings.body);assert.equal(bookings.json().vendor.region,'대구·경북');
 assert.equal((await f.call(c,'GET','/api/platform/vendor-bookings?event=other&token='+token)).status,401);
 const reserve={token,event:'national-cre',type:'reserve',date:'2026-09-28',quantity:8,requestId:randomUUID()};assert.equal((await f.call(c,'POST','/api/platform/vendor-bookings',reserve)).status,200);
 f.restart();assert.equal((await f.refresh(c)).json().companies.length,1);assert.equal((await f.call(c,'POST','/api/platform/vendor-bookings',reserve)).json().duplicate,true);
 await f.post(c,'logout',{});assert.equal((await f.call(c,'GET','/api/platform/vendor-bookings?token='+token)).status,401);
});
test('staff requires owner approval; contact changes cannot transfer ownership or notification recipient',async t=>{
 const f=await fixture(t),owner=await f.login('01000000001'),staff=await f.login('01000000002'),stranger=await f.login('01000000003'),id=await register(f,owner);
 assert.equal((await f.post(staff,'select',{id})).status,403);
 const join=await f.post(staff,'join',{companyId:id,name:'직원'}),request=join.json().id;
 assert.equal((await f.post(stranger,'join-response',{id:request,action:'approve'})).status,403);
 const p=(await f.post(owner,'profile',{companyId:id})).json();assert.equal(p.requests.length,1);
 assert.equal((await f.post(owner,'profile',{companyId:id,action:'contact',phone:'01000000004',revision:p.revision})).status,422);
 const otp=(await f.post(owner,'otp',{phone:'01000000004',purpose:'contact'})).json(),code=f.sms.at(-1).fallbackText.match(/\d{6}/)[0];
 const proof=(await f.post(owner,'verify',{challenge:otp.challenge,code})).json().proof;
 const saved=await f.post(owner,'profile',{companyId:id,action:'contact',phone:'01000000004',proof,revision:p.revision});assert.equal(saved.status,200,saved.body);
 assert.equal((await f.refresh(owner)).json().phone,'01000000001');assert.equal((await f.repository.listRecords('national-cre','notification'))[0].recipientPhone,'01000000001');
 const approval={id:request,action:'approve'};assert.equal((await f.post(owner,'join-response',approval)).status,200);assert.equal((await f.post(owner,'join-response',approval)).json().duplicate,true);
 const staffProfile=(await f.post(staff,'profile',{companyId:id})).json();assert.equal(staffProfile.role,'staff');assert.equal(staffProfile.phone,'01000000004');assert.equal(staffProfile.bankAccount,undefined);
 const token=(await f.post(staff,'select',{id})).json().token;
 assert.equal((await f.post(staff,'profile',{companyId:id,action:'bank'})).status,403);
 assert.equal((await f.call(staff,'POST','/api/platform/vendor-checkout/settings',{token,event:'national-cre',phone:'01000000002'})).status,403);
 assert.equal((await f.call(staff,'GET','/api/platform/vendor-entries?event=national-cre&token='+token)).status,200);
 assert.equal((await f.post(staff,'join-response',{id:request,action:'cancel'})).status,409);
});
test('wrong OTP attempt budget, expiry, provider failures and write failures fail closed',async t=>{
 const f=await fixture(t),c=f.client();await f.refresh(c);let otp=(await f.post(c,'otp',{phone:'01000000001'})).json();
 const code=f.sms.at(-1).fallbackText.match(/\d{6}/)[0],wrong=code==='000000'?'111111':'000000';
 for(let i=0;i<5;i++)assert.equal((await f.post(c,'verify',{challenge:otp.challenge,code:wrong})).status,422);
 assert.equal((await f.post(c,'verify',{challenge:otp.challenge,code})).status,422);
 otp=(await f.post(c,'otp',{phone:'01000000002'})).json();f.advance(180000);assert.equal((await f.post(c,'verify',{challenge:otp.challenge,code:f.sms.at(-1).fallbackText.match(/\d{6}/)[0]})).status,422);
 f.provider.sendSms=async()=>{throw Error('provider unavailable')};assert.equal((await f.post(c,'otp',{phone:'01000000003'})).status,502);assert.equal((await f.refresh(c)).json().authenticated,false);
});
test('portal signing key persists separately, rejects corrupt storage and does not use weak operator passwords',async t=>{
 const f=await fixture(t),{vendorAccessSecret}=require('../vendor-access-secret'),repo={durable:true,dbPath:f.repository.dbPath};
 const key=vendorAccessSecret({repository:repo});assert.equal(key.length,64);assert.equal(vendorAccessSecret({repository:repo}),key);
 assert.equal(vendorAccessSecret({repository:{...repo,durable:false}}),'');assert.equal(vendorAccessSecret({repository:repo,secret:'weak'}),'');
 const fs=require('node:fs'),path=require('node:path');fs.writeFileSync(path.join(path.dirname(repo.dbPath),'vendor-access.key'),'corrupted');assert.equal(vendorAccessSecret({repository:repo}),'');
});
test('registration write failure is atomic; stale bank revisions cannot overwrite a saved profile',async t=>{
 const f=await fixture(t),c=await f.login('01000000001');
 f.repository.db.exec("CREATE TRIGGER reject_new_vendor BEFORE INSERT ON platform_kv WHEN NEW.key LIKE '%::vendor::%' BEGIN SELECT RAISE(ABORT,'isolated vendor failure'); END");
 assert.equal((await f.post(c,'register',{name:'테스트',region:'대구·경북',phone:'01000000001'})).status,503);assert.equal((await f.refresh(c)).json().companies.length,0);
 f.repository.db.exec('DROP TRIGGER reject_new_vendor');const id=await register(f,c),p=(await f.post(c,'profile',{companyId:id})).json();
 const bank={companyId:id,action:'bank',revision:p.revision,bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'};
 assert.equal((await f.post(c,'profile',bank)).status,200);assert.equal((await f.post(c,'profile',{...bank,bankAccount:'111111'})).status,409);
 assert.equal((await f.post(c,'profile',{companyId:id})).json().bankAccount,'000000');
 const token=(await f.post(c,'select',{id})).json().token;assert.ok(token.startsWith('va1.'));
 assert.equal((await f.call(c,'GET','/api/platform/vendor-bookings?token='+token.slice(0,-2)+'xx')).status,401);
});

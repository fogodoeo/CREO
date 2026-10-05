'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {createVendorDirectory}=require('../vendor-directory');
async function fixture(t){
 const uploads=[],storage={put:async(_scope,name,bytes)=>{uploads.push(bytes);return {url:'/api/broadcast-assets/vendor-logos/'+name};}};
 const f=await createFixture({apiOptions:{vendorLogoStorage:storage}});t.after(f.close);
 await f.repository.upsertRecord('national-cre','vendor',{id:'legacy-vendor',name:'전용 링크 업체',active:true,phone:'01000000001',bankName:'가상은행',bankAccount:'000000',bankHolder:'가상업체',paymentMethods:['bank_transfer','card']});
 const link=await f.call(f.client(),'POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:'legacy-vendor'},{'x-creo-admin':f.secret});assert.equal(link.status,200,link.body);
 const url=new URL(link.json().url,f.origin),code=url.searchParams.get('code')||url.pathname.split('/').pop();
 const auth={code,event:'national-cre'};
 f.read=()=>f.call(f.client(),'GET','/api/platform/vendor-checkout?'+new URLSearchParams(auth));
 f.save=body=>f.call(f.client(),'POST','/api/platform/vendor-checkout/logo',{...auth,...body});
 f.image='data:image/png;base64,'+(await require('sharp')({create:{width:400,height:600,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 return Object.assign(f,{uploads,storage,auth,directory:createVendorDirectory(f.repository)});
}
test('short link logo works without bank edits, is durable, shared across channels and removable',async t=>{
 const f=await fixture(t),before=(await f.read()).json().vendor;
 assert.equal(before.logoUrl,'');
 const first=await f.save({data:f.image,directoryRevision:before.directoryRevision});assert.equal(first.status,200,first.body);
 const p=await f.directory.profileFor('national-cre','legacy-vendor');
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,require('../platform-core').normalizeChannel({id:'other',name:'다른 경매',status:'active',dataAdapter:'platform'})]);
 const member=await f.directory.attach(p.id,'other');f.restart();
 const after=(await f.read()).json().vendor;assert.ok(after.logoUrl.endsWith('.webp'));
 for(const key of ['phone','bankName','bankAccount','bankHolder','paymentMethods'])assert.deepEqual(after[key],before[key]);
 assert.equal((await f.directory.find('other',member.vendorId)).logoUrl,after.logoUrl);
 const meta=await require('sharp')(f.uploads[0]).metadata();assert.equal(meta.format,'webp');assert.equal(meta.height,320);
 const remove=await f.save({remove:true,directoryRevision:after.directoryRevision});assert.equal(remove.status,200,remove.body);
 f.restart();assert.equal((await f.read()).json().vendor.logoUrl,'');assert.equal((await f.directory.find('other',member.vendorId)).logoUrl,'');
});
test('duplicate and concurrent logo saves reject stale revisions before storing another image',async t=>{
 const f=await fixture(t);await f.directory.enroll('national-cre','legacy-vendor');
 const payload={data:f.image,directoryRevision:(await f.read()).json().vendor.directoryRevision};
 const results=await Promise.all([f.save(payload),f.save(payload)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.uploads.length,1);
 assert.equal((await f.save(payload)).status,409);assert.equal(f.uploads.length,1);
});
test('invalid files, missing revisions, expired access and storage failures preserve the existing logo',async t=>{
 const f=await fixture(t);await f.directory.enroll('national-cre','legacy-vendor');
 let before=(await f.read()).json().vendor;assert.equal((await f.save({data:f.image,directoryRevision:before.directoryRevision})).status,200);
 before=(await f.read()).json().vendor;
 assert.equal((await f.save({data:f.image})).status,409);
 assert.equal((await f.save({data:'data:image/svg+xml;base64,AAAA',directoryRevision:before.directoryRevision})).status,422);
 assert.equal((await f.save({code:'invalid-code',data:f.image,directoryRevision:before.directoryRevision})).status,401);
 f.storage.put=async()=>{throw Error('storage unavailable');};
 assert.equal((await f.save({data:f.image,directoryRevision:before.directoryRevision})).status,503);
 assert.deepEqual((await f.read()).json().vendor,before);
 await f.repository.upsertRecord('national-cre','vendor',{...await f.directory.find('national-cre','legacy-vendor'),active:false});
 assert.equal((await f.save({remove:true,directoryRevision:before.directoryRevision})).status,401);
});
test('account staff cannot bypass owner permissions through the legacy logo endpoint',async t=>{
 const f=await fixture(t),owner=await f.login('01000000003');
 const id=(await f.post(owner,'register',{name:'회원 업체',region:'서울',phone:'01000000003'})).json().id;
 const staff=await f.login('01000000004'),join=(await f.post(staff,'join',{companyId:id,name:'직원',sharingConsent:true})).json();
 assert.equal((await f.post(owner,'join-response',{id:join.id,action:'approve'})).status,200);
 const token=(await f.post(staff,'select',{id})).json().token;
 const r=await f.call(staff,'POST','/api/platform/vendor-checkout/logo',{token,event:'national-cre',data:f.image,directoryRevision:1});assert.equal(r.status,403,r.body);assert.equal(f.uploads.length,0);
});
test('logo UI saves independently and keeps unsaved contact fields and dirty state on success or failure',async()=>{
 const source=fs.readFileSync(require.resolve('../public/vendor-entry-app.js'),'utf8');
 const code=source.slice(source.indexOf('  function bindProfileLogo('),source.indexOf('  function radioGroup('));
 const nodes=new Map(),errors=[];const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'unsaved',disabled:false,focus(){}});return nodes.get(id);};
 const context=vm.createContext({busy:false,uploading:false,profile:{logoUrl:'/old.webp',directoryRevision:2},profileDirty:true,$,eventControls(){},errorAt:(id,message)=>errors.push(message),profileLogoMarkup:()=>'<new logo>',Store:{logo:async()=>({logoUrl:'',directoryRevision:3})}});
 vm.runInContext(code,context);await context.saveProfileLogo(null);
 assert.equal($('profile-phone').value,'unsaved');assert.equal(context.profileDirty,true);assert.equal(context.profile.directoryRevision,3);assert.equal(context.profile.logoUrl,'');
 context.Store.logo=async()=>{throw Error('다시 시도해 주세요.');};await context.saveProfileLogo(null);
 assert.equal(context.profile.directoryRevision,3);assert.equal(context.busy,false);assert.equal($('profile-save').disabled,false);assert.ok(errors.includes('다시 시도해 주세요.'));
});

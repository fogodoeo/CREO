'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fs=require('node:fs'),vm=require('node:vm');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {channelKey}=require('../platform-core');
async function fixture(t,apiOptions={}){
 const f=await createFixture({apiOptions});t.after(f.close);const guest=f.client();
 const get=path=>f.call(guest,'GET','/api/platform/promo-library'+(path||''));
 const admin=()=>f.call(guest,'GET','/api/platform/promo-center?month=2026-10',undefined,{'x-creo-admin':f.secret});
 const edit=body=>f.call(guest,'POST','/api/platform/promo-center',{requestId:randomUUID(),...body},{'x-creo-admin':f.secret});
 return {...f,guest,get,admin,edit};
}
test('anonymous library contains all active manuscripts, never assignments, usage, audit or company details',async t=>{
 const f=await fixture(t);const key=channelKey('national-cre','setting','promo-center');
 const service=require('../promo-center').createPromoCenter({repository:f.repository,vendorsFor:async()=>[]});
 await service.mutate({admin:true},{action:'capacity',capacity:2,revision:0,requestId:randomUUID()});
 const row=(await f.repository.getRowsByKeys([key]))[0],stored=JSON.parse(row.value);
 stored.assignments.push({id:'private-assignment',vendorId:'private-vendor',date:'2026-10-14',slot:'afternoon',templateId:stored.templates[0].id});
 stored.copies.push({vendorId:'private-vendor',templateId:stored.templates[0].id,at:1});
 stored.templates[0].internalNote='private-note';stored.audit.push({actor:'private-actor'});
 await f.repository.upsertRows([{key,value:JSON.stringify(stored)}]);
 const r=await f.get('?admin=1&company=private-vendor');assert.equal(r.status,200,r.body);
 assert.deepEqual(Object.keys(r.json()).sort(),['partners','templates']);
 assert.deepEqual(r.json().templates.map(x=>x.id),stored.templates.filter(x=>x.active!==false).map(x=>x.id));
 assert.doesNotMatch(r.body,/private-|"(?:assignments|copies|usage|published|audit|actor|phone|bankAccount|csrfToken|internalNote)"/);
 assert.deepEqual(Object.keys(f.guest.jar),[]);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('public GET reflects operator edits and hides archived manuscripts after reload and restart',async t=>{
 const f=await fixture(t);let state=(await f.admin()).json();const entry=state.templates.find(x=>x.active!==false);
 let r=await f.edit({action:'template',id:entry.id,revision:state.revision,name:entry.name,title:'운영자가 수정한 공개 제목',blocks:entry.blocks,active:true});assert.equal(r.status,200,r.body);
 f.restart();assert.equal((await f.get()).json().templates.find(x=>x.id===entry.id).title,'운영자가 수정한 공개 제목');
 state=(await f.admin()).json();r=await f.edit({action:'template',id:entry.id,revision:state.revision,name:entry.name,title:'보관한 원고',blocks:entry.blocks,active:false});assert.equal(r.status,200,r.body);
 f.restart();assert.equal((await f.get()).json().templates.some(x=>x.id===entry.id),false);
});
test('public library never permits mutations or grants access to authenticated management',async t=>{
 const f=await fixture(t);
 for(const method of ['POST','PUT','DELETE']){const r=await f.call(f.guest,method,'/api/platform/promo-library',{action:'assign',company:'anything'});assert.equal(r.status,405);}
 assert.equal((await f.get('/unknown')).status,405);
 assert.equal((await f.call(f.guest,'GET','/api/platform/promo-center?month=2026-10&company=anything')).status,401);
 assert.equal((await f.call(f.guest,'POST','/api/platform/promo-center',{action:'template',requestId:randomUUID()})).status,401);
 assert.equal((await f.call(f.guest,'GET','/api/platform/national-vendor-directory')).status,401);
});
test('public logo selection accepts only the current catalog and reuses one result across concurrent requests and restart',async t=>{
 let puts=0;const f=await fixture(t,{vendorLogoStorage:{put:async(_channel,_name,bytes)=>{puts++;assert.ok(bytes.length>0);return {url:'https://example.com/public-partners.png'};}}});
 await f.repository.upsertRecord('national-cre','vendor',{id:'sample',name:'서울 공개 업체',active:true,broadcastRegion:'서울·인천',phone:'01099999999',bankAccount:'private-account'});
 const state=(await f.get()).json(),path='/partners?mode=all&catalogVersion='+state.partners.version;
 const results=await Promise.all([f.get(path),f.get(path)]);for(const r of results){assert.equal(r.status,200,r.body);assert.equal(r.json().images.length,1);assert.doesNotMatch(r.body,/01099999999|private-account/);}
 assert.equal(puts,1);f.restart();assert.equal((await f.get(path)).status,200);assert.equal(puts,1);
 assert.equal((await f.get('/partners?mode=all&catalogVersion=old')).status,409);
 assert.equal((await f.get('/partners?mode=regions&region=99&catalogVersion='+state.partners.version)).status,422);
 assert.equal((await f.get('/partners?mode=arbitrary&catalogVersion='+state.partners.version)).status,422);
});
test('public listing storage failures do not return a fake empty successful catalog',async t=>{
 const f=await fixture(t),normal=f.repository.getRowsByKeys.bind(f.repository);
 f.repository.getRowsByKeys=async()=>{throw Error('isolated read failure')};assert.equal((await f.get()).status,500);
 f.repository.getRowsByKeys=normal;assert.ok((await f.get()).json().templates.length>0);
});
test('public copy preserves HTML and text without requiring or impersonating a vendor',async()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8'),writes=[];
 const nodes=new Map(['copy-status','detail'].map(k=>[k,{textContent:'',open:false}]));
 const ctx=vm.createContext({library:true,admin:false,copying:false,partnerReady:true,partnerImages:[],template:{id:'public'},
  syncCopyButtons(){},bodyHTML:()=>'<p>글</p><img src="https://example.com/photo.png"><p>다음 글</p>',plainBody:()=> '글\n다음 글',
  $:k=>nodes.get(k),Blob,ClipboardItem:class{constructor(value){this.value=value;}},window:{ClipboardItem:true},navigator:{clipboard:{write:async items=>writes.push(items),writeText:async value=>writes.push(value)}},
  request(){throw Error('anonymous copy must not send a vendor mutation');}});
 vm.runInContext(source.slice(source.indexOf(' async function copy('),source.indexOf(' let imageBundleController=')),ctx);
 await ctx.copy(true);assert.match(await writes[0][0].value['text/html'].text(),/글<\/p><img.*<p>다음 글/);assert.match(nodes.get('copy-status').textContent,/본문을 복사했어요/);
 await ctx.copy('plain');assert.equal(writes[1],'글\n다음 글');
});

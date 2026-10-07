'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPromoCenter}=require('../promo-center');
const seed=require('../promo-templates.json');
const {randomUUID}=require('node:crypto');
const key=require('../platform-core').channelKey('national-cre','setting','promo-center');
function fixture(){
 const templates=seed.filter(t=>['launch26-joseon','launch26-showtime','ep01-welcome'].includes(t.id)).map(t=>({...structuredClone(t),title:'운영자가 수정한 '+t.id,name:'운영자 이름',version:3,bundleVersion:4}));
 for(const t of templates)t.blocks[0].text='운영자가 다듬은 도입부 '+t.id;
 for(const id of ['launch26-easy','ep01-brief','launch26-collector'])templates.push({...structuredClone(templates[0]),id,title:'이전 원고 '+id});
 const accepted=templates.find(t=>t.id==='launch26-joseon');accepted.title='승인된 전하 원고';
 const saved={revision:10,catalogVersion:2,capacity:1,templates,assignments:[
  {id:'pending',vendorId:'vendor',templateId:'launch26-easy',date:'2026-10-14',slot:'afternoon'},
  {id:'done',vendorId:'vendor',templateId:'launch26-easy',date:'2026-10-07',slot:'afternoon',publication:{url:'https://cafe.naver.com/reptilia/12345',title:'게시한 예전 제목',version:3}}
  ,{id:'brief-pending',vendorId:'vendor',templateId:'ep01-brief',date:'2026-10-14',slot:'night'}
  ,{id:'collector-pending',vendorId:'vendor',templateId:'launch26-collector',date:'2026-10-15',slot:'afternoon'}
 ],copies:[{vendorId:'vendor',templateId:'launch26-easy',version:3,at:1}],audit:[],requests:[]};
 let raw=JSON.stringify(saved),writes=0;
 const repository={getRowsByKeys:async()=>[{key,value:raw}],compareAndSwapRows:async(_key,expected,rows)=>{if(raw!==expected)return false;raw=rows[0].value;writes++;return true;}};
 const create=()=>createPromoCenter({repository,vendorsFor:async()=>[{id:'vendor',name:'업체'}],now:()=>Date.parse('2026-10-08T12:00:00+09:00')});
 return {repository,create,get raw(){return raw},set raw(v){raw=v},get writes(){return writes}};
}
test('three new stories are added once, removed drafts are archived and all three approved manuscripts keep operator edits',async()=>{
 const f=fixture(),s=createView(f.create());const first=await s();
 assert.equal(first.revision,11);assert.equal(f.writes,1);
 assert.equal(first.templates.filter(t=>t.active!==false).length,6);
 const old=first.templates.find(t=>t.id==='launch26-easy');assert.equal(old.active,false);assert.equal(old.version,4);
 for(const id of ['launch26-showtime','ep01-welcome']){
  const preserved=first.templates.find(t=>t.id===id);assert.equal(preserved.version,3);assert.equal(preserved.title,'운영자가 수정한 '+id);
  assert.equal(preserved.blocks[0].text,'운영자가 다듬은 도입부 '+id);
 }
 assert.equal(first.templates.find(t=>t.id==='launch26-taste').version,1);
 assert.equal(first.templates.find(t=>t.id==='launch26-joseon').title,'승인된 전하 원고');
 assert.equal(first.assignments.find(a=>a.id==='pending').templateId,'ep01-welcome');
 assert.equal(first.assignments.find(a=>a.id==='brief-pending').templateId,'launch26-taste');
 assert.equal(first.assignments.find(a=>a.id==='collector-pending').templateId,'launch26-breeder');
 const done=first.assignments.find(a=>a.id==='done');assert.equal(done.templateId,'launch26-easy');assert.equal(done.publication.title,'게시한 예전 제목');assert.equal(done.publication.version,3);
 assert.equal(old.usage.length,1);await s();await createView(f.create())();assert.equal(f.writes,1);
 const post=await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:11,id:'ep01-welcome',name:'운영자 수정',title:'어떤 제목이든 수정 유지',blocks:first.templates.find(t=>t.id==='ep01-welcome').blocks,active:true});
 assert.equal(post.revision,12);assert.equal((await createView(f.create())()).templates.find(t=>t.id==='ep01-welcome').title,'어떤 제목이든 수정 유지');
 await assert.rejects(f.create().mutate({vendorId:'vendor'},{action:'copy',requestId:randomUUID(),templateId:'ep01-welcome',version:3}),e=>e.status===409);
});
function createView(service){return ()=>service.view({admin:true,month:'2026-10'});}
test('copy polish centers stored paragraphs and removes old notices without replacing operator text or publication history',async()=>{
 const f=fixture(),saved=JSON.parse(f.raw);saved.catalogVersion=3;
 const t=saved.templates.find(t=>t.id==='launch26-showtime');t.title='제가 고른 제목';t.bundleVersion=0;
 t.blocks[0].text='제가 직접 다듬은 문장';t.blocks[0].align='left';
 t.blocks.push({type:'text',text:'쌀쌀해진 환절기에 고속버스 택배 걱정 없이,\n집 근처 제휴 전문 매장에서 안전하게 아이를 인계받으실 수 있습니다.',size:16,align:'left'},
  {type:'text',text:'※ 사진은 샵 투어의 분위기를 연출한 이미지입니다.',size:16,align:'left'});
 const history=structuredClone(saved.assignments.find(a=>a.id==='done')),copies=structuredClone(saved.copies);f.raw=JSON.stringify(saved);
 const first=await createView(f.create())(),result=first.templates.find(t=>t.id==='launch26-showtime');
 assert.equal(result.title,'제가 고른 제목');
 assert.equal(result.version,4);assert.equal(result.blocks[0].text,'제가 직접 다듬은 문장');
 assert.ok(result.blocks.filter(b=>b.type==='text').every(b=>b.align==='center'));
 const text=result.blocks.map(b=>b.text||'').join('\n');assert.doesNotMatch(text,/택배|※ 사진/);assert.match(text,/생물 전문 배송업체/);
 assert.deepEqual(JSON.parse(f.raw).assignments.find(a=>a.id==='done'),history);assert.deepEqual(JSON.parse(f.raw).copies,copies);
 assert.equal(JSON.parse(f.raw).catalogVersion,4);assert.equal(f.writes,1);
 await createView(f.create())();assert.equal(f.writes,1);
 const edited=await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:first.revision,id:result.id,name:result.name,title:'나중에 또 다듬은 제목',blocks:result.blocks,active:true});
 const after=await createView(f.create())();assert.equal(after.revision,edited.revision);assert.equal(after.templates.find(t=>t.id===result.id).title,'나중에 또 다듬은 제목');
});
test('a migration retries a conflicting write and returns the committed revision, without losing concurrent history',async()=>{
 const f=fixture(),normal=f.repository.compareAndSwapRows;let collided=false;
 f.repository.compareAndSwapRows=async(...args)=>{
  if(!collided){collided=true;const current=JSON.parse(f.raw);current.revision++;current.copies.push({vendorId:'vendor',templateId:'launch26-easy',version:3,at:2});f.raw=JSON.stringify(current);return false;}
  return normal(...args);
 };
 const view=await createView(f.create())();assert.equal(view.revision,12);assert.equal(JSON.parse(f.raw).revision,12);assert.equal(view.templates.find(t=>t.id==='launch26-easy').usage.length,2);assert.equal(f.writes,1);
});
test('failed migration never reports an unsaved new catalog as successful',async()=>{
 const f=fixture();f.repository.compareAndSwapRows=async()=>false;
 await assert.rejects(createView(f.create())(),e=>e.status===409);
 assert.equal(JSON.parse(f.raw).revision,10);assert.equal(JSON.parse(f.raw).catalogVersion,2);
 f.repository.compareAndSwapRows=async()=>{throw Error('disk unavailable')};
 await assert.rejects(createView(f.create())(),/disk unavailable/);
});

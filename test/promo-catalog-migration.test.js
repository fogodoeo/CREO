'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPromoCenter}=require('../promo-center');
const seed=require('../promo-templates.json');
const {randomUUID}=require('node:crypto');
const key=require('../platform-core').channelKey('national-cre','setting','promo-center');
function fixture(){
 const templates=seed.map(t=>({...structuredClone(t),title:'이전 원고 '+t.id,name:'이전 이름',version:3,bundleVersion:4}));
 templates.push({...structuredClone(templates[0]),id:'launch26-easy',title:'이전 간편 원고'});
 const accepted=templates.find(t=>t.id==='launch26-joseon');accepted.title='승인된 전하 원고';
 const saved={revision:10,capacity:1,templates,assignments:[
  {id:'pending',vendorId:'vendor',templateId:'launch26-easy',date:'2026-10-14',slot:'afternoon'},
  {id:'done',vendorId:'vendor',templateId:'launch26-easy',date:'2026-10-07',slot:'afternoon',publication:{url:'https://cafe.naver.com/reptilia/12345',title:'게시한 예전 제목',version:3}}
 ],copies:[{vendorId:'vendor',templateId:'launch26-easy',version:3,at:1}],audit:[],requests:[]};
 let raw=JSON.stringify(saved),writes=0;
 const repository={getRowsByKeys:async()=>[{key,value:raw}],compareAndSwapRows:async(_key,expected,rows)=>{if(raw!==expected)return false;raw=rows[0].value;writes++;return true;}};
 const create=()=>createPromoCenter({repository,vendorsFor:async()=>[{id:'vendor',name:'업체'}],now:()=>Date.parse('2026-10-08T12:00:00+09:00')});
 return {repository,create,get raw(){return raw},set raw(v){raw=v},get writes(){return writes}};
}
test('curated replacement archives old drafts, updates pending assignment, preserves approved text and completed history once',async()=>{
 const f=fixture(),s=createView(f.create());const first=await s();
 assert.equal(first.revision,11);assert.equal(f.writes,1);
 assert.equal(first.templates.filter(t=>t.active!==false).length,5);
 const old=first.templates.find(t=>t.id==='launch26-easy');assert.equal(old.active,false);assert.equal(old.version,4);
 assert.equal(first.templates.find(t=>t.id==='ep01-welcome').version,4);
 assert.equal(first.templates.find(t=>t.id==='launch26-joseon').title,'승인된 전하 원고');
 assert.equal(first.assignments.find(a=>a.id==='pending').templateId,'ep01-welcome');
 const done=first.assignments.find(a=>a.id==='done');assert.equal(done.templateId,'launch26-easy');assert.equal(done.publication.title,'게시한 예전 제목');assert.equal(done.publication.version,3);
 assert.equal(old.usage.length,1);await s();await createView(f.create())();assert.equal(f.writes,1);
 const post=await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:11,id:'ep01-welcome',name:'운영자 수정',title:'어떤 제목이든 수정 유지',blocks:first.templates.find(t=>t.id==='ep01-welcome').blocks,active:true});
 assert.equal(post.revision,12);assert.equal((await createView(f.create())()).templates.find(t=>t.id==='ep01-welcome').title,'어떤 제목이든 수정 유지');
 await assert.rejects(f.create().mutate({vendorId:'vendor'},{action:'copy',requestId:randomUUID(),templateId:'ep01-welcome',version:3}),e=>e.status===409);
});
function createView(service){return ()=>service.view({admin:true,month:'2026-10'});}
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
 assert.equal(JSON.parse(f.raw).revision,10);assert.equal(JSON.parse(f.raw).catalogVersion,undefined);
 f.repository.compareAndSwapRows=async()=>{throw Error('disk unavailable')};
 await assert.rejects(createView(f.create())(),/disk unavailable/);
});

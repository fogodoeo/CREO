'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPromoCenter}=require('../promo-center');
const seed=require('../promo-templates.json');
const {randomUUID}=require('node:crypto');
const key=require('../platform-core').channelKey('national-cre','setting','promo-center');
function legacyTemplate(id,extra={}){
 const photo=require('../promo-image-additions.json').find(p=>p.templateId===id);
 return {
  id,name:'이전 원고 '+id,title:'운영자가 수정한 '+id,version:3,bundleVersion:4,active:true,catalogOrder:10,
  blocks:[
   {type:'text',text:'운영자가 다듬은 도입부 '+id,size:24,bold:true,color:'ink',align:'center'},
   {type:'text',text:'안내 문단 '+id,size:16,bold:false,color:'ink',align:'center'},
   ...(photo?[{type:'image',src:photo.src,copySrc:'https://creok.onrender.com'+photo.src,alt:photo.alt,width:500}]:[]),
   {type:'text',text:'👉 [전국크레자랑 공식 네이버 밴드 입장하기]',size:18,bold:true,color:'green',align:'center',href:'https://band.us/n/a6a6beMe97Ucc'}
  ],
  ...extra
 };
}
function fixture(){
 const templates=[
  legacyTemplate('launch26-joseon',{title:'승인된 전하 원고'}),
  legacyTemplate('launch26-showtime'),
  legacyTemplate('ep01-welcome'),
  legacyTemplate('launch26-taste'),
  legacyTemplate('launch26-tour'),
  legacyTemplate('launch26-breeder'),
  legacyTemplate('launch26-easy',{title:'이전 원고 launch26-easy'}),
  legacyTemplate('ep01-brief',{title:'이전 원고 ep01-brief'}),
  legacyTemplate('launch26-collector',{title:'이전 원고 launch26-collector'})
 ];
 const saved={revision:10,catalogVersion:2,capacity:1,templates,assignments:[
  {id:'pending',vendorId:'vendor',templateId:'ep01-welcome',date:'2026-10-19',slot:'afternoon'},
  {id:'done',vendorId:'vendor',templateId:'launch26-easy',date:'2026-10-07',slot:'afternoon',publication:{url:'https://cafe.naver.com/reptilia/12345',title:'게시한 예전 제목',version:3}},
  {id:'brief-pending',vendorId:'vendor',templateId:'launch26-taste',date:'2026-10-19',slot:'night'},
  {id:'collector-pending',vendorId:'vendor',templateId:'launch26-breeder',date:'2026-10-20',slot:'afternoon'},
  {id:'joseon-pending',vendorId:'vendor',templateId:'launch26-joseon',date:'2026-10-20',slot:'night'}
 ],copies:[{vendorId:'vendor',templateId:'launch26-easy',version:3,at:1}],audit:[],requests:[]};
 let raw=JSON.stringify(saved),writes=0;
 const repository={getRowsByKeys:async()=>[{key,value:raw}],compareAndSwapRows:async(_key,expected,rows)=>{if(raw!==expected)return false;raw=rows[0].value;writes++;return true;}};
 const create=()=>createPromoCenter({repository,vendorsFor:async()=>[{id:'vendor',name:'업체'}],now:()=>Date.parse('2026-10-16T12:00:00+09:00')});
 return {repository,create,get raw(){return raw},set raw(v){raw=v},get writes(){return writes}};
}
test('five Wolssu manuscripts become the only active templates, retired 10.14 drafts archive cleanly and keep operator edits and history',async()=>{
 const f=fixture(),s=createView(f.create());const first=await s();
 assert.equal(first.revision,11);assert.equal(f.writes,1);
 assert.deepEqual(first.templates.filter(t=>t.active!==false).map(t=>t.id),seed.map(t=>t.id));
 const old=first.templates.find(t=>t.id==='launch26-easy');assert.equal(old.active,false);assert.equal(old.version,4);
 for(const id of ['launch26-showtime','ep01-welcome']){
  const preserved=first.templates.find(t=>t.id===id);assert.equal(preserved.active,false);assert.equal(preserved.version,4);assert.equal(preserved.title,'운영자가 수정한 '+id);
  assert.equal(preserved.blocks[0].text,'운영자가 다듬은 도입부 '+id);
 }
 assert.equal(first.templates.find(t=>t.id==='wolssu26-taste').version,1);
 assert.equal(first.templates.find(t=>t.id==='launch26-joseon').title,'승인된 전하 원고');
 assert.equal(first.assignments.find(a=>a.id==='pending').templateId,'wolssu26-afterwork');
 assert.equal(first.assignments.find(a=>a.id==='brief-pending').templateId,'wolssu26-taste');
 assert.equal(first.assignments.find(a=>a.id==='collector-pending').templateId,'wolssu26-breeder');
 assert.equal(first.assignments.find(a=>a.id==='joseon-pending').templateId,'wolssu26-joseon');
 const done=first.assignments.find(a=>a.id==='done');assert.equal(done.templateId,'launch26-easy');assert.equal(done.publication.title,'게시한 예전 제목');assert.equal(done.publication.version,3);
 assert.equal(old.usage.length,1);await s();await createView(f.create())();assert.equal(f.writes,1);
 const post=await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:11,id:'wolssu26-afterwork',name:'운영자 수정',title:'어떤 제목이든 수정 유지',blocks:first.templates.find(t=>t.id==='wolssu26-afterwork').blocks,active:true});
 assert.equal(post.revision,12);assert.equal((await createView(f.create())()).templates.find(t=>t.id==='wolssu26-afterwork').title,'어떤 제목이든 수정 유지');
 await assert.rejects(f.create().mutate({vendorId:'vendor'},{action:'copy',requestId:randomUUID(),templateId:'wolssu26-afterwork',version:1}),e=>e.status===409);
});
function createView(service){return ()=>service.view({admin:true,month:'2026-10'});}
test('copy polish centers stored paragraphs and removes old notices without replacing operator text or publication history',async()=>{
 const f=fixture(),saved=JSON.parse(f.raw);saved.catalogVersion=3;
 const t=saved.templates.find(t=>t.id==='launch26-showtime');t.title='제가 고른 제목';t.bundleVersion=0;t.active=false;
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
 assert.equal(JSON.parse(f.raw).catalogVersion,require('../promo-catalog-migration.json').version);assert.equal(f.writes,1);
 await createView(f.create())();assert.equal(f.writes,1);
 const activeTarget=first.templates.find(t=>t.id==='wolssu26-relay');
 const edited=await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:first.revision,id:activeTarget.id,name:activeTarget.name,title:'나중에 또 다듬은 제목',blocks:activeTarget.blocks,active:true});
 const after=await createView(f.create())();assert.equal(after.revision,edited.revision);assert.equal(after.templates.find(t=>t.id===activeTarget.id).title,'나중에 또 다듬은 제목');
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
test('reader hook migration updates stock titles once, preserving operator titles and immutable publication history',async()=>{
 const f=fixture(),saved=JSON.parse(f.raw),hooks=require('../promo-copy-hooks.json');saved.catalogVersion=4;
 for(const a of saved.assignments)if(!a.publication)a.templateId=require('../promo-catalog-migration.json').retire[a.templateId]||a.templateId;
 const hookIds=['launch26-joseon','launch26-showtime','ep01-welcome','launch26-taste','launch26-tour','launch26-breeder'];
 saved.templates=hookIds.map(id=>legacyTemplate(id,{version:6,active:false,title:hooks[id].previous[0]}));
 saved.templates.find(t=>t.id==='launch26-tour').title='운영자가 정한 샵 투어 제목';
 const before=structuredClone(saved.assignments),copies=structuredClone(saved.copies);f.raw=JSON.stringify(saved);
 const first=await createView(f.create())();
 for(const t of first.templates.filter(t=>hookIds.includes(t.id))){assert.equal(t.title,t.id==='launch26-tour'?'운영자가 정한 샵 투어 제목':hooks[t.id].title);assert.equal(t.version,t.id==='launch26-tour'?6:7);}
 assert.deepEqual(JSON.parse(f.raw).assignments,before);assert.deepEqual(JSON.parse(f.raw).copies,copies);
 await createView(f.create())();assert.equal(f.writes,1);
 const t=first.templates.find(x=>x.active!==false);await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:first.revision,id:t.id,name:t.name,title:'다시 직접 다듬은 제목',blocks:t.blocks,active:true});
 assert.equal((await createView(f.create())()).templates.find(x=>x.id===t.id).title,'다시 직접 다듬은 제목');
});
test('photo additions preserve version 5 operator edits and history, add once and survive restart',async()=>{
 const f=fixture(),saved=JSON.parse(f.raw),photos=require('../promo-image-additions.json');saved.catalogVersion=5;
 const sources=new Set(photos.map(p=>p.src));
 saved.templates=photos.map(p=>{const t=legacyTemplate(p.templateId,{version:4,active:false});t.blocks=t.blocks.filter(b=>!sources.has(b.src));return t;});
 const own=saved.templates.find(t=>t.id==='launch26-taste');own.title=require('../promo-copy-hooks.json')[own.id].previous[0];own.blocks[0].text='운영자가 방금 다듬은 취향 질문';
 const snapshot=structuredClone(own.blocks),history=structuredClone(saved.assignments.find(a=>a.publication)),copies=structuredClone(saved.copies);f.raw=JSON.stringify(saved);
 const first=await createView(f.create())(),changed=first.templates.find(t=>t.id===own.id);
 assert.equal(changed.title,own.title);assert.equal(changed.version,5);assert.deepEqual(changed.blocks.filter(b=>!sources.has(b.src)),snapshot);
 for(const p of photos){const t=first.templates.find(t=>t.id===p.templateId);assert.equal(t.blocks.filter(b=>b.src===p.src).length,1);}
 assert.deepEqual(JSON.parse(f.raw).assignments.find(a=>a.publication),history);assert.deepEqual(JSON.parse(f.raw).copies,copies);
 await createView(f.create())();assert.equal(f.writes,1);
});

test('new concepts append once to the current catalog, preserving edited manuscripts and frozen history',async()=>{
 const f=fixture(),saved=JSON.parse(f.raw);
 const ids=new Set(['wolssu26-afterwork','wolssu26-breeder']);
 saved.catalogVersion=require('../promo-catalog-migration.json').version;
 saved.templates=structuredClone(seed.filter(t=>!ids.has(t.id)));
 saved.templates[0].title='현재 운영자가 직접 고른 제목';saved.templates[0].blocks[0].text='현재 운영자가 직접 고친 도입부';
 saved.templates[0].active=false;saved.templates[0].version=12;
 const oldTemplates=structuredClone(saved.templates),assignments=structuredClone(saved.assignments),copies=structuredClone(saved.copies);f.raw=JSON.stringify(saved);
 const first=await createView(f.create())();assert.equal(first.revision,11);assert.equal(f.writes,1);
 const persisted=JSON.parse(f.raw);assert.deepEqual(persisted.templates.filter(t=>!ids.has(t.id)),oldTemplates);
 assert.deepEqual(persisted.assignments,assignments);assert.deepEqual(persisted.copies,copies);
 for(const id of ids){const added=first.templates.filter(v=>v.id===id);assert.equal(added.length,1);assert.equal(added[0].active,true);assert.equal(added[0].version,1);}
 await createView(f.create())();assert.equal(f.writes,1);
 const added=first.templates.find(t=>ids.has(t.id));await f.create().mutate({admin:true},{action:'template',requestId:randomUUID(),revision:first.revision,id:added.id,name:added.name,title:'새 원고를 나중에 수정한 제목',blocks:added.blocks,active:false});
 const again=await createView(f.create())();assert.equal(again.templates.find(t=>t.id===added.id).title,'새 원고를 나중에 수정한 제목');assert.equal(again.templates.find(t=>t.id===added.id).active,false);
});

test('current-catalog additions retry concurrent changes and never report a failed save as successful',async()=>{
 const f=fixture(),saved=JSON.parse(f.raw),ids=new Set(['wolssu26-afterwork','wolssu26-breeder']);
 saved.catalogVersion=require('../promo-catalog-migration.json').version;saved.templates=structuredClone(seed.filter(t=>!ids.has(t.id)));f.raw=JSON.stringify(saved);
 const normal=f.repository.compareAndSwapRows;let conflicted=false;
 f.repository.compareAndSwapRows=async(...args)=>{if(!conflicted){conflicted=true;const latest=JSON.parse(f.raw);latest.revision++;latest.templates[0].title='동시에 수정한 제목';latest.copies.push({vendorId:'vendor',templateId:latest.templates[0].id,version:1,at:99});f.raw=JSON.stringify(latest);return false;}return normal(...args);};
 const first=await createView(f.create())();assert.equal(first.revision,12);assert.equal(first.templates[0].title,'동시에 수정한 제목');assert.equal(JSON.parse(f.raw).copies.at(-1).at,99);assert.equal(f.writes,1);
 f.raw=JSON.stringify(saved);f.repository.compareAndSwapRows=async()=>false;
 await assert.rejects(createView(f.create())(),e=>e.status===409);assert.equal(JSON.parse(f.raw).templates.some(t=>ids.has(t.id)),false);
});

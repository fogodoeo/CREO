'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createVendorEntries}=require('../vendor-entries');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-entry-batch-')),options={dbPath:path.join(dir,'local.sqlite'),durable:true,startWorker:false,adminSecret:'test'};
 let repo=new SQLitePlatformRepository(options),service=createVendorEntries(repo);
 const channel={id:'alpha',status:'active'},contexts=['A','B','C'].map(id=>({channel,vendor:{id,name:'가상업체'+id,phone:'01000000000',bankName:'테스트은행',bankAccount:'000',bankHolder:'가상'},profile:{id:randomUUID(),members:[{channelId:'alpha',vendorId:id}]},catalog:{channels:[channel]}}));
 await repo.upsertRecord('alpha','setting',{id:'entry-policy',open:true});
 const entries=[];for(const [index,c] of contexts.entries())for(let n=0;n<3-index;n++){const entry={id:randomUUID(),sex:'female',weight:String(10+n),note:'비고 '+c.vendor.id+n,photoIds:[]};await service.command(c,{type:'submit',entry,requestId:randomUUID()});entries.push({id:entry.id,vendorId:c.vendor.id,expectedVersion:1});}
 t.after(()=>{repo.close();if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('creo-entry-batch-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 return {channel,contexts,entries,get repo(){return repo},get service(){return service},approve:(rows=entries,part='1부',requestId=randomUUID())=>service.batch(channel,contexts,{type:'approve-many',requestId,part,entries:rows}),items:()=>repo.listRecords('alpha','item'),restart(){repo.close();repo=new SQLitePlatformRepository(options);service=createVendorEntries(repo);}};
}
test('checked entries alone become numbered auction items, with atomic replay across restart',async t=>{
 const f=await fixture(t),requestId=randomUUID(),selected=[f.entries[0],f.entries[3],f.entries[5]];
 const results=await Promise.all([f.approve(selected,'1부',requestId),f.approve(selected,'1부',requestId)]);assert.deepEqual(results.map(r=>r.duplicate).sort(),[false,true]);
 let items=(await f.items()).sort((a,b)=>a.lotNumber-b.lotNumber);assert.equal(items.length,3);assert.deepEqual(items.map(i=>i.name),['1부 A01','1부 A02','1부 A03']);assert.ok(items.every(i=>i.status==='waiting'&&i.note.startsWith('비고')));
 assert.equal((await f.service.read(f.contexts[0])).entries.filter(e=>e.status==='submitted').length,2);
 f.restart();assert.equal((await f.approve(selected,'1부',requestId)).duplicate,true);assert.equal((await f.items()).length,3);
 await assert.rejects(f.approve(selected,'2부',requestId),e=>e.status===409);
 assert.equal((await f.repo.listRecords('beta','item')).length,0);
});
test('a stale, duplicated or foreign selection leaves the whole batch unchanged',async t=>{
 const f=await fixture(t),before=await Promise.all(f.contexts.map(c=>f.service.read(c)));
 for(const entries of [[f.entries[0],{...f.entries[3],expectedVersion:99}],[f.entries[0],f.entries[0]],[{...f.entries[0],vendorId:'C'}]])await assert.rejects(f.approve(entries));
 assert.equal((await f.items()).length,0);assert.deepEqual(await Promise.all(f.contexts.map(c=>f.service.read(c))),before);
 const other={...f.channel,id:'beta'};await assert.rejects(f.service.batch(other,f.contexts,{type:'approve-many',requestId:randomUUID(),part:'1부',entries:f.entries}),e=>e.status===403);
});
test('real SQLite write failure rolls all vendors and items back; retry can recover',async t=>{
 const f=await fixture(t),before=await Promise.all(f.contexts.map(c=>f.service.read(c))),write=f.repo.upsertRows.bind(f.repo),id=randomUUID();
 f.repo.upsertRows=rows=>write(rows.some(r=>r.key.includes('::item::'))?[...rows,{key:{invalid:true},value:'fail transaction'}]:rows);
 await assert.rejects(f.approve(f.entries,'1부',id));assert.equal((await f.items()).length,0);assert.deepEqual(await Promise.all(f.contexts.map(c=>f.service.read(c))),before);
 f.restart();assert.equal((await f.approve(f.entries,'1부',id)).count,6);
});
test('vendor round robin shuffles vendors and keeps identities, per-vendor order and other parts',async t=>{
 const f=await fixture(t);await f.approve(f.entries.slice(0,5));await f.approve(f.entries.slice(5),'2부');
 const before=await f.items(),targets=before.filter(i=>i.name.startsWith('1부')),request={type:'arrange',requestId:randomUUID(),part:'1부',items:targets.map(i=>({id:i.id,updatedAt:i.updatedAt}))};
 const result=await f.service.batch(f.channel,[],request,{random:()=>0});assert.equal(result.count,5);
 const after=(await f.items()).sort((a,b)=>a.lotNumber-b.lotNumber);assert.deepEqual(after.slice(0,5).map(i=>i.vendorId),['B','A','B','A','A']);
 for(const item of after)assert.equal(item.name,before.find(i=>i.id===item.id).name);
 assert.deepEqual(after.find(i=>i.name.startsWith('2부')),before.find(i=>i.name.startsWith('2부')));
 f.restart();assert.equal((await f.service.batch(f.channel,[],request,{random:()=>.99})).duplicate,true);assert.deepEqual((await f.items()).sort((a,b)=>a.lotNumber-b.lotNumber),after);
});
test('arrangement rejects stale lists, changed items and auction progress without writing',async t=>{
 const f=await fixture(t);await f.approve();const items=await f.items(),request={type:'arrange',requestId:randomUUID(),part:'1부',items:items.map(i=>({id:i.id,updatedAt:i.updatedAt}))};
 await assert.rejects(f.service.batch(f.channel,[],{...request,items:request.items.slice(1)}));
 for(const patch of [{status:'live'},{status:'sold',soldPrice:10000},{attributes:{bid_log:'[{"amount":1}]'}},{updatedAt:'older-version'}]){
   await f.repo.upsertRows([{key:'creo_v2::alpha::item::'+items[0].id,value:JSON.stringify({...items[0],...patch})}]);const before=await f.items();await assert.rejects(f.service.batch(f.channel,[],request));assert.deepEqual(await f.items(),before);
 }
 await assert.rejects(f.service.batch({...f.channel,status:'archived'},[],request));
});
test('numbering is independent per part and never resets a previously assigned code',async t=>{
 const f=await fixture(t);await f.approve(f.entries.slice(0,2),'1부');await f.approve(f.entries.slice(2,4),'2부');await f.approve(f.entries.slice(4),'이벤');
 assert.deepEqual((await f.items()).sort((a,b)=>a.lotNumber-b.lotNumber).map(i=>i.name),['1부 A01','1부 A02','2부 B01','2부 B02','이벤 E01','이벤 E02']);
});
test('a late first-part entry is inserted before later parts without renumbering identities',async t=>{
 const f=await fixture(t);await f.approve(f.entries.slice(0,2),'2부');await f.approve(f.entries.slice(2,3),'이벤');
 const before=await f.items();await f.approve(f.entries.slice(3,5),'1부');
 const after=(await f.items()).sort((a,b)=>a.lotNumber-b.lotNumber);
 assert.deepEqual(after.map(i=>i.name),['1부 A01','1부 A02','2부 B01','2부 B02','이벤 E01']);
 for(const item of before)assert.equal(after.find(i=>i.id===item.id).name,item.name);
 assert.equal(new Set(after.map(i=>i.lotNumber)).size,5);
});
test('late insertion cannot move an item with auction history or leave a partial approval',async t=>{
 const f=await fixture(t);await f.approve(f.entries.slice(0,1),'2부');
 const existing=(await f.items())[0];await f.repo.upsertRecord('alpha','item',{...existing,status:'sold',soldPrice:30000,winnerName:'가상 구매자'});
 const before=await f.items(),state=await f.service.read(f.contexts[1]);
 await assert.rejects(f.approve(f.entries.slice(3,5),'1부'));
 assert.deepEqual(await f.items(),before);assert.deepEqual(await f.service.read(f.contexts[1]),state);
});
test('failed insertion rolls back shifted orders and can retry once after restart',async t=>{
 const f=await fixture(t);await f.approve(f.entries.slice(0,2),'2부');
 const before=await f.items(),write=f.repo.upsertRows.bind(f.repo),requestId=randomUUID();
 f.repo.upsertRows=rows=>write([...rows,{key:{invalid:true},value:'rollback'}]);
 await assert.rejects(f.approve(f.entries.slice(3,5),'1부',requestId));assert.deepEqual(await f.items(),before);
 f.restart();await f.approve(f.entries.slice(3,5),'1부',requestId);await f.approve(f.entries.slice(3,5),'1부',requestId);
 assert.deepEqual((await f.items()).sort((a,b)=>a.lotNumber-b.lotNumber).map(i=>i.name),['1부 A01','1부 A02','2부 B01','2부 B02']);
});
test('arrangement version always advances even when the previous timestamp is ahead of the clock',async t=>{
 const f=await fixture(t);await f.approve();
 const stamp=new Date(Date.now()+60000).toISOString();
 for(const item of await f.items())await f.repo.upsertRows([{key:'creo_v2::alpha::item::'+item.id,value:JSON.stringify({...item,updatedAt:stamp})}]);
 const request={type:'arrange',part:'1부',requestId:randomUUID(),items:(await f.items()).map(i=>({id:i.id,updatedAt:i.updatedAt}))};
 await f.service.batch(f.channel,[],request,{random:()=>0});
 assert.ok((await f.items()).every(i=>i.updatedAt>stamp));
 await assert.rejects(f.service.batch(f.channel,[],{...request,requestId:randomUUID()}));
});
test('concurrent distinct batches allocate unique numbers and stale edits cannot overwrite approved entries',async t=>{
 const f=await fixture(t);await Promise.all([f.approve(f.entries.slice(0,3)),f.approve(f.entries.slice(3))]);
 const items=await f.items();assert.equal(new Set(items.map(i=>i.name)).size,6);assert.equal(new Set(items.map(i=>i.lotNumber)).size,6);
 await assert.rejects(f.service.command(f.contexts[0],{type:'withdraw',requestId:randomUUID(),id:f.entries[0].id,expectedVersion:1}));
 assert.deepEqual(await f.items(),items);
});
test('label payload keeps the full code and uses the approved facts without buyer data',()=>{
 const {label}=require('../public/entry-label-print');
 const value=label({group:{vendor:{name:'가상업체'}},entry:{id:'one',itemId:'item',code:'출품 01',lot:'1부 A01',status:'approved',approved:{sex:'female',weight:'10'},note:'다른 정보'}},[{id:'item',code:'1부 A01'}]);
 assert.deepEqual(value,{kind:'identification',lot_number:'1부 A01',company:'가상업체',traits:'암컷 10g',parents:'',source_ref:'출품 01'});
});

test('parent names use the approved relationship and current parent record, without placeholders',()=>{
 const {label,parentNames}=require('../public/entry-label-print');
 const row={group:{vendor:{name:'업체'},parents:[{id:'sire',name:'펩시콜라'},{id:'other',name:'아직 승인 안 된 부모'}]},entry:{status:'approved',code:'출품 01',lot:'1부 A01',sireId:'other',approved:{sireId:'sire',parents:[{role:'sire',name:'이전 이름'},{role:'dam',name:'백설'}]}}};
 assert.equal(label(row,[]).parents,'펩시콜라 × 백설');
 row.group.parents[0].name='수정한 이름';assert.equal(parentNames(row),'수정한 이름 × 백설');
 row.entry.approved.parents=[];assert.equal(parentNames(row),'부 수정한 이름');
 row.entry.approved={};assert.equal(parentNames(row),'');
});
test('printing rejects changed order, parents or entry version even while a preview is open',()=>{
 const {verifySnapshot}=require('../public/entry-label-print');
 const entry={id:'entry',itemId:'item',version:2,code:'출품 01',lot:'1부 A01',status:'approved',approved:{sex:'female',weight:'28',sireId:'parent'}},group={vendor:{id:'vendor',name:'업체'},parents:[{id:'parent',name:'아토'}],entries:[entry]};
 const selection=[{entry,group}],allocation=[{id:'item',code:'1부 A01',order:1}],base={groups:[group],allocation};
 assert.doesNotThrow(()=>verifySnapshot(selection,allocation,structuredClone(base)));
 for(const change of [fresh=>fresh.allocation[0].order=2,fresh=>fresh.groups[0].parents[0].name='수정한 부모',fresh=>fresh.groups[0].entries[0].version=3,fresh=>fresh.groups[0].entries=[]]){
   const fresh=structuredClone(base);change(fresh);assert.throws(()=>verifySnapshot(selection,allocation,fresh),/변경/);
 }
});

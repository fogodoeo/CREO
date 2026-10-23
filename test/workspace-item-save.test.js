'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base}=require('../tools/national-settlement-fixture.cjs');
const route='/channels/national-cre/items';
async function fixture(t){const f=await base();t.after(()=>f.close());return f;}
const create=(extra={})=>({editorRequestId:'editor-create-0001',expectedRoundDate:'2026-10-14',record:{id:'editor-new',lotNumber:10,name:'A10',status:'waiting',vendorId:'v1',attributes:{broadcastDate:'2026-10-14'}},...extra});
test('editor creation retries once durably, survives restart and never reverts a later auction result',async t=>{
 const f=await fixture(t),body=create(),results=await Promise.all([f.request('POST',route,body),f.request('POST',route,body)]);
 assert.deepEqual(results.map(r=>r.status),[201,201]);assert.equal(results.filter(r=>r.json().duplicate).length,1);
 assert.equal((await f.repository.listRecords('national-cre','item')).filter(i=>i.id===body.record.id).length,1);
 const first=results[0].json().record;await f.repository.upsertRecord('national-cre','item',{...first,status:'sold',soldPrice:170000,winnerName:'가상 낙찰자'});
 const sold=await f.repository.getRecord('national-cre','item',first.id);f.restart();const replay=await f.request('POST',route,body);
 assert.equal(replay.json().duplicate,true);assert.deepEqual(await f.repository.getRecord('national-cre','item',first.id),sold);
 assert.equal((await f.request('POST',route,{...body,record:{...body.record,name:'다른 내용'}})).status,409);
 assert.equal((await f.request('POST',route,{...body,editorRequestId:'editor-other-0001'})).status,409);
 assert.deepEqual(await f.repository.getRecord('national-cre','item',first.id),sold);
});
test('editor update serializes duplicates and rejects concurrent stale edits without touching shipment or notification facts',async t=>{
 const f=await fixture(t),item=await f.repository.getRecord('national-cre','item','a01'),shipments=await f.repository.listRecords('national-cre','shipment'),notifications=await f.repository.listRecords('national-cre','notification');
 const body={editorRequestId:'editor-update-0001',expectedUpdatedAt:item.updatedAt,expectedRoundDate:'2026-10-14',record:{...item,note:'새 비고'}};
 const replies=await Promise.all([f.request('PUT',route+'/a01',body),f.request('PUT',route+'/a01',body),f.request('PUT',route+'/a01',{...body,editorRequestId:'editor-conflict-0001',record:{...item,note:'동시 변경'}})]);
 assert.deepEqual(replies.map(r=>r.status),[200,200,409]);assert.ok(replies[1].json().duplicate);
 const saved=await f.repository.getRecord('national-cre','item','a01');assert.equal(saved.note,'새 비고');assert.ok(saved.updatedAt>item.updatedAt);
 f.restart();assert.equal((await f.request('PUT',route+'/a01',body)).json().duplicate,true);assert.deepEqual(await f.repository.getRecord('national-cre','item','a01'),saved);
 assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),shipments);assert.deepEqual(await f.repository.listRecords('national-cre','notification'),notifications);
});
test('SQLite failure rolls back the item and its replay receipt together',async t=>{
 const f=await fixture(t),body=create(),write=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=rows=>write(rows.some(r=>r.key.startsWith('creo_workspace_item_write::'))?[...rows,{key:{invalid:true},value:'fail'}]:rows);
 const failed=await f.request('POST',route,body);assert.equal(failed.status,500,failed.body);assert.equal(await f.repository.getRecord('national-cre','item',body.record.id),null);
 assert.deepEqual(await f.repository.getRowsByKeys(['creo_workspace_item_write::national-cre::'+body.editorRequestId]),[]);
 f.repository.upsertRows=write;f.restart();const saved=await f.request('POST',route,body);assert.equal(saved.status,201,saved.body);assert.equal(saved.json().duplicate,undefined);
});
test('editor credentials, request identity and expected versions fail closed and requests stay channel scoped',async t=>{
 const f=await fixture(t),body=create();assert.equal((await f.request('POST',route,body,false)).status,401);
 for(const bad of [{...body,editorRequestId:'short'},{...body,record:{...body.record,id:''}}])assert.equal((await f.request('POST',route,bad)).status,422);
 assert.equal((await f.request('POST',route,body)).status,201);
 assert.equal((await f.request('PUT',route+'/'+body.record.id,{editorRequestId:'editor-no-version',record:{name:'변경'}})).status,409);
 const other={...body,expectedRoundDate:'',record:{...body.record,vendorId:'',name:'다른 채널'}};assert.equal((await f.request('POST','/channels/creyon/items',other)).status,201);
 assert.equal((await f.repository.getRecord('national-cre','item',body.record.id)).name,'A10');assert.equal((await f.repository.getRecord('creyon','item',body.record.id)).name,'다른 채널');
});
test('live status, cancelled status, metadata and archive lifecycle stay intact',async t=>{
 const f=await fixture(t),existing=await f.repository.getRecord('national-cre','item','a01');
 await f.repository.upsertRecord('national-cre','item',{...existing,status:'live',attributes:{...existing.attributes,parents:[{name:'가상 부모'}],checklist:'gender:U|weight:3'}});
 let current=await f.repository.getRecord('national-cre','item','a01');const body={editorRequestId:'editor-live-0001',expectedUpdatedAt:current.updatedAt,expectedRoundDate:'2026-10-14',record:{...current,status:'waiting',note:'비고만 변경'}};
 assert.equal((await f.request('PUT',route+'/a01',body)).status,200);current=await f.repository.getRecord('national-cre','item','a01');assert.equal(current.status,'live');assert.equal(current.attributes.checklist,'gender:U|weight:3');
 await f.repository.upsertRecord('national-cre','item',{...current,status:'cancelled'});current=await f.repository.getRecord('national-cre','item','a01');
 const cancelled={editorRequestId:'editor-cancel-0001',expectedUpdatedAt:current.updatedAt,expectedRoundDate:'2026-10-14',record:{...current,note:'취소 메모'}};assert.equal((await f.request('PUT',route+'/a01',cancelled)).status,200);assert.equal((await f.repository.getRecord('national-cre','item','a01')).status,'cancelled');
 current=await f.repository.getRecord('national-cre','item','a01');await f.repository.upsertRecord('national-cre','item',{...current,auctionArchiveId:'old-round'});
 const archived=await f.repository.getRecord('national-cre','item','a01');assert.equal((await f.request('PUT',route+'/a01',cancelled)).json().duplicate,true);assert.deepEqual(await f.repository.getRecord('national-cre','item','a01'),archived);
 assert.equal((await f.request('PUT',route+'/a01',{...cancelled,editorRequestId:'editor-archived-001',expectedUpdatedAt:archived.updatedAt})).status,409);
});

test('editor cannot introduce another broadcast date into a legacy channel or save with stale round context',async t=>{
 const f=await fixture(t),before=await f.repository.listRecords('national-cre','item'),body=create();
 for(const next of [{...body,expectedRoundDate:'2026-10-19'},{...body,record:{...body.record,attributes:{broadcastDate:'2026-10-19'}}},{...body,expectedRoundDate:undefined}])assert.equal((await f.request('POST',route,next)).status,409);
 assert.deepEqual(await f.repository.listRecords('national-cre','item'),before);
 const item=before[0],update={editorRequestId:'editor-wrong-round',expectedUpdatedAt:item.updatedAt,expectedRoundDate:'2026-10-19',record:{...item,note:'다른 회차'}};
 assert.equal((await f.request('PUT',route+'/'+item.id,update)).status,409);assert.deepEqual(await f.repository.getRecord('national-cre','item',item.id),item);
});
test('item and retry receipt survive closing and reopening the SQLite database',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{SQLitePlatformRepository}=require('../sqlite-platform-repository'),Save=require('../workspace-item-save');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-item-restart-')),options={dataDir:dir,startWorker:false};let repository=new SQLitePlatformRepository(options);
 t.after(()=>{repository.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-item-restart-'))throw Error('Unsafe test cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 const body=create(),attempt=await Save.prepare(repository,'national-cre','POST',body,body.record.id),saved=await Save.commit(repository,'national-cre',body.record,attempt);
 repository.close();repository=new SQLitePlatformRepository(options);
 const replay=await Save.prepare(repository,'national-cre','POST',body,body.record.id);assert.deepEqual(replay.record,saved);assert.deepEqual(await repository.getRecord('national-cre','item',saved.id),saved);
});

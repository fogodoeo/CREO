'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SupabaseConfigRepository}=require('../platform-repository');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {mirrorCursor,readMirrorCursor}=require('../repository-scan');
const compare=new Intl.Collator('en').compare;
function remoteFixture(){
 const data=new Map(['A','a','Z','z','_a','-A','0','AA','aA','b','B'].map(id=>['creo_v2::'+id,'remote-'+id]));
 const queries=[];
 const remote=new SupabaseConfigRepository({url:'https://isolated.invalid',key:'isolated',fetchImpl:async(url,options)=>{
  assert.equal(options.method,undefined);const q=new URL(url).searchParams;queries.push(q);
  const after=q.getAll('key').find(v=>v.startsWith('gt.'))?.slice(3)||'';
  assert.equal(q.get('order'),'key.asc');assert.ok(q.getAll('key').includes('like.creo\\_v2::*'));
  return new Response(JSON.stringify([...data].filter(([key])=>!after||compare(key,after)>0).sort(([a],[b])=>compare(a,b)).slice(0,Number(q.get('limit'))).map(([key,value])=>({key,value}))));
 }});
 return {remote,data,queries};
}
async function collect(repository,{after='',limit=2}={}){
 const rows=[],cursors=new Set();let pages=0;
 do{const page=await repository.scanRowsByPrefix('creo_v2::',{after,limit});rows.push(...page.rows);after=page.nextCursor;if(after){assert.ok(!cursors.has(after));cursors.add(after);}assert.ok(++pages<50);}while(after);
 return rows.map(row=>({...row}));
}
function localFixture(t,mirror){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-scan-')),dbPath=path.join(dir,'test.sqlite');
 const options={dbPath,mirror,durable:true,startWorker:false};let repository=new SQLitePlatformRepository(options);
 t.after(()=>{repository.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('creo-scan-'));fs.rmSync(dir,{recursive:true,force:true});});
 return {get repository(){return repository},restart(){repository.close();repository=new SQLitePlatformRepository(options);return repository;}};
}
test('PostgreSQL locale cursors retain mixed-case and punctuation keys across pages and boundary deletion',async()=>{
 const {remote,data}=remoteFixture(),expected=[...data.keys()].sort(compare);
 assert.notDeepEqual(expected,[...data.keys()].sort(),'fixture reproduces a different database collation');
 assert.deepEqual((await collect(remote)).map(r=>r.key),expected);
 const first=await remote.scanRowsByPrefix('creo_v2::',{limit:2});
 assert.deepEqual(await remote.scanRowsByPrefix('creo_v2::',{limit:2}),first,'retry is stable');
 data.delete(first.nextCursor);
 assert.deepEqual((await collect(remote,{after:first.nextCursor})).map(r=>r.key),expected.slice(2),'deleting the cursor row does not skip its successor');
});
test('independent local and remote passes preserve edits, tombstones, cold keys and restart without cache writes',async t=>{
 const {remote,data}=remoteFixture(),f=localFixture(t,remote);let repository=f.repository;
 await repository.upsertRows([{key:'creo_v2::a',value:'local-edit'},{key:'creo_v2::local',value:'local-only'}]);
 await repository.deleteRow('creo_v2::A');
 const before=repository.db.prepare('SELECT * FROM platform_kv ORDER BY key').all();
 const first=await repository.scanRowsByPrefix('creo_v2::',{limit:1});repository=f.restart();
 const rows=[...first.rows,...await collect(repository,{after:first.nextCursor,limit:1})];
 assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
 const expected=new Map(data);expected.set('creo_v2::a','local-edit');expected.set('creo_v2::local','local-only');expected.delete('creo_v2::A');
 assert.deepEqual([...new Map(rows.map(r=>[r.key,r.value]))].sort(),[...expected].sort());
 assert.deepEqual(repository.db.prepare('SELECT * FROM platform_kv ORDER BY key').all(),before);
 assert.deepEqual(await collect(repository),await collect(repository),'complete repeated scans remain stable');
});
test('remote response finishing after local edit or deletion cannot restore stale values',async t=>{
 let release;const mirror={scanRowsByPrefix:()=>new Promise(resolve=>release=resolve)};
 const f=localFixture(t,mirror),r=f.repository;
 const start=await r.scanRowsByPrefix('creo_v2::');const pending=r.scanRowsByPrefix('creo_v2::',{after:start.nextCursor});
 await r.upsertRows([{key:'creo_v2::a',value:'new-local'}]);await r.deleteRow('creo_v2::b');
 release({rows:[{key:'creo_v2::a',value:'stale'},{key:'creo_v2::b',value:'deleted'},{key:'creo_v2::c',value:'cold'}],nextCursor:null});
 assert.deepEqual(await pending,{rows:[{key:'creo_v2::c',value:'cold'}],nextCursor:null});
 assert.equal(r.statements.get.get('creo_v2::a').value,'new-local');assert.equal(r.statements.get.get('creo_v2::c'),undefined);
});
test('opaque cursors reject foreign scopes and malformed positions; mirror failure never completes a scan',async t=>{
 for(const cursor of ['raw-key','scan1:bad',mirrorCursor('other::','remote','other::a'),mirrorCursor('creo_v2::','remote','other::a'),mirrorCursor('creo_v2::','invalid','')])assert.throws(()=>readMirrorCursor('creo_v2::',cursor),/cursor/);
 const f=localFixture(t,{scanRowsByPrefix:async()=>{throw Error('offline')}});
 await assert.rejects(collect(f.repository),/offline/);
});
test('duplicate, foreign, oversized and corrupt remote pages still fail closed',async()=>{
 for(const rows of [[{key:'creo_v2::a',value:'one'},{key:'creo_v2::a',value:'two'}],[{key:'creoXv2::a',value:'foreign'}],Array.from({length:4},(_,i)=>({key:'creo_v2::'+i,value:'x'}))]){
  const repository=new SupabaseConfigRepository({url:'https://isolated.invalid',key:'isolated',fetchImpl:async()=>new Response(JSON.stringify(rows))});
  await assert.rejects(repository.scanRowsByPrefix('creo_v2::',{limit:2}),/Invalid inventory/);
 }
 const repository=new SupabaseConfigRepository({url:'https://isolated.invalid',key:'isolated',integritySecret:'signed',fetchImpl:async()=>new Response(JSON.stringify([{key:'creo_v2::a',value:'tampered'}]))});
 await assert.rejects(repository.scanRowsByPrefix('creo_v2::'),/integrity/);
});

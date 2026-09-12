'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {SupabaseConfigRepository,protectStoredValue}=require('../platform-repository');
const {createEntryPhotoAudit}=require('../entry-photo-audit');
const {createBuyerAccountAuth}=require('../buyer-account-auth');
const owner='11111111-1111-4111-8111-111111111111';
const photo=n=>{const id=`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`,base=`/__entry_photo__/${owner}/${id}/${'a'.repeat(64)}`;return {id,url:base+'/full.webp',thumbnailUrl:base+'/thumb.webp',size:1000,thumbnailSize:100};};
function fixture(t,options={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creo-photo-audit-')),dbPath=path.join(directory,'test.sqlite');
 const repository=new SQLitePlatformRepository({dbPath,durable:true,startWorker:false,adminSecret:'local-admin',...options});
 t.after(()=>{repository.close();const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-photo-audit-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});});
 return repository;
}
const authFor=repository=>createBuyerAccountAuth({repository,config:{enabled:false,secret:'local-only-photo-record-secret'},hashPhone:()=>''});
async function seed(repository){
 const media=[1,2,3,4].map(photo),auth=authFor(repository),state={schema:1,ownerId:owner,entries:[{photoIds:[media[0].id]},{approved:{photoIds:[media[0].id]}}],parents:[{photoId:media[0].id}],parentHistory:[{photoId:media[1].id}],media:[...media,{id:'external',url:'https://api.feedle.me/example.webp',size:999999,thumbnailSize:1}]};
 await repository.upsertRows([{key:'vendor_entries_v1::'+owner,value:JSON.stringify(state)},{key:'vendor_directory_v1',value:JSON.stringify({version:1,profiles:[{id:owner,info:{name:'가상 업체',phone:'PRIVATE-PHONE',bankAccount:'PRIVATE-BANK'}}]})},{key:'creo_v2::alpha::item::one',value:JSON.stringify({id:'one',photoUrl:media[0].url,winnerPhone:'PRIVATE-BUYER'})},auth.row('creo_v2::buyer-collection::record::first',{schema:1,item:{media:[media[2]],parents:[{role:'sire',media:[media[0]]}]}})]);
 return {media,state,auth};
}
test('read-only photo usage deduplicates shared parents and retains buyer snapshots and prior versions',async t=>{
 const repository=fixture(t),{auth}=await seed(repository),before=repository.db.prepare('SELECT * FROM platform_kv ORDER BY key').all(),audit=createEntryPhotoAudit({repository,decodeBuyerRecord:auth.decodeRow});
 const [a,b]=await Promise.all([audit.inspect(),audit.inspect()]);assert.strictEqual(a,b,'simultaneous inspections share one bounded scan');
 assert.deepEqual(a.totals,{photoCount:4,fileCount:8,registeredBytes:4400,linkedPhotoCount:3,linkedBytes:3300,unlinkedPhotoCount:1,unlinkedBytes:1100,externalPhotoCount:1});
 assert.equal(a.referenceScanComplete,true);assert.equal(a.objectVerification,false);assert.equal(a.deletionEnabled,false);assert.deepEqual(a.uses.map(use=>use.photoCount),[1,2,2,1]);
 assert.equal(a.vendors[0].name,'가상 업체');assert.doesNotMatch(JSON.stringify(a),/PRIVATE|__entry_photo__|full.webp|buyer-collection/);
 assert.deepEqual(repository.db.prepare('SELECT * FROM platform_kv ORDER BY key').all(),before,'inventory writes no records, timestamps or cache rows');
});
test('unreadable archive or unknown managed paths suppress unlinked counts instead of claiming deletion candidates',async t=>{
 const repository=fixture(t);await seed(repository);
 let result=await createEntryPhotoAudit({repository,decodeBuyerRecord:()=>{throw Error('key unavailable')}}).inspect();assert.equal(result.referenceScanComplete,false);assert.equal(result.unresolved.unreadableBuyerRecords,1);assert.equal(result.totals.unlinkedPhotoCount,null);assert.equal(result.vendors[0].unlinkedPhotoCount,null);assert.equal(result.uses.find(use=>use.id==='library').photoCount,null);
 await repository.upsertRows([{key:'creo_v2::beta::archive::one',value:JSON.stringify({photoUrl:photo(99).url,other:'/__entry_photo__/broken'})}]);
 result=await createEntryPhotoAudit({repository,decodeBuyerRecord:authFor(repository).decodeRow}).inspect();assert.equal(result.unresolved.missingMetadata,1);assert.equal(result.unresolved.invalidReferences,1);assert.equal(result.totals.registeredBytes,4400);assert.equal(result.totals.unlinkedBytes,null);
});
test('edits between scan passes are marked incomplete and do not block the edit',async t=>{
 const repository=fixture(t),{auth,state}=await seed(repository),scan=repository.scanRowsByPrefix.bind(repository);let passes=0;
 repository.scanRowsByPrefix=async(prefix,options)=>{if(prefix==='vendor_directory_v1'&&++passes===2){state.entries.push({photoIds:[photo(4).id]});await repository.upsertRows([{key:'vendor_entries_v1::'+owner,value:JSON.stringify(state)}]);}return scan(prefix,options);};
 const result=await createEntryPhotoAudit({repository,decodeBuyerRecord:auth.decodeRow}).inspect();assert.equal(result.consistent,false);assert.equal(result.referenceScanComplete,false);assert.equal(result.totals.unlinkedPhotoCount,null);
});
test('malformed metadata and bounded-scan exhaustion fail clearly without partial zero totals',async t=>{
 const repository=fixture(t),{auth}=await seed(repository);
 await assert.rejects(createEntryPhotoAudit({repository,decodeBuyerRecord:auth.decodeRow,maxRows:2}).inspect(),e=>e.status===503);
 await repository.upsertRows([{key:'vendor_entries_v1::'+owner,value:'{broken'}]);await assert.rejects(createEntryPhotoAudit({repository,decodeBuyerRecord:auth.decodeRow}).inspect(),e=>e.status===503);
});
test('SQLite cursor scan merges cold mirror keys, local edits and deletion marks without gaps or cache writes',async t=>{
 const remote=new Map(Array.from({length:14},(_,i)=>['prefix::'+String(i).padStart(2,'0'),'remote-'+i]));
 const mirror={async upsertRows(){},async deleteRow(){},async scanRowsByPrefix(prefix,{after,limit}){const rows=[...remote].filter(([k])=>k.startsWith(prefix)&&k>after).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,value}));return {rows:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1].key:null};}};
 const repository=fixture(t,{mirror});await repository.upsertRows([{key:'prefix::03',value:'local-edit'},{key:'prefix::05a',value:'local-add'},{key:'prefix::90',value:'local-last'}]);
 for(const n of ['00','01','02','04','05','06'])await repository.deleteRow('prefix::'+n);
 const before=repository.db.prepare('SELECT * FROM platform_kv ORDER BY key').all();let after='',result=[],pages=0;
 do{const page=await repository.scanRowsByPrefix('prefix::',{after,limit:2});result.push(...page.rows);after=page.nextCursor;assert.ok(++pages<30);}while(after);
 const expected=[...remote].filter(([k])=>!['00','01','02','04','05','06'].some(n=>k==='prefix::'+n)).map(([key,value])=>({key,value:key==='prefix::03'?'local-edit':value})).concat([{key:'prefix::05a',value:'local-add'},{key:'prefix::90',value:'local-last'}]).sort((a,b)=>a.key.localeCompare(b.key));
 assert.deepEqual(result.map(row=>({...row})),expected);assert.deepEqual(repository.db.prepare('SELECT * FROM platform_kv ORDER BY key').all(),before);
 mirror.scanRowsByPrefix=async()=>{throw Error('offline')};await assert.rejects(repository.scanRowsByPrefix('prefix::'),/offline/);
});
test('Supabase inventory uses an ordered cursor and rejects corrupted protected rows instead of skipping them',async()=>{
 const secret='local-signing',rows=['a','b','c'].map(id=>({key:'creo_v2::'+id,value:protectStoredValue('creo_v2::'+id,JSON.stringify({id}),secret)}));let bad=false,queries=[];
 const repository=new SupabaseConfigRepository({url:'https://isolated.supabase.co',key:'fake',integritySecret:secret,fetchImpl:async(url,options)=>{assert.equal(options.method,undefined);assert.ok(options.signal);const query=new URL(url).searchParams;queries.push(query);let data=rows.filter(row=>!query.getAll('key').some(v=>v.startsWith('gt.')&&row.key<=v.slice(3))).slice(0,Number(query.get('limit')));if(bad)data=[{...data[0],value:'bad-signature'}];return new Response(JSON.stringify(data));}});
 let page=await repository.scanRowsByPrefix('creo_v2::',{limit:2});assert.equal(page.nextCursor,'creo_v2::b');assert.equal(page.rows.length,2);page=await repository.scanRowsByPrefix('creo_v2::',{limit:2,after:page.nextCursor});assert.equal(page.rows[0].key,'creo_v2::c');assert.equal(page.nextCursor,null);assert.ok(queries[0].getAll('key').includes('gte.creo_v2::'));
 bad=true;await assert.rejects(repository.scanRowsByPrefix('creo_v2::'),/integrity/);await assert.rejects(repository.scanRowsByPrefix('creo_v2::',{after:'other::'}),/cursor/);
});
test('photo usage API requires operator authorization and never exposes write actions',async t=>{
 const repository=fixture(t);await seed(repository);const {createPlatformApi}=require('../platform-api');const api=createPlatformApi({repository,buyerAccountConfig:{enabled:false,secret:'local-only-photo-record-secret'},logger:{error(){}}});
 async function call(method,admin=false){const req=Readable.from([]);req.method=method;req.headers=admin?{'x-creo-admin':'local-admin'}:{};req.socket={remoteAddress:'127.0.0.1'};const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}};await api.handle(req,res,new URL('https://example.test/api/platform/entry-photo-usage'));return res;}
 assert.equal((await call('GET')).status,401);const response=await call('GET',true);assert.equal(response.status,200,response.body);assert.equal(JSON.parse(response.body).totals.photoCount,4);assert.match(response.headers['Cache-Control'],/no-store/);assert.equal((await call('POST',true)).status,405);assert.equal((await call('DELETE',true)).status,405);
});

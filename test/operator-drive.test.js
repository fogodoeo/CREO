'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {OperatorDrive,KEY,CHUNK}=require('../operator-drive');
const {createDriveApi}=require('../operator-drive-api');
const {createDriveStorage}=require('../operator-drive-storage');
function mockStorage(){
 const uploads=new Map(),objects=new Map();let failRemove=false,failBegin=false,loseComplete=false;
 return {uploads,objects,get failRemove(){return failRemove;},set failRemove(v){failRemove=v;},set failBegin(v){failBegin=v;},set loseComplete(v){loseComplete=v;},
  async begin(id){if(failBegin)throw Error('offline');uploads.set(id,new Map());return 'private-upload-id';},
  async part(id,u,n,b){uploads.get(id).set(n,Buffer.from(b));},async head(id){return objects.get(id)?.length??null;},
  async complete(id,u,size,chunk){const parts=uploads.get(id);if(parts.size!==Math.ceil(size/chunk))throw Error('missing');const bytes=Buffer.concat([...parts].sort((a,b)=>a[0]-b[0]).map(v=>v[1]));if(bytes.length!==size)throw Error('size');objects.set(id,bytes);uploads.delete(id);if(loseComplete){loseComplete=false;throw Error('lost response');}},
  async abort(id){uploads.delete(id);},async remove(id){if(failRemove)throw Error('offline');objects.delete(id);},async url(e,preview){return `https://example.invalid/${e.id}?preview=${preview}`;}};
}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-drive-')),repo=new SQLitePlatformRepository({dataDir:dir,startWorker:false}),storage=mockStorage();t.after(()=>{repo.db.close();fs.rmSync(dir,{recursive:true,force:true});});return {repo,storage,drive:new OperatorDrive({repository:repo,storage})};}
async function file(drive,name='영상.mp4',parent=null){const {id}=await drive.create({name,parent,size:4,mime:'video/mp4'},'file');await drive.part(id,1,async()=>Buffer.from('data'));await drive.complete(id);return id;}
test('folders, multipart upload retry, rename/move, trash/restore, restart and permanent deletion',async t=>{
 const {repo,drive,storage}=fixture(t);const folder=await drive.create({name:'방송 원본'},'folder');const id=await file(drive);
 const e=(await drive.list()).entries.find(e=>e.id===id);await drive.edit(id,{parent:folder.id,name:'최종.mp4',revision:e.revision});
 await assert.rejects(drive.edit(id,{name:'옛 이름.mp4',revision:e.revision}),{status:409});
 assert.equal(storage.objects.get(id).toString(),'data');await drive.trash(folder.id);await drive.trash(folder.id);
 assert.equal((await drive.list()).usedBytes,4);await assert.rejects(drive.content(id,true),{status:404});
 const restarted=new OperatorDrive({repository:repo,storage});await restarted.restore(folder.id);assert.equal((await restarted.list()).entries.find(e=>e.id===id).name,'최종.mp4');
 await restarted.trash(folder.id);await restarted.purge(folder.id);await restarted.purge(folder.id);assert.equal((await restarted.list()).entries.length,0);assert.equal(storage.objects.size,0);
});
test('concurrent duplicate names, CAS across instances, cycle prevention and upload folder lock',async t=>{
 const {drive,repo,storage}=fixture(t),second=new OperatorDrive({repository:repo,storage});
 const names=await Promise.allSettled([drive.create({name:'같은 폴더'},'folder'),second.create({name:'같은 폴더'},'folder')]);assert.equal(names.filter(r=>r.status==='fulfilled').length,1);
 const a=(await drive.list()).entries[0],b=await drive.create({name:'하위',parent:a.id},'folder');
 await assert.rejects(drive.edit(a.id,{parent:b.id,revision:a.revision}),/하위/);
 const pending=await drive.create({name:'미완료',parent:b.id,size:4},'file');await assert.rejects(drive.trash(a.id),/미완료/);
 await drive.purge(pending.id,true);assert.equal(storage.uploads.size,0);
 await Promise.all([drive.create({name:'A'},'folder'),second.create({name:'B'},'folder')]);assert.equal((await drive.list()).entries.length,4);
});
test('multipart partial failure, duplicate initialization/completion and response-loss recovery',async t=>{
 const {drive,storage}=fixture(t),id=randomUUID(),body={id,name:'테스트',size:4};
 await Promise.all([drive.create(body,'file'),drive.create(body,'file')]);assert.equal(storage.uploads.size,1);assert.equal((await drive.list()).entries.length,1);
 await assert.rejects(drive.part(id,0,async()=>Buffer.from('data')),{status:400});await assert.rejects(drive.part(id,1,async()=>Buffer.from('x')),{status:400});
 await drive.part(id,1,async()=>Buffer.from('data'));await drive.part(id,1,async()=>Buffer.from('data'));
 storage.loseComplete=true;await assert.rejects(drive.complete(id),/lost response/);await drive.complete(id);await drive.complete(id);
 assert.equal((await drive.list()).usedBytes,4);assert.ok(!(await drive.list()).entries[0].uploadId);
});
test('storage failures retain recoverable state; pending cancellation and purge can retry',async t=>{
 const {drive,storage}=fixture(t);storage.failBegin=true;await assert.rejects(drive.create({name:'실패 파일',size:4},'file'));
 let pending=(await drive.list()).entries[0];await drive.purge(pending.id,true);storage.failBegin=false;
 const id=await file(drive);await drive.trash(id);storage.failRemove=true;await assert.rejects(drive.purge(id));await assert.rejects(drive.restore(id),/영구 삭제/);
 assert.equal((await drive.list()).entries[0].state,'deleting');storage.failRemove=false;await drive.purge(id);assert.equal((await drive.list()).entries.length,0);
});
test('restoring into deleted parent falls back to root; conflicts never overwrite',async t=>{
 const {drive}=fixture(t),folder=await drive.create({name:'폴더'},'folder'),id=await file(drive,'파일',folder.id);
 await drive.trash(id);await drive.trash(folder.id);await drive.purge(folder.id);await drive.restore(id);assert.equal((await drive.list()).entries[0].parent,null);
 await drive.trash(id);await file(drive,'파일');await assert.rejects(drive.restore(id),{status:409});
});
test('input paths, reserved identity, limits and unavailable backend fail closed',async t=>{
 const {drive,repo}=fixture(t);await assert.rejects(drive.create({name:'../x'},'folder'));await assert.rejects(drive.create({id:'../../banner',name:'x'},'folder'));
 await assert.rejects(drive.create({name:'zero',size:0},'file'));await assert.rejects(drive.create({name:'huge',size:30*1024**3},'file'));
 await assert.rejects(new OperatorDrive({repository:repo,storage:null}).list(),{status:503});assert.equal(await repo.getRow(KEY),null);
});
test('HTTP authorization covers list, download, upload and mutations; cross-origin changes rejected',async t=>{
 const {drive}=fixture(t),handler=createDriveApi({drive,isAdmin:r=>r.headers['x-test-auth']==='yes',origin:'https://creok.onrender.com'});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/operator-drive/`,id=randomUUID();
 for(const [route,method]of [['entries','GET'],[`entries/${id}/content`,'GET'],['uploads','POST'],[`entries/${id}/purge`,'POST'],[`entries/${id}/parts/1`,'PUT']])assert.equal((await fetch(base+route,{method})).status,401);
 const headers={'x-test-auth':'yes','content-type':'application/json'};
 assert.equal((await fetch(base+'folders',{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:'{"name":"bad"}'})).status,403);
 assert.equal((await fetch(base+'folders',{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
 assert.equal((await fetch(base+'folders',{method:'POST',headers,body:'null'})).status,400);
 const r=await fetch(base+'folders',{method:'POST',headers,body:JSON.stringify({name:'정상'})});assert.equal(r.status,200);
 assert.equal((await (await fetch(base+'entries',{headers})).json()).entries.length,1);
});
test('R2 adapter confines keys and verifies ordered part sizes before completion',async()=>{
 const commands=[];const r2={bucket:'test',client:{async send(cmd){commands.push(cmd);if(cmd.constructor.name==='ListPartsCommand')return {Parts:[{PartNumber:1,Size:3,ETag:'x'}]};return {};}}};
 const store=createDriveStorage(r2),id=randomUUID();await assert.rejects(store.complete(id,'secret',4,CHUNK),{status:409});
 await store.complete(id,'secret',3,CHUNK);await store.remove(id);
 assert.ok(commands.every(c=>c.input.Key===`operator-drive/objects/${id}`));assert.equal(commands.at(-1).constructor.name,'DeleteObjectCommand');
});
test('signed download preserves Korean filename and refuses active-content inline previews',async()=>{
 const {S3Client}=require('@aws-sdk/client-s3');
 const client=new S3Client({region:'auto',endpoint:'https://example.invalid',credentials:{accessKeyId:'test-key',secretAccessKey:'test-secret'}});
 const store=createDriveStorage({bucket:'test',client}),file={id:randomUUID(),name:'쭌이네 영상.mp4',mime:'video/mp4'};
 const url=new URL(await store.url(file));assert.match(url.searchParams.get('response-content-disposition'),/attachment; filename="download"; filename\*=UTF-8''/);
 assert.ok(url.searchParams.get('response-content-disposition').includes(encodeURIComponent(file.name)));assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
 assert.equal(new URL(await store.url({...file,mime:'text/html'},true)).searchParams.get('response-content-type'),'application/octet-stream');
 assert.equal(new URL(await store.url(file,true)).searchParams.get('response-content-type'),'video/mp4');client.destroy();
});
test('fresh SQLite connection reads persisted tree and failed CAS cannot overwrite saved metadata',async t=>{
 const {drive,repo,storage}=fixture(t),id=await file(drive);const dbPath=repo.dbPath;
 const reopened=new SQLitePlatformRepository({dbPath,startWorker:false});
 try{const other=new OperatorDrive({repository:reopened,storage});assert.equal((await other.list()).entries[0].id,id);
  const failed=new OperatorDrive({repository:{getRow:repo.getRow.bind(repo),compareAndSwapRows:async()=>false},storage});
  await assert.rejects(failed.edit(id,{name:'not saved',revision:1}),{status:409});assert.equal((await other.list()).entries[0].name,'영상.mp4');
 }finally{reopened.db.close();}
});

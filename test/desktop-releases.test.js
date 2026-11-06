'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Readable}=require('node:stream');
const {OperatorDrive}=require('../operator-drive');
const {DesktopReleases,createDesktopReleaseApi,validateRelease,compare}=require('../desktop-releases');

function fixture(){
 let raw=null;
 const repository={async getRow(){return raw===null?null:{value:raw};},async compareAndSwapRows(key,expected,rows){if(raw!==expected)return false;raw=rows[0].value;return true;}};
 const storage={async url(file){return `https://storage.invalid/${file.id}?expires=300`;}};
 const drive=new OperatorDrive({repository,storage});
 return {drive,repository,storage,releases:new DesktopReleases(drive)};
}
async function candidate(f,version='1.0.0'){
 const id=randomUUID(),folder=await f.drive.create({name:'v'+version},'folder');
 await f.drive.change(s=>s.entries.push({id,parent:folder.id,kind:'file',name:`monitor-${version}.exe`,size:100,state:'ready',revision:1}));
 return {schema:1,dataSchema:1,version,platform:'windows-x64',fileId:id,size:100,sha256:'a'.repeat(64),notes:'설치와 인쇄 검증',folder:folder.id};
}
test('empty state, publish, duplicate request, restart and signed download',async()=>{
 const f=fixture();assert.deepEqual(await f.releases.latest(),{release:null});const body=await candidate(f);
 const first=await f.releases.publish(body);assert.deepEqual(await f.releases.publish(body),first);
 const restarted=new DesktopReleases(new OperatorDrive({repository:f.repository,storage:f.storage}));
 assert.equal((await restarted.latest()).release.version,'1.0.0');
 assert.match((await restarted.download('1.0.0')).url,/expires=300/);
 assert.equal(Object.keys((await f.drive.read()).state.desktopReleases).length,1);
});
test('published version cannot be replaced, renamed, trashed or deleted with parent folder',async()=>{
 const f=fixture(),body=await candidate(f);await f.releases.publish(body);
 await assert.rejects(f.releases.publish({...body,sha256:'b'.repeat(64)}),{status:409});
 await assert.rejects(f.drive.edit(body.fileId,{name:'changed.exe',revision:1}),{status:409});
 await assert.rejects(f.drive.trash(body.fileId),{status:409});
 await assert.rejects(f.drive.trash(body.folder),{status:409});
 await assert.rejects(f.drive.purge(body.fileId),{status:409});
});
test('concurrent publishing and trashing cannot leave a stable version pointing to trash',async()=>{
 const f=fixture(),body=await candidate(f);
 const result=await Promise.allSettled([f.releases.publish(body),f.drive.trash(body.folder)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const latest=await f.releases.latest();if(latest.release)assert.ok(!(await f.drive.read()).state.entries.find(e=>e.id===body.fileId).trashRoot);
});
test('out-of-order publication cannot downgrade stable and prior installer remains downloadable',async()=>{
 const f=fixture(),older=await candidate(f,'1.9.0'),newer=await candidate(f,'1.10.0');
 await f.releases.publish(older);await f.releases.publish(newer);
 await assert.rejects(f.releases.publish(older),{status:409});
 assert.equal((await f.releases.latest()).release.version,'1.10.0');
 assert.ok((await f.releases.download('1.9.0')).url);assert.ok(compare('1.10.0','1.9.0')>0);
});
test('incomplete, wrong-size, deleted and non-installer artifacts cannot publish',async()=>{
 for(const change of [{state:'uploading'},{size:99},{trashRoot:'test'},{name:'file.js'}]){
  const f=fixture(),body=await candidate(f);await f.drive.change(s=>Object.assign(s.entries.find(e=>e.id===body.fileId),change));
  await assert.rejects(f.releases.publish(body),{status:409});assert.deepEqual(await f.releases.latest(),{release:null});
 }
});
test('manifest validation rejects unsupported schemas, arbitrary IDs and unsafe versions',()=>{
 const body={schema:1,dataSchema:1,version:'1.0.0',platform:'windows-x64',fileId:randomUUID(),size:100,sha256:'a'.repeat(64),notes:'변경'};
 for(const override of [{version:'../file'},{version:'01.0.0'},{size:0},{size:2**40},{fileId:'unknown'},{sha256:'bad'},{dataSchema:2},{platform:'linux'}])assert.throws(()=>validateRelease({...body,...override}));
});
test('storage failure leaves the stable registry unchanged',async()=>{
 const f=fixture(),body=await candidate(f);f.repository.compareAndSwapRows=async()=>{throw Error('disk full');};
 await assert.rejects(f.releases.publish(body),/disk full/);assert.deepEqual(await f.releases.latest(),{release:null});
});
async function request(handler,method,path,body,headers={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{method,headers:{'content-type':'application/json',...headers}});
 let status,result;const res={writeHead(s){status=s;},end(text){result=JSON.parse(text);}};
 const handled=await handler(req,res,new URL(path,'https://creok.onrender.com'));
 return {handled,status,result};
}
test('API authentication, cross-site writes and download response have explicit boundaries',async()=>{
 const f=fixture(),body=await candidate(f);let allowed=false;
 const api=createDesktopReleaseApi({drive:f.drive,isAdmin:async()=>allowed});
 assert.equal((await request(api,'GET','/api/desktop-releases/stable')).status,401);
 allowed=true;assert.equal((await request(api,'POST','/api/desktop-releases/publish',body,{origin:'https://evil.invalid'})).status,403);
 assert.equal((await request(api,'POST','/api/desktop-releases/publish',body)).status,200);
 const response=await request(api,'GET','/api/desktop-releases/1.0.0/download');assert.equal(response.status,200);assert.equal(response.result.expiresIn,300);
 assert.equal((await request(api,'GET','/not-a-release')).handled,false);
});

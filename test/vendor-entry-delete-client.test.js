'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const source=fs.readFileSync(require.resolve('../public/vendor-entry-api.js'),'utf8');
function fixture(pathname='/vendor-entries.html'){
 const records=new Map(),ownerId=randomUUID(),entry={id:randomUUID(),version:1,status:'draft'};
 let state={ownerId,channelId:'alpha',version:1,entries:[entry],parents:[],media:[]},failNext=false,deferRead=null;
 const posts=[];let reads=0;
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={transaction(){const tx={objectStore(){const run=fn=>{const result={};queueMicrotask(()=>{result.result=fn();tx.oncomplete?.();});return result;};return {get:key=>run(()=>structuredClone(records.get(key))),put:(value,key)=>run(()=>records.set(key,structuredClone(value))),delete:key=>run(()=>records.delete(key))};}};return tx;}};request.onsuccess();});return request;}};
 const fetch=async(url,options)=>{
  if(!options.body){reads++;const snapshot=structuredClone(state);if(deferRead){const wait=deferRead;deferRead=null;await wait;}return {ok:true,json:async()=>({state:snapshot})};}
  const body=JSON.parse(options.body);posts.push(body);
  if(failNext){failNext=false;throw Error('lost response');}
  state={...state,version:2,entries:[]};return {ok:true,json:async()=>({state:structuredClone(state),result:entry.id,duplicate:posts.length>1})};
 };
 const context=vm.createContext({window:{},location:{search:'?code=local-only&event=alpha',pathname},URLSearchParams,structuredClone,crypto:{randomUUID},indexedDB,fetch,AbortSignal});
 vm.runInContext(source,context);
 return {store:context.window.EntryPreviewStore,records,posts,entry,key:ownerId+':alpha:draft',get reads(){return reads;},snapshot:()=>structuredClone(state),loseNext(){failNext=true;},deleted(){state={...state,version:2,entries:[]};},holdRead(promise){deferRead=promise;}};
}
test('broadcast-provided entries restore local drafts without a duplicate network request and preserve channel isolation',async()=>{
 const f=fixture('/vendor-broadcast.html'),state=f.snapshot();
 f.records.set(f.key,{nationalDrafts:{[f.entry.id]:{note:'아직 작성 중'}}});
 const saved=await f.store.read({state:{...state,bookingSummary:{enabled:true,mode:'regional-cycle-v1'}}});
 assert.equal(f.reads,0);assert.equal(saved.entries[0].id,f.entry.id);assert.equal(f.store.recovery.read().nationalDrafts[f.entry.id].note,'아직 작성 중');
 assert.ok(f.store.pageUrl('booking').startsWith('/vendor-broadcast.html?'));
 await assert.rejects(f.store.read({state:{...state,channelId:'other'}}),/경매가 일치/);
 assert.equal(f.store.CHANNEL,'alpha');assert.equal(f.store.getState().ownerId,state.ownerId);
});
test('a broadcast rendered at the original short URL adopts its entries without redirecting to a second document',async()=>{
 const f=fixture('/w/local-only');
 await f.store.read({state:{...f.snapshot(),bookingSummary:{enabled:true,mode:'regional-cycle-v1'}}});
 assert.equal(f.reads,0);assert.equal(f.store.getState().entries.length,1);
});
test('delete retries reuse the durable request id and clear only the matching recovered draft',async()=>{
 const f=fixture();await f.store.read();await f.store.recovery.save({entry:f.entry,parent:{id:'parent-draft'}});
 f.loseNext();const request={type:'delete',id:f.entry.id,expectedVersion:1};
 await assert.rejects(f.store.send(request),/연결하지/);assert.equal(f.store.recovery.read().entry.id,f.entry.id);
 await f.store.send(request);
 assert.equal(f.posts.length,2);assert.equal(f.posts[0].requestId,f.posts[1].requestId);
 assert.equal(f.store.getState().entries.length,0);assert.equal(f.store.recovery.read().entry,null);assert.equal(f.store.recovery.read().parent.id,'parent-draft');
 assert.equal(f.records.get(f.key).entry,null);
});
test('reload drops a recovered saved entry deleted on another device but keeps new unsaved work',async()=>{
 const f=fixture();await f.store.read();await f.store.recovery.save({entry:f.entry});f.deleted();await f.store.read();
 assert.equal(f.store.recovery.read(),null);assert.equal(f.records.get(f.key),null);
 await f.store.recovery.save({entry:{id:randomUUID(),version:0,note:'아직 저장 전'}});await f.store.read();
 assert.equal(f.store.recovery.read().entry.note,'아직 저장 전');
});
test('a delayed pre-delete read cannot restore a removed row or its recovery state',async()=>{
 const f=fixture();await f.store.read();await f.store.recovery.save({entry:f.entry});
 let release;f.holdRead(new Promise(resolve=>{release=resolve}));const beforeDelete=f.store.read();
 await f.store.send({type:'delete',id:f.entry.id,expectedVersion:1});release();
 assert.equal((await beforeDelete).entries.length,0);assert.equal(f.store.recovery.read(),null);
});

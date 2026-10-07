'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
async function fixture(t){const f=await createFixture();t.after(f.close);const owner=await f.login('01000000001'),other=await f.login('01000000002');
 const register=async(c,name)=>(await f.post(c,'register',{name,region:'서울·인천',phone:(await f.refresh(c)).json().phone})).json().id;
 const id=await register(owner,'테스트 업체'),otherId=await register(other,'다른 업체');assert.ok(id&&otherId);
 const get=(c=owner,company=id,admin=false)=>f.call(c,'GET','/api/platform/promo-center?month=2026-09'+(admin?'':'&company='+company),undefined,admin?{'x-creo-admin':f.secret}:{});
 const post=(body,c=owner,admin=false)=>f.call(c,'POST','/api/platform/promo-center',{requestId:randomUUID(),...(!admin?{company:id}:{}),...body},admin?{'x-creo-admin':f.secret}:{});
 const assign=async(extra={})=>{const s=(await get(owner,id,true)).json();return post({action:'assign',revision:s.revision,date:'2026-09-23',slot:'afternoon',vendorId:id,templateId:s.templates[0].id,...extra},owner,true);};
 return {...f,owner,other,id,otherId,get,post,assign};
}
test('promo routes require live membership and CSRF; vendor cannot assign or impersonate',async t=>{
 const f=await fixture(t);assert.equal((await f.get()).status,200);assert.equal((await f.get(f.client())).status,401);assert.equal((await f.get(f.other)).status,403);
 assert.equal((await f.call(f.owner,'GET','/api/platform/promo-center?month=2026-09&company='+f.id,undefined,{'x-creo-admin':f.secret})).json().admin,false);
 assert.equal((await f.post({action:'assign',revision:0})).status,403);
 const r=await f.call(f.owner,'POST','/api/platform/promo-center',{action:'copy',company:f.id,requestId:randomUUID(),templateId:'ep01-welcome',version:1},{origin:'https://evil.invalid'});assert.equal(r.status,403);
 assert.equal((await f.post({action:'copy',templateId:'ep01-welcome',version:1},f.other)).status,403);
 await f.call(f.owner,'POST','/api/platform/vendor-access/logout',{});assert.equal((await f.get()).status,401);
});
test('concurrent assignments obey capacity; retry is idempotent; restart retains records',async t=>{
 const f=await fixture(t),body={action:'assign',revision:0,date:'2026-09-23',slot:'afternoon',vendorId:f.id,templateId:'ep01-welcome',requestId:randomUUID()};
 const results=await Promise.all([f.post(body,f.owner,true),f.post({...body,vendorId:f.otherId,requestId:randomUUID()},f.owner,true)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const winning=results[0].status===200?body:null;
 if(winning)assert.equal((await f.post(body,f.owner,true)).json().duplicate,true);
 f.restart();const snapshot=(await f.get()).json();assert.equal(snapshot.assignments.length,1);assert.equal(snapshot.assignments[0].status,'assigned');
 assert.equal((await f.assign({vendorId:f.otherId})).status,409);
});
test('copy is distinct from publication, owned completion validates time, URL, duplicate and restart',async t=>{
 const f=await fixture(t),a=(await f.assign()).json();assert.ok(a.id);
 const copy={action:'copy',requestId:randomUUID(),templateId:'ep01-welcome',version:1};assert.equal((await f.post(copy)).status,200);assert.equal((await f.post(copy)).json().duplicate,true);
 assert.equal((await f.get()).json().assignments[0].status,'assigned');assert.equal((await f.get()).json().templates.find(t=>t.id==='ep01-welcome').usage.length,1);
 const complete={action:'complete',id:a.id,templateId:'ep01-welcome',version:1,url:'https://cafe.naver.com/reptilia/12345',requestId:randomUUID()};
 assert.equal((await f.post(complete)).status,422);f.advance(5*3600000);
 assert.equal((await f.post({...complete,company:f.otherId},f.other)).status,403);
 assert.equal((await f.post({...complete,url:'https://evil.invalid/12345'})).status,422);
 assert.equal((await f.post(complete)).status,200);assert.equal((await f.post(complete)).json().duplicate,true);
 f.restart();assert.equal((await f.get()).json().assignments[0].status,'completed');
 assert.equal((await f.post({...complete,requestId:randomUUID()})).status,409);
});
test('end-of-slot status uses Korea time, cancelled assignment frees slot, stale change fails',async t=>{
 const f=await fixture(t),a=(await f.assign()).json();f.advance(6*3600000);assert.equal((await f.get()).json().assignments[0].status,'overdue');
 assert.equal((await f.post({action:'cancel',id:a.id,revision:0},f.owner,true)).status,409);
 const s=(await f.get()).json();assert.equal((await f.post({action:'cancel',id:a.id,revision:s.revision},f.owner,true)).status,200);
 assert.equal((await f.get()).json().assignments[0].status,'cancelled');
 assert.equal((await f.assign({date:'2026-09-24'})).status,200);
});
test('template validation rejects active payloads, versions cannot be overwritten, storage failure not reported as success',async t=>{
 const f=await fixture(t),s=(await f.get()).json(),template=s.templates[0];
 assert.equal((await f.post({action:'template',revision:0,name:'unsafe',title:'unsafe',blocks:[{type:'image',src:'javascript:alert(1)'}]},f.owner,true)).status,422);
 const update={action:'template',revision:0,id:template.id,name:'수정',title:'수정 제목',blocks:template.blocks};assert.equal((await f.post(update,f.owner,true)).status,200);
 assert.equal((await f.post(update,f.owner,true)).status,409);assert.equal((await f.post({action:'copy',templateId:template.id,version:1})).status,409);
 const previous=f.repository.compareAndSwapRows;f.repository.compareAndSwapRows=async()=>{throw Error('isolated disk failure')};
 assert.equal((await f.post({action:'copy',templateId:template.id,version:2})).status,500);f.repository.compareAndSwapRows=previous;
 assert.equal((await f.get()).json().templates[0].usage.length,0);
});

test('unfinished own assignments remain discoverable across months and after deadline',async t=>{
 const f=await fixture(t);await f.assign();await f.assign({date:'2026-10-01'});
 f.advance(6*3600000);
 const s=(await f.get()).json();assert.equal(s.pending.length,2);assert.equal(s.pending[0].status,'overdue');assert.equal(s.pending[1].date,'2026-10-01');
 assert.equal((await f.get(f.other,f.otherId)).json().pending.length,0);
});

test('assigned template cannot be hidden; tracking URL variations cannot complete another assignment',async t=>{
 const f=await fixture(t),a=(await f.assign()).json();const s=(await f.get()).json(),template=s.templates[0];
 assert.equal((await f.post({action:'template',revision:s.revision,id:template.id,name:template.name,title:template.title,blocks:template.blocks,active:false},f.owner,true)).status,409);
 f.advance(5*3600000);
 assert.equal((await f.post({action:'complete',id:a.id,templateId:template.id,version:template.version,url:'https://m.cafe.naver.com/reptilia/12345/?from=share#comment'})).status,200);
 const next=(await f.assign({date:'2026-09-24'})).json();f.advance(24*3600000);
 assert.equal((await f.post({action:'complete',id:next.id,templateId:template.id,version:template.version,url:'https://cafe.naver.com/reptilia/12345?from=another'})).status,409);
 assert.equal((await f.get()).json().assignments[0].publication.url,'https://cafe.naver.com/reptilia/12345');
});

test('new bundled manuscripts merge into existing state without overwriting edits or history',async t=>{
 const f=await fixture(t);await f.assign();await f.post({action:'copy',templateId:'ep01-welcome',version:1});
 const key=require('../platform-core').channelKey('national-cre','setting','promo-center');
 const row=(await f.repository.getRowsByKeys([key]))[0],saved=JSON.parse(row.value);
 saved.templates=saved.templates.filter(t=>!t.id.startsWith('launch26-'));
 saved.templates[0].title='수정한 나만의 제목과 인사말';saved.templates[0].active=false;
 await f.repository.upsertRows([{key,value:JSON.stringify(saved)}]);f.restart();
 let view=(await f.get(f.owner,f.id,true)).json();const bundled=require('../promo-templates.json');assert.equal(view.templates.filter(t=>t.id.startsWith('launch26-')).length,bundled.filter(t=>t.id.startsWith('launch26-')).length);
 assert.equal(view.templates[0].title,'수정한 나만의 제목과 인사말');assert.equal(view.templates[0].active,false);assert.equal(view.templates.find(t=>t.id==='ep01-welcome').usage.length,1);assert.equal(view.assignments.length,1);
 assert.equal((await f.post({action:'copy',templateId:'launch26-joseon',version:1})).status,200);f.restart();
 view=(await f.get(f.owner,f.id,true)).json();assert.equal(view.templates.length,bundled.length);assert.equal(view.templates.find(t=>t.id==='launch26-joseon').usage.length,1);
});

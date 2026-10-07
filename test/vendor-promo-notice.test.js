'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID}=require('node:crypto'),{createFixture}=require('../tools/vendor-portal-preview.cjs');
async function fixture(t){
 const f=await createFixture();t.after(f.close);const owner=await f.login('01000000001'),other=await f.login('01000000002');
 const id=(await f.post(owner,'register',{name:'홍보 테스트',region:'서울·인천',phone:'01000000001'})).json().id;
 const tasks=(c=owner,company=id)=>f.call(c,'GET','/api/platform/vendor-access/tasks?company='+company);
 const promo=()=>f.call(owner,'GET','/api/platform/promo-center?month=2026-09',undefined,{'x-creo-admin':f.secret});
 const change=async(body,admin=true)=>f.call(owner,'POST','/api/platform/promo-center',{requestId:randomUUID(),...(admin?{revision:(await promo()).json().revision}:{company:id}),...body},admin?{'x-creo-admin':f.secret}:{});
 const assign=async(date)=>change({action:'assign',date,slot:'afternoon',vendorId:id,templateId:'launch26-taste'});
 return {...f,id,owner,other,tasks,change,assign};
}
test('vendor summary requires own live membership and includes no private vendor fields',async t=>{
 const f=await fixture(t);assert.equal((await f.tasks(f.client())).status,401);assert.equal((await f.tasks(f.other)).status,403);
 const empty=(await f.tasks()).json();assert.equal(empty.promoAttention,false);assert.deepEqual(empty.promoSummary,{pendingCount:0,next:null});
 const a=(await f.assign('2026-09-23')).json();const status=(await f.tasks()).json();
 assert.equal(status.promoAttention,true);assert.equal(status.promoSummary.next.id,a.id);assert.equal(status.promoSummary.next.isToday,true);
 assert.equal(status.promoSummary.next.start,'13:30');assert.equal(status.promoSummary.next.end,'14:55');
 assert.doesNotMatch(JSON.stringify(status.promoSummary),/01000000001|bankAccount|actorId|loginPhone/);
 await f.post(f.owner,'logout',{});assert.equal((await f.tasks()).status,401);
});
test('today has priority over old missed dates; completion, cancellation, cross-month and restart stay accurate',async t=>{
 const f=await fixture(t),old=(await f.assign('2026-09-23')).json(),today=(await f.assign('2026-09-24')).json(),future=(await f.assign('2026-10-14')).json();
 f.advance(24*3600000);let status=(await f.tasks()).json();assert.equal(status.promoSummary.pendingCount,3);assert.equal(status.promoSummary.next.id,today.id);
 f.advance(5*3600000);
 const complete={action:'complete',id:today.id,templateId:'launch26-taste',version:1,url:'https://cafe.naver.com/reptilia/8765432',requestId:randomUUID()};
 const done=await f.change(complete,false);assert.equal(done.status,200,done.body);assert.equal((await f.change(complete,false)).json().duplicate,true);
 assert.equal((await f.tasks()).json().promoSummary.next.id,old.id);assert.equal((await f.tasks()).json().promoSummary.next.status,'overdue');
 await f.change({action:'cancel',id:old.id});f.restart();status=(await f.tasks()).json();assert.equal(status.promoSummary.pendingCount,1);assert.equal(status.promoSummary.next.id,future.id);assert.equal(status.promoSummary.next.isToday,false);
 await f.change({action:'cancel',id:future.id});assert.equal((await f.tasks()).json().promoAttention,false);
});
test('failed promo read leaves other vendor task summaries usable and reports a retry state',async t=>{
 const f=await fixture(t),normal=f.repository.getRowsByKeys.bind(f.repository),key=require('../platform-core').channelKey('national-cre','setting','promo-center');
 f.repository.getRowsByKeys=async keys=>{if(keys.includes(key))throw Error('isolated promo read failure');return normal(keys);};
 const response=await f.tasks();assert.equal(response.status,200,response.body);const s=response.json();assert.equal(s.promoUnavailable,true);assert.equal(typeof s.bookingAttention,'boolean');assert.equal(typeof s.settlementAttention,'boolean');
 f.repository.getRowsByKeys=normal;assert.equal((await f.tasks()).json().promoUnavailable,undefined);
});
const source=fs.readFileSync(require.resolve('../public/vendor-portal-shell.js'),'utf8');
function ui(){
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),calls=[];
 const host={dataset:{},isConnected:true,hidden:true,innerHTML:'',setAttribute(){},removeAttribute(){},querySelector(){return null;}};
 const ctx=vm.createContext({esc,AbortSignal,fetch:url=>new Promise((resolve,reject)=>calls.push({url,resolve,reject}))});
 vm.runInContext(source.slice(source.indexOf(' function promoMarkup('),source.indexOf(' const refreshVersions=')),ctx);return {ctx,host,calls};
}
test('notice shows exact time, escaped title, clear deadline state, direct assignment link and safe empty state',()=>{
 const f=ui(),s={promoSummary:{pendingCount:2,next:{id:'a&b',date:'2026-10-14',slotLabel:'오후',start:'13:30',end:'14:55',status:'assigned',isToday:true,title:'<img onerror=attack()>'}}};
 const html=f.ctx.promoMarkup('company&other',s);assert.match(html,/오늘 홍보글 게시 대상/);assert.match(html,/10월 14일 · 오후 13:30–14:55/);assert.match(html,/assignment=a%26b/);assert.match(html,/company=company%26other/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/미완료 일정 2건/);
 s.promoSummary.next.status='overdue';assert.match(f.ctx.promoMarkup('x',s),/이미 게시했다면 글 링크/);
 assert.equal(f.ctx.promoMarkup('x',{promoSummary:{pendingCount:0,next:null}}),'');assert.match(f.ctx.promoMarkup('x',{promoUnavailable:true}),/다시 확인/);
});
test('late or disconnected responses cannot replace another company notice; failure has a retry state',async()=>{
 const f=ui(),first=f.ctx.mountPromo(f.host,'old'),second=f.ctx.mountPromo(f.host,'new');
 f.calls[1].resolve({ok:true,json:async()=>({promoUnavailable:true})});await second;const current=f.host.innerHTML;
 f.calls[0].resolve({ok:true,json:async()=>({promoSummary:{pendingCount:0,next:null}})});await first;assert.equal(f.host.dataset.company,'new');assert.equal(f.host.innerHTML,current);
 const disconnected=f.ctx.mountPromo(f.host,'third');f.host.isConnected=false;f.calls[2].reject(Error('timeout'));await disconnected;assert.equal(f.host.innerHTML,current);
 f.host.isConnected=true;const fail=f.ctx.mountPromo(f.host,'fourth');f.calls[3].reject(Error('timeout'));await fail;assert.match(f.host.innerHTML,/불러오지 못했어요/);assert.equal(f.host.hidden,false);
});
function deepLink(id,pending,admin=false){
 const status={textContent:''},calls=[];const ctx=vm.createContext({query:new URLSearchParams({assignment:id}),admin,assignmentOpened:false,company:'mine',state:{pending},month:'2026-10',selected:'2026-10-08',$:()=>status,render:()=>calls.push('render'),refresh:async()=>calls.push('refresh'),preview:tid=>calls.push(tid)});
 const code=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');vm.runInContext(code.slice(code.indexOf(' async function openAssignedPreview('),code.indexOf(' async function start()')),ctx);return {ctx,calls,status};
}
test('assignment entry opens only own pending manuscript once and switches to the assigned month',async()=>{
 const f=deepLink('wanted',[{id:'wanted',vendorId:'mine',date:'2026-11-01',templateId:'taste'}]);await f.ctx.openAssignedPreview();assert.equal(f.ctx.month,'2026-11');assert.equal(f.ctx.selected,'2026-11-01');assert.deepEqual(f.calls,['refresh','taste']);await f.ctx.openAssignedPreview();assert.equal(f.calls.length,2);
 for(const pending of [[],[{id:'wanted',vendorId:'other',date:'2026-11-01',templateId:'private'}]]){const x=deepLink('wanted',pending);await x.ctx.openAssignedPreview();assert.equal(x.calls.length,0);assert.match(x.status.textContent,/완료되었거나 변경/);}
 const changed=deepLink('wanted',[{id:'wanted',vendorId:'mine',date:'2026-11-01',templateId:'taste'}]);changed.ctx.refresh=async()=>{changed.ctx.state.pending=[];};await changed.ctx.openAssignedPreview();assert.match(changed.status.textContent,/변경/);assert.equal(changed.calls.length,0);
 const a=deepLink('wanted',[],true);await a.ctx.openAssignedPreview();assert.equal(a.ctx.assignmentOpened,false);
});

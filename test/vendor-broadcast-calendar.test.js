'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),Tasks=require('../public/vendor-task-state');
const source=fs.readFileSync(require.resolve('../public/vendor-broadcast.js'),'utf8');
const html=fs.readFileSync(require.resolve('../public/vendor-broadcast.html'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function payload(){
 const regions=['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남'];
 return {mode:'regional-cycle-v1',now:'2026-10-20T00:00:00Z',vendor:{name:'가상 업체',region:regions[2]},dates:['2026-10-14','2026-10-19','2026-10-21','2026-10-26','2026-10-28'].map((date,i)=>({date,regionName:regions[i],startsAt:date+'T11:00:00Z',maxQuantityAvailable:i===2?4:0})),reservations:[],entryState:{entries:[],parents:[],media:[],events:[{id:'national-cre',entriesOpen:true}]}};
}
async function fixture(initial=payload(),savedRecovery={}){
  const {document,window:dom}=parseHTML(html);let data=initial,recovery=savedRecovery;const requests=[];
  const sheet=document.querySelector('#sheet');sheet.showModal=()=>{sheet.open=true};sheet.close=()=>{sheet.open=false;sheet.dispatchEvent(new dom.Event('close'))};
  const Store={token:'isolated',read:async()=>{},getState:()=>data.entryState,recovery:{read:()=>recovery,save:async value=>{recovery=structuredClone(value)}},pageUrl:()=>'/vendor-checkout.html'};
 const window={EntryPreviewStore:Store,CreoVendorShell:{mount(){}},addEventListener(){}};
  const storage=new Map();
  vm.runInNewContext(source,{document,window,location:{search:'',pathname:'/vendor-broadcast.html'},URLSearchParams,structuredClone,setTimeout:()=>0,crypto:require('node:crypto'),sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},CreoVendorTasks:Tasks,AbortSignal,fetch:async(_url,options)=>{if(options.method==='POST')requests.push(JSON.parse(options.body));return {ok:true,json:async()=>structuredClone(data)}}});
 await tick();assert.equal(document.querySelector('#load-error').textContent,'');
  return {document,$:s=>document.querySelector(s),event:type=>new dom.Event(type,{bubbles:true,cancelable:true}),set:next=>data=next,requests,recovery:()=>recovery};
}
test('five-date calendar disables empty month navigation and preserves the five region labels',async()=>{
 const f=await fixture();
 assert.equal(f.$('[data-month="-1"]').disabled,true);assert.equal(f.$('[data-month="1"]').disabled,true);
 assert.deepEqual([...f.document.querySelectorAll('.day[data-date]')].map(b=>b.dataset.date),payload().dates.map(d=>d.date));
 assert.equal(f.document.querySelectorAll('.registration-task').length,1);
 f.$('[data-month="1"]').click();assert.equal(f.$('.calendar-head h2').textContent,'2026년 10월');
});

test('cross-region panel assignment is visible separately, with a one-entry limit and no ordinary registration prompt',async()=>{
 const data=payload();data.vendor.id='vendor';const date=data.dates[3];date.panelAssigned=true;date.panelLimit=1;
 data.entryState.entries=[{id:'panel-1',entryNumber:1,channelId:'national-cre',channelVendorId:'vendor',broadcastDate:date.date,auctionKind:'event',status:'draft',version:1}];
 const f=await fixture(data),button=f.$('[data-panel-date="2026-10-26"]');assert.ok(button);
 assert.match(button.closest('article').textContent,/패널 참여 · 1 \/ 1마리/);
 assert.doesNotMatch(button.closest('article').textContent,/접수 일정 확인|출품할 개체 4마리/);
 button.click();await tick();assert.equal(f.document.querySelectorAll('.bulk-row').length,1);assert.equal(f.$('[data-action="panel-add"]'),null);
 f.$('[data-action="panel-back"]').click();await tick();assert.equal(f.$('#sheet').open,false);assert.equal(f.requests.length,0);
 assert.ok(f.$('[data-start-registration="true"]'));
});
function submitted(){const data=payload(),date=data.dates[2],entries=Array.from({length:4},(_,i)=>({id:'entry-'+i,version:1,status:'submitted',sex:'unknown',weight:'3',hatchDate:'2026-09-01'}));data.reservations=[{id:'reservation',date:date.date,status:'confirmed',session:date,completed:4,entryLimit:4,entryIds:entries.map(e=>e.id),entries}];data.entryState.entries=entries;return data;}

test('panel editor shows a separate count and preserves stable rows and the normal four-entry route',async()=>{
 const data=submitted();data.vendor.id='vendor';
 const panels=[2,1].map(i=>({id:'panel-'+i,entryNumber:i,channelId:'national-cre',channelVendorId:'vendor',broadcastDate:data.dates[2].date,auctionKind:'event',status:'draft',version:1,sex:'unknown',weight:String(i+10),hatchDate:'2025-01-01'}));data.entryState.entries.push(...panels);
 const f=await fixture(data);f.$('[data-panel-date]').click();await tick();
 assert.match(f.$('.entry-progress').textContent,/패널개체/);assert.equal(f.document.querySelectorAll('.bulk-row').length,2);
 assert.equal(f.$('[name="weight-0"]').value,'11');assert.equal(f.$('[name="weight-1"]').value,'12');
 assert.match(f.$('#bulk-entry-form').textContent,/개체등록비 1만 원 면제/);
 assert.equal(f.$('[data-action="pickup"]'),null);
 f.$('[data-action="panel-back"]').click();await tick();assert.equal(f.document.querySelectorAll('.bulk-row').length,4);assert.equal(f.requests.length,0);
 const css=fs.readFileSync(require.resolve('../public/vendor-broadcast.css'),'utf8');assert.match(css,/\[data-action="panel-delete"\][^{]*\{[^}]*grid-column:1\/-1/);
});
test('opening and closing a submitted edit sends no withdrawal or save and keeps a path to the completed entries',async()=>{
 const f=await fixture(submitted());assert.match(f.$('.vendor-round-card').textContent,/접수 완료/);assert.match(f.$('.vendor-round-card').textContent,/보기·수정/);
 f.$('.vendor-round-card [data-date]').click();f.$('[data-action="bulk-reopen"]').click();await tick();
 assert.equal(f.requests.length,0);assert.match(f.$('.bulk-row-state').textContent,/기존 접수 유지/);
 await f.$('#close').onclick();assert.equal(f.requests.length,0);assert.equal(f.$('#sheet').open,false);
 await f.$('#refresh').onclick();assert.match(f.$('.round-status').textContent,/접수 완료/);
});
test('a recovered submitted edit stays local and cancel restores accepted fields without a server mutation',async()=>{
 const data=submitted(),saved={nationalDrafts:{'entry-0':{...data.reservations[0].entries[0],weight:'8',note:'',parents:{sire:{},dam:{}}}}};
 const f=await fixture(data,saved);f.$('.vendor-round-card [data-date]').click();
 assert.equal(f.$('[name="weight-0"]').value,'8');assert.match(f.$('.bulk-row-state').textContent,/기존 접수 유지/);
 f.$('[data-action="bulk-cancel-edit"]').click();await tick();
 assert.equal(f.$('[name="weight-0"]').value,'3');assert.equal(f.recovery().nationalDrafts['entry-0'],undefined);assert.equal(f.requests.length,0);
});
test('personal entry cards precede collapsed calendar and delivery details and preserve historical access',async()=>{
 const f=await fixture(submitted());assert.ok(f.$('#calendar-content').firstElementChild.classList.contains('my-broadcasts'));
 assert.equal(!!f.$('#all-broadcast-dates').open,false);assert.equal(!!f.$('#vendor-delivery').open,false);assert.ok(f.$('.parent-task'));
 const past=submitted();past.now='2026-10-22T00:00:00Z';f.set(past);await f.$('#refresh').onclick();assert.match(f.$('.my-broadcasts').textContent,/지난 출품 내역/);assert.match(f.$('.my-broadcasts').textContent,/출품 내역 보기/);
 assert.doesNotMatch(f.$('.my-broadcasts').textContent,/수정|미등록|등록 이어|등록 시작/);assert.equal(f.$('.parent-task'),null);
 f.$('.vendor-round-card [data-date]').click();assert.equal(f.$('[name="weight-0"]').hasAttribute('readonly'),true);assert.equal(f.$('[data-action="bulk-reopen"]'),null);assert.equal(f.$('[data-bulk-photo="sire"]'),null);assert.equal(f.$('[data-action="pickup"]'),null);assert.equal(f.requests.length,0);
});
test('the parent shortcut opens editable fields without withdrawing and today stays current after broadcast start',async()=>{
 const data=submitted();data.now='2026-10-21T14:00:00Z';assert.equal(Tasks.vendorBroadcasts(data)[0].past,false);
 const f=await fixture(data);f.$('.parent-task').click();assert.equal(f.$('[data-bulk-row="0"] details').open,true);
 assert.equal(f.$('[name="weight-0"]').hasAttribute('readonly'),false);assert.ok(f.$('[data-bulk-photo="sire"]'));assert.equal(f.requests.length,0);
});
test('unsaved submitted edits survive closing locally and only the explicit save sends an atomic replacement',async()=>{
 const f=await fixture(submitted());f.$('.vendor-round-card [data-date]').click();f.$('[data-action="bulk-reopen"]').click();await tick();
 const weight=f.$('[name="weight-0"]');weight.value='8';weight.dispatchEvent(f.event('input'));await f.$('#close').onclick();
 assert.equal(f.requests.length,0);assert.equal(f.recovery().nationalDrafts['entry-0'].weight,'8');
 f.$('.vendor-round-card [data-date]').click();assert.equal(f.$('[name="weight-0"]').value,'8');
 for(const input of f.document.querySelectorAll('input,select'))input.checkValidity=()=>true;
 f.$('#bulk-entry-form').dispatchEvent(f.event('submit'));await tick();await tick();
 assert.equal(f.$('#step-error').textContent,'');assert.equal(f.requests.length,1);assert.equal(f.requests[0].type,'save-entries');assert.equal(f.requests[0].submit,true);
 assert.equal(f.requests[0].entries.length,1);assert.equal(f.requests[0].entries[0].replaceSubmitted,true);assert.equal(f.requests[0].entries[0].entry.weight,'8');
});
test('existing later records remain reachable and refreshing a removed month returns to the first cycle',async()=>{
 const f=await fixture(),next=payload();
 next.dates.push({date:'2026-12-07',regionName:'서울·인천',startsAt:'2026-12-07T11:00:00Z',maxQuantityAvailable:0});
 f.set(next);await f.$('#refresh').onclick();
 assert.equal(f.$('[data-month="1"]').disabled,false);f.$('[data-month="1"]').click();
 assert.equal(f.$('.calendar-head h2').textContent,'2026년 12월');assert.ok(f.$('.day[data-date="2026-12-07"]'));
 assert.equal(f.$('[data-month="1"]').disabled,true);assert.equal(f.$('[data-month="-1"]').disabled,false);
 f.$('[data-month="-1"]').click();assert.equal(f.$('.calendar-head h2').textContent,'2026년 10월');
 f.$('[data-month="1"]').click();f.set(payload());await f.$('#refresh').onclick();
 assert.equal(f.$('.calendar-head h2').textContent,'2026년 10월');assert.equal(f.$('[data-month="1"]').disabled,true);
});

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
async function fixture(){
 const {document}=parseHTML(html);let data=payload();
 const Store={token:'isolated',read:async()=>{},recovery:{read:()=>null},pageUrl:()=>'/vendor-checkout.html'};
 const window={EntryPreviewStore:Store,CreoVendorShell:{mount(){}},addEventListener(){}};
 vm.runInNewContext(source,{document,window,location:{search:'',pathname:'/vendor-broadcast.html'},URLSearchParams,CreoVendorTasks:Tasks,AbortSignal,fetch:async()=>({ok:true,json:async()=>structuredClone(data)})});
 await tick();assert.equal(document.querySelector('#load-error').textContent,'');
 return {document,$:s=>document.querySelector(s),set:next=>data=next};
}
test('five-date calendar disables empty month navigation and preserves the five region labels',async()=>{
 const f=await fixture();
 assert.equal(f.$('[data-month="-1"]').disabled,true);assert.equal(f.$('[data-month="1"]').disabled,true);
 assert.deepEqual([...f.document.querySelectorAll('.day[data-date]')].map(b=>b.dataset.date),payload().dates.map(d=>d.date));
 assert.equal(f.document.querySelectorAll('.registration-task').length,1);
 f.$('[data-month="1"]').click();assert.equal(f.$('.calendar-head h2').textContent,'2026년 10월');
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

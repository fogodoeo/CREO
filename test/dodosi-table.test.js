'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const groups=()=>Array.from({length:17},(_,i)=>({id:'g'+i,bookingKey:'k'+i,name:'가상 '+i,phone:'01000000000',quantity:i===0?6:1,paid:i!==2,shop:'[서울] 가상 정거샵',items:[{lot:'A'+i}],schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}}));
async function page(extra={}){
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/dodosi-dispatch.html'),'utf8'));
 const data={groups:groups(),checks:[],batches:[],excluded:[],fresh:true,sender:{name:'가상',phone:'01000000000'},originName:'출발점',...extra};
 let writes=0;window.getSelection=()=>null;
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/dodosi-workflow.js'),'utf8'),{document,window,location:{search:'?channel=fixture'},URLSearchParams,CreoPlatform:{verifyAdmin:async()=>true,api:async(_route,options)=>{if(options?.method)writes++;return data;}},setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto});
 await new Promise(r=>setImmediate(r));
 return {document,data,writes:()=>writes,$:id=>document.getElementById(id),select:(id,checked)=>{const e=document.querySelector(`[data-select="${id}"]`);e.checked=checked;document.getElementById('rows').onchange({target:e});}};
}
test('unchecked recipients can be selected before reconciliation without any server write',async()=>{
 const p=await page();assert.equal(p.$('next-ten').disabled,false);p.$('next-ten').onclick();
 assert.match(p.$('selection-count').textContent,/10\/10명/);assert.equal(p.document.querySelector('[data-select="g2"]').hasAttribute('checked'),false);
 p.select('g2',true);assert.match(p.$('error').textContent,/최대 10명/);
 p.select('g1',false);p.select('g2',true);assert.match(p.$('selection-count').textContent,/결제 미확인 1명/);assert.equal(p.writes(),0);
});
test('ten verified rows stay visible and green; next selection contains only the remaining seven',async()=>{
 const p=await page({checks:groups().slice(0,10).map(g=>({bookingKey:g.bookingKey,status:'confirmed',receiptId:'receipt'+g.id,checkedAt:new Date().toISOString()}))});
 assert.equal(p.document.querySelectorAll('tr.is-confirmed').length,10);assert.equal(p.document.querySelectorAll('[data-row]').length,17);
 assert.equal(p.document.querySelector('[data-select="g0"]').disabled,true);p.$('next-ten').onclick();assert.match(p.$('selection-count').textContent,/7\/10명/);
 assert.equal(p.writes(),0);
});
test('an input-only batch is not green and does not block the next recipients',async()=>{
 const p=await page({batches:[{id:'batch',status:'review',plans:groups().slice(0,10)}]});
 assert.equal(p.document.querySelectorAll('tr.is-confirmed').length,0);assert.ok(p.document.querySelector('[data-row="g0"] [data-resume]'));
 p.$('next-ten').onclick();assert.match(p.$('selection-count').textContent,/7\/10명/);assert.equal(p.document.querySelector('[data-select="g0"]').disabled,true);
});
test('conflicting or pending receipts and invalid schedules cannot be selected; different valid days can mix',async()=>{
 const gs=groups();gs[3].schedule.status='review';gs[4].schedule.dropoffDate='2026-11-25';
 const p=await page({groups:gs,checks:[{bookingKey:'k0',status:'payment_pending'},{bookingKey:'k1',status:'conflict'}]});
 for(const id of ['g0','g1','g3'])assert.equal(p.document.querySelector(`[data-select="${id}"]`).disabled,true);
 p.select('g2',true);p.select('g4',true);assert.equal(p.$('error').textContent,'');assert.match(p.$('selection-count').textContent,/2\/10명/);assert.match(p.$('selection-count').textContent,/11\/24 · 11\/25 맡김 · 날짜별 2묶음/);assert.equal(p.writes(),0);
});
test('next ten uses the earliest dropoff date, not a later single recipient at the front',async()=>{
 const gs=groups();gs[0].schedule.dropoffDate='2026-11-28';
 const p=await page({groups:gs});p.$('next-ten').onclick();
 assert.equal(p.document.querySelector('[data-select="g0"]').hasAttribute('checked'),false);
 assert.match(p.$('selection-count').textContent,/11\/24 맡김 · 10\/10명/);
});
test('cached prices render automatically with discount and stale markers; no per-person quote buttons',async()=>{
 const gs=groups();gs[0].cachedQuote={status:'ready',checkedAt:'2026-11-24T00:00:00Z',quote:{total:49000}};gs[1].cachedQuote={status:'stale',checkedAt:'2026-11-23T00:00:00Z',quote:{total:28000}};
 const p=await page({groups:gs,discountBp:5000});
 assert.equal(p.document.querySelectorAll('[data-quote]').length,0);assert.match(p.document.querySelector('[data-row="g0"] .quote-cell').textContent,/24,500원/);
 assert.match(p.document.querySelector('[data-row="g1"] .quote-cell').textContent,/이전 견적/);assert.match(p.document.querySelector('[data-row="g2"] .quote-cell').textContent,/갱신 대기/);
 assert.match(p.$('price-status').textContent,/오전 8시/);
});

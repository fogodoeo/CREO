'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const tick=()=>new Promise(setImmediate);
test('admin badges follow the selected round, discard late responses and keep retry visible',async()=>{
 const {document,window}=parseHTML('<html><body><nav><a data-work-key="shipping" aria-current="page">배송</a><a data-work-key="organizer">정산</a><a data-work-key="changes">변경</a><summary data-work-group="finance"></summary></nav><a id="quick-shipping" class="operation"></a><a id="quick-organizer" class="operation"></a><p id="work-summary-status" hidden></p><iframe id="operator-frame"></iframe></body></html>');
 const calls=[],timers=[];vm.runInNewContext(fs.readFileSync(require.resolve('../public/operator-work.js'),'utf8'),{document,window,location:{origin:'https://test'},CustomEvent:window.CustomEvent,CreoPlatform:{api:path=>new Promise((resolve,reject)=>calls.push({path,resolve,reject}))},setTimeout:f=>timers.push(f),clearTimeout(){}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));
 const select=id=>document.dispatchEvent(new window.CustomEvent('creo:operator-ready',{detail:{state:{channel:{id}}}}));
 select('old');select('new');calls[1].resolve({channelId:'new',counts:{shipping:2,organizer:0,changes:0}});await tick();
 assert.equal(document.querySelector('[data-work-key=shipping]').getAttribute('aria-current'),'page');assert.match(document.getElementById('quick-shipping').textContent,/확인 필요 2건/);
 calls[0].resolve({channelId:'old',counts:{shipping:9,organizer:0,changes:0}});await tick();assert.doesNotMatch(document.body.textContent,/9/);
 select('new');calls[2].reject(Error('offline'));await tick();assert.equal(document.querySelectorAll('.operator-work-count').length,0);assert.equal(document.getElementById('work-summary-status').hidden,false);
 document.querySelector('#work-summary-status button').click();calls[3].resolve({channelId:'new',counts:{shipping:0,organizer:0,changes:0}});await tick();assert.equal(document.getElementById('work-summary-status').hidden,true);
 select('new');document.dispatchEvent(new window.Event('creo:operator-reset'));calls[4].resolve({channelId:'new',counts:{shipping:8,organizer:0,changes:0}});await tick();assert.equal(document.querySelectorAll('.operator-work-count').length,0);assert.equal(document.getElementById('work-summary-status').hidden,true);
});
test('vendor attention keeps active navigation separate, targets the right round and ignores reordered replies',async()=>{
 const {document,window}=parseHTML('<html><body><main id="main"></main><nav id="nav" data-company="mine"><a data-vendor-section="booking" href="/vendor-broadcast.html?event=national-cre">출품</a><a data-vendor-section="settlement" href="/vendor-checkout.html?event=national-cre" aria-current="page">정산</a><a data-vendor-section="profile" href="/vendor-access.html">업체</a></nav></body></html>');
 const calls=[],location={origin:'https://test',pathname:'/vendor-checkout.html',search:'?portal=mine'},nav=document.getElementById('nav');
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/vendor-portal-shell.js'),'utf8'),{document,window,location,URL,URLSearchParams,AbortSignal,Event:window.Event,fetch:url=>new Promise((resolve,reject)=>calls.push({url,resolve,reject}))});
 const shell=window.CreoVendorShell,first=shell.refreshAttention(nav),second=shell.refreshAttention(nav);
 calls[1].resolve({ok:true,json:async()=>({settlementAttention:true,settlementCount:3,settlementTarget:{channelId:'national-cre-20261021',round:'date:2026-10-21'}})});await second;
 const link=nav.querySelector('[data-vendor-section=settlement]');assert.equal(link.getAttribute('aria-current'),'page');assert.match(link.textContent,/3/);assert.match(link.href,/event=national-cre-20261021/);
 calls[0].resolve({ok:true,json:async()=>({settlementCount:9})});await first;assert.doesNotMatch(link.textContent,/9/);
 const failed=shell.refreshAttention(nav);calls[2].reject(Error('offline'));await failed;assert.equal(document.getElementById('vendor-task-error').hidden,false);assert.match(link.textContent,/3/,'last known attention is retained on failure');
 shell.applyAttention(nav,{settlementCount:0,settlementAttention:false});assert.equal(link.querySelector('.vendor-nav-count').hidden,true);assert.equal(link.getAttribute('aria-current'),'page');assert.equal(link.dataset.settlementEvent,undefined);assert.equal(document.getElementById('vendor-task-error').hidden,true);
});

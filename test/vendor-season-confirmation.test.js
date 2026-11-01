'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/vendor-portal-shell.js'),'utf8');
function fixture(){
 const {document}=parseHTML('<html><body><section id="notice"></section></body></html>'),create=document.createElement.bind(document),calls=[];
 document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>el.setAttribute('open','');el.close=()=>el.removeAttribute('open');}return el;};
 const context={document,seasonState:{id:'national-2026-11',title:'11월 전국크레자랑 참가 확인'},seasonBusy:false,seasonDialog:null,seasonGeneration:1,seasonHost:document.getElementById('notice'),esc:String,seasonBanner(){},seasonWrite:async(...args)=>{calls.push(args);return {status:args[0]};}};
 vm.runInNewContext(source.slice(source.indexOf(' function openSeason('),source.indexOf(' async function showSeason('))+'\nopenSeason();',context);
 const find=selector=>document.querySelector(selector),click=selector=>find(selector).onclick();return {context,calls,find,click};
}
test('participation selection shows confirmation without saving; back and close leave no response',async()=>{
 const f=fixture();f.click('[data-season-accept]');assert.equal(f.calls.length,0);assert.match(f.find('h2').textContent,/참가 희망으로 제출할까요/);assert.equal(f.find('[data-season-submit]').textContent,'참가 희망 제출');
 f.click('[data-season-back]');assert.equal(f.calls.length,0);assert.ok(f.find('[data-season-accept]'));assert.equal(f.find('.season-decline-confirm').hidden,true);
 f.click('[data-season-accept]');f.click('[data-season-close]');assert.equal(f.calls.length,0);assert.equal(f.find('dialog').hasAttribute('open'),false);
});
test('participation persists only after final submission and suppresses double clicks',async()=>{
 const f=fixture();let release;f.context.seasonWrite=(...args)=>{f.calls.push(args);return new Promise(resolve=>release=resolve);};
 f.click('[data-season-accept]');const first=f.click('[data-season-submit]');await f.click('[data-season-submit]');assert.deepEqual(f.calls,[['accepted',false]]);assert.equal(f.find('[data-season-submit]').disabled,true);
 release({status:'accepted'});await first;assert.equal(f.find('dialog').hasAttribute('open'),false);
});
test('decline has its own confirmation, requires consent and returning clears consent',async()=>{
 const f=fixture();f.click('[data-season-decline]');assert.equal(f.calls.length,0);assert.match(f.find('h2').textContent,/불참으로 제출할까요/);
 await f.click('[data-season-submit]');assert.equal(f.calls.length,0);assert.match(f.find('.season-error').textContent,/체크/);
 f.find('input').checked=true;f.click('[data-season-back]');f.click('[data-season-decline]');assert.equal(f.find('input').checked,false);
 f.find('input').checked=true;await f.click('[data-season-submit]');assert.deepEqual(f.calls,[['declined',true]]);
});
test('failed final submission keeps confirmation and enables retry',async()=>{
 const f=fixture();f.click('[data-season-accept]');f.context.seasonWrite=async()=>{throw Error('연결을 확인한 뒤 다시 제출해 주세요.');};
 await f.click('[data-season-submit]');assert.equal(f.find('dialog').hasAttribute('open'),true);assert.match(f.find('.season-error').textContent,/다시 제출/);assert.equal(f.find('[data-season-submit]').disabled,false);
 f.context.seasonWrite=async(...args)=>{f.calls.push(args);return {status:'accepted'};};await f.click('[data-season-submit]');assert.equal(f.calls.length,1);
});

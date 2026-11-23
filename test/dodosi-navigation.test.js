'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Home=require('../public/operator-home-model'),Shell=require('../public/operator-shell-model');
const channel={id:'national-cre-20261123',name:'11월 23일 부울경',status:'active',dataAdapter:'platform',features:{shipping:true},nationalRound:{parentId:'national-cre'},shippingDefaults:{enabledCarriers:['dodosi']}};
const state={channel,label:channel.name,round:{},home:'/main?channel='+channel.id,finished:true};
test('Dodosi registration stays reachable after broadcast ends and retains the selected round',()=>{
 for(const finished of [false,true]){
  const s={...state,finished};assert.equal(Home.links(s).dodosi,'/dodosi-dispatch.html?channel='+channel.id);
  assert.equal(Shell.entry(s,'dodosi').label,'도도시 배송 입력');assert.equal(Shell.entry(s,'dodosi').scope,'round');
  assert.equal(Shell.resolve(Home.links(s).dodosi,s).key,'dodosi');
 }
 for(const s of [{...state,archiveId:'old'},{...state,channel:{...channel,status:'archived'}},{...state,channel:{...channel,shippingDefaults:{enabledCarriers:['parge']}}},{...state,channel:{...channel,features:{shipping:false}}}])assert.equal(Shell.entry(s,'dodosi'),null);
});
test('Dodosi menu opens a top-level page for the extension on desktop and mobile',()=>{
 for(const mobile of [false,true]){
  const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/index.html'),'utf8'));
  window.matchMedia=q=>({matches:q.includes('max-width')?mobile:!mobile,addEventListener(){}});
  let target='';const location={search:'?channel='+channel.id+'&view=dodosi',origin:'https://test',replace:url=>target=url};
  const context={document,window,location,URL,URLSearchParams,CreoOperatorShell:Shell,CreoOperatorHome:Home,CreoPlatform:{escapeHtml:String}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/operator-shell.js'),'utf8'),context);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const ready=new window.Event('creo:operator-ready');ready.detail={state,catalog:{channels:[channel]},rounds:[]};document.dispatchEvent(ready);
  assert.equal(target,'/dodosi-dispatch.html?channel='+channel.id);
  assert.equal(document.querySelector('[data-work-key="dodosi"]').textContent,'도도시 배송 입력');
  assert.equal(document.querySelector('option[value="dodosi"]').textContent,'도도시 배송 입력');
  assert.equal(document.getElementById('operator-frame').getAttribute('src'),null);
 }
});
test('shipping toolbar offers Dodosi outside hidden search tools and forwards it out of the iframe',()=>{
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/shipping.html'),'utf8'));
 const a=document.getElementById('shipping-dodosi-link');assert.ok(a.closest('#current-company-bar'));assert.equal(a.closest('#shipping-work-tools'),null);
 assert.equal(document.querySelectorAll('#shipping-dodosi-link').length,1);
 a.href='/dodosi-dispatch.html?channel='+channel.id;
 const messages=[],frame={parent:{location:{pathname:'/main'},postMessage:m=>messages.push(m)},frameElement:{id:'operator-frame'}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/operator-embed.js'),'utf8'),{document,window:frame,location:{origin:'https://test',href:'https://test/shipping.html',pathname:'/shipping.html',search:''},URL,URLSearchParams,MutationObserver:window.MutationObserver});
 const e=new window.Event('click',{bubbles:true,cancelable:true});e.button=0;a.dispatchEvent(e);
 assert.equal(e.defaultPrevented,true);assert.equal(messages[0].href,a.href);assert.notEqual(a.target,'_blank');
});

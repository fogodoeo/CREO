'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Home=require('../public/operator-home-model'),Shell=require('../public/operator-shell-model');
const channels=[{id:'national-cre',name:'전크자',status:'active',dataAdapter:'platform'},{id:'national-cre-20261021',name:'전라·충청',status:'draft',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:'2026-10-21'}},{id:'clab-1015',name:'씨랩',status:'active',dataAdapter:'platform'}];
const rounds=channels.map(c=>({channelId:c.id,name:c.name,status:c.status,familyId:Home.family(c),date:c.nationalRound?.date||''})).concat({channelId:'national-cre',archiveId:'old',familyId:'national-cre',name:'지난 회차'});
const state=query=>Home.selection({channels},rounds,'national-cre',query);
test('shell routes keep the explicit round and archived scope; global vendor route has no date filter',()=>{
 for(const id of channels.map(c=>c.id)){
  const s=state('?channel='+id);for(const key of ['items','members','broadcast','pinball','print']){const u=new URL(Shell.frame(s,key),'https://test');assert.equal(u.searchParams.get('channel'),id,key);assert.equal(u.searchParams.get('embedded'),'1');}
  const global=new URL(Shell.frame(s,'vendors'),'https://test');assert.equal(global.searchParams.has('channel'),false);assert.equal(global.searchParams.get('program'),Home.family(s.channel));assert.equal(Shell.entry(s,'vendors').scope,'program');
  assert.equal(Shell.entry(s,'promo').scope,'global');assert.equal(new URL(Shell.frame(s,'promo'),'https://test').searchParams.get('admin'),'1');
  assert.equal(new URL(Shell.frame(s,'intake'),'https://test').searchParams.get('channel'),Home.national(s.channel)?'national-cre':id);
 }
 const s=state('?channel=national-cre&archive=old');for(const key of ['shipping','shippingStatus','organizer','print','report','changes'])assert.equal(new URL(Shell.frame(s,key),'https://test').searchParams.get('archive'),'old');
 for(const key of ['items','members','broadcast','pinball','parge'])assert.equal(Shell.frame(s,key),'');
});
test('only known administration pages resolve; public broadcast, buyer links and external URLs cannot be embedded',()=>{
 const s=state('?channel=national-cre');for(const href of ['https://evil.test/channel-workspace.html?channel=national-cre','javascript:alert(1)','/buyer-shipping.html?code=x','/broadcast-router.html?live=1','/unknown'])assert.equal(Shell.resolve(href,s),null);
 assert.equal(Shell.resolve('/channel-workspace.html?channel=clab-1015&tab=vendors',s).key,'members');
 assert.equal(Shell.resolve('/channel-workspace.html?channel=national-cre&tab=items',s).key,'items');
 assert.equal(Shell.entry(s,'missing'),null);
});
test('shell and home restore the selected work page after round change and refresh, reject foreign frame messages',async()=>{
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/index.html'),'utf8'));for(const s of document.querySelectorAll('select'))Object.defineProperty(s,'value',{value:'',writable:true});
 window.matchMedia=()=>({matches:true,addEventListener(){}});window.confirm=()=>true;
 const location={search:'?channel=national-cre&view=items',origin:'https://test',href:'https://test/main?channel=national-cre&view=items'},writes=[];
 const history={replaceState(_,__,url){location.search=new URL(url,location.origin).search;},pushState(_,__,url){this.replaceState(_,__,url)}};
 const platform={escapeHtml:s=>String(s),verifyAdmin:async()=>true,api:async(path,options)=>{writes.push([path,options]);return{channels,rounds,activeChannelId:'national-cre'}}};
 const sandbox={document,window,location,history,URL,URLSearchParams,CustomEvent:window.CustomEvent,CreoPlatform:platform,CreoOperatorHome:Home,CreoOperatorShell:Shell};
 vm.createContext(sandbox);for(const file of ['operator-home.js','operator-shell.js'])vm.runInContext(fs.readFileSync(require.resolve('../public/'+file),'utf8'),sandbox);
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 assert.equal(document.getElementById('operator-page-title').textContent,'개체·경매 순서');assert.match(document.getElementById('operator-frame').src,/channel=national-cre&tab=items/);
 const select=document.getElementById('quick-round');select.value='national-cre-20261021';select.dispatchEvent(new window.Event('change'));assert.equal(location.search,'?channel=national-cre-20261021&view=items');assert.match(document.getElementById('operator-frame').src,/channel=national-cre-20261021&tab=items/);
 document.getElementById('refresh-home').dispatchEvent(new window.Event('click'));await new Promise(setImmediate);assert.match(document.getElementById('operator-frame').src,/channel=national-cre-20261021/);
 const ev=new window.Event('message');ev.origin='https://evil.test';ev.source={};ev.data={type:'creo:operator-link',href:'/main?channel=national-cre'};window.dispatchEvent(ev);assert.match(location.search,/national-cre-20261021/);
 const frame=document.getElementById('operator-frame');Object.defineProperty(frame,'contentWindow',{value:{},configurable:true});
 const dirty=new window.Event('message');dirty.origin='https://test';dirty.source=frame.contentWindow;dirty.data={type:'creo:operator-dirty',dirty:true};window.dispatchEvent(dirty);window.confirm=()=>false;
 select.value='national-cre';select.dispatchEvent(new window.Event('change'));assert.equal(location.search,'?channel=national-cre-20261021&view=items');
 location.search='?channel=national-cre';window.dispatchEvent(new window.Event('popstate'));assert.equal(location.search,'?channel=national-cre-20261021&view=items');
 window.confirm=()=>true;
 select.value='national-cre@old';select.dispatchEvent(new window.Event('change'));assert.equal(document.getElementById('operator-unavailable').hidden,false);assert.equal(document.getElementById('operator-frame').getAttribute('src'),null);
 assert(writes.every(([path,options])=>path==='operation-rounds'&&!options),'Navigation must never write live auction state');
});
test('embedded page links preserve the shell while standalone tools cannot silently replace the selected work page',()=>{
 const {document,window}=parseHTML('<html><head></head><body><a id="known" href="/promo-center.html?admin=1">홍보</a><a id="receipt" href="/organizer-shipping.html?channel=national-cre&archive=old">업체 정산</a><a id="setup" href="/capture-setup.html">본체 설정</a><a id="tool" href="/national-broadcast-kit.html">방송 자료</a><a id="live" href="/roulette/?broadcast=1">송출</a></body></html>'),messages=[];
 const frame={frameElement:{id:'operator-frame'},parent:{location:{pathname:'/main'},postMessage:(data,origin)=>messages.push({data,origin})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/operator-embed.js'),'utf8'),{document,window:frame,location:{origin:'https://test',href:'https://test/channel-workspace.html',pathname:'/channel-workspace.html'},URL,URLSearchParams,MutationObserver:window.MutationObserver});
 for(const id of ['known','receipt','setup','tool','live']){const e=new window.Event('click',{bubbles:true,cancelable:true});e.button=0;document.getElementById(id).dispatchEvent(e);}
 assert.deepEqual(messages.map(m=>m.data.href),['/promo-center.html?admin=1','/organizer-shipping.html?channel=national-cre&archive=old','/capture-setup.html']);assert.equal(messages[0].origin,'https://test');for(const id of ['tool','live'])assert.equal(document.getElementById(id).target,'_blank');assert(document.documentElement.classList.contains('operator-embedded'));
});

test('mobile context disclosure keeps program and round visible, preserves selection, and stays expanded on home and desktop',async()=>{
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/index.html'),'utf8')),$=id=>document.getElementById(id);
 for(const s of document.querySelectorAll('select'))Object.defineProperty(s,'value',{value:'',writable:true});
 const changes=[],media={matches:false,addEventListener:(_,fn)=>changes.push(fn)},calls=[];
 window.matchMedia=()=>media;window.confirm=()=>true;
 const location={search:'?channel=national-cre-20261021&view=shipping',origin:'https://test',href:'https://test/main?channel=national-cre-20261021&view=shipping'};
 const history={replaceState(_,__,url){location.search=new URL(url,location.origin).search;},pushState(_,__,url){this.replaceState(_,__,url);}};
 const ctx={document,window,location,history,URL,URLSearchParams,CustomEvent:window.CustomEvent,CreoPlatform:{escapeHtml:String,verifyAdmin:async()=>true,api:async(p,o)=>{calls.push([p,o]);return{channels,rounds,activeChannelId:'national-cre'};}},CreoOperatorHome:Home,CreoOperatorShell:Shell};vm.createContext(ctx);
 for(const file of ['operator-home.js','operator-shell.js'])vm.runInContext(fs.readFileSync(require.resolve('../public/'+file),'utf8'),ctx);
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 const toggle=$('operator-context-toggle'),panel=$('selection-panel');
 assert.equal(toggle.hidden,false);assert.equal(toggle.textContent,'방송일 변경');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert(panel.classList.contains('compact-closed'));
 assert.equal($('operator-breadcrumb').textContent,'전국크레자랑 · 전라·충청');
 const before=$('operator-frame').src;
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert(!panel.classList.contains('compact-closed'));assert.equal($('operator-frame').src,before);
 $('quick-round').value='national-cre@old';$('quick-round').dispatchEvent(new window.Event('change'));
 assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.match($('operator-frame').src,/channel=national-cre&archive=old/);assert.equal($('operator-breadcrumb').textContent,'전국크레자랑 · 지난 회차');
 toggle.click();assert(panel.classList.contains('compact-closed'));
 media.matches=true;changes.forEach(fn=>fn());assert.equal(toggle.hidden,true);assert(!panel.classList.contains('compact-closed'));
 media.matches=false;changes.forEach(fn=>fn());assert.equal(toggle.hidden,false);assert(panel.classList.contains('compact-closed'));
 const nav=search=>document.dispatchEvent(new window.CustomEvent('creo:operator-navigate',{detail:{search}}));
 nav('?channel=national-cre&view=vendors');assert.equal(toggle.textContent,'프로그램 변경');assert.equal($('round-field').hidden,true);assert.equal($('operator-breadcrumb').textContent,'전국크레자랑');
 toggle.click();assert(!panel.classList.contains('compact-closed'));
 nav('?channel=national-cre&view=shipping');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal($('round-field').hidden,false);
 nav('?channel=national-cre&view=promo');assert.equal(toggle.hidden,true);assert.equal(panel.hidden,true);assert.equal($('operator-breadcrumb').textContent,'전체 운영');
 nav('?channel=national-cre');assert.equal(toggle.hidden,true);assert.equal(panel.hidden,false);assert(!panel.classList.contains('compact-closed'));
 assert(calls.every(([p,o])=>p==='operation-rounds'&&!o),'Opening or changing the context must not mutate auction state');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Home=require('../public/operator-home-model'),Shell=require('../public/operator-shell-model');
const channels=[{id:'national-cre',name:'10/19 경기',status:'archived'},{id:'national-cre-20261021',name:'10/21 전라·충청',status:'active',nationalRound:{parentId:'national-cre',date:'2026-10-21'}},{id:'clab-1015',name:'10/15 씨랩',status:'active'}].map(c=>({...c,dataAdapter:'platform'}));
const rounds=channels.map(c=>({channelId:c.id,name:c.name,status:c.status,familyId:Home.family(c)})).concat({channelId:'national-cre',archiveId:'old',name:'10/14 지난 회차',familyId:'national-cre'});
const catalog={channels,rounds,activeChannelId:'national-cre-20261021'};
const state=q=>Home.selection(catalog,rounds,catalog.activeChannelId,q);
const source=p=>fs.readFileSync(require.resolve('../public/'+p),'utf8');

// This is a workflow inventory, deliberately independent of the menu definition.
// Iterating only existing menu entries cannot detect a missing business function.
test('all required administration workflows have reachable, existing menu destinations',()=>{
 const required={vendors:'/operator-vendors.html',access:'/national-vendors.html',rounds:'/national-rounds.html',bookings:'/organizer-bookings.html',promo:'/promo-center.html',intake:'/vendor-entry-review.html',items:'/channel-workspace.html',members:'/channel-workspace.html',broadcast:'/broadcast-studio.html',pinball:'/roulette/',captures:'/capture-gallery.html',captureSetup:'/capture-setup.html',shipping:'/shipping.html',organizer:'/organizer-shipping.html',shippingStatus:'/shipping-status.html',changes:'/checkout-changes.html',parge:'/parge-dispatch.html',report:'/settlement-report.html',print:'/print.html',settings:'/channel-manager.html',rates:'/shipping-rates.html',monitor:'/band-monitor.html',archives:'/channel-archives.html'};
 const s=state('?channel=national-cre-20261021');
 for(const [key,path] of Object.entries(required)){
  const entry=Shell.entry(s,key);assert(entry,'Missing required workflow: '+key);
  assert.equal(new URL(entry.href,'https://test').pathname,path,key);
  assert(fs.existsSync(require.resolve('../public'+path+(path.endsWith('/')?'index.html':''))),path);
  assert.equal(Shell.resolve(entry.href,s).key,key);
 }
});

test('receipt navigation remains available for closed/archived financial rounds and respects unsupported channels',()=>{
 for(const query of ['?channel=national-cre','?channel=national-cre&archive=old','?channel=national-cre-20261021','?channel=clab-1015']){
  const s=state(query),href=Home.links(s).organizer;assert(href);
  const url=new URL(href,'https://test');assert.equal(url.pathname,'/organizer-shipping.html');assert.equal(url.searchParams.get('channel'),s.channel.id);assert.equal(url.searchParams.get('archive')||'',s.archiveId);
  assert.equal(Shell.entry(s,'organizer').group,'finance');
 }
 for(const patch of [{status:'draft'},{status:'paused'},{features:{shipping:false}},{features:{auction:false}},{dataAdapter:'legacy-cdcup'}]){
  const s=state('?channel=clab-1015');s.channel={...s.channel,...patch};assert.equal(Home.links(s).organizer,'');assert.equal(Shell.entry(s,'organizer'),null);
 }
});

test('home tile, sidebar, report link, reload and round changes all reach the same exact receipt scope without writes',async()=>{
 const {document,window}=parseHTML(source('index.html'));for(const e of document.querySelectorAll('select'))Object.defineProperty(e,'value',{writable:true,value:''});
 window.matchMedia=()=>({matches:true,addEventListener(){}});window.confirm=()=>true;
 const location={search:'?channel=national-cre',origin:'https://test',href:'https://test/main?channel=national-cre'};
 const history={replaceState(_,__,url){location.search=new URL(url,location.origin).search;},pushState(_,__,url){this.replaceState(_,__,url)}};
 const calls=[],platform={escapeHtml:String,verifyAdmin:async()=>true,api:async(path,options)=>{calls.push([path,options]);return catalog;}};
 const ctx={document,window,location,history,URL,URLSearchParams,CustomEvent:window.CustomEvent,CreoPlatform:platform,CreoOperatorHome:Home,CreoOperatorShell:Shell};vm.createContext(ctx);
 for(const file of ['operator-home.js','operator-shell.js'])vm.runInContext(source(file),ctx);
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 const tile=document.getElementById('quick-organizer');assert.equal(tile.hidden,false);assert(tile.closest('.pipeline'));assert.equal(tile.href,'/organizer-shipping.html?channel=national-cre');
 const click=node=>{const e=new window.Event('click',{bubbles:true,cancelable:true});e.button=0;node.dispatchEvent(e);};
 click(tile);assert.equal(document.getElementById('operator-page-title').textContent,'업체 정산·입금 확인');
 const frame=document.getElementById('operator-frame'),picker=document.getElementById('quick-round');
 Object.defineProperty(frame,'contentWindow',{value:{},configurable:true});
 for(const value of ['national-cre-20261021','national-cre@old','clab-1015','national-cre']){
  picker.value=value;picker.dispatchEvent(new window.Event('change'));const [id,archive='']=value.split('@');
  const check=()=>{const u=new URL(frame.src,'https://test');assert.equal(u.pathname,'/organizer-shipping.html');assert.equal(u.searchParams.get('channel'),id);assert.equal(u.searchParams.get('archive')||'',archive);assert.equal(new URLSearchParams(location.search).get('view'),'organizer');};
  check();document.getElementById('refresh-home').dispatchEvent(new window.Event('click'));await new Promise(setImmediate);check();
  const link=document.querySelector('#admin-nav a[aria-current="page"]');assert.equal(link.textContent,'업체 정산·입금 확인');click(link);check();
 }
 picker.value='national-cre@old';picker.dispatchEvent(new window.Event('change'));
 click(document.querySelector('#admin-nav a[href*="view=report"]'));
 const message=new window.Event('message');message.origin='https://test';message.source=frame.contentWindow;message.data={type:'creo:operator-link',href:'/organizer-shipping.html?channel=national-cre&archive=old'};window.dispatchEvent(message);
 assert.equal(location.search,'?channel=national-cre&archive=old&view=organizer');assert.match(frame.src,/archive=old/);
 assert(calls.every(([path,options])=>path==='operation-rounds'&&!options));
});

test('native Parge navigation also exposes settlement for the currently selected round',async()=>{
 const {document,window}=parseHTML('<html><head></head><body><main>운송 접수</main></body></html>');window.parent=window;window.matchMedia=()=>({matches:true,addEventListener(){}});
 vm.runInNewContext(source('operator-native-shell.js'),{document,window,location:{search:'?channel=national-cre-20261021'},CreoPlatform:{api:async()=>catalog,escapeHtml:String},CreoOperatorHome:Home,CreoOperatorShell:Shell});
 document.dispatchEvent(new window.Event('creo:native-operator-ready'));await new Promise(setImmediate);
 const link=document.querySelector('#native-operator-shell a[href*="view=organizer"]');assert(link);assert.equal(link.textContent,'업체 정산·입금 확인');assert.equal(link.href,'/main?channel=national-cre-20261021&view=organizer');
});

test('print dispatch links already carry the selected channel before clicking or opening a new tab',()=>{
 const html=source('print.html'),start=html.indexOf('function syncPrintChannel('),end=html.indexOf('function renderPrintError(',start),fn=html.slice(start,end);
 for(const id of ['national-cre','national-cre-20261021','clab-1015']){
  const {document}=parseHTML(html),link=document.getElementById('parge-dispatch-link');assert.equal(link.hidden,true);assert.equal(link.hasAttribute('onclick'),false);
  const location={search:'?channel='+id,href:'https://test/print.html?channel='+id};const ctx={document,location,URL,URLSearchParams,PRINT_CHANNEL_ID:id,CreoChannelRuntime:require('../public/channel-runtime'),CreoOperatorPipeline:{sync(){}}};vm.createContext(ctx);vm.runInContext(fn,ctx);
  const channel={id,name:'가상 회차',status:'active',dataAdapter:'platform'};ctx.channel=channel;
  vm.runInContext('syncPrintChannel(channel)',ctx);assert.equal(link.hidden,false);assert.equal(link.href,'/parge-dispatch.html?channel='+id);
  location.search+='&archive=old';vm.runInContext('syncPrintChannel(channel)',ctx);assert.equal(link.hidden,true);assert.equal(link.hasAttribute('href'),false);
 }
});

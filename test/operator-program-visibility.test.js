'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Home=require('../public/operator-home-model'),Shell=require('../public/operator-shell-model');
const channels=[
 {id:'national-cre',name:'전국크레자랑',status:'archived'},
 {id:'national-cre-20261021',name:'10/21 전라·충청',status:'active',nationalRound:{parentId:'national-cre',date:'2026-10-21'}},
 {id:'national-cre-20261026',name:'10/26 대구·경북',status:'draft',nationalRound:{parentId:'national-cre',date:'2026-10-26'}},
 {id:'national-cre-20261028',name:'10/28 부산·울산·경남',status:'draft',nationalRound:{parentId:'national-cre',date:'2026-10-28'}},
 {id:'creyon-1001',name:'크레용 이전 회차',status:'archived'},
 {id:'clab-1015',name:'씨랩',status:'active'},
 {id:'retired-auction',name:'보관된 경매',status:'archived'},
 {id:'checkout-test-sample',name:'격리 테스트',status:'active'}
].map(c=>({...c,dataAdapter:'platform'}));
const rounds=channels.map(c=>({channelId:c.id,name:c.name,status:c.status,familyId:Home.family(c)})).concat({channelId:'retired-auction',archiveId:'old',name:'지난 낙찰',familyId:'retired-auction'});
const catalog={channels,rounds,activeChannelId:'national-cre-20261021'};
const source=file=>fs.readFileSync(require.resolve('../public/'+file),'utf8');

test('retired programs leave the routine picker without hiding old rounds of an operating family',()=>{
 assert.deepEqual(Home.families(catalog).map(c=>c.id),['national-cre','clab']);
 assert.deepEqual(Home.families(catalog,'missing').map(c=>c.id),['national-cre','clab']);
 assert.deepEqual(Home.families(catalog,'checkout-test-sample').map(c=>c.id),['national-cre','clab']);
 for(const id of ['national-cre','creyon-1001']){
  const state=Home.selection(catalog,rounds,catalog.activeChannelId,'?channel='+id);assert(Home.links(state).organizer);assert(Home.families(catalog,id).some(c=>c.id===Home.family(state.channel)));
 }
 const prepared=Home.selection(catalog,rounds,catalog.activeChannelId,'?channel=national-cre-20261026');assert.equal(prepared.active,false);assert(Home.links(prepared).broadcast);assert.equal(Home.links(prepared).organizer,'');
});

test('explicit historical links remain available and restoring a program makes it selectable again',()=>{
 const state=Home.selection(catalog,rounds,catalog.activeChannelId,'?channel=retired-auction&archive=old');
 assert(Home.families(catalog,state.channel.id).some(c=>c.id==='retired-auction'));
 const receipt=new URL(Home.links(state).organizer,'https://test');assert.equal(receipt.searchParams.get('channel'),'retired-auction');assert.equal(receipt.searchParams.get('archive'),'old');
 const restored=structuredClone(catalog);restored.channels.find(c=>c.id==='retired-auction').status='active';
 assert(Home.families(restored).some(c=>c.id==='retired-auction'));assert(!Home.families(catalog).some(c=>c.id==='retired-auction'));
});

test('home reload and history preserve an explicit retired round, then remove it from the picker on departure',async()=>{
 const {document,window}=parseHTML(source('index.html'));for(const el of document.querySelectorAll('select'))Object.defineProperty(el,'value',{value:'',writable:true});
 const location={search:'?channel=retired-auction&archive=old'},history={replaceState(_,__,url){location.search=new URL(url,'https://test').search;},pushState(_,__,url){this.replaceState(_,__,url)}},calls=[];
 const api={escapeHtml:String,verifyAdmin:async()=>true,api:async(p,o)=>{calls.push([p,o]);return catalog;}};
 vm.runInNewContext(source('operator-home.js'),{document,window,location,history,URLSearchParams,CustomEvent:window.CustomEvent,CreoPlatform:api,CreoOperatorHome:Home});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 const picker=document.getElementById('quick-channel'),choices=()=>[...picker.querySelectorAll('option')].map(o=>o.value);
 assert.equal(picker.value,'retired-auction');assert(choices().includes('retired-auction'));assert.match(document.getElementById('quick-organizer').href,/archive=old/);
 document.getElementById('refresh-home').dispatchEvent(new window.Event('click'));await new Promise(setImmediate);assert.equal(picker.value,'retired-auction');
 picker.value='national-cre';picker.dispatchEvent(new window.Event('change'));assert.deepEqual(choices(),['national-cre','clab']);assert.equal(document.getElementById('quick-round').querySelectorAll('option').length,4);
 location.search='?channel=retired-auction&archive=old';window.dispatchEvent(new window.Event('popstate'));assert.equal(picker.value,'retired-auction');assert.match(document.getElementById('quick-organizer').href,/archive=old/);
 assert(calls.every(([path,options])=>path==='operation-rounds'&&!options),'Visibility changes must not mutate auction state');
});

test('native dispatch picker also excludes retired programs',async()=>{
 const {document,window}=parseHTML('<html><head></head><body><main>운송 접수</main></body></html>');window.parent=window;window.matchMedia=()=>({matches:true,addEventListener(){}});
 vm.runInNewContext(source('operator-native-shell.js'),{document,window,location:{search:'?channel=national-cre-20261021'},CreoPlatform:{api:async()=>catalog,escapeHtml:String},CreoOperatorHome:Home,CreoOperatorShell:Shell});
 document.dispatchEvent(new window.Event('creo:native-operator-ready'));await new Promise(setImmediate);
 assert.deepEqual([...document.querySelectorAll('#native-family option')].map(o=>o.value),['national-cre','clab']);
 assert.equal(document.querySelectorAll('#native-round option').length,4);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Home=require('../public/operator-home-model'),Shell=require('../public/operator-shell-model');
const source=file=>fs.readFileSync(require.resolve('../public/'+file),'utf8');
const tick=()=>new Promise(setImmediate);
const dates=['2026-10-14','2026-10-19','2026-10-21','2026-10-26','2026-10-28'];
const regions=['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남'];
const data={rounds:dates.map((date,i)=>({date,familyId:'national-cre',channelId:i<2?'national-cre':'national-cre-'+date.replaceAll('-',''),...(i===0?{archiveId:'old'}:{})})),vendors:dates.map((date,i)=>({id:'v'+i,name:'가상 업체 '+i,phone:'0100000000'+i,members:[{channelId:'national-cre',familyId:'national-cre',vendorId:'v'+i,status:'active',active:true,region:regions[i]}],broadcasts:[{familyId:'national-cre',date,region:regions[i],scheduled:true,requested:false,itemCount:i<2?1:0,rounds:i<2?[{channelId:'national-cre',archiveId:i===0?'old':'',itemCount:1,status:'active'}]:[]}]}))};
data.vendors.push({id:'clab',name:'가상 씨랩 업체',members:[{channelId:'creyon',familyId:'clab',vendorId:'c',status:'active',active:true}],broadcasts:[]});
function page(file){const {document,window}=parseHTML(source(file));for(const s of document.querySelectorAll('select'))Object.defineProperty(s,'value',{value:'',writable:true});return{document,window};}

test('directory opens the whole selected program, filters dates without duplicate companies, and keeps historical links exact',async()=>{
 const {document,window}=page('operator-vendors.html'),calls=[];
 vm.runInNewContext(source('operator-vendors.js'),{document,URLSearchParams,location:{search:'?program=national-cre'},CreoPlatform:{escapeHtml:String,api:async(path,options)=>{calls.push([path,options]);return data;}}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await tick();
 const $=id=>document.getElementById(id);
 assert.equal($('family').value,'national-cre');assert.equal($('status').textContent,'5개 업체');assert.equal(document.querySelectorAll('.vendor-row').length,5);
 assert.equal(document.querySelectorAll('.vendor-detail dl').length,10);assert.equal(document.querySelectorAll('details[open]').length,0);
 assert.equal($('date').querySelectorAll('option').length,6);
 const historical=document.querySelector('.vendor-broadcasts a');assert.match(historical.href,/archive=old/);assert.match(historical.href,/view=organizer/);
 const southern=[...document.querySelectorAll('.vendor-row')].find(r=>r.textContent.includes('10/28'));
 assert.match(southern.querySelector('a').href,/channel=national-cre-20261028&view=intake&vendor=v4/);
 $('date').value='2026-10-19';$('date').dispatchEvent(new window.Event('change'));assert.equal($('status').textContent,'1개 업체');assert.match($('rows').textContent,/가상 업체 1/);
 $('search').value='없는 이름';$('search').dispatchEvent(new window.Event('input'));assert.match($('rows').textContent,/검색어나 방송일을 바꿔/);
 $('reset').dispatchEvent(new window.Event('click'));assert.equal($('status').textContent,'5개 업체');
 $('family').value='clab';$('family').dispatchEvent(new window.Event('change'));assert.equal($('status').textContent,'1개 업체');assert.equal($('access').hidden,true);assert.match($('rows').textContent,/가상 씨랩 업체/);
 assert(calls.every(([p,o])=>p==='operator-vendors'&&!o));
});

test('directory failure has retry, hides stale rows, and discards out-of-order refresh results',async()=>{
 const {document,window}=page('operator-vendors.html'),pending=[],$=id=>document.getElementById(id);
 vm.runInNewContext(source('operator-vendors.js'),{document,URLSearchParams,location:{search:'?program=national-cre'},CreoPlatform:{escapeHtml:String,api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));pending.shift().reject(Error('unavailable'));await tick();
 assert.equal($('status').getAttribute('role'),'alert');assert.match($('status').textContent,/새로고침/);assert.equal($('reload').disabled,false);
 $('reload').dispatchEvent(new window.Event('click'));$('reload').dispatchEvent(new window.Event('click'));
 pending[1].resolve(data);await tick();pending[0].resolve({vendors:[],rounds:[]});await tick();
 assert.equal($('status').textContent,'5개 업체');assert.equal($('reload').disabled,false);
});

test('main separates whole-program directory from dated work and follows exact intake, region and archived settlement links',async()=>{
 const {document,window}=page('index.html'),$=id=>document.getElementById(id),calls=[];
 window.matchMedia=()=>({matches:true,addEventListener(){}});window.confirm=()=>true;
 const channels=[{id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'},{id:'national-cre-20261028',name:'경남편',status:'draft',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:dates[4]}},{id:'creyon',name:'씨랩',status:'active',dataAdapter:'platform'}];
 const rounds=[{channelId:'national-cre',familyId:'national-cre',date:dates[1],name:'경기편'},{channelId:'national-cre',archiveId:'old',familyId:'national-cre',date:dates[0],name:'서울·인천편'},{channelId:channels[1].id,familyId:'national-cre',date:dates[4],name:'경남편'},{channelId:'creyon',familyId:'clab',name:'씨랩'}];
 const location={search:'?channel=national-cre&view=vendors',origin:'https://test',href:'https://test/main?channel=national-cre&view=vendors'};
 const history={replaceState(_,__,url){location.search=new URL(url,location.origin).search;},pushState(_,__,url){this.replaceState(_,__,url);}};
 const ctx={document,window,location,history,URL,URLSearchParams,CustomEvent:window.CustomEvent,CreoPlatform:{escapeHtml:String,verifyAdmin:async()=>true,api:async(p,o)=>{calls.push([p,o]);return{channels,rounds,activeChannelId:'national-cre'};}},CreoOperatorHome:Home,CreoOperatorShell:Shell};vm.createContext(ctx);
 for(const file of ['operator-home.js','operator-shell.js'])vm.runInContext(source(file),ctx);
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await tick();
 assert.equal($('selection-panel').hidden,false);assert.equal($('round-field').hidden,true);assert.equal($('manage-rounds').hidden,true);assert.equal($('operator-breadcrumb').textContent,'전국크레자랑');
 const frame=$('operator-frame');Object.defineProperty(frame,'contentWindow',{value:{},configurable:true});
 const navigate=href=>{const e=new window.Event('message');e.origin=location.origin;e.source=frame.contentWindow;e.data={type:'creo:operator-link',href};window.dispatchEvent(e);};
 navigate('/main?channel=national-cre-20261028&view=intake&vendor=v4&status=approved');
 assert.equal($('round-field').hidden,false);assert.equal($('operator-breadcrumb').textContent,'전국크레자랑 · 경남편');
 let url=new URL(frame.src,location.origin);assert.equal(url.searchParams.get('broadcastDate'),dates[4]);assert.equal(url.searchParams.get('vendor'),'v4');assert.equal(url.searchParams.get('status'),'approved');
 const standalone=new URL($('operator-standalone').href,location.origin);assert.equal(standalone.searchParams.get('vendor'),'v4');assert.equal(standalone.searchParams.get('broadcastDate'),dates[4]);assert.equal(standalone.searchParams.has('embedded'),false);
 navigate('/organizer-bookings.html?channel=national-cre&vendor=v4&action=region');url=new URL(frame.src,location.origin);assert.equal(url.searchParams.get('action'),'region');assert.equal(url.searchParams.get('vendor'),'v4');assert.equal(url.searchParams.has('broadcastDate'),false);assert.equal($('round-field').hidden,true);assert.equal($('operator-page-title').textContent,'방송 지역 배정');
 navigate('/main?channel=national-cre&archive=old&view=organizer');url=new URL(frame.src,location.origin);assert.equal(url.searchParams.get('archive'),'old');assert.equal(url.searchParams.has('vendor'),false);
 navigate('/main?channel=creyon&view=vendors');assert.match(frame.src,/program=clab/);assert.equal($('round-field').hidden,true);
 assert(calls.every(([p,o])=>p==='operation-rounds'&&!o));
});

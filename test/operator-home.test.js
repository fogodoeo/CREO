'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const M=require('../public/operator-home-model');
const channels=[{id:'national-cre',name:'전국크레자랑',status:'active'},{id:'national-cre-20261021',name:'10/21 전라·충청',status:'draft',nationalRound:{parentId:'national-cre',date:'2026-10-21'}},{id:'clab-1015',name:'씨랩 10/15',status:'active'},{id:'creyon-1001',name:'크레용 10/01',status:'active'}].map(c=>({...c,dataAdapter:'platform'}));
const rounds=channels.map(c=>({channelId:c.id,name:c.name,familyId:M.family(c),date:c.nationalRound?.date||'',status:c.status}));
rounds.push({channelId:'national-cre',archiveId:'old',name:'10/14 이전 회차',familyId:'national-cre',status:'history'});
const catalog={channels},active='national-cre';
test('all launchers follow selected draft or CLAB round while actual operating channel stays separate',()=>{
 for(const id of ['national-cre-20261021','clab-1015','creyon-1001']){
  const state=M.selection(catalog,rounds,active,'?channel='+id);assert.equal(state.active,false);
  const links=M.links(state);for(const key of ['workspace','broadcast','shipping','shippingStatus','print','report','pinball','captures','parge'])assert.equal(new URL(links[key],'https://example.test').searchParams.get('channel'),id,key);
 }
 assert.deepEqual(M.families(catalog).map(c=>c.id),['national-cre','clab']);
});
test('archived round only exposes scoped financial routes and rejects missing identity instead of fallback',()=>{
 const s=M.selection(catalog,rounds,active,'?channel=national-cre&archive=old'),links=M.links(s);
 for(const key of ['shipping','shippingStatus','print','report','home'])assert.equal(new URL(links[key],'https://example.test').searchParams.get('archive'),'old');
 for(const key of ['workspace','broadcast','pinball','parge','captures'])assert.equal(links[key],undefined);
 assert.throws(()=>M.selection(catalog,rounds,active,'?channel=missing'));
 assert.throws(()=>M.selection(catalog,rounds,active,'?channel=clab-1015&archive=old'));
});
test('pinball resolver never replaces explicit selected round or malformed explicit query with current live channel',async()=>{
 const source=fs.readFileSync(require.resolve('../roulette-app/src/app.ts'),'utf8');
 const fn=source.slice(source.indexOf('async function resolveActivePinballChannel'),source.indexOf('type PinballStanding')).replace(': Promise<void>','').replace(' as { channelId?: string }','');
 for(const query of ['?channel=clab-1015','?channel=bad%2Fquery','?channel=national-cre-20261021&broadcast=1','']){
  let calls=0;const q=new URLSearchParams(query);const sandbox={queryParameters:q,isBroadcastMode:q.has('broadcast'),remoteChannelId:q.get('channel')||'',isRemoteDisplay:false,isRemoteController:false,autoLoadAuctionWinners:false,fetch:async()=>{calls++;return {ok:true,json:async()=>({channelId:'national-cre'})}}};
  vm.createContext(sandbox);await vm.runInContext(fn+';resolveActivePinballChannel()',sandbox);assert.equal(calls,query?0:1);assert.equal(sandbox.remoteChannelId,query?q.get('channel'):'national-cre');
 }
});
test('home controller reloads selected scope, ignores out-of-order loads and never activates by selection',async()=>{
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../public/index.html'),'utf8'));const pending=[],calls=[],history=[];
 // Linkedom exposes select value as read-only; implement the browser setter.
 for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{writable:true,value:''});
 const location={search:'?channel=clab-1015',replace(){},reload(){}};
 const platform={escapeHtml:s=>String(s),verifyAdmin:async()=>true,api:(path,options)=>{calls.push([path,options]);return new Promise(resolve=>pending.push(resolve))}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/operator-home.js'),'utf8'),{document,window,location,history:{replaceState:(...a)=>history.push(a[2]),pushState:(...a)=>history.push(a[2])},URLSearchParams,CreoPlatform:platform,CreoOperatorHome:M});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 pending.shift()({...catalog,rounds,activeChannelId:active});await new Promise(setImmediate);
 assert.equal(document.getElementById('work-title').textContent,'씨랩 10/15');assert.match(document.getElementById('quick-pinball').href,/channel=clab-1015/);
 document.getElementById('refresh-home').dispatchEvent(new window.Event('click'));document.getElementById('refresh-home').dispatchEvent(new window.Event('click'));
 pending[1]({...catalog,rounds,activeChannelId:active});await new Promise(setImmediate);pending[0]({channels:[],rounds:[],activeChannelId:'missing'});await new Promise(setImmediate);
 assert.equal(document.getElementById('work-panel').hidden,false);assert.equal(document.getElementById('work-title').textContent,'씨랩 10/15');assert.ok(calls.every(([p,o])=>p==='operation-rounds'&&!o));assert.ok(history.every(h=>h==='/main?channel=clab-1015'));
});

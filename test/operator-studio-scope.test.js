'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/broadcast-studio.html'),'utf8'),script=html.match(/<script>\s*(document.addEventListener[\s\S]*?)<\/script>/)[1];
async function setup(search){
 const {document,window}=parseHTML(html),writes=[],messages=[],confirmations=[],urls=[];let failure=false,answer=true,hold=null;
 window.parent={postMessage:data=>messages.push(data)};
 const frame=document.getElementById('control-frame');frame.contentWindow={};
 const channels=[{id:'national-cre',name:'전국크레자랑',status:'active'},{id:'national-cre-20261021',name:'전라충청',status:'draft',nationalRound:{date:'2026-10-21'}}],select=document.getElementById('channel-select');
 Object.defineProperty(select,'value',{writable:true,value:''});
 vm.runInNewContext(script,{document,window,location:{search,origin:'http://test.invalid'},history:{replaceState(_a,_b,url){urls.push(url)}},URLSearchParams,confirm:message=>{confirmations.push(message);return answer},requestAnimationFrame:f=>f(),CreoStudioTheme:{setChannel(){}},CreoOperatorPipeline:{sync(){}},CreoBroadcastProfiles:{resolve:()=>({id:'standard'}),studioFrame:(c,v)=>'editor.html?channel='+c.id+'&view='+v},CreoPlatform:{escapeHtml:s=>s,setAdmin(){},verifyAdmin:async()=>true,api:async(path,options)=>{
  if(options){writes.push([path,JSON.parse(options.body)]);if(failure)throw Error('진행 중인 경매를 종료해 주세요.');if(hold)await hold;return {}}
  if(path==='operation-rounds')return {channels,activeChannelId:'national-cre',rounds:channels.map(channel=>({channelId:channel.id,familyId:'national-cre',name:channel.id==='national-cre'?'2026.10.19 경기편':'2026.10.21 전라·충청편'}))};
  if(path.startsWith('channels'))return {channels,version:1};return {channelId:'national-cre',catalogVersion:1};
 }}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);
 return {document,window,writes,messages,confirmations,urls,fail(value=true){failure=value},answer(value){answer=value},hold(value){hold=value},message(data,extra={}){window.dispatchEvent(Object.assign(new window.Event('message'),{origin:'http://test.invalid',source:frame.contentWindow,data,...extra}))}};
}
test('requested draft renders its own editor and preview without switching actual broadcast',async()=>{
 const f=await setup('?channel=national-cre-20261021');
 assert.match(f.document.getElementById('control-frame').src,/channel=national-cre-20261021/);
 assert.match(f.document.getElementById('live-2').href,/event=national-cre-20261021.*preview=1/);
 assert.match(f.document.getElementById('engine-label').textContent,/송출: 2026.10.19 경기편/);assert.deepEqual(f.writes,[]);
 assert.equal(f.document.querySelectorAll('#channel-select optgroup').length,1);assert.equal(f.document.querySelector('#channel-select optgroup').getAttribute('label'),'전국크레자랑');
 f.document.getElementById('channel-switch-button').click();await new Promise(setImmediate);
 assert.deepEqual(f.writes,[['national-rounds',{action:'activate',date:'2026-10-21',expectedActiveChannelId:'national-cre'}]]);
 assert.match(f.document.getElementById('live-2').href,/page=2&live=1/);
});
test('failed switch retains requested editor; invalid and archived round URLs never open another round',async()=>{
 const f=await setup('?channel=national-cre-20261021');f.fail();f.document.getElementById('channel-switch-button').click();await new Promise(setImmediate);
 assert.match(f.document.getElementById('control-frame').src,/national-cre-20261021/);assert.match(f.document.getElementById('studio-error').textContent,/진행 중인 경매/);assert.match(f.document.getElementById('live-2').href,/preview=1/);
 assert.equal(f.document.getElementById('channel-switch-button').disabled,false);
 assert.match(f.document.getElementById('engine-label').textContent,/현재 송출: 2026.10.19 경기편/);
 f.fail(false);f.document.getElementById('channel-switch-button').click();await new Promise(setImmediate);
 assert.equal(f.writes.length,2);assert.equal(f.document.getElementById('studio-error').hidden,true);
 for(const search of ['?channel=missing','?channel=national-cre&archive=old']){
  const bad=await setup(search);assert.equal(bad.document.getElementById('control-frame').getAttribute('src'),null);assert.equal(bad.document.getElementById('studio').hidden,true);assert.deepEqual(bad.writes,[]);
 }
});
test('dirty layout guards page and round navigation, preserves shell query, and ignores foreign or stale messages',async()=>{
 const f=await setup('?channel=national-cre&embedded=1&adminShell=1'),frame=f.document.getElementById('control-frame'),select=f.document.getElementById('channel-select');
 const dirty={type:'creo-layout-draft',channelId:'national-cre',page:1,dirty:true,saving:false};
 for(const extra of [{origin:'https://foreign.invalid'},{source:{}},{data:{...dirty,page:2}},{data:{...dirty,channelId:'wrong'}}])f.message(dirty,extra);
 assert.equal(f.messages.at(-1).dirty,false);
 f.message(dirty);assert.equal(f.messages.at(-1).dirty,true);f.answer(false);
 f.document.querySelector('[data-view="layout-2"]').click();assert.match(frame.src,/view=layout-1/);
 select.value='national-cre-20261021';select.dispatchEvent(new f.window.Event('change'));assert.equal(select.value,'national-cre');
 f.answer(true);f.document.querySelector('[data-view="layout-2"]').click();assert.match(frame.src,/view=layout-2/);assert.equal(f.messages.at(-1).dirty,false);
 assert.match(f.urls.at(-1),/embedded=1/);assert.match(f.urls.at(-1),/adminShell=1/);
 assert.equal(f.document.querySelector('[data-view="layout-2"]').getAttribute('aria-pressed'),'true');assert.deepEqual(f.writes,[]);
});
test('saving layout blocks navigation and activation; duplicate activation has one request and recovers on completion',async()=>{
 const f=await setup('?channel=national-cre-20261021'),frame=f.document.getElementById('control-frame'),button=f.document.getElementById('channel-switch-button');
 f.message({type:'creo-layout-draft',channelId:'national-cre-20261021',page:1,dirty:true,saving:true});
 f.document.querySelector('[data-view="settings"]').click();button.click();assert.match(frame.src,/layout-1/);assert.deepEqual(f.writes,[]);
 f.message({type:'creo-layout-draft',channelId:'national-cre-20261021',page:1,dirty:false,saving:false});
 let finish;f.hold(new Promise(resolve=>{finish=resolve}));button.click();button.click();await new Promise(setImmediate);assert.equal(f.writes.length,1);
 f.document.querySelector('[data-view="layout-2"]').click();assert.match(frame.src,/layout-1/);
 finish();await new Promise(setImmediate);assert.match(f.document.getElementById('live-2').href,/live=1/);assert.equal(button.hidden,true);
});
test('reauthentication retains the layout document and unsaved draft',async()=>{
 const f=await setup('?channel=national-cre'),frame=f.document.getElementById('control-frame'),src=frame.src;
 f.message({type:'creo-layout-draft',channelId:'national-cre',page:1,dirty:true,saving:false});f.message({type:'creo-admin-required'});
 assert.equal(f.document.getElementById('studio').hidden,true);f.document.getElementById('admin-password').value='isolated-test';
 f.document.getElementById('login-form').dispatchEvent(new f.window.Event('submit',{cancelable:true}));await new Promise(setImmediate);
 assert.equal(f.document.getElementById('studio').hidden,false);assert.equal(frame.src,src);assert.equal(f.messages.at(-1).dirty,true);assert.match(f.document.getElementById('studio-error').textContent,/남아 있는 수정사항/);assert.deepEqual(f.writes,[]);
});
test('whole settings draft blocks navigation and activation without accepting stale or foreign settings messages',async()=>{
 const f=await setup('?channel=national-cre-20261021&view=settings'),frame=f.document.getElementById('control-frame');
 const draft={type:'creo-settings-draft',channelId:'national-cre-20261021',page:2,dirty:true,saving:false};
 f.message({...draft,channelId:'other'});f.message(draft,{source:{}});f.message(draft,{origin:'https://foreign.invalid'});assert.equal(f.messages.at(-1).dirty,false);
 f.message(draft);f.answer(false);f.document.querySelector('[data-view="layout-2"]').click();assert.match(frame.src,/view=settings/);
 f.message({...draft,saving:true});f.answer(true);f.document.querySelector('[data-view="layout-2"]').click();f.document.getElementById('channel-switch-button').click();assert.match(frame.src,/view=settings/);assert.deepEqual(f.writes,[]);
 f.message({...draft,dirty:false,saving:false});f.document.querySelector('[data-view="layout-2"]').click();assert.match(frame.src,/view=layout-2/);
 f.message(draft);assert.equal(f.messages.at(-1).dirty,false);
});
test('content settings open a prepared national round without falling back or offering archived broadcasts',async()=>{
 const source=fs.readFileSync(require.resolve('../public/auction-control.html'),'utf8'),body=source.slice(source.indexOf('async function loadCatalog()'),source.indexOf('    async function load(){'));
 const channels=[{id:'national-cre',name:'경기편',status:'active'},{id:'national-cre-20261021',name:'전라·충청편',status:'draft',nationalRound:{parentId:'national-cre'}},{id:'closed',name:'이전 회차',status:'archived'},{id:'disabled',status:'active',features:{broadcast:false}}];
 for(const id of ['national-cre-20261021','closed','missing']){
  const reads=[],select={},context=vm.createContext({catalog:null,runtime:null,channelId:'',location:{search:'?channel='+id},$:()=>select,esc:s=>s,CreoChannelRuntime:require('../public/channel-runtime'),CreoPlatform:{api:async path=>{reads.push(path);return {channels}}}});
  vm.runInContext(body,context);
  if(id==='national-cre-20261021'){await context.loadCatalog();assert.equal(context.channelId,id);assert.match(select.innerHTML,/전라·충청편/);assert.doesNotMatch(select.innerHTML,/closed|disabled/)}else await assert.rejects(context.loadCatalog(),/찾을 수 없습니다/);
  assert.deepEqual(reads,['channels?includeArchived=1']);
 }
});

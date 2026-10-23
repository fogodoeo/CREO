'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/auction-control.html'),'utf8'),settings=require('../public/studio-settings-draft');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const tick=()=>new Promise(setImmediate);
function setup({compact=false,page=1,basic=false}={}){
 const {document,window}=parseHTML(source),form=document.getElementById('control-form'),writes=[],messages=[];
 const tag=document.createElement('input');tag.name='page2VendorTagOn';tag.type='checkbox';form.append(tag);
 Object.defineProperty(form,'elements',{get(){const elements=[...form.querySelectorAll('input[name],select[name],textarea[name]')];for(const el of elements)elements[el.name]=el;return elements;}});
 for(const el of form.elements){if(el.localName==='select')Object.defineProperty(el,'value',{writable:true,value:''});if(el.type==='checkbox')el.checked=true;else el.value=el.name==='hostName1'?'진행자':el.name.endsWith('Interval')?'5':'';}
 let failure=null,held=null,server={mode:'sold',page:3,activeItemId:'new-winner',layoutPlacements:{slot:{x:40}},...Object.fromEntries(form.elements.map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]))};
 window.parent={postMessage:data=>messages.push(JSON.parse(JSON.stringify(data)))};
 window.frameElement=null;
 const context=vm.createContext({document,window,location:{origin:'http://test.invalid'},channelId:'national-cre-20261021',workspaceLoadSequence:0,state:{mode:'live',activeItemId:'old-item'},page,compactMode:compact,$:id=>document.getElementById(id),form,isBasicDice:()=>basic,CreoStudioSettings:settings,syncBidderOpacityValue(){},toast(){},confirm:()=>false,CreoPlatform:{api:async(path,options)=>{const patch=JSON.parse(options.body);writes.push([path,patch]);if(held)await held;if(failure)throw failure;server={...server,...patch};return {state:{...server}}}}});
 vm.runInContext(between('function read(){','function updatePositionWarnings'),context);
 vm.runInContext(between('function syncBasicTickerFields','function isCrewart'),context);
 vm.runInContext(between('let settingsDraft=null','function assetKindLabel'),context);
 vm.runInContext(between('function saveVendorTag(',"\nform.addEventListener('change'"),context);
 vm.runInContext(between("$('save').onclick=",'function openAssetManager'),context);
 context.receiveSettings();
 return {document,window,context,writes,messages,server:()=>server,fail(error=Object.assign(Error('연결 끊김'),{status:503})){failure=error},hold(promise){held=promise},edit(name,value){const el=form.elements[name];if(el.type==='checkbox')el.checked=value;else el.value=value;context.captureSettings();},save:()=>document.getElementById('save').onclick(),reload(values){server={...server,...values};for(const el of form.elements)if(Object.hasOwn(server,el.name)){if(el.type==='checkbox')el.checked=server[el.name];else el.value=server[el.name];}context.receiveSettings();},value:name=>form.elements[name].value,status:()=>vm.runInContext('settingsDraft.status()',context)};
}
test('whole settings save only changed config, preserving a newer auction and layout; repeated/reloaded saves are inert',async()=>{
 const f=setup();f.edit('hostName1','새 진행자');await f.save();
 assert.deepEqual(f.writes,[['channels/national-cre-20261021/broadcast-state',{hostName1:'새 진행자'}]]);
 assert.equal(f.server().mode,'sold');assert.equal(f.server().activeItemId,'new-winner');assert.equal(f.server().page,3);assert.equal(f.server().layoutPlacements.slot.x,40);
 await f.save();f.reload({});await f.save();assert.equal(f.writes.length,1);assert.equal(f.value('hostName1'),'새 진행자');assert.equal(f.status().dirty,false);
});
test('compact settings preserve other-page edits; shared basic ticker saves only its changed peers',async()=>{
 const f=setup({compact:true,page:2,basic:true});f.edit('hostName1','아직 저장 전');f.edit('page2Ticker','공통 안내');f.context.syncBasicTickerFields('page2Ticker');await f.save();
 assert.deepEqual(f.writes[0][1],{page1Ticker:'공통 안내',page2Ticker:'공통 안내'});assert.equal(f.status().dirty,true);
 f.context.page=1;await f.save();assert.deepEqual(f.writes[1][1],{hostName1:'아직 저장 전'});assert.equal(f.status().dirty,false);
});
test('failed save retains input and persistent recovery; duplicate clicks and edits while saving do not lose work',async()=>{
 const f=setup();f.edit('hostName1','먼저 수정');f.fail();await f.save();assert.equal(f.document.getElementById('settings-error').hidden,false);assert.match(f.document.getElementById('settings-error').textContent,/다시 눌러/);assert.equal(f.value('hostName1'),'먼저 수정');
 f.fail(null);let finish;f.hold(new Promise(resolve=>{finish=resolve}));const pending=f.save();await tick();const duplicate=f.save();assert.equal(f.writes.length,2);assert.equal(f.document.getElementById('save').disabled,true);assert.equal(f.status().saving,true);
 f.edit('hostName1','진행자');finish();await Promise.all([pending,duplicate]);assert.equal(f.value('hostName1'),'진행자');assert.equal(f.status().dirty,true);assert.equal(f.document.getElementById('settings-error').hidden,true);
 await f.save();assert.equal(f.server().hostName1,'진행자');assert.equal(f.status().dirty,false);
});
test('asset reload preserves a content draft and fresh untouched settings; round reset cannot carry old input',async()=>{
 const f=setup();f.edit('hostName1','유지할 문구');f.reload({hostRole1:'서버의 새 역할'});assert.equal(f.value('hostName1'),'유지할 문구');assert.equal(f.value('hostRole1'),'서버의 새 역할');
 assert.equal(f.context.canLeaveSettings(),false);const event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 f.window.frameElement={dataset:{layoutDraftHost:'1'}};const hosted=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(hosted);assert.equal(hosted.defaultPrevented,false);
 await f.save();assert.deepEqual(f.writes[0][1],{hostName1:'유지할 문구'});f.context.channelId='clab';f.reload({hostName1:'씨랩 진행자'});assert.equal(f.status().dirty,false);f.edit('hostName1','씨랩 수정');await f.save();assert.equal(f.writes.at(-1)[0],'channels/clab/broadcast-state');
});
test('immediate vendor toggles are ordered with manual saves, retain later edits, and relay auth failures',async()=>{
 const f=setup({page:2});f.edit('hostName1','문구');let finish;f.hold(new Promise(resolve=>{finish=resolve}));const manual=f.save();await tick();
 const hide=f.context.saveVendorTag(false,'national-cre-20261021'),show=f.context.saveVendorTag(true,'national-cre-20261021');assert.equal(f.writes.length,1);assert.equal(f.status().saving,true);
 finish();await Promise.all([manual,hide,show]);assert.deepEqual(f.writes.map(([,body])=>body),[{hostName1:'문구'},{page2VendorTagOn:false},{page2VendorTagOn:true}]);assert.equal(f.status().dirty,false);assert.equal(f.server().page2VendorTagOn,true);
 f.fail(Object.assign(Error('다시 로그인해 주세요.'),{status:401}));f.edit('hostName1','로그인 후 저장');await f.save();assert.ok(f.messages.some(message=>message.type==='creo-admin-required'));assert.equal(f.status().dirty,true);assert.equal(f.value('hostName1'),'로그인 후 저장');
});
test('configuration allowlist excludes unexpected and auction fields even if a caller offers them',async()=>{
 const writes=[],draft=settings.create({fields:['hostName1'],write:async patch=>{writes.push(patch);return {state:patch}}});
 draft.receive({hostName1:'이름',activeItemId:'old'});draft.capture({hostName1:'새 이름',mode:'sold',activeItemId:'wrong',layoutPlacements:{},page:2});await draft.save();assert.deepEqual(writes,[{hostName1:'새 이름'}]);
});
test('banner dialog relays only its own round drafts, blocks leaving while busy, and preserves content on close',async()=>{
 const f=setup(),childMessages=[];let reloads=0,returned=false;
 f.window.HTMLElement.prototype.showModal=function(){this.open=true;};f.window.HTMLElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(f.document,'activeElement',{get:()=>({focus(){returned=true;}})});
 f.context.load=async()=>{reloads++;};
 vm.runInContext(between('function openSharedBannerLibrary(){','let catalog='),f.context);
 f.context.openSharedBannerLibrary();const overlay=f.document.getElementById('shared-banner-overlay'),frame=overlay.querySelector('iframe'),child={postMessage:data=>childMessages.push(data)};
 Object.defineProperty(frame,'contentWindow',{value:child});assert.equal(overlay.localName,'dialog');assert.equal(overlay.open,true);assert.equal(frame.dataset.layoutDraftHost,'1');
 const message=(data,{origin='http://test.invalid',source=child}={})=>{const e=new f.window.Event('message');Object.assign(e,{origin,source,data});f.window.dispatchEvent(e);};
 const draft={type:'creo-banner-draft',channelId:'national-cre-20261021',dirty:true,saving:false};
 message(draft,{origin:'https://foreign.invalid'});message(draft,{source:{}});message({...draft,channelId:'other'});assert.equal(f.context.canLeaveSettings(),true);
 message(draft);assert.equal(f.messages.at(-1).dirty,true);assert.equal(f.context.canLeaveSettings(),false);
 const unload=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 message({...draft,saving:true});assert.equal(f.messages.at(-1).saving,true);
 message({type:'creo-close-banner-library',channelId:draft.channelId});assert.equal(overlay.open,true);assert.equal(reloads,0);
 const escape=new f.window.Event('cancel',{cancelable:true});overlay.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.equal(childMessages.at(-1).type,'creo-close-banner-request');
 f.edit('hostName1','유지할 문구');message({...draft,dirty:false,saving:false});assert.equal(f.messages.at(-1).dirty,true);
 message({type:'creo-close-banner-library',channelId:draft.channelId});assert.equal(overlay.open,false);assert.equal(reloads,1);assert.equal(returned,true);assert.equal(f.value('hostName1'),'유지할 문구');assert.equal(f.status().dirty,true);
 f.context.openSharedBannerLibrary();assert.equal(childMessages.at(-1).type,'creo-refresh-banner-library');assert.equal(f.document.querySelectorAll('#shared-banner-overlay').length,1);
});
test('workspace responses begun before or during a save cannot refill an older settings snapshot afterward',async()=>{
 for(const during of [false,true]){
  const f=setup();vm.runInContext(between('    async function load(){',"\ndocument.querySelectorAll('.page-tab')"),f.context);
  let loaded,finish;const write=f.context.CreoPlatform.api;
  f.context.CreoPlatform.api=(path,options)=>options?write(path,options):new Promise(resolve=>{loaded=resolve});
  f.edit('hostName1','확정 문구');f.hold(new Promise(resolve=>{finish=resolve}));
  let loading;if(!during)loading=f.context.load();const saving=f.save();await tick();if(during)loading=f.context.load();
  finish();await saving;loaded({channel:{id:'national-cre-20261021'},broadcast:{hostName1:'오래된 값'}});await loading;
  assert.equal(f.value('hostName1'),'확정 문구');assert.equal(f.status().dirty,false);
 }
});

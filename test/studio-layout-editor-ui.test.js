'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/platform-layout-editor.html'),'utf8'),script=fs.readFileSync(require.resolve('../public/studio-layout-editor.js'),'utf8');
const placements={x:10,y:20,width:30,height:10,fontScale:1,opacity:100,visible:true};
function setup(){
 const {document,window}=parseHTML(html),preview=parseHTML('<html><head></head><body data-broadcast-theme="national"><div data-layout-slot="p1-host-1"></div></body></html>').document,messages=[],writes=[];
 let failure=false,hold=null;
 const frame=document.getElementById('frame'),settings=document.getElementById('settings-frame');frame.contentDocument=preview;frame.contentWindow={};settings.contentWindow={};
 Object.defineProperties(preview.documentElement,{clientWidth:{value:1920},clientHeight:{value:1080}});
 preview.querySelector('[data-layout-slot]').getBoundingClientRect=()=>({left:192,top:216,width:576,height:108,right:768});
 for(const id of ['slot','p2-scene'])Object.defineProperty(document.getElementById(id),'value',{writable:true,value:id==='slot'?'':'item'});
 Object.defineProperties(document.getElementById('canvas-surface'),{clientWidth:{value:640},clientHeight:{value:360}});
 window.frameElement=null;window.parent={postMessage:data=>messages.push(JSON.parse(JSON.stringify(data)))};
 vm.runInNewContext(script,{document,window,location:{search:'?channel=national-cre&page=1',origin:'http://test.invalid'},URLSearchParams,Option:function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option},requestAnimationFrame:f=>f(),setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}},CreoLayoutDraft:require('../public/studio-layout-draft'),CreoBroadcastTextLayout:require('../public/broadcast-text-layout'),CreoPlatform:{api:async(path,options)=>{const body=JSON.parse(options.body);writes.push([path,body]);if(hold)await hold;if(failure)throw Object.assign(Error('연결 끊김'),{status:503});return {state:{layoutPlacements:body.layoutPlacements}}}}});
 const message=(source,data,origin='http://test.invalid')=>window.dispatchEvent(Object.assign(new window.Event('message'),{origin,source,data}));
 const ready=(values={'p1-host-1':placements})=>message(frame.contentWindow,{type:'creo-layout-ready',page:1,placements:values});ready();
 return {document,window,messages,writes,ready,change(x){const field=document.getElementById('x');field.value=String(x);field.oninput()},settingsMessage(data,origin){message(settings.contentWindow,data,origin)},settingsSaved(){message(settings.contentWindow,{type:'creo-broadcast-settings-saved',page:1})},fail(value=true){failure=value},hold(value){hold=value}};
}
test('saving content refreshes the preview without publishing an unsaved placement or reset',()=>{
 const f=setup();f.change(25);assert.equal(f.messages.at(-1).dirty,true);f.settingsSaved();assert.deepEqual(f.writes,[]);f.ready();assert.equal(f.document.getElementById('x').value,'25.0');assert.equal(f.messages.at(-1).dirty,true);
 f.document.getElementById('reset').onclick();f.settingsSaved();f.ready();assert.equal(f.messages.at(-1).dirty,true);assert.deepEqual(f.writes,[]);
});
test('layout failure retains input and error for retry; duplicate saves are suppressed and later edits stay dirty',async()=>{
 const f=setup();f.change(25);f.fail();await f.document.getElementById('save').onclick();assert.equal(f.document.getElementById('save-error').hidden,false);assert.equal(f.document.getElementById('x').value,'25.0');assert.equal(f.messages.at(-1).dirty,true);
 f.fail(false);let finish;f.hold(new Promise(resolve=>{finish=resolve}));const pending=f.document.getElementById('save').onclick();await f.document.getElementById('save').onclick();assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1],f.writes[0]);assert.equal(f.messages.at(-1).saving,true);
 f.change(35);finish();await pending;assert.equal(f.messages.at(-1).dirty,true);assert.equal(f.document.getElementById('x').value,'35.0');assert.equal(f.document.getElementById('save-error').hidden,true);
 await f.document.getElementById('save').onclick();assert.equal(f.messages.at(-1).dirty,false);assert.equal(f.writes.at(-1)[1].layoutPlacements['p1-host-1'].x,35);
});
test('standalone dirty layout guards browser navigation; the explicit studio host owns its own guard',()=>{
 const f=setup();f.change(25);const event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 f.window.frameElement={dataset:{layoutDraftHost:'1'}};const hosted=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(hosted);assert.equal(hosted.defaultPrevented,false);
});
test('settings drafts join layout navigation protection with channel/source/page validation and relay authentication',()=>{
 const f=setup(),draft={type:'creo-settings-draft',channelId:'national-cre',page:1,dirty:true,saving:false};
 f.settingsMessage({...draft,channelId:'other'});f.settingsMessage({...draft,page:2});f.settingsMessage(draft,'https://foreign.invalid');assert.equal(f.messages.at(-1).dirty,false);
 f.settingsMessage(draft);assert.equal(f.messages.at(-1).dirty,true);assert.equal(f.document.getElementById('save-status').textContent,'저장된 배치');assert.equal(f.document.getElementById('save').disabled,true);
 const event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 f.settingsMessage({...draft,saving:true});assert.equal(f.messages.at(-1).saving,true);
 f.settingsMessage({type:'creo-admin-required'});assert.equal(f.messages.at(-1).type,'creo-admin-required');
 f.settingsMessage({...draft,dirty:false});assert.equal(f.messages.at(-1).dirty,false);f.change(28);f.settingsMessage({...draft,dirty:false});assert.equal(f.messages.at(-1).dirty,true);
});

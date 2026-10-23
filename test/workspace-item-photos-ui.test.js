'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/workspace-item-photos.js'),'utf8'),Facts=require('../public/workspace-item-facts');
const tick=()=>new Promise(setImmediate),plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const {document,window}=parseHTML('<html><body><button id="outside">저장</button><div id="photos"></div></body></html>');let active=null,id=0,locked=false,changed=0,decodeFailure=false,closed=0;const calls=[],errors=[],revoked=[],handlers=[];
 Object.defineProperty(document,'activeElement',{get:()=>active});window.HTMLElement.prototype.focus=function(){active=this;};
 const originalCreate=document.createElement.bind(document);document.createElement=name=>name==='canvas'?{getContext:()=>({drawImage(){}}),toBlob:fn=>fn({size:200,type:'image/webp'})}:originalCreate(name);
 class PhotoURL extends URL{static createObjectURL(){return 'blob:https://fixture/'+(++id);}static revokeObjectURL(url){revoked.push(url);}}
 window.CreoWorkspaceItemFacts=Facts;window.CreoPlatform={escapeHtml:s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))};
 vm.runInNewContext(source,{window,document,URL:PhotoURL,location:{origin:'https://fixture'},structuredClone,crypto:{randomUUID:()=>String(++id)},AbortSignal,createImageBitmap:async()=>{if(decodeFailure)throw Error('decode');return {width:640,height:480,close(){closed++;}};},FileReader:class{readAsDataURL(){this.result='data:image/webp;base64,Zml4dHVyZQ==';this.onload();}}});
 const host=document.querySelector('#photos'),context={channelId:'round21',round:{date:'2026-10-21'}},component=window.CreoWorkspaceItemPhotos.create({document,context:()=>context,busy:()=>locked,onChange:()=>changed++,onError:e=>errors.push(e),api:async(route,options)=>{calls.push({route,body:options&&JSON.parse(options.body)});return handlers.shift()?.(route,options)||{itemId:'a01',references:{}};}});
 const choose=(role,files)=>host.querySelector('#item-photo-'+role).onchange({currentTarget:{files,value:'file'}});
 const file={name:'fixture.png',type:'image/png',size:1000};
 return {document,window,host,component,context,calls,errors,handlers,revoked,file,choose,active:()=>active,changed:()=>changed,closed:()=>closed,lock:value=>locked=value,decodeFailure:()=>decodeFailure=true};
}
test('selection is local, validates the entire batch, supports remove/undo and releases previews on close',()=>{
 const f=fixture();f.component.mount(f.host,{id:'a01',photoUrl:'/old.webp'});f.choose('child',[f.file,{...f.file,type:'text/plain'}]);assert.equal(f.errors.length,1);assert.deepEqual(plain(f.component.read()),{});
 f.choose('child',Array(12).fill(f.file));assert.equal(f.errors.length,2);assert.equal(f.calls.length,0);
 f.choose('child',[f.file]);assert.equal(f.host.querySelectorAll('img').length,2);assert.equal(f.active().id,'item-photo-child');assert.equal(f.changed(),1);assert.equal(f.calls.length,0);
 f.host.querySelector('[data-photo-remove="child:0"]').click();assert.equal(f.component.read().child.length,1);f.host.querySelector('[data-photo-undo="child"]').click();assert.deepEqual(plain(f.component.read()),{});assert.equal(f.host.querySelector('img').getAttribute('src'),'https://fixture/old.webp');
 f.lock(true);f.choose('sire',[f.file]);assert.deepEqual(plain(f.component.read()),{});f.component.reset();assert.equal(f.revoked.length,1);assert.equal(f.calls.length,0);
});
test('large preview links use full images, reject unsafe URLs and retain focus across asynchronous reads',async()=>{
 const f=fixture();let resolve;f.handlers.push(()=>new Promise(r=>resolve=r));f.component.mount(f.host,{id:'a01',attributes:{media:[{url:'/__entry_photo__/full',thumbnailUrl:'/__entry_photo__/thumb'},{url:'javascript:alert(1)'}]}});
 f.host.querySelector('#item-photo-sire').focus();resolve({itemId:'a01',references:{'/__entry_photo__/full':'/full.webp','/__entry_photo__/thumb':'/thumb.webp'}});await tick();assert.equal(f.active().id,'item-photo-sire');assert.equal(f.host.querySelector('a').getAttribute('href'),'https://fixture/full.webp');assert.equal(f.host.querySelector('img').getAttribute('src'),'https://fixture/thumb.webp');assert.equal(f.host.querySelectorAll('a').length,1);
 f.host.querySelector('img').onerror();assert.match(f.host.textContent,/사진을 불러오지 못했어요/);f.handlers.push(()=>({itemId:'a01',references:{'/__entry_photo__/full':'/new-full.webp','/__entry_photo__/thumb':'/new-thumb.webp'}}));const retry=f.host.querySelector('[data-photo-focus="view-child-0"]');retry.focus();retry.click();await tick();assert.equal(f.host.querySelector('img').getAttribute('src'),'https://fixture/new-thumb.webp');assert.equal(f.active().getAttribute('aria-label'),'개체 사진 1 크게 보기');
});
test('failed reads have a retry; stale responses after closing cannot overwrite another editor or steal outside focus',async()=>{
 const f=fixture();f.handlers.push(()=>{throw Error('읽기 실패');});f.component.mount(f.host,{id:'a01',photoUrl:'/__entry_photo__/full'});await tick();assert.match(f.host.textContent,/읽기 실패/);
 let resolve;f.handlers.push(()=>new Promise(r=>resolve=r));f.host.querySelector('[data-photo-reload]').click();f.document.querySelector('#outside').focus();f.component.reset();f.component.mount(f.host,{id:'a02',photoUrl:'/second.webp'});resolve({itemId:'a01',references:{'/__entry_photo__/full':'/first.webp'}});await tick();assert.equal(f.active().id,'outside');assert.equal(f.host.querySelector('a').getAttribute('href'),'https://fixture/second.webp');assert.deepEqual(plain(f.component.read()),{});
});
test('upload response loss reuses the file identity; item save retry reuses uploaded photos; separate roles attach only after all succeed',async()=>{
 const f=fixture();f.component.mount(f.host,{id:'a01'});f.choose('child',[f.file]);f.choose('sire',[f.file]);const values={photoEdits:f.component.read()},record={id:'a01',attributes:{}},child={url:'/__entry_photo__/child'},sire={url:'/__entry_photo__/sire'};
 f.handlers.push(()=>{throw Error('response lost');});await assert.rejects(f.component.prepare(record,values,f.context),/response lost/);assert.equal(record.photoUrl,undefined);
 f.handlers.push(()=>({media:child}),()=>{throw Error('storage failed');});await assert.rejects(f.component.prepare(record,values,f.context),/storage failed/);assert.deepEqual(f.calls[0].body,f.calls[1].body);assert.equal(record.photoUrl,undefined);
 f.handlers.push(()=>({media:sire}));const saved=await f.component.prepare(record,values,f.context);assert.equal(saved.photoUrl,child.url);assert.equal(saved.attributes.parents[0].media[0].url,sire.url);assert.deepEqual(f.calls[2].body,f.calls[3].body);assert.equal(f.closed(),2);
 await f.component.prepare(record,values,f.context);assert.equal(f.calls.length,4);assert.equal(f.calls[0].body.expectedRoundDate,'2026-10-21');
});
test('an unreadable image fails before upload, preserving the chosen file for replacement',async()=>{
 const f=fixture();f.component.mount(f.host,{});f.choose('dam',[f.file]);f.decodeFailure();const values={photoEdits:f.component.read()};await assert.rejects(f.component.prepare({attributes:{}},values,f.context),/写真|사진을 읽지/);assert.equal(f.calls.length,0);assert.equal(f.component.read().dam.length,1);
});

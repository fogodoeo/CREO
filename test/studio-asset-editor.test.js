'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{parseHTML}=require('linkedom');
const saver=require('../public/studio-asset-save'),source=file=>fs.readFileSync(require.resolve('../public/'+file),'utf8'),tick=()=>new Promise(setImmediate);
const base={id:'existing-logo',kind:'vendor',name:'기존 업체 로고',targetName:'가상 업체',imageUrl:'/existing.png',page:'all',sortOrder:0,active:true};
function setup(){
 const {document,window}=parseHTML(source('auction-control.html')),$=id=>document.getElementById(id),form=$('asset-form'),messages=[],writes=[],uploads=[],revoked=[];
 let focus=null,files=[],failure=null,hold=null,uploadFailure=null,lost=false;
 Object.defineProperty(document,'activeElement',{get:()=>focus});window.HTMLElement.prototype.focus=function(){if(!this.disabled)focus=this;};
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(form,'elements',{get(){const elements=[...form.querySelectorAll('input[name],select[name]')];for(const el of elements)elements[el.name]=el;return elements;}});
 for(const el of form.elements)if(el.localName==='select')Object.defineProperty(el,'value',{value:'',writable:true});
 form.reset=()=>{files=[];for(const el of form.elements){el.value='';el.checked=el.name==='active';}};
 Object.defineProperty($('asset-file'),'files',{get:()=>files});
 window.parent={postMessage:message=>messages.push(JSON.parse(JSON.stringify(message)))};
 const records=new Map([[base.id,{...base}]]),context=vm.createContext({document,window,$,assetForm:form,channelId:'national-cre-20261021',page:1,assetFilter:'all',assetDirty:false,assetSaving:false,settingsDraft:null,workspaceLoadSequence:0,workspace:{assets:[{...base}]},location:{origin:'http://fixture.invalid'},CreoStudioAssetSave:{...saver,create:options=>saver.create({...options,makeId:()=>`asset_${crypto.randomUUID()}`})},URL:{createObjectURL:()=>'/object.png',revokeObjectURL:url=>revoked.push(url)},
  esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),visibleAssets:()=>context.workspace.assets,settingsStatus:()=>messages.push({dirty:context.assetDirty,saving:context.assetSaving}),syncDiceVideoSlots(){},syncPreview(){},openSharedBannerLibrary(){},isCrewart:()=>false,confirm:()=>true,
  optimizeDiceVideo:async file=>file,fileToBase64:async()=>Buffer.from('fake').toString('base64'),
  CreoPlatform:{api:async(path,options)=>{writes.push([path,JSON.parse(options.body||'{}'),options.method]);if(hold)await hold;if(failure)throw failure;const record=JSON.parse(options.body||'{}').record;if(options.method==='DELETE'){records.delete(path.split('/').at(-1));return{};}records.set(record.id,{...record});if(lost){lost=false;throw Error('응답 끊김');}return{record:{...record}};}},
  fetch:async(path,options)=>{uploads.push([path,JSON.parse(options.body)]);if(hold)await hold;return uploadFailure?{ok:false,status:503,json:async()=>({error:'업로드 실패'})}:{ok:true,json:async()=>({url:'/uploaded-'+uploads.length+'.png'})};}
 });
 vm.runInContext(source('studio-asset-editor.js'),context);context.resetAssetForm();context.openAssetManager();
 return{document,window,$,context,records,writes,uploads,messages,revoked,focus:()=>focus,fail:v=>{failure=v;},hold:v=>{hold=v;},uploadFail:v=>{uploadFailure=v;},lose:()=>{lost=true;},
  start(){return $('new-asset').onclick();},edit(key,value){form.elements[key].value=value;form.elements[key].dispatchEvent(new window.Event('input',{bubbles:true}));},
  choose(file=new File(['fake'],'선택 로고.png',{type:'image/png'})){files=[file];$('asset-file').onchange();},submit:()=>form.onsubmit({preventDefault(){}}),
  message(data,{origin='http://fixture.invalid',sender=window.parent}={}){const e=new window.Event('message');Object.assign(e,{origin,source:sender,data});window.dispatchEvent(e);}
 };
}
test('library first, accessible edit and dirty close preserve input until explicit discard',()=>{
 const f=setup();assert.equal(f.$('asset-manager').localName,'dialog');assert.equal(f.$('asset-manager').open,true);assert.equal(f.$('asset-form').hidden,true);
 f.start();f.choose();assert.equal(f.$('asset-name').value,'선택 로고');assert.equal(f.context.assetDirty,true);
 f.$('close-assets').onclick();assert.equal(f.$('asset-discard').open,true);assert.equal(f.$('asset-manager').open,true);
 f.$('asset-keep').onclick();assert.equal(f.$('asset-name').value,'선택 로고');
 f.$('reset-asset').onclick();f.$('asset-discard-confirm').onclick();assert.equal(f.$('asset-form').hidden,true);assert.equal(f.context.assetDirty,false);assert.equal(f.writes.length,0);assert(f.revoked.length);
 f.context.editAsset(base.id);assert.equal(f.$('asset-name').value,base.name);assert.equal(f.context.assetDirty,false);assert.equal(f.focus().id,'asset-form-title');
 f.$('close-assets').onclick();assert.equal(f.$('asset-manager').open,false);assert.equal(f.messages.at(-1).channelId,'national-cre-20261021');assert.equal(f.messages.at(-1).open,false);
});
test('upload and save are one action; duplicate clicks and close while busy have one durable effect',async()=>{
 const f=setup();f.start();f.choose();let release;f.hold(new Promise(resolve=>{release=resolve;}));const pending=f.submit();f.$('close-assets').onclick();assert.equal(f.context.assetSaving,true);assert.equal(f.$('asset-manager').open,true);await tick();const duplicate=f.submit();
 assert.equal(f.uploads.length,1);assert.equal(f.$('save-asset').disabled,true);assert.equal(f.context.assetSaving,true);f.$('close-assets').onclick();assert.equal(f.$('asset-manager').open,true);
 release();await Promise.all([pending,duplicate]);assert.equal(f.writes.length,1);assert.equal(f.records.size,2);assert.equal(f.context.assetDirty,false);assert.equal(f.context.assetSaving,false);assert.equal(f.$('asset-form').hidden,true);assert.equal(f.focus().id,'new-asset');assert.match(f.$('asset-status').textContent,/저장했습니다/);
 assert.equal(f.writes[0][0],'channels/national-cre-20261021/assets');assert.equal(f.context.workspaceLoadSequence,1);
});
test('metadata failures and a lost committed response retain file and reuse the same upload and identity',async()=>{
 for(const lost of [false,true]){const f=setup();f.start();f.choose();f.edit('name','확정할 로고');if(lost)f.lose();else f.fail(Error('등록 실패'));
  await f.submit();assert.equal(f.$('asset-form').hidden,false);assert.equal(f.context.assetDirty,true);assert.equal(f.$('asset-name').value,'확정할 로고');assert.equal(f.focus().id,'asset-status');assert.match(f.$('asset-status').textContent,/저장.*다시/);
  const id=f.writes[0][1].record.id;f.fail(null);await f.submit();assert.equal(f.uploads.length,1);assert.equal(f.writes[1][1].record.id,id);assert.equal(f.records.size,2);assert.equal(f.context.workspace.assets.length,2);
 }
});
test('upload failure, new files, invalid media and vendor target errors do not lose the draft',async()=>{
 const f=setup();f.start();f.choose();f.uploadFail(true);await f.submit();assert.equal(f.writes.length,0);assert.equal(f.context.assetDirty,true);f.uploadFail(false);f.fail(Error('목록 실패'));await f.submit();
 f.choose(new File(['new'],'새 파일.png',{type:'image/png'}));f.fail(null);await f.submit();assert.equal(f.uploads.length,3);assert.equal(f.records.size,2);
 f.start();f.choose(new File(['x'],'문서.pdf',{type:'application/pdf'}));await f.submit();assert.equal(f.writes.length,2);assert.match(f.$('asset-status').textContent,/이미지/);
 f.choose();f.edit('kind','vendor');await f.submit();assert.match(f.$('asset-status').textContent,/업체명/);assert.equal(f.writes.length,2);
});
test('reauthentication leaves inputs recoverable, and a new context cannot receive the old file',async()=>{
 const f=setup();f.start();f.choose();f.fail(Object.assign(Error('로그인 필요'),{status:401}));await f.submit();assert(f.messages.some(m=>m.type==='creo-admin-required'));
 f.context.renderAssets();f.context.openAssetManager();assert.equal(f.$('asset-name').value,'선택 로고');assert.equal(f.$('asset-form').hidden,false);
 f.context.channelId='other-round';f.fail(null);await f.submit();assert.equal(f.writes.length,1);assert.match(f.$('asset-status').textContent,/원래 방송일/);
 f.context.channelId='national-cre-20261021';await f.submit();assert.equal(f.writes.length,2);assert.equal(f.uploads.length,1);
});
test('dice selection opens a recoverable explicit save, replacing the existing face once',async()=>{
 const f=setup(),dice={...base,id:'dice-2',kind:'dice',name:'주사위 2번',targetName:'2',imageUrl:'/dice.mp4'};f.context.workspace.assets.push(dice);f.records.set(dice.id,dice);
 f.context.uploadDiceVideo(2,new File(['video'],'주사위.mov',{type:'video/quicktime'}));assert.equal(f.writes.length,0);assert.equal(f.$('asset-kind').value,'dice');assert.equal(f.$('asset-target').value,'2');
 f.fail(Error('실패'));await f.submit();f.fail(null);await f.submit();assert.equal(f.uploads.length,1);assert.equal(f.writes.at(-1)[0],'channels/national-cre-20261021/assets/dice-2');assert.equal(f.writes.at(-1)[2],'PUT');assert.equal(f.records.size,2);
});
test('late upload cannot write into another round and reset cannot bypass an active save',async()=>{
 let scope='one',release;const writes=[],errors=[];const model=saver.create({context:()=>scope,upload:()=>new Promise(resolve=>{release=resolve}),write:async(...args)=>{writes.push(args);return{record:args[1]};},onError:e=>errors.push(e),makeId:()=> 'stable'});
 const job=model.save({record:{name:'로고',kind:'sponsor'},file:new File(['x'],'x.png',{type:'image/png'})});await tick();assert.equal(model.reset(),false);scope='two';release({url:'/one.png'});assert.equal(await job,false);assert.equal(writes.length,0);assert.match(errors[0].message,/방송일/);assert.equal(model.reset(),true);
});
test('foreign open requests are ignored; approved parent requests retain channel and page',()=>{
 const f=setup();f.$('close-assets').onclick();for(const options of [{origin:'http://foreign.invalid'},{sender:{}}])f.message({type:'creo-open-assets'},options);assert.equal(f.$('asset-manager').open,false);
 f.message({type:'creo-open-assets',filter:'vendor'});assert.equal(f.$('asset-manager').open,true);assert.equal(f.messages.at(-1).page,1);assert.equal(f.messages.at(-1).channelId,'national-cre-20261021');
});
test('asset retry IDs stay singular through concurrent requests and API restart without changing auction state',async t=>{
 const {fixture}=require('../tools/national-settlement-fixture.cjs'),f=await fixture();t.after(()=>f.close());
 const beforeItems=await f.repository.listRecords('national-cre','item'),record={id:'asset_isolated_retry',kind:'sponsor',name:'가상 로고',imageUrl:'/fixture.png',page:'all',active:true};
 const path='/channels/national-cre/assets',responses=await Promise.all([f.request('POST',path,{record}),f.request('POST',path,{record})]);assert(responses.every(r=>r.status===201));
 f.restart();assert.equal((await f.request('POST',path,{record})).status,201);
 const records=await f.repository.listRecords('national-cre','asset');assert.equal(records.length,1);assert.equal(records[0].id,record.id);assert.equal((await f.repository.listRecords('creyon','asset')).length,0);
 assert.deepEqual(await f.repository.listRecords('national-cre','item'),beforeItems);assert.equal(await f.repository.getActiveChannel(),'national-cre');
 assert.equal((await f.request('POST',path,{record:{...record,id:'unauthorized'}},false)).status,401);
 const write=f.repository.upsertRecord.bind(f.repository);let fail=true;f.repository.upsertRecord=async(channel,type,value)=>{if(type==='asset'&&fail){fail=false;throw Error('isolated storage failure');}return write(channel,type,value);};
 const another={...record,id:'asset_retry_after_failure'};assert.equal((await f.request('POST',path,{record:another})).status,500);assert.equal((await f.repository.listRecords('national-cre','asset')).length,1);
 assert.equal((await f.request('POST',path,{record:another})).status,201);assert.equal((await f.repository.listRecords('national-cre','asset')).length,2);
});

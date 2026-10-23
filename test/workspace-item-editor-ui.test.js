'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Draft=require('../public/workspace-item-draft');
const source=fs.readFileSync(require.resolve('../public/workspace-item-editor.js'),'utf8');
function fixture(){
 const {document,window}=parseHTML('<html><body><button id="open">수정</button></body></html>');let active=null,id=0,fail=false,hold=false,release,scope='round21';
 Object.defineProperty(document,'activeElement',{get:()=>active});window.HTMLElement.prototype.focus=function(){active=this;};window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};
 Object.defineProperty(window.HTMLElement.prototype,'open',{get(){return this.hasAttribute('open');},set(value){value?this.setAttribute('open',''):this.removeAttribute('open');},configurable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return(this.querySelector('option[selected]')||this.querySelector('option'))?.value||'';},set(value){this.querySelectorAll('option').forEach(o=>o.selected=o.value===String(value));},configurable:true});
 const messages=[],calls=[],saved=[],focus=[];
 window.parent={postMessage:data=>messages.push(data)};window.CreoWorkspaceItemDraft=Draft;window.CreoWorkspaceItemFacts=require('../public/workspace-item-facts');window.CreoPlatform={escapeHtml:s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))};
 const ctx={window,document,location:{origin:'https://fixture'},URL,FormData:class extends Map{constructor(form){super([...form.querySelectorAll('input,textarea,select')].filter(e=>!e.disabled&&e.name).map(e=>[e.name,e.value]));}},structuredClone,AbortSignal,crypto:{randomUUID:()=>String(++id)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/workspace-item-photos.js'),'utf8'),ctx);
 vm.runInNewContext(source,ctx);
 const editor=window.CreoWorkspaceItemEditor.create({document,context:()=>({channelId:scope,channel:{name:'가상 10/21 방송',nationalRound:{date:'2026-10-21'},vendorSettlement:{enabled:true},features:{vendors:true}},round:{date:'2026-10-21'},vendors:[{id:'v1',name:'가상 업체'}],items:[{name:'A01',lotNumber:1}]}),api:async(route,options)=>{const body=JSON.parse(options.body);calls.push({route,options,body});if(hold)await new Promise(resolve=>release=resolve);if(fail){fail=false;throw Object.assign(Error('응답 지연'),{status:503});}return {record:{...body.record,updatedAt:'v2'}};},onSaved:(record,channel)=>saved.push({record,channel}),restoreFocus:(...args)=>focus.push(args)});
 const form=document.querySelector('form');Object.defineProperty(form,'elements',{get:()=>new Proxy({},{get:(_,key)=>form.querySelector('[name="'+key+'"]')})});
 const record={id:'a01',name:'A01',lotNumber:1,vendorId:'v1',status:'cancelled',note:'기존 비고',updatedAt:'v1',attributes:{broadcastDate:'2026-10-21',parents:[{name:'가상 부모'}]}};
 const input=(name,value)=>{const el=form.elements[name];el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
 return {document,window,form,editor,calls,messages,saved,focus,record,input,active:()=>active,failNext:()=>fail=true,hold:()=>hold=true,release:()=>{hold=false;release();},switchScope:()=>scope='other',submit:()=>form.onsubmit({preventDefault(){}})};
}
test('native editor groups optional fields, uses the selected date and preserves cancelled or legacy state',()=>{
 const f=fixture();f.editor.open(f.record);assert.equal(f.form.elements.status.value,'cancelled');assert.equal(f.document.querySelector('.workspace-item-editor').open,true);assert.equal(f.active().id,'item-editor-title');assert.equal(f.document.querySelectorAll('#item-editor-fields>details[open]').length,0);
 for(const field of f.form.querySelectorAll('input,select,textarea'))assert.ok(f.form.querySelector('label[for="'+field.id+'"]'),field.id);
 f.editor.close();f.editor.open(null);assert.equal(f.form.elements.broadcastDate.value,'2026-10-21');assert.equal(f.form.elements.lotNumber.value,'2');
 f.editor.close();f.editor.open({...f.record,status:'legacy'});assert.equal(f.form.elements.status.value,'legacy');
 f.editor.close();f.editor.open({...f.record,status:'live'});assert.equal(f.form.elements.status.disabled,true);assert.equal(f.form.elements.status.value,'live');
});
test('closing a dirty edit asks once, keeps input on continue and returns focus only on discard',()=>{
 const f=fixture();f.editor.open(f.record);f.input('note','새 비고');assert.equal(f.messages.at(-1).dirty,true);
 f.form.querySelector('[data-close]').click();assert.equal(f.document.querySelector('.workspace-item-discard').open,true);assert.equal(f.editor.isOpen(),true);
 f.document.querySelector('[data-keep]').click();assert.equal(f.form.elements.note.value,'새 비고');assert.equal(f.editor.isOpen(),true);
 f.input('note','기존 비고');assert.equal(f.messages.at(-1).dirty,false);f.form.querySelector('[data-close]').click();assert.equal(f.editor.isOpen(),false);assert.equal(f.focus.length,1);
 f.editor.open(f.record);f.input('note','버릴 입력');f.form.querySelector('[data-cancel]').click();f.document.querySelector('[data-discard]').click();assert.equal(f.editor.isOpen(),false);assert.equal(f.calls.length,0);
});
test('save locks every control and navigation, retains failed input and replays one request on retry',async()=>{
 const f=fixture();f.editor.open(f.record);f.input('note','유지할 비고');f.hold();f.failNext();const saving=f.submit();await new Promise(setImmediate);
 assert.equal(f.editor.busy(),true);assert.ok([...f.form.querySelectorAll('input,select,textarea,button')].every(el=>el.disabled));let navigated=false;assert.equal(f.editor.leave(()=>navigated=true),false);assert.equal(navigated,false);assert.equal(f.messages.at(-1).busy,true);
 const cancel=new f.window.Event('cancel',{cancelable:true});f.document.querySelector('.workspace-item-editor').dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(f.editor.isOpen(),true);
 f.release();assert.equal(await saving,false);assert.equal(f.form.elements.note.value,'유지할 비고');assert.match(f.document.querySelector('#item-editor-error').textContent,/응답 지연/);assert.equal(f.active().id,'item-editor-error');assert.equal(f.editor.isOpen(),true);
 assert.equal(await f.submit(),true);assert.equal(f.calls[0].body.editorRequestId,f.calls[1].body.editorRequestId);assert.equal(f.calls[0].options.method,'PUT');assert.equal(f.saved[0].record.status,'cancelled');assert.equal(f.editor.isOpen(),false);assert.equal(f.messages.at(-1).busy,false);
});
test('invalid hidden financial input is revealed with a linked error, while scope changes never write',async()=>{
 const f=fixture();f.editor.open(f.record);f.input('soldPrice','-1');assert.equal(await f.submit(),false);assert.equal(f.calls.length,0);assert.equal(f.form.elements.soldPrice.closest('details').open,true);assert.equal(f.active(),f.form.elements.soldPrice);
 f.input('soldPrice','0');f.switchScope();assert.equal(await f.submit(),false);assert.equal(f.calls.length,0);assert.match(f.document.querySelector('#item-editor-error').textContent,/방송일이 바뀌었습니다/);
});
test('unrelated edits preserve legacy nonnumeric weight and incomplete birth dates',async()=>{
 const f=fixture();f.editor.open({...f.record,attributes:{...f.record.attributes,entry_traits:{weight:'미측정',hatchDate:'25년 9월'}}});assert.equal(f.form.elements.weight.type,'text');assert.equal(f.form.elements.hatchDate.type,'text');f.input('note','비고만 변경');assert.equal(await f.submit(),true);assert.equal(f.saved[0].record.attributes.entry_traits.weight,'미측정');assert.equal(f.saved[0].record.attributes.entry_traits.hatchDate,'25년 9월');
});

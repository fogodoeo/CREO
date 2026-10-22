'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/vendor-entry-app.js'),'utf8');
const editor=source.slice(source.indexOf('  function radioGroup('),source.indexOf('  function renderEntryPhotos('));
const blank={id:'test-entry',morph:'',sex:'unknown',weight:'',hatchDate:'',note:'',photoIds:[],version:0};
function setup(entry=blank){
 const {document,window}=parseHTML('<main id="content"></main>'),calls=[];let stored=[],fail=false,recovery;
 class FormData{constructor(form){this.form=form}get(key){return this.form.querySelector('[name="'+key+'"]'+(key==='sex'?':checked':''))?.value}}
 const ctx=vm.createContext({document,window:{scrollTo(){}},FormData,structuredClone,Date,draft:null,dirty:false,busy:false,uploading:false,profileSequence:0,profile:null,profileEventId:'',eventId:'clab',state:{},$:id=>document.getElementById(id),esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),editorNavigation(){},canDeleteEntry:()=>false,renderEntryPhotos(){},renderParents(){},leave(){},openImport(){},addEntryPhotos(){},renderList(){},toast(){},profileApi:async()=>({phone:'synthetic'}),profileReady:()=>true,entries:()=>stored,Store:{recovery:{clear:async()=>{recovery=null}}},errorAt:(id,text)=>{document.getElementById(id).textContent=text},keepDraft:()=>{recovery=structuredClone(ctx.readDraft())},send:async command=>{calls.push(structuredClone(command));if(fail)throw Error('저장 실패. 다시 시도해 주세요.');stored=[{...structuredClone(command.entry),version:command.entry.version+1}];return command.entry.id}});
 const programStates=[];ctx.eventControls=()=>programStates.push(ctx.busy||ctx.uploading);ctx.Store.live=true;ctx.Store.recovery.save=async value=>{recovery=structuredClone(value)};ctx.Store.recovery.read=()=>structuredClone(recovery);
 vm.runInContext(editor,ctx);ctx.editEntry(entry);return {ctx,document,window,calls,programStates,fail:v=>fail=v,recovery:()=>recovery};
}
test('direct entry records morph separately from notes for both draft save and submission',async()=>{
 const f=setup(),morph=f.document.getElementById('entry-morph');assert.equal(f.document.querySelector('label[for="entry-morph"]').textContent,'모프 선택');assert.equal(morph.getAttribute('maxlength'),'60');
 morph.value='릴리화이트';f.document.getElementById('entry-note').value='꼬리 특징';await f.ctx.saveEntry(false,false);await f.ctx.saveEntry(true,false);
 assert.deepEqual(f.calls.map(c=>[c.type,c.entry.morph,c.entry.note]),[['save','릴리화이트','꼬리 특징'],['submit','릴리화이트','꼬리 특징']]);assert.equal(f.calls[1].expectedVersion,1);assert.deepEqual(f.programStates,[true,false,true,false]);
});
test('imported morph can be corrected without changing parent or photo identities; failure preserves the correction',async()=>{
 const f=setup({...blank,morph:'가져온 모프 "<test>"',sireId:'sire',photoIds:['photo'],version:3});assert.equal(f.document.getElementById('entry-morph').value,'가져온 모프 "<test>"');assert.equal(f.document.querySelector('test'),null);
 f.document.getElementById('entry-morph').value='정정 모프';f.fail(true);assert.equal(await f.ctx.saveEntry(true,false),false);assert.equal(f.document.getElementById('entry-morph').value,'정정 모프');assert.equal(f.recovery().morph,'정정 모프');assert.equal(f.document.getElementById('submit-entry').disabled,false);
 f.fail(false);assert.equal(await f.ctx.saveEntry(true,false),true);assert.equal(f.calls[1].entry.sireId,'sire');assert.deepEqual(f.calls[1].entry.photoIds,['photo']);assert.equal(f.calls[1].entry.morph,'정정 모프');assert.deepEqual(f.programStates,[true,false,true,false]);
});
test('morph remains optional and blanking it is kept deliberately instead of restoring stale imported text',async()=>{
 const f=setup({...blank,morph:'기존 모프'});f.document.getElementById('entry-morph').value='';await f.ctx.saveEntry(true,false);assert.equal(f.calls[0].entry.morph,'');
});
test('editing a submitted entry does not withdraw it; cancel and explicit save have separate actions',async()=>{
 const f=setup({...blank,status:'submitted',version:4,code:'출품 02'});assert.equal(f.calls.length,0);assert.equal(f.document.querySelector('h1').textContent,'개체 수정');assert.equal(f.document.getElementById('submit-entry').textContent,'수정 저장');
 assert.equal(f.document.getElementById('save-draft').textContent,'수정 취소');f.document.getElementById('save-draft').onclick();assert.equal(f.calls.length,0);
 f.document.getElementById('entry-weight').value='25';assert.equal(await f.ctx.saveEntry(false,false),false);assert.equal(f.calls.length,0);
 assert.equal(await f.ctx.saveEntry(true,false),true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].type,'submit');assert.equal(f.calls[0].reviewEdit,true);assert.equal(f.calls[0].expectedVersion,4);
});
test('approved editing retains its approved facts and sends a review request instead of immediately revising the auction',async()=>{
 const approved={morph:'원본',weight:'22'};const f=setup({...blank,status:'approved',version:2,approved,itemId:'item',lot:'A01'});
 assert.equal(f.calls.length,0);assert.equal(f.document.getElementById('submit-entry').textContent,'변경안 보내기');f.document.getElementById('entry-morph').value='수정 모프';await f.ctx.saveEntry(true,false);
 assert.equal(f.calls[0].type,'submit');assert.equal(f.calls[0].reviewEdit,true);assert.deepEqual(f.calls[0].entry.approved,approved);assert.equal(f.calls[0].entry.itemId,'item');
});
test('reload restores submitted edits without adopting a newer server version or issuing a withdrawal',async()=>{
 for(const status of ['submitted','approved']){
  const saved={...blank,status,version:5},local={...blank,status:'submitted',version:4,weight:'27',reviewEdit:true},f=setup();
  await f.ctx.Store.recovery.save({entry:local});Object.assign(f.ctx,{portal:false,section:'entries',role:'vendor',restoringRecovery:false,setContext(){},currentEvent:()=>({entriesOpen:true}),entries:()=>[saved],location:{search:'?event=clab'}});f.ctx.Store.read=async()=>({entries:[saved]});
  vm.runInContext(source.slice(source.indexOf('  async function start()'),source.indexOf("  window.addEventListener('message'")),f.ctx);
  await f.ctx.start();assert.equal(f.calls.length,0);assert.equal(f.ctx.dirty,true);assert.equal(f.ctx.draft.version,4);assert.equal(f.ctx.draft.reviewEdit,true);assert.equal(f.document.getElementById('entry-weight').value,'27');
 }
});
test('submitted detail edit starts locally and offers cancellation instead of withdrawing the entry',()=>{
 const f=setup(),box=f.document.createElement('div');box.innerHTML='<dialog id="detail-dialog"><h2 id="detail-title"></h2><div id="detail-content"></div><div id="detail-actions"></div><p id="detail-error"></p></dialog>';f.document.documentElement.append(box);
 const dialog=f.document.getElementById('detail-dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
 Object.assign(f.ctx,{role:'vendor',selectedDetail:null,displaySource:e=>e,renderInformation:()=>'',currentEvent:()=>({entriesOpen:true}),images(){}});
 vm.runInContext(source.slice(source.indexOf('  function detailEntry('),source.indexOf('  async function review(')),f.ctx);
 f.ctx.detailEntry({...blank,status:'submitted',version:2});assert.equal(dialog.open,true);assert.equal(f.document.getElementById('edit-review-entry').textContent,'개체 수정');f.document.getElementById('edit-review-entry').onclick();
 assert.equal(dialog.open,false);assert.equal(f.calls.length,0);assert.equal(f.ctx.draft.status,'submitted');assert.equal(f.ctx.draft.version,2);assert.equal(f.document.getElementById('save-draft').textContent,'수정 취소');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/vendor-entry-app.js'),'utf8');
const controls=source.slice(source.indexOf('  function entryProgramId('),source.indexOf('  function renderList('));
const change=source.slice(source.indexOf("  $('entry-event').onchange ="),source.indexOf("  window.addEventListener('beforeunload'"));
const national={id:'national-cre',name:'전크자 기본',entriesOpen:true},round={id:'national-cre-20261021',name:'전라충청',entriesOpen:false},clab={id:'clab',name:'크레용 씨랩',entriesOpen:true};
function setup(events,eventId,{portal=false,allowLeave=true}={}){
 const {document}=parseHTML('<div><label for="entry-event">프로그램</label><select id="entry-event"></select></div><p id="entry-program" hidden></p><nav id="navigation"><a data-vendor-section="entries">출품</a></nav>');
 const select=document.getElementById('entry-event');let value;
 Object.defineProperty(select,'value',{get(){return value??select.querySelector('option[selected]')?.value??select.querySelector('option')?.value??''},set(v){value=v}});
 const ctx=vm.createContext({state:{events,channelId:eventId},eventId,portal,busy:false,uploading:false,section:'entries',Store:{CHANNEL:eventId,live:true},location:{href:'original'},document,$:id=>document.getElementById(id),esc:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),pageUrl:(section,id)=>'/vendor-entries.html?event='+id,currentEvent:()=>ctx.state.events.find(e=>e.id===ctx.eventId),entries:()=>[],window:{CreoVendorNavigation:{configureBooking(){},updateStatus(){}}},leave:action=>{if(allowLeave)action()}});
 vm.runInContext(controls+change,ctx);ctx.eventControls();return {ctx,document,select,options:()=>[...select.querySelectorAll('option')].map(e=>({id:e.value,text:e.textContent}))};
}
test('entry program picker shows national once beside CLAB and keeps the original round context',()=>{
 const f=setup([national,round,{...round,id:'national-cre-20261026'},clab],round.id);
 assert.deepEqual(f.options(),[{id:national.id,text:'전국크레자랑'},{id:clab.id,text:'크레용 씨랩'}]);
 assert.equal(f.select.value,national.id);assert.equal(f.ctx.eventId,round.id);assert.equal(f.select.parentElement.hidden,false);
 assert.equal(f.document.getElementById('entry-program').hidden,true);
 f.select.value=national.id;f.select.onchange({target:f.select});assert.equal(f.ctx.location.href,'original','choosing the current program does not replace the exact context');
 f.select.value=clab.id;f.select.onchange({target:f.select});assert.equal(f.ctx.location.href,'/vendor-entries.html?event='+clab.id);
});
test('single national program or CLAB shows a static context instead of a redundant picker',()=>{
 for(const [events,id,label] of [[[national,round],round.id,'전국크레자랑'],[[clab],clab.id,clab.name]]){
  const f=setup(events,id);assert.equal(f.select.parentElement.hidden,true);assert.equal(f.document.getElementById('entry-program').hidden,false);assert.equal(f.document.getElementById('entry-program').textContent,label);
 }
 const portal=setup([national,round],round.id,{portal:true});assert.equal(portal.document.getElementById('entry-program').hidden,true);
});
test('switching from CLAB goes to the national program; cancelling an edit keeps the current program selected',()=>{
 const f=setup([national,round,clab],clab.id);f.select.value=national.id;f.select.onchange({target:f.select});assert.equal(f.ctx.location.href,'/vendor-entries.html?event=national-cre');
 const cancel=setup([national,round,clab],round.id,{allowLeave:false});cancel.select.value=clab.id;cancel.select.onchange({target:cancel.select});assert.equal(cancel.select.value,national.id);assert.equal(cancel.ctx.eventId,round.id);assert.equal(cancel.ctx.location.href,'original');
});
test('without a national membership the picker preserves authorized round links and escapes names',()=>{
 const f=setup([round,{...clab,name:'<img src=x onerror=alert(1)>'}],round.id);
 assert.deepEqual(f.options().map(e=>e.id),[round.id,clab.id]);assert.equal(f.document.querySelector('img'),null);
 assert.match(f.options()[0].text,/접수 마감/);f.ctx.busy=true;f.ctx.eventControls();assert.equal(f.select.disabled,true);
});

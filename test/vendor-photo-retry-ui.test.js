'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-broadcast.js'),'utf8');
const functions=source.slice(source.indexOf(' function photoStatus('),source.indexOf(' function photoBlock('));
function fixture(){
 const events=[],row={id:'e1',version:3,sex:'unknown',weight:'3',parents:{sire:{name:'아빠',photoId:'saved'},dam:{name:'엄마',photoId:'failed'}}};
 const media=[{id:'saved',url:'/saved'},{id:'failed',url:'blob:failed',pending:true}],scroll={scrollTop:120},details={open:false};
 const context={Number,bulkDrafts:[row],draft:null,selected:'2026-10-26',slot:0,state:{entryState:{media}},esc:s=>String(s).replaceAll('<','&lt;'),photo:id=>context.state.entryState.media.find(m=>m.id===id),bulkEditable:()=>true,editable:()=>true,capture:()=>events.push('capture'),openBulk:()=>events.push('redraw'),message:text=>events.push(text),Store:{getState:()=>({media}),send:async body=>{events.push(body);media[1]={id:'failed',url:'/uploaded'}}},$:s=>s==='.bulk-scroll'?scroll:s.endsWith(' details')?details:{querySelector:()=>({focus:()=>events.push('focus')})}};
 vm.runInNewContext(functions,context);return {context,events,row,media,scroll,details};
}
test('failed photo has a named retry action while successful and read-only photos do not show failure',()=>{
 const {context:c}=fixture();
 const html=c.photoStatus('failed',false,'개체 1 모 개체 사진',0);
 assert.match(html,/role="status"/);assert.match(html,/개체 1 모 개체 사진을 아직 전송하지 못했어요/);assert.match(html,/aria-label="개체 1 모 개체 사진 다시 전송"/);assert.match(html,/data-index="0"/);
 assert.equal(c.photoStatus('saved',false,'부 사진',0),'');assert.equal(c.photoStatus('failed',true,'모 사진',0),'');
});
test('photo retry preserves the unsaved names, entry revision and form location without submitting the entry',async()=>{
 const f=fixture(),before=JSON.stringify(f.row);await f.context.retryDraftPhoto('failed',0);
 assert.equal(JSON.stringify(f.row),before);assert.deepEqual(f.events.filter(e=>e?.type).map(e=>[e.type,e.id]),[['retry-photo','failed']]);assert.equal(f.context.state.entryState.media[1].url,'/uploaded');assert.equal(f.details.open,true);assert.equal(f.scroll.scrollTop,120);assert.ok(f.events.some(e=>typeof e==='string'&&e.includes('저장')));
});
test('repeated failure keeps the file available for retry and does not report success or change submitted data',async()=>{
 const f=fixture(),before=JSON.stringify(f.row);f.context.Store.send=async()=>{throw Error('전송 실패')};
 await assert.rejects(f.context.retryDraftPhoto('failed',0),/전송 실패/);assert.equal(JSON.stringify(f.row),before);assert.equal(f.context.state.entryState.media[1].pending,true);assert.ok(f.events.includes('redraw'));assert.ok(!f.events.some(e=>typeof e==='string'&&e.includes('전송했어요')));
 f.context.bulkEditable=()=>false;await f.context.retryDraftPhoto('failed',0);
 f.context.bulkEditable=()=>true;await f.context.retryDraftPhoto('unrelated-photo',0);assert.equal(f.events.filter(e=>e==='capture').length,1);
});

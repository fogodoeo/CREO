'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/channel-workspace.html'),'utf8');
const source=html.slice(html.indexOf('let workspaceFeedbackVersion='),html.indexOf("$('workspace-save-feedback').querySelector('button').onclick="));
function fixture(){
 const body={},add={focus(){document.activeElement=this;}},notice={hidden:true},paragraph={},retry={};
 notice.querySelector=selector=>selector==='p'?paragraph:retry;
 const document={body,activeElement:body,querySelectorAll:()=>buttons};let buttons=[],saved,loads=0,fail,resolve;
 const ctx={document,channelId:'round21',data:{items:[{id:'a01',name:'A01',note:'old'}]},workspaceLoadSequence:0,
  $:id=>id==='workspace-save-feedback'?notice:add,CreoPlatform:{api(){}},CreoWorkspaceItemEditor:{create:options=>(saved=options.onSaved,{})},
  render(){buttons.forEach(button=>{button.isConnected=false;});if(buttons.includes(document.activeElement))document.activeElement=body;buttons=ctx.data.items.map(row=>({dataset:{edit:'items:'+row.id},isConnected:true,focus(){document.activeElement=this;}}));},
  loadWorkspace(){loads++;return new Promise((accept,reject)=>{resolve=accept;fail=reject;});}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.render();
 return {ctx,document,notice,paragraph,retry,buttons:()=>buttons,save:(...args)=>saved(...args),fail:()=>fail(Error('read failed')),resolve:()=>resolve(),loads:()=>loads};
}
test('acknowledged save is merged before refresh and failed refresh offers only a list retry',async()=>{
 const f=fixture();f.save({id:'a01',name:'A01',note:'saved',status:'cancelled'},'round21');assert.equal(f.ctx.data.items.length,1);assert.equal(f.ctx.data.items[0].note,'saved');assert.equal(f.loads(),1);assert.equal(f.paragraph.textContent,'저장했습니다.');assert.equal(f.document.activeElement.dataset.edit,'items:a01');
 f.fail();await Promise.resolve();assert.equal(f.ctx.data.items[0].status,'cancelled');assert.match(f.paragraph.textContent,/저장은 완료/);assert.equal(f.retry.hidden,false);assert.equal(f.loads(),1);
});
test('a delayed list failure from a prior scope does not overwrite the new scope notice',async()=>{
 const f=fixture();f.save({id:'a01',name:'A01'},'round21');f.ctx.channelId='round26';f.paragraph.textContent='새 회차';f.fail();await Promise.resolve();assert.equal(f.paragraph.textContent,'새 회차');f.save({id:'other'},'round21');assert.equal(f.loads(),1);
});
test('list refresh restores the focused item action without stealing focus from a new form',()=>{
 const f=fixture();f.buttons()[0].focus();const restore=vm.runInContext('refreshSavedItemFocus()',f.ctx);f.ctx.render();assert.equal(f.document.activeElement,f.document.body);restore();assert.equal(f.document.activeElement,f.buttons()[0]);
 const nextRestore=vm.runInContext('refreshSavedItemFocus()',f.ctx),input={};f.document.activeElement=input;f.ctx.render();nextRestore();assert.equal(f.document.activeElement,input);
 f.buttons()[0].focus();const removed=vm.runInContext('refreshSavedItemFocus()',f.ctx);f.ctx.data.items=[];f.ctx.render();removed();assert.ok(f.document.activeElement.focus);assert.notEqual(f.document.activeElement,f.document.body);
});
test('successful list retry moves focus off the disappearing retry button and ignores a superseded status',async()=>{
 const f=fixture();f.document.activeElement=f.retry;const first=f.ctx.retryWorkspaceList({currentTarget:f.retry});assert.equal(f.retry.disabled,true);f.document.activeElement=f.document.body;f.resolve();await first;assert.equal(f.retry.hidden,true);assert.notEqual(f.document.activeElement,f.retry);assert.notEqual(f.document.activeElement,f.document.body);assert.equal(f.paragraph.textContent,'목록을 새로 불러왔습니다.');
 const second=f.ctx.retryWorkspaceList({currentTarget:f.retry});vm.runInContext('workspaceFeedbackVersion++',f.ctx);f.paragraph.textContent='새 저장 결과';f.fail();await second;assert.equal(f.paragraph.textContent,'새 저장 결과');assert.equal(f.retry.disabled,false);
});

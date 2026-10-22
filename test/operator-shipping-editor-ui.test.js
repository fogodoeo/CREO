'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/shipping.html'),'utf8');
const source=html.slice(html.indexOf('        function operatorShippingDraft()'),html.indexOf('        function updateEditorPricing()'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function setup(api){
    const fields={'editor-memo':{value:'메모'},'operator-shipping-feedback':{hidden:true,textContent:''}},calls=[];
    const state={operatorGeneration:1,operatorVersion:'',operatorPending:false,operatorError:'',operatorQuoteKey:''};let n=0;
    const ctx=vm.createContext({activeEditorWinner:'buyer',winnerStateMap:{buyer:state},SHIPPING_CHANNEL_ID:'round-channel',editorShippingState:{type:'배송',company:'파르게',region:'서울',hub:'가상점'},location:{search:'?archive=older'},URLSearchParams,crypto:{randomUUID:()=>`request-${++n}`},document:{getElementById:id=>fields[id]},activeBuyerLinkItem:()=>({_platformItemId:'first'}),CreoPlatform:{api:async(path,options)=>{if(options)assert.equal(typeof options.body,'string','fetch body must be JSON');const body=options?JSON.parse(options.body):null;calls.push({path,body});return api(path,body)}},updates:0,updateEditorPricing(){ctx.updates++},showLoading(){},closed:0,closeWinnerEditor(){ctx.closed++},refreshShippingWorkspace:async()=>{},showToast(){}});
    vm.runInContext(source,ctx);return {ctx,state,fields,calls};
}
test('quote reads the exact round and sends a valid JSON body, without storing a payment',async()=>{
    const f=setup(async(_path,body)=>body?{totals:{totalAmount:333000}}:{editVersion:'version'});
    await f.ctx.refreshOperatorShippingQuote(f.state);
    assert.match(f.calls[0].path,/archive=older/);assert.equal(f.calls[1].body.expectedArchiveId,'older');assert.equal(f.calls[1].body.action,'quote');assert.equal(f.calls[1].body.expectedVersion,'version');assert.equal(f.state.operatorQuote.totals.totalAmount,333000);
    await f.ctx.refreshOperatorShippingQuote(f.state);assert.equal(f.calls.length,2,'unchanged render does not quote repeatedly');
});
test('late quote or failure cannot overwrite a newly selected address',async()=>{
    for(const reject of [false,true]){
        const late=deferred(),f=setup(async(_path,body)=>body?late.promise:{editVersion:'version'});
        f.state.operatorVersion='version';const work=f.ctx.refreshOperatorShippingQuote(f.state);
        f.ctx.editorShippingState.hub='다른점';if(reject)late.reject(Error('old failure'));else late.resolve({totals:{totalAmount:1}});
        await work;assert.equal(f.state.operatorQuote,null);assert.equal(f.state.operatorError,'');assert.equal(f.state.operatorPending,false);assert.equal(f.ctx.updates,1);
    }
});
test('closing and reopening the same buyer ignores old version reads',async()=>{
    const late=deferred(),f=setup(()=>late.promise);const work=f.ctx.refreshOperatorShippingQuote(f.state);
    f.state.operatorGeneration++;f.state.operatorPending=false;late.resolve({editVersion:'old'});await work;
    assert.equal(f.state.operatorVersion,'');assert.equal(f.calls.length,1);assert.equal(f.ctx.updates,0);
});
test('empty form stops after reading version; corrected selection recovers from quote error',async()=>{
    let fail=true;const f=setup(async(_path,body)=>{if(!body)return {editVersion:'version'};if(fail)throw Error('다시 선택');return {totals:{totalAmount:7}}});
    f.ctx.editorShippingState.hub='';await f.ctx.refreshOperatorShippingQuote(f.state);await f.ctx.refreshOperatorShippingQuote(f.state);assert.equal(f.calls.length,1);
    f.ctx.editorShippingState.hub='잘못된점';await f.ctx.refreshOperatorShippingQuote(f.state);assert.equal(f.state.operatorError,'다시 선택');await f.ctx.refreshOperatorShippingQuote(f.state);assert.equal(f.calls.length,2);
    fail=false;f.ctx.editorShippingState.hub='올바른점';await f.ctx.refreshOperatorShippingQuote(f.state);assert.equal(f.state.operatorError,'');assert.equal(f.state.operatorQuote.totals.totalAmount,7);
});
test('failed save retains inputs and request identity; double submit sends one request',async()=>{
    const late=deferred();let fail=true;const f=setup(async()=>{if(fail)return late.promise;return {duplicate:true}});
    Object.assign(f.state,{operatorVersion:'version',operatorQuote:{totals:{totalAmount:333000}},operatorQuoteKey:JSON.stringify(f.ctx.operatorShippingDraft())});
    const first=f.ctx.saveOperatorShippingEditor(f.state);await f.ctx.saveOperatorShippingEditor(f.state);assert.equal(f.calls.length,1);
    late.reject(Error('저장 실패'));await first;assert.equal(f.fields['editor-memo'].value,'메모');assert.equal(f.fields['operator-shipping-feedback'].textContent,'저장 실패');assert.equal(f.ctx.closed,0);
    fail=false;await f.ctx.saveOperatorShippingEditor(f.state);assert.equal(f.calls[0].body.requestId,f.calls[1].body.requestId);assert.equal(f.calls[1].body.expectedAmount,333000);assert.equal(f.ctx.closed,1);
});

test('successful save followed by a failed list refresh reports saved state, not failed storage',async()=>{
    const f=setup(async()=>({duplicate:false})),notices=[];
    Object.assign(f.state,{operatorVersion:'version',operatorQuote:{totals:{totalAmount:333000}},operatorQuoteKey:JSON.stringify(f.ctx.operatorShippingDraft())});
    f.ctx.refreshShippingWorkspace=async()=>{throw Error('read failed')};f.ctx.showToast=message=>notices.push(message);
    await f.ctx.saveOperatorShippingEditor(f.state);
    assert.equal(f.ctx.closed,1);assert.equal(f.calls.length,1);assert.match(notices[0],/저장은 완료/);assert.equal(f.state.operatorSaving,false);
});

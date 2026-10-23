'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-access.js'),'utf8');
const pendingBinding=source.slice(source.indexOf("  for(const button of document.querySelectorAll('[data-complete-setup]'))"),source.indexOf("  for(const button of document.querySelectorAll('[data-cancel-setup]'))"));
test('pending connection retries the same application and enters only after durable success',async()=>{
 const calls=[],button={dataset:{completeSetup:'saved-id'}},state={ownerSetups:[{id:'saved-id',companyId:'existing'}]};let fail=true;
 const context={state,document:{querySelectorAll:()=>[button]},run:fn=>fn(),request:async(route,body)=>{calls.push([route,body]);if(fail)throw Error('retry');return {id:'existing',connected:true};},chooseCompany:async id=>calls.push(['choose',id]),enter:async()=>calls.push(['refresh'])};
 vm.runInNewContext(pendingBinding,context);
 await assert.rejects(button.onclick(),/retry/);assert.equal(calls.length,1);
 fail=false;await button.onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
  ['owner-setup',{action:'request',companyId:'existing',requestId:'saved-id',consent:true}],
  ['owner-setup',{action:'request',companyId:'existing',requestId:'saved-id',consent:true}],['choose','existing']]);
});
test('first connection preserves explicit consent and request identity across a failed save',async()=>{
 const binding=source.slice(source.indexOf("  form('owner-setup-form'"),source.indexOf("  bind('setup-other-phone'"));
 let submit,fail=true;const calls=[];
 const context={form:(_id,fn)=>submit=fn,setupCompany:{id:'existing'},setupRequestId:'first-id',$:()=>({checked:true}),request:async(route,body)=>{calls.push([route,body]);if(fail)throw Error('retry');return {id:'existing',connected:true};},chooseCompany:async id=>calls.push(['choose',id]),enter:async()=>calls.push(['refresh'])};
 vm.runInNewContext(binding,context);await assert.rejects(submit(),/retry/);fail=false;await submit();
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
  ['owner-setup',{action:'request',companyId:'existing',requestId:'first-id',consent:true}],
  ['owner-setup',{action:'request',companyId:'existing',requestId:'first-id',consent:true}],['choose','existing']]);
});

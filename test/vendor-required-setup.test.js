'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-access.js'),'utf8');
const binding=source.slice(source.indexOf(' function bindProfile()'),source.indexOf(' function openEditor('));
function setup(){
 const calls=[],elements={'setup-bank-name':{value:' 가상은행 '},'setup-bank-account':{value:' 000000 '},'setup-bank-holder':{value:' 가상 업체 '},'profile-logout':{},main:{classList:{remove(){}}}};
 const context={profile:{role:'owner',setupRequired:true,revision:7,requests:[],members:[]},company:'company-one',$:id=>elements[id],bind(){},document:{querySelectorAll:()=>[]},form:(id,callback)=>{if(id==='setup-bank-form')context.submit=callback;},request:async(route,body)=>calls.push({route,body}),loadProfile:async()=>{calls.push('reload');context.profile.setupRequired=false;},navigate:async section=>calls.push(section)};
 vm.runInNewContext(binding+'\nbindProfile()',context);return {context,calls,elements};
}
test('required bank save reloads authoritative profile before opening the company broadcast',async()=>{
 const f=setup();await f.context.submit();
 assert.equal(f.calls[0].route,'profile');assert.equal(f.calls[0].body.companyId,'company-one');assert.equal(f.calls[0].body.revision,7);assert.equal(f.calls[0].body.bankName,'가상은행');assert.equal(f.calls[0].body.bankAccount,'000000');
 assert.deepEqual(f.calls.slice(1),['reload','booking']);
});
test('failed save keeps typed values and does not navigate; retry and remaining required contact are safe',async()=>{
 const f=setup();f.context.request=async()=>{throw Error('저장 실패');};await assert.rejects(f.context.submit(),/저장 실패/);
 assert.deepEqual(f.calls,[]);assert.equal(f.elements['setup-bank-account'].value,' 000000 ');
 f.context.request=async()=>f.calls.push('saved');f.context.loadProfile=async()=>f.calls.push('reload');
 await f.context.submit();assert.deepEqual(f.calls,['saved','reload']);
});
test('failed navigation leaves the saved profile available and never repeats the bank mutation itself',async()=>{
 const f=setup();f.context.navigate=async()=>{throw Error('연결 실패');};await assert.rejects(f.context.submit(),/연결 실패/);
 assert.equal(f.context.profile.setupRequired,false);assert.equal(f.calls.filter(c=>c?.route==='profile').length,1);assert.equal(f.calls[1],'reload');
});

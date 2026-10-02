'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-access.js'),'utf8');
const enter=source.slice(source.indexOf(' async function enter()'),source.indexOf(' async function loadProfile()'));
async function landing(overrides={},search=''){
 const calls=[],context={URLSearchParams,state:{available:true,authenticated:true,channelLogin:true,phoneVerificationRequired:false,companies:[],requests:[],participations:Array.from({length:20},(_,i)=>({channelId:'other-'+i})),...overrides},company:'company-a',q:new URLSearchParams(search),refresh:async()=>{},go:s=>calls.push(s),navigate:async()=>calls.push('broadcast:'+context.company),loadProfile:async()=>calls.push('profile')};
 await vm.runInNewContext(enter+'\nenter()',context);return calls;
}
test('common login goes directly to national broadcast regardless of other auction memberships',async()=>{
 assert.deepEqual(await landing({companies:[{id:'national-vendor'}]}),['broadcast:national-vendor']);
 assert.deepEqual(await landing(),['choice']);
});
test('common entry preserves required verification, staff approval and company/profile selection',async()=>{
 assert.deepEqual(await landing({authenticated:false}),['login']);
 assert.deepEqual(await landing({phoneVerificationRequired:true,companies:[{id:'company-a'}]}),['verify-required']);
 assert.deepEqual(await landing({requests:[{id:'pending-request'}]}),['pending']);
 assert.deepEqual(await landing({companies:[{id:'a'},{id:'b'}]}),['companies']);
 assert.deepEqual(await landing({companies:[{id:'company-a'}]},'?section=profile'),['profile']);
 assert.deepEqual(await landing({available:false}),['unavailable']);
});

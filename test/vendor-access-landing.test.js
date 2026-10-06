'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-access.js'),'utf8');
const enter=source.slice(source.indexOf(' async function enter()'),source.indexOf(' async function loadProfile()'));
const choose=source.slice(source.indexOf(' async function chooseCompany('),source.indexOf(' function bind('));
async function landing(overrides={},search=''){
 const calls=[],context={URLSearchParams,state:{available:true,authenticated:true,channelLogin:true,phoneVerificationRequired:false,companies:[],requests:[],participations:Array.from({length:20},(_,i)=>({channelId:'other-'+i})),...overrides},company:'company-a',q:new URLSearchParams(search),refresh:async()=>{},go:s=>calls.push(s),openDirectory:async()=>calls.push('directory'),navigate:async()=>calls.push('broadcast:'+context.company),loadProfile:async()=>calls.push('profile')};
 await vm.runInNewContext(enter+'\n'+choose+'\nenter()',context);return calls;
}
test('common login requires channel selection even with one national company',async()=>{
 assert.deepEqual(await landing({companies:[{id:'national-vendor'}]}),['channels']);
 assert.deepEqual(await landing(),['directory']);
 assert.deepEqual(await landing({preregisteredOnly:true}),['directory']);
});
test('channel return keeps the selected authorized company and rejects unrelated IDs',async()=>{
 assert.deepEqual(await landing({companies:[{id:'company-a'},{id:'b'}]},'?section=channels'),['channels']);
 assert.deepEqual(await landing({companies:[{id:'a'},{id:'b'}]},'?section=channels'),['companies']);
 assert.deepEqual(await landing({authenticated:false},'?section=channels'),['login']);
});
test('company selection refreshes missing membership and never accepts an unrelated ID',async()=>{
 const choose=source.slice(source.indexOf(' async function chooseCompany('),source.indexOf(' function bind('));
 const calls=[],context={q:new URLSearchParams(),state:{},company:'old',refresh:async()=>{context.state={authenticated:true,companies:[{id:'allowed'}]};calls.push('refresh');},go:s=>calls.push(s)};
 await vm.runInNewContext(choose+"\nchooseCompany('allowed')",context);
 assert.equal(context.company,'allowed');assert.deepEqual(calls,['refresh','channels']);
 calls.length=0;
 await assert.rejects(vm.runInNewContext(choose+"\nchooseCompany('unrelated')",context),/업체 연결/);
 assert.deepEqual(calls,['refresh']);assert.equal(context.company,'allowed');
});
test('entry checks the session once and presents two authorized companies before channel choice',async()=>{
 assert.deepEqual(await landing({companies:[{id:'doremi'},{id:'celeb'}]}),['companies']);
 assert.deepEqual(await landing({companies:[{id:'company-a'},{id:'celeb'}]},'?section=companies'),['companies']);
 const calls=[],context={q:new URLSearchParams(),state:{available:true,authenticated:true,companies:[{id:'doremi',canClaim:true}],requests:[]},company:'',refresh:async()=>calls.push('session'),request:async(route,body)=>calls.push(route+':'+body.id),go:s=>calls.push(s),openDirectory:async()=>{},loadProfile:async()=>{}};
 await vm.runInNewContext(enter+'\n'+choose+'\nenter()',context);
 assert.deepEqual(calls,['session','claim:doremi','channels']);
 assert.equal(context.company,'doremi');
 // The ordinary bootstrap must not make a session read before enter() does it.
 const bootstrap=source.slice(source.lastIndexOf('  run(async()=>'),source.lastIndexOf('})();'));
 assert.ok(bootstrap);
 const bootCalls=[],bootContext={q:new URLSearchParams(),run:work=>work(),refresh:async()=>bootCalls.push('session'),enter:async()=>bootCalls.push('enter')};
 await vm.runInNewContext(bootstrap,bootContext);assert.deepEqual(bootCalls,['enter']);
});
test('missing required info lands on profile, completed and staff companies keep channel choice',async()=>{
 assert.deepEqual(await landing({companies:[{id:'company-a',setupRequired:true}]}),['profile']);
 assert.deepEqual(await landing({companies:[{id:'company-a',setupRequired:false,role:'staff'}]}),['channels']);
 assert.deepEqual(await landing({companies:[{id:'company-a',setupRequired:false}]},'?review=1'),['profile']);
});
test('common entry preserves required verification, staff approval and company/profile selection',async()=>{
 assert.deepEqual(await landing({authenticated:false}),['login']);
 assert.deepEqual(await landing({phoneVerificationRequired:true,companies:[{id:'company-a'}]}),['verify-required']);
 assert.deepEqual(await landing({requests:[{id:'pending-request'}]}),['pending']);
 assert.deepEqual(await landing({companies:[{id:'a'},{id:'b'}]}),['companies']);
 assert.deepEqual(await landing({companies:[{id:'company-a'}]},'?section=profile'),['profile']);
 assert.deepEqual(await landing({available:false}),['unavailable']);
});

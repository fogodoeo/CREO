'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-access.js'),'utf8');
const start=source.indexOf(' function previousScreen(){'),end=source.indexOf(" $('back').onclick=",start);
function back(screen,state,otp){return vm.runInNewContext(source.slice(start,end)+';previousScreen()',{screen,state,otp});}
test('phone login returns to login without requiring an authenticated company list',()=>{
 for(const state of [undefined,{},{authenticated:false},{companies:[]}])assert.equal(back('phone',state),'login');
});
test('OTP back returns to the correct form and directory tolerates missing session lists',()=>{
 assert.equal(back('verify',{}, {purpose:'login'}),'phone');
 assert.equal(back('verify',{}, {purpose:'register'}),'register');
 assert.equal(back('directory',{}),'login');
 assert.equal(back('directory',{companies:[{id:'a'}]}),'companies');
});

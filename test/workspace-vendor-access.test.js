'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/workspace-vendor-access.js'),'utf8');
function fixture(){
 const host={hidden:true,innerHTML:'',textContent:'',replaceChildren(){this.innerHTML='';this.textContent='';},querySelectorAll(){return[];},append(node){this.retry=node;}};
 const pending=[],ctx={window:{},document:{getElementById:()=>host,createElement:()=>({})},CreoPlatform:{escapeHtml:String,api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))},AbortSignal};
 vm.runInNewContext(source,ctx);return {host,pending,api:ctx.window.CreoWorkspaceVendorAccess};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('workspace request summary stays national-only and ignores late responses after channel/tab changes',async()=>{
 const f=fixture();f.api.sync({channelId:'creyon-1001',tab:'vendors'});assert.equal(f.pending.length,0);
 f.api.sync({channelId:'national-cre',tab:'vendors'});assert.equal(f.host.hidden,false);
 f.api.sync({channelId:'national-cre',tab:'items'});f.pending[0].resolve({deletions:[{id:'d1',name:'Old'}]});await tick();assert.equal(f.host.hidden,true);assert.equal(f.host.innerHTML,'');
 f.api.sync({channelId:'national-cre',tab:'vendors'});f.pending[1].resolve({deletions:[{id:'d2',name:'New'}]});await tick();assert.match(f.host.innerHTML,/삭제 승인 대기 1건/);assert.match(f.host.innerHTML,/New/);
 f.api.sync({channelId:'other',tab:'vendors'});assert.equal(f.host.hidden,true);
});
test('request load failure gives retry, and a newer empty response clears stale notices',async()=>{
 const f=fixture();f.api.sync({channelId:'national-cre',tab:'vendors'});f.pending[0].reject(Error('Offline'));await tick();assert.match(f.host.textContent,/불러오지 못/);assert.equal(f.host.retry.textContent,'다시 확인');
 f.host.retry.onclick();f.pending[1].resolve({deletions:[]});await tick();assert.equal(f.host.hidden,true);assert.equal(f.host.innerHTML,'');
});
test('national vendor delete bypasses the legacy hard-delete endpoint, ordinary auctions preserve it',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/channel-workspace.html'),'utf8');
 const block=html.slice(html.indexOf('async function deleteRecord('),html.indexOf("$('shared-vendors').onclick"));
 const calls=[],ctx={channelId:'national-cre',CreoWorkspaceVendorAccess:{open:async(...args)=>calls.push(args)},confirm:()=>{throw Error('Legacy confirmation must not run');}};
 vm.createContext(ctx);vm.runInContext(block,ctx);await ctx.deleteRecord('vendors','v1',{});assert.deepEqual(calls,[['v1','delete']]);
 ctx.channelId='other';await assert.rejects(ctx.deleteRecord('vendors','v1',{}),/Legacy confirmation/);
});

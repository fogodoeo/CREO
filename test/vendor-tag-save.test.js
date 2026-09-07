'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('vendor toggle saves false without changing auction state and refreshes P2',async()=>{
 const source=fs.readFileSync(require.resolve('../public/auction-control.html'),'utf8');
 const start=source.indexOf('function saveVendorTag('),end=source.indexOf("\nform.addEventListener('change'",start);
 const calls=[],messages=[];
 const context=vm.createContext({CreoPlatform:{api:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return{state:{page2VendorTagOn:false}}}},channelId:'cdcup',state:{mode:'sold',page:3},window:{parent:{postMessage:value=>messages.push(value)}},location:{origin:'http://localhost'},toast:()=>{}});
 vm.runInContext(source.slice(start,end),context);
 await context.saveVendorTag(false,'cdcup');
 assert.deepEqual(calls,[{path:'channels/cdcup/broadcast-state',body:{page2VendorTagOn:false}}]);
 assert.equal(context.state.mode,'sold');assert.equal(context.state.page,3);assert.equal(context.state.page2VendorTagOn,false);
 assert.equal(messages[0].page,2);
 context.channelId='other';messages.length=0;await context.saveVendorTag(true,'cdcup');assert.equal(messages.length,0);
});

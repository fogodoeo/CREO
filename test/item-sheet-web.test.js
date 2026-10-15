'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('ordinary workspace saves preserve sheet traits/photos and send the opened revision',async()=>{
    const source=fs.readFileSync(require.resolve('../public/channel-workspace.html'),'utf8');
    const start=source.indexOf("$('record-form').onsubmit="),end=source.indexOf('CreoItemSheetLink.mount',start),handler=source.slice(start,end);
    const original={id:'a',name:'A01',updatedAt:'opened-version',vendorId:'v',attributes:{checklist:'gender:F|weight:28',entry_traits:{hatchDate:'2025-07-01'},parents:[{role:'sire',media:[{url:'/sire.webp'}]}]}};
    const form={name:'A01',note:'웹 수정'},nodes={'record-form':{},'save-record':{isConnected:true}},calls=[];
    const context={$:id=>nodes[id],recordPending:false,editing:{channelId:'alpha',type:'items',id:'a',record:original},channelId:'alpha',selectedChannel:()=>({}),FormData:function(){return Object.entries(form)},endpoint:()=>'/items/a',CreoPlatform:{api:async(path,args)=>calls.push(JSON.parse(args.body))},closeModal(){},loadWorkspace:async()=>{},toast(){}};
    vm.runInNewContext(handler,context);await nodes['record-form'].onsubmit({preventDefault(){},currentTarget:{}});
    assert.deepEqual(calls[0].record.attributes,original.attributes);assert.equal(calls[0].record.note,'웹 수정');assert.equal(calls[0].expectedUpdatedAt,'opened-version');
});

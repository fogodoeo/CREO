'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Draft=require('../public/workspace-item-draft');
test('ordinary workspace saves preserve sheet traits/photos and send the opened revision',async()=>{
    const original={id:'a',name:'A01',updatedAt:'opened-version',vendorId:'v',attributes:{checklist:'gender:F|weight:28',entry_traits:{hatchDate:'2025-07-01'},parents:[{role:'sire',media:[{url:'/sire.webp'}]}]}};
    const calls=[],editor=Draft.create({scope:()=> 'alpha',write:async(channel,method,body)=>{calls.push(body);return {record:{...body.record,updatedAt:'saved-version'}};}});
    const form=editor.open({...original,lotNumber:1},{channelId:'alpha',channel:{features:{vendors:true}},items:[],vendors:[]});
    assert.equal(await editor.save({...form,note:'웹 수정'}),true);
    assert.deepEqual(calls[0].record.attributes,original.attributes);assert.equal(calls[0].record.note,'웹 수정');assert.equal(calls[0].expectedUpdatedAt,'opened-version');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{prepareNationalCre}=require('../tools/prepare-national-cre.cjs');
test('national channel setup is additive, opens new intake and preserves existing closed intake on replay',async()=>{
 let channels=[{id:'existing',name:'기존 경매'}],policy={open:false,revision:0},version=1;const writes=[];
 const api=async(method,route,body)=>{
  if(method==='GET')return route.startsWith('channels?')?{channels,version}:policy;
  writes.push({method,route,body});
  if(method==='POST'){assert.equal(body.expectedVersion,version);channels=[...channels,body.channel];version++;return {};}
  assert.equal(body.expectedRevision,policy.revision);policy={open:body.open,revision:policy.revision+1};return policy;
 };
 assert.equal((await prepareNationalCre(api)).exists,false);assert.equal(writes.length,0);
 await prepareNationalCre(api,{apply:true});assert.equal(writes.length,2);assert.equal(channels[0].id,'existing');assert.equal(policy.open,true);
 policy={open:false,revision:2};await prepareNationalCre(api,{apply:true});assert.equal(writes.length,2);assert.equal(policy.open,false);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {visible}=require('../public/contribution-result');
test('sold result expires after five seconds without clearing the sold state',()=>{
 const item={status:'sold',updatedAt:'2026-09-08T00:00:00Z'},start=Date.parse(item.updatedAt);
 assert.equal(visible(item,'sold',start),true);assert.equal(visible(item,'sold',start+4999),true);
 assert.equal(visible(item,'sold',start+5000),false);assert.equal(item.status,'sold');
 assert.equal(visible(item,'sold',start+600000),false);
 assert.equal(visible({...item,updatedAt:new Date(start+10000).toISOString()},'sold',start+11000),true);
});
test('reload, invalid timestamps and non-sold states cannot start old result animations',()=>{
 for(const item of [null,{status:'sold'},{status:'sold',updatedAt:'invalid'},{status:'live',updatedAt:new Date().toISOString()}])assert.equal(visible(item,'sold'),false);
 const item={status:'sold',updatedAt:'2026-09-08T00:00:00Z'};
 assert.equal(visible(item,'live',Date.parse(item.updatedAt)),false);
 assert.equal(visible(item,'sold',Date.parse(item.updatedAt)-1),false);
 assert.equal(visible(item,'sold',Date.parse(item.updatedAt)+90000,true),true);
});

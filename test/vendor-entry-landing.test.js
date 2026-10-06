'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
test('a national short link starts on its broadcast page while ordinary auctions and explicit profile links keep their page',async t=>{
 const f=await createFixture();t.after(f.close);
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,normalizeChannel({id:'ordinary',name:'일반 경매',status:'active',dataAdapter:'platform'})]);
 const codes={};
 for(const channel of ['national-cre','ordinary']){
  await f.repository.upsertRecord(channel,'vendor',{id:'vendor',name:'테스트',active:true});
  const r=await f.call(f.client(),'POST',`/api/platform/channels/${channel}/vendor-checkout-link`,{vendorId:'vendor'},{'x-creo-admin':f.secret});assert.equal(r.status,200,r.body);codes[channel]=r.json().code;
 }
 assert.equal(await f.api.vendorEntryPage({code:codes['national-cre']}),'/vendor-entries.html');
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 assert.equal(await f.api.vendorEntryPage({code:codes['national-cre']}),'/vendor-broadcast.html');
 assert.equal(await f.api.vendorEntryPage({code:codes.ordinary}),'/vendor-entries.html');
 assert.equal(await f.api.vendorEntryPage({code:codes['national-cre'],section:'profile'}),'/vendor-entries.html');
 assert.equal(await f.api.vendorEntryPage({code:codes['national-cre'],event:'ordinary'}),'/vendor-entries.html');
 assert.equal(await f.api.vendorEntryPage({code:'invalid-code'}),'/vendor-entries.html');
 f.restart();assert.equal(await f.api.vendorEntryPage({code:codes['national-cre']}),'/vendor-broadcast.html');
 const original=f.repository.getRowsByKeys;f.repository.getRowsByKeys=async()=>{throw Error('isolated failure');};
 assert.equal(await f.api.vendorEntryPage({code:codes['national-cre']}),'/vendor-entries.html');f.repository.getRowsByKeys=original;
 assert.equal((await f.repository.listRecords('national-cre','item')).length,0);
});

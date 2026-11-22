'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');
const Home=require('../public/operator-home-model');
async function switchCarrier(f){const c=await f.repository.getCatalog();await f.repository.saveCatalog(c.channels.map(c=>({...c,shippingDefaults:{...c.shippingDefaults,enabledCarriers:['dodosi']}})));f.restart();}
test('Dodosi-only switch preserves existing Parge fees, rejects new Parge, and needs no approval',async t=>{
 const f=await fixture();t.after(()=>f.close());
 await f.repository.upsertRows([{key:'shipping_rate_dodosi',value:JSON.stringify({items:[{route:'전라',region:'광주',shop:'테스트점',price:28000}]})}]);
 const before=(await f.read()).json();
 assert.equal((await f.request('POST','/buyer-shipping',{...f.saveBody,expectedVersion:before.editVersion},false)).status,200);
 const saved=await f.repository.listRecords('national-cre','shipment');
 await switchCarrier(f);
 assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),saved);
 const old=(await f.read()).json();assert.equal(old.selection.destinationType,'parge');assert(old.destinations.some(d=>d.id==='parge'));
 assert.equal(old.totals.shippingAmount,saved.reduce((n,s)=>n+s.cost,0));
 // A changed/retired public table must not reprice a saved destination on payment save.
 await f.repository.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{수도권:[{shop:'다른 지점',cost:99000}]}})}]);
 const beforeSave=(await f.read()).json();
 const retained=await f.request('POST','/buyer-shipping',{...f.saveBody,requestId:'old-quote-retained',expectedVersion:beforeSave.editVersion},false);
 assert.equal(retained.status,200,retained.body);assert.equal(retained.json().totals.shippingAmount,old.totals.shippingAmount);
 const retainedRows=await f.repository.listRecords('national-cre','shipment');
 await f.repository.upsertRecord('national-cre','item',item('a04','v1',{winnerPhone:'01000000004'}));
 const link=(await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'a04'})).json();
 const read=()=>f.request('GET','/buyer-shipping?code='+link.code,null,false);
 const fresh=(await read()).json();assert.equal(fresh.carrierRequest.canRequest,false);assert.equal(fresh.carrierRequest.canUseDodosi,true);
 assert.deepEqual(fresh.destinations.filter(d=>d.type!=='pickup').map(d=>d.id),['dodosi']);
 const parge={...f.saveBody,code:link.code,requestId:'new-parge-denied',expectedVersion:fresh.editVersion,payments:[{vendorKey:'v1',method:'bank_transfer'}]};
 assert.equal((await f.request('POST','/buyer-shipping',parge,false)).status,422);
 const body={...parge,requestId:'new-dodosi-quote',destinationId:'dodosi',pargeRegion:'전라',pargeShop:'광주 - 테스트점'};
 const a=await f.request('POST','/buyer-shipping',body,false);assert.equal(a.status,200,a.body);
 assert.equal(a.json().selection.destinationType,'dodosi');
 const rows=await f.repository.listRecords('national-cre','shipment');
 assert.equal((await f.request('POST','/buyer-shipping',body,false)).status,200);
 assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),rows);
 f.restart();assert.equal((await read()).json().selection.destinationType,'dodosi');
 for(const oldRow of retainedRows)assert.deepEqual((await f.repository.listRecords('national-cre','shipment')).find(s=>s.id===oldRow.id),oldRow);
 assert.equal((await f.repository.listRecords('national-cre','carrierrequest')).length,0);
});
test('new rounds hide Parge entry, past rounds retain its record link',()=>{
 const channel={id:'national-cre-20261123',nationalRound:{parentId:'national-cre'},status:'active',dataAdapter:'platform',features:{shipping:true},shippingDefaults:{enabledCarriers:['dodosi']}};
 const state={channel,round:{},home:'/main',finished:false};assert.equal(Home.links(state).parge,'');assert.match(Home.links({...state,finished:true}).parge,/parge-dispatch/);
});

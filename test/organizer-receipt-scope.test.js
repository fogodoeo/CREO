'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');
const route='/channels/national-cre/organizer-shipping',key='creo_organizer_shipping_ledger::national-cre';
async function setup(t){
 const f=await fixture();t.after(()=>f.close());
 const archive=(await f.request('POST','/channels/national-cre/archives',{title:'10/14 이전 방송'})).json().archive.id;
 assert.equal((await f.request('POST','/channels/national-cre/archives/'+archive+'/close-round')).status,200);
 for(const id of ['v1','v2'])await f.repository.upsertRecord('national-cre','item',item('new-'+id,id,{attributes:{broadcastDate:'2026-10-19'}}));
 const legacy={id:'legacy',vendorId:'v1',amount:10000,status:'confirmed',paidOn:'2026-10-15',memo:'기존 입금',bank:{bankName:'가상은행'}};
 await f.repository.upsertRows([{key,value:JSON.stringify([legacy])}]);
 const get=async(a='')=>(await f.request('GET',route+(a?'?archive='+a:''))).json();
 const read=async()=>JSON.parse((await f.repository.getRowsByKeys([key]))[0].value);
 const body={receiptId:'legacy',vendorId:'v1',expectedAmount:10000,expectedStatus:'confirmed',targetArchiveId:archive,expectedItemIds:['a01','a02']};
 return{...f,archive,legacy,get,read,body};
}
test('legacy receipts expose a recovery path without blocking unrelated vendor deposits or cancellations',async t=>{
 const f=await setup(t),before=await f.read(),view=await f.get();
 assert.equal(view.unassignedReceiptCount,1);assert.equal(view.unassignedReceipts.length,1);
 assert.deepEqual(view.unassignedReceipts[0].rounds.map(r=>r.itemIds),[['new-v1'],['a01','a02']]);
 assert.equal(view.unassignedReceipts[0].bank,undefined);
 assert.deepEqual(await f.read(),before,'read never assigns receipts');
 const v=view.vendors.find(v=>v.vendorId==='v2'),body={vendorId:'v2',amount:1000,paidOn:'2026-10-19',requestId:'unrelated-vendor-01',expectedReceivedAmount:0,expectedTotalAmount:v.totalAmount};
 assert.equal(v.unassignedReceiptCount,0);
 assert.equal((await f.request('POST',route+'/deposit',body)).status,200);
 assert.equal((await f.request('POST',route+'/deposit',{...body,vendorId:'v1',requestId:'blocked-vendor-01'})).status,409);
 const receipt=(await f.get()).vendors.find(v=>v.vendorId==='v2').history[0];
 assert.equal((await f.request('POST',route+'/cancel',{vendorId:'v2',receiptId:receipt.id,expectedAmount:1000})).status,200);
 assert.deepEqual((await f.read())[0],f.legacy);
});
test('explicit assignment is atomic, duplicate-safe and durable, retaining amount/status and exact archived totals',async t=>{
 const f=await setup(t),items=await f.repository.listRecords('national-cre','item');
 const replies=await Promise.all([f.request('POST',route+'/assign-round',f.body),f.request('POST',route+'/assign-round',f.body)]);
 assert.deepEqual(replies.map(r=>r.status),[200,200]);assert.deepEqual(replies.map(r=>r.json().duplicate).sort(),[false,true]);
 f.restart();assert.equal((await f.request('POST',route+'/assign-round',f.body)).json().duplicate,true);
 const record=(await f.read())[0];for(const name of Object.keys(f.legacy))assert.deepEqual(record[name],f.legacy[name]);
 assert.deepEqual(record.itemIds,['a01','a02']);assert.equal(record.roundAssignment.archiveId,f.archive);
 assert.equal((await f.get()).unassignedReceiptCount,0);assert.equal((await f.get()).vendors.find(v=>v.vendorId==='v1').receivedAmount,0);
 assert.equal((await f.get(f.archive)).vendors.find(v=>v.vendorId==='v1').receivedAmount,10000);
 assert.deepEqual(await f.repository.listRecords('national-cre','item'),items);assert.equal(f.sms.length,0);
});
test('concurrent different assignments accept one destination; conflicts and stale review never reclassify',async t=>{
 const f=await setup(t),next={...f.body,targetArchiveId:'',expectedItemIds:['new-v1']};
 const replies=await Promise.all([f.request('POST',route+'/assign-round',f.body),f.request('POST',route+'/assign-round',next)]);
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.read()).length,1);
 const snapshot=await f.read();assert.equal((await f.request('POST',route+'/assign-round',{...f.body,expectedAmount:1})).status,409);assert.deepEqual(await f.read(),snapshot);
});
test('assignment enforces organizer ownership, amount/status snapshots, nonempty exact item set and valid archive',async t=>{
 const f=await setup(t);
 assert.equal((await f.request('POST',route+'/assign-round',f.body,false)).status,401);
 for(const patch of [{expectedAmount:1},{expectedStatus:'pending'},{expectedItemIds:[]},{expectedItemIds:['a01']},{expectedItemIds:['a01','b03']},{expectedItemIds:['a01','a01']}])assert.equal((await f.request('POST',route+'/assign-round',{...f.body,...patch})).status,409);
 assert.equal((await f.request('POST',route+'/assign-round',{...f.body,vendorId:'v2'})).status,404);
 assert.equal((await f.request('POST',route+'/assign-round',{...f.body,targetArchiveId:'missing'})).status,404);
 assert.equal((await f.request('POST',route+'/assign-round',{...f.body,targetArchiveId:null})).status,422);
 const link=(await f.request('POST','/channels/creyon/organizer-link',{})).json(),code=new URL(link.url).pathname.split('/').at(-1);
 const response=await f.call(f.client(),'POST','/api/platform'+route+'/assign-round',f.body,{'x-creo-organizer':code});assert.equal(response.status,401);
 assert.deepEqual(await f.read(),[f.legacy]);
});
test('pending assignment never confirms a transfer; old review endpoint cannot bypass round isolation',async t=>{
 const f=await setup(t);await f.repository.upsertRows([{key,value:JSON.stringify([{...f.legacy,status:'pending'}])}]);
 const review={vendorId:'v1',reportId:'legacy',expectedAmount:10000,action:'confirmed'};
 assert.equal((await f.request('POST',route+'/review',review)).status,409);
 assert.equal((await f.request('POST',route+'/assign-round',{...f.body,expectedStatus:'pending'})).status,200);
 assert.equal((await f.read())[0].status,'pending');
 assert.equal((await f.get(f.archive)).vendors.find(v=>v.vendorId==='v1').receivedAmount,0);
 assert.equal((await f.request('POST',route+'/review',review)).status,409);
 assert.equal((await f.request('POST',route+'/review?archive='+f.archive,review)).status,200);
 assert.equal((await f.get(f.archive)).vendors.find(v=>v.vendorId==='v1').receivedAmount,10000);
});
test('storage failure and an archived-while-open target fail without losing or duplicating the original receipt',async t=>{
 const f=await setup(t),write=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=async()=>{throw Error('isolated storage failure')};
 assert.equal((await f.request('POST',route+'/assign-round',f.body)).status,500);f.repository.upsertRows=write;
 assert.deepEqual(await f.read(),[f.legacy]);
 const newer=(await f.request('POST','/channels/national-cre/archives',{title:'10/19 방송'})).json().archive.id;
 assert.equal((await f.request('POST','/channels/national-cre/archives/'+newer+'/close-round')).status,200);
 assert.equal((await f.request('POST',route+'/assign-round',{...f.body,targetArchiveId:'',expectedItemIds:['new-v1']})).status,409);
 assert.deepEqual(await f.read(),[f.legacy]);
});

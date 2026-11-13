'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../tools/national-settlement-fixture.cjs'),Core=require('../public/parge-dispatch-core');
const route='/channels/national-cre/parge-dispatch';
async function setup(t){const f=await fixture();t.after(()=>f.close());
 await f.repository.upsertRecord('national-cre','item',{id:'parge-test-a',name:'P01',status:'sold',soldPrice:100000,winnerName:'격리수령인',winnerPhone:'01000000001'});
 await f.repository.upsertRecord('national-cre','shipment',{id:'parge-ship-a',itemId:'parge-test-a',method:'delivery',destinationType:'parge',recipientName:'격리수령인',recipientPhone:'01000000001',pargeShop:'격리 매장',paymentStatus:'paid'});
 f.plan=async()=>{const w={items:await f.repository.listRecords('national-cre','item'),shipments:await f.repository.listRecords('national-cre','shipment')};return Core.manifest(Core.build(w,{channelId:'national-cre'}).groups,{channelId:'national-cre',date:'2099-10-24'});};
 f.prepare=async(extra={})=>({action:'prepare',requestId:'parge-request-00001',plan:await f.plan(),...extra});return f;
}
test('parge history is admin-only and channel-isolated',async t=>{const f=await setup(t);assert.equal((await f.request('GET',route,null,false)).status,401);assert.equal((await f.request('POST',route,await f.prepare(),false)).status,401);assert.deepEqual((await f.request('GET','/channels/creyon/parge-dispatch')).json().records,[]);});
test('duplicate prepare and concurrent requests reserve items once, durable across restart',async t=>{const f=await setup(t),body=await f.prepare();const out=await Promise.all([f.request('POST',route,body),f.request('POST',route,body)]);out.forEach(r=>assert.equal(r.status,200,r.body));assert.equal(out[0].json().record.id,out[1].json().record.id);f.restart();assert.equal((await f.request('GET',route)).json().records.length,1);assert.equal((await f.request('POST',route,{...body,requestId:'parge-request-00002'})).status,409);});
test('stale phone, shop, sale or sum never dispatches',async t=>{const f=await setup(t);const body=await f.prepare();await f.repository.upsertRecord('national-cre','item',{...(await f.repository.getRecord('national-cre','item','parge-test-a')),soldPrice:200000});assert.equal((await f.request('POST',route,body)).status,409);assert.equal((await f.request('GET',route)).json().records.length,0);});
test('storage failure leaves no reservation and retry is safe',async t=>{const f=await setup(t),body=await f.prepare(),write=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.endsWith('parge-dispatch')))throw Error('isolated failure');return write(rows);};assert.equal((await f.request('POST',route,body)).status,500);f.repository.upsertRows=write;assert.equal((await f.request('GET',route)).json().records.length,0);assert.equal((await f.request('POST',route,body)).status,200);});
test('cart, booking and release require explicit operator checks and never mutate financial records',async t=>{const f=await setup(t),items=await f.repository.listRecords('national-cre','item'),shipments=await f.repository.listRecords('national-cre','shipment');const prepared=await f.request('POST',route,await f.prepare());assert.equal(prepared.status,200,prepared.body);const id=prepared.json().record.id;
 assert.equal((await f.request('POST',route,{action:'confirm-cart',id})).status,409);
 assert.equal((await f.request('POST',route,{action:'confirm-cart',id,confirmed:true})).json().record.status,'cart');
 assert.equal((await f.request('POST',route,{action:'attempted',id})).json().record.status,'cart');
 assert.equal((await f.request('POST',route,{action:'confirm-booked',id,confirmed:true})).status,409);
 assert.equal((await f.request('POST',route,{action:'confirm-booked',id,confirmed:true,reference:'격리 예약 확인'})).json().record.status,'booked');
 assert.equal((await f.request('POST',route,{action:'confirm-cart',id,confirmed:true})).json().record.status,'booked');
 assert.equal((await f.request('POST',route,{action:'release',id,confirmedAbsent:true})).status,409);
 assert.deepEqual(await f.repository.listRecords('national-cre','item'),items);assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),shipments);
});
test('malformed dispatch plan is a client conflict without a saved record',async t=>{const f=await setup(t);const body=await f.prepare();body.plan.groups[0].price=-1;assert.equal((await f.request('POST',route,body)).status,409);assert.equal((await f.request('GET',route)).json().records.length,0);});
test('late submission by another buyer is new; extra animal for existing buyer needs consolidation',async t=>{const f=await setup(t);assert.equal((await f.request('POST',route,await f.prepare())).status,200);
 for(const [id,phone,name]of [['late','01000000002','추가 수령인'],['extra','01000000001','격리수령인']]){await f.repository.upsertRecord('national-cre','item',{id,name:id,status:'sold',soldPrice:200000,winnerName:name,winnerPhone:phone});await f.repository.upsertRecord('national-cre','shipment',{id:'s-'+id,itemId:id,method:'delivery',destinationType:'parge',pargeShop:'격리 매장',recipientName:name,recipientPhone:phone,paymentStatus:'paid'});const w={items:[await f.repository.getRecord('national-cre','item',id)],shipments:await f.repository.listRecords('national-cre','shipment')};const plan=Core.manifest(Core.build(w,{channelId:'national-cre'}).groups,{channelId:'national-cre',date:'2099-10-24'});const r=await f.request('POST',route,{action:'prepare',requestId:'parge-request-'+id+'-00001',plan});assert.equal(r.status,id==='late'?200:409,r.body);}
});
test('confirmed empty cart allows rebuilding without deleting audit history',async t=>{const f=await setup(t),body=await f.prepare();const id=(await f.request('POST',route,body)).json().record.id;assert.equal((await f.request('POST',route,{action:'release',id})).status,409);assert.equal((await f.request('POST',route,{action:'release',id,confirmedAbsent:true})).status,200);assert.equal((await f.request('POST',route,{...body,requestId:'parge-request-00002'})).status,200);assert.equal((await f.request('GET',route)).json().records.length,2);});

test('sender is admin-only, persists across restart and stays isolated from other auctions',async t=>{
 const f=await setup(t),body={action:'save-sender',name:'크레용 대구본점',expectedRevision:0};
 assert.equal((await f.request('POST',route,body,false)).status,401);
 assert.equal((await f.request('POST',route,body)).json().record.name,body.name);
 f.restart();assert.deepEqual((await f.request('GET',route)).json().sender,{name:body.name,phone:'01050029163',revision:1});
 assert.equal((await f.request('GET','/channels/creyon/parge-dispatch')).json().sender.name,'크레오 대구본점');
});
test('sender saves are idempotent and concurrent stale changes cannot overwrite the winner',async t=>{
 const f=await setup(t),body={action:'save-sender',name:'크레용 대구본점',expectedRevision:0};
 const results=await Promise.all([f.request('POST',route,body),f.request('POST',route,{...body,name:'다른 업체'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=(await f.request('GET',route)).json().sender;
 assert.equal((await f.request('POST',route,{...body,name:saved.name})).status,200);
 assert.equal((await f.request('GET',route)).json().sender.revision,1);
});
test('saved sender reaches canonical dispatch, stale names fail and existing plans keep their sender',async t=>{
 const f=await setup(t),body=await f.prepare();
 await f.request('POST',route,{action:'save-sender',name:'크레용 대구본점',expectedRevision:0});
 assert.equal((await f.request('POST',route,body)).status,409);
 body.plan.senderName='크레용 대구본점';const prepared=await f.request('POST',route,body);assert.equal(prepared.status,200,prepared.body);
 assert.equal(prepared.json().record.plan.senderName,'크레용 대구본점');
 await f.request('POST',route,{action:'save-sender',name:'크레오 대구본점',expectedRevision:1});
 assert.equal((await f.request('POST',route,body)).json().record.id,prepared.json().record.id);
 assert.equal((await f.request('POST',route,{...body,plan:{...body.plan,senderName:'크레오 대구본점'}})).status,409);
 assert.equal((await f.request('GET',route)).json().records[0].plan.senderName,'크레용 대구본점');
});
test('invalid sender and failed persistence never replace saved sender',async t=>{
 const f=await setup(t);
 for(const name of ['', '   ', 'x'.repeat(81), '이름\n다른 줄', '<script>'])assert.equal((await f.request('POST',route,{action:'save-sender',name,expectedRevision:0})).status,409);
 const write=f.repository.upsertRecord.bind(f.repository);f.repository.upsertRecord=async(id,type,record)=>{if(record.id==='parge-sender')throw Error('isolated failure');return write(id,type,record);};
 assert.equal((await f.request('POST',route,{action:'save-sender',name:'크레용 대구본점',expectedRevision:0})).status,500);
 assert.equal((await f.request('GET',route)).json().sender.revision,0);
});
test('custom sender phone persists, is normalized and reaches the plan; old clients retain it',async t=>{
 const f=await setup(t),body=await f.prepare();
 const saved=await f.request('POST',route,{action:'save-sender',name:'크레용 대구본점',phone:'010-1234-5678',expectedRevision:0});
 assert.equal(saved.status,200,saved.body);assert.equal(saved.json().record.phone,'01012345678');
 f.restart();assert.equal((await f.request('GET',route)).json().sender.phone,'01012345678');
 assert.equal((await f.request('GET','/channels/creyon/parge-dispatch')).json().sender.phone,'01050029163');
 body.plan.senderName='크레용 대구본점';assert.equal((await f.request('POST',route,body)).status,409);
 body.plan.senderPhone='01012345678';const prepared=await f.request('POST',route,body);assert.equal(prepared.status,200,prepared.body);assert.equal(prepared.json().record.plan.senderPhone,'01012345678');
 const legacy=await f.request('POST',route,{action:'save-sender',name:'다른 이름',expectedRevision:1});assert.equal(legacy.json().record.phone,'01012345678');
 assert.equal((await f.request('GET',route)).json().records[0].plan.senderPhone,'01012345678');
 assert.equal((await f.request('POST',route,{action:'save-sender',name:'다른 이름',phone:'01099998888',expectedRevision:1})).status,409);
});
test('invalid sender phones fail without replacing saved data',async t=>{
 const f=await setup(t);for(const phone of ['',null,'123','010-abc-5678','01012345678901234'])assert.equal((await f.request('POST',route,{action:'save-sender',name:'크레용 대구본점',phone,expectedRevision:0})).status,409);
 assert.equal((await f.request('GET',route)).json().sender.revision,0);
});

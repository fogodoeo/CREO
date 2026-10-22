'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');
async function setup(t,apiOptions={}){
 const f=await fixture({origin:'https://creo.test',apiOptions});t.after(()=>f.close());
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id==='national-cre'?{...c,shippingSupport:{enabled:false}}:c));
 await f.repository.upsertRows([{key:'shipping_rate_dodosi',value:JSON.stringify({items:[{route:'전북',region:'전북',shop:'가상 전주점',price:27000}]})},{key:'creo_organizer_shipping_bank::national-cre',value:JSON.stringify({notificationPhone:'01000000009'})}]);
 f.submit=(extra={})=>f.request('POST','/buyer-shipping/carrier-request',{code:f.code,query:'전북',region:'전체',...extra},false);
 f.rows=()=>f.repository.listRecords('national-cre','carrierrequest');
 f.review=(id,body={action:'approve'})=>f.request('POST','/channels/national-cre/carrier-requests/'+id,body);
 return f;
}
test('request appears only after empty Parge search and never accepts an unapproved Dodosi save',async t=>{
 const f=await setup(t),initial=(await f.read()).json();assert.equal(initial.carrierRequest.canRequest,true);assert(!initial.destinations.some(d=>d.id==='dodosi'));
 for(const extra of [{query:''},{query:'전'},{query:'수도권'},{query:'가상 정거샵'},{query:'ㄱㅅ'},{region:'없는 분류'}])assert.equal((await f.submit(extra)).status,422,JSON.stringify(extra));
 assert.equal((await f.request('POST','/buyer-shipping/carrier-request',{query:'전북'},false)).status,401);
 const before=await f.repository.listRecords('national-cre','shipment');
 assert.equal((await f.request('POST','/buyer-shipping',{...f.saveBody,destinationId:'dodosi',pargeRegion:'전북',pargeShop:'가상 전주점'},false)).status,422);
 assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),before);assert.equal((await f.rows()).length,0);
});
test('one request per buyer/round atomically queues one SMS with authenticated approval link across concurrent input and restart',async t=>{
 const f=await setup(t),before=(await f.read()).json();
 const responses=await Promise.all([f.submit(),f.submit({query:'없는 지역'})]);assert(responses.every(r=>r.status===200),responses.map(r=>r.body).join('\n'));assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);
 const [record]=await f.rows();assert.equal((await f.rows()).length,1);assert.equal(record.state,'pending');
 const notices=await f.repository.listRecords('national-cre','notification');assert.equal(notices.length,1);assert.equal(notices[0].transport,'sms');assert.equal(notices[0].recipientPhone,'01000000009');assert.equal(notices[0].templateKey,'operator_carrier_request');assert(Buffer.byteLength(notices[0].fallbackText,'utf8')<=90);assert.match(notices[0].fallbackText,new RegExp('/w/'+record.operatorCode));
 const after=(await f.read()).json();assert.equal(after.carrierRequest.state,'pending');assert.equal(after.carrierRequest.canRequest,false);assert.deepEqual(after.totals,before.totals);assert.equal(after.selection,null);assert.doesNotMatch(JSON.stringify(after),/01000000009|01000000003|ds_|phoneHash|notificationId/);
 assert.equal((await f.request('GET','/carrier-request-link?code='+record.operatorCode,null,false)).status,401);assert.equal((await f.request('GET','/carrier-request-link?code='+record.operatorCode)).json().id,record.id);
 assert.equal((await f.request('GET','/channels/national-cre/carrier-requests',null,false)).status,401);assert.equal((await f.request('POST','/channels/creyon/carrier-requests/'+record.id,{action:'approve'})).status,404);
 f.restart();assert.equal((await f.submit()).json().duplicate,true);assert.equal((await f.repository.listRecords('national-cre','notification')).length,1);
});
test('approval unlocks a choice only, applies on buyer save, and does not cross buyers or later rounds',async t=>{
 const f=await setup(t);await f.submit();const [record]=await f.rows();const before=await f.repository.listRecords('national-cre','shipment');
 const approved=await Promise.all([f.review(record.id),f.review(record.id)]);assert(approved.every(r=>r.status===200));assert.deepEqual(approved.map(r=>r.json().duplicate).sort(),[false,true]);assert.deepEqual(await f.repository.listRecords('national-cre','shipment'),before);
 const data=(await f.read()).json();assert.equal(data.carrierRequest.canUseDodosi,true);assert(data.destinations.some(d=>d.id==='dodosi'));assert.equal(data.selection,null);
 assert.equal(data.carriers.dodosi.regions[0].shops[0].name,'전북 - 가상 전주점');
 const save=await f.request('POST','/buyer-shipping',{...f.saveBody,expectedVersion:data.editVersion,destinationId:'dodosi',pargeRegion:'전북',pargeShop:'전북 - 가상 전주점'},false);assert.equal(save.status,200,save.body);assert.equal(save.json().selection.destinationId,'dodosi');assert.equal(save.json().totals.shippingAmount,41000);
 await f.repository.upsertRecord('national-cre','item',item('other01','v1',{winnerPhone:'01000000004'}));
 await f.repository.upsertRecord('national-cre','item',item('next01','v1',{attributes:{broadcastDate:'2026-10-19'}}));
 for(const id of ['other01','next01']){const link=(await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:id})).json();const p=(await f.request('GET','/buyer-shipping?code='+link.code,null,false)).json();assert.equal(p.carrierRequest.canUseDodosi,false,id);assert(!p.destinations.some(d=>d.id==='dodosi'));assert.equal((await f.request('POST','/buyer-shipping',{...f.saveBody,code:link.code,requestId:'new-'+id,destinationId:'dodosi',pargeRegion:'전북',pargeShop:'가상 전주점'},false)).status,422);}
});
test('rejection needs a reason, remains visible after reload and never repeats the request or text',async t=>{
 const f=await setup(t);await f.submit();const [record]=await f.rows();assert.equal((await f.review(record.id,{action:'reject'})).status,422);
 assert.equal((await f.review(record.id,{action:'reject',reason:'현장 수령으로 안내드렸어요.'})).status,200);
 assert.equal((await f.review(record.id)).status,409);assert.equal((await f.submit()).json().duplicate,true);f.restart();
 const data=(await f.read()).json();assert.equal(data.carrierRequest.state,'rejected');assert.equal(data.carrierRequest.reason,'현장 수령으로 안내드렸어요.');assert.equal(data.carrierRequest.canRequest,false);assert.equal(data.carrierRequest.canUseDodosi,false);assert.equal((await f.repository.listRecords('national-cre','notification')).length,1);
});
test('SQL failure rolls back request, approval link and SMS and allows safe retry',async t=>{
 const f=await setup(t),original=f.repository.upsertRows.bind(f.repository);let linkKey;
 f.repository.upsertRows=async rows=>{linkKey=rows.find(r=>r.key.startsWith('creo_carrier_request_link::'))?.key;return original(rows.some(r=>r.key.includes('::carrierrequest::'))?[...rows,{key:{invalid:true},value:'force SQL failure'}]:rows)};
 assert.equal((await f.submit()).status,500);assert.equal((await f.rows()).length,0);assert.equal((await f.repository.listRecords('national-cre','notification')).length,0);assert.deepEqual(await f.repository.getRowsByKeys([linkKey]),[]);
 f.repository.upsertRows=original;assert.equal((await f.submit()).status,200);const [record]=await f.rows();
 f.repository.upsertRows=async rows=>original([...rows,{key:{invalid:true},value:'approval failure'}]);assert.equal((await f.review(record.id)).status,500);assert.equal((await f.rows())[0].state,'pending');
 f.repository.upsertRows=original;assert.equal((await f.review(record.id)).status,200);
});
test('payment, shipment, owner and paused channel changes prevent approval and cannot leak eligibility',async t=>{
 for(const boundary of ['paid','shipped','owner','paused']){
  const f=await setup(t);await f.submit();const [record]=await f.rows();
  if(boundary==='owner')await f.repository.upsertRecord('national-cre','item',{...(await f.repository.getRecord('national-cre','item','a01')),winnerPhone:'01000000005'});
  else if(boundary==='paused'){const c=await f.repository.getCatalog();await f.repository.saveCatalog(c.channels.map(x=>x.id==='national-cre'?{...x,status:'draft'}:x));}
  else await f.repository.upsertRecord('national-cre','shipment',{id:'s',itemId:'a01',recipientPhone:'01000000003',paymentStatus:boundary==='paid'?'paid':'bank_transfer_pending',status:boundary==='shipped'?'shipped':'pending'});
  assert.equal((await f.review(record.id)).status,409,boundary);assert.equal((await f.rows())[0].state,'pending');assert.equal((await f.review(record.id,{action:'reject',reason:'상태 변경 확인'})).status,200);
 }
});
test('approval survives archive and new auction while operator list is restricted to its round',async t=>{
 const f=await setup(t);await f.submit();const [record]=await f.rows();await f.review(record.id);
 const archive=(await f.request('POST','/channels/national-cre/archives',{title:'이전 회차'})).json().archive.id;assert.equal((await f.request('POST','/channels/national-cre/archives/'+archive+'/close-round')).status,200);
 await f.repository.upsertRecord('national-cre','item',item('new01','v1',{attributes:{broadcastDate:'2026-10-19'}}));
 const current=await f.request('GET','/channels/national-cre/carrier-requests');assert.equal(current.json().records.length,0);
 const old=await f.request('GET','/channels/national-cre/carrier-requests?recordId='+record.id);assert.equal(old.json().archiveId,archive);assert.equal(old.json().records.length,1);
 f.restart();assert.equal((await f.read()).json().carrierRequest.canUseDodosi,true);
 const newer=(await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'new01'})).json();assert.equal((await f.request('GET','/buyer-shipping?code='+newer.code,null,false)).json().carrierRequest.canUseDodosi,false);
});
test('disabled notification service fails without recording a request, and former Dodosi selections remain usable',async t=>{
 const f=await setup(t,{notificationService:null});assert.equal((await f.submit()).status,503);assert.equal((await f.rows()).length,0);
 await f.repository.upsertRecord('national-cre','shipment',{id:'legacy',itemId:'a01',recipientPhone:'01000000003',destinationType:'dodosi',destinationId:'dodosi',pargeRegion:'전북',pargeShop:'가상 전주점',buyerSubmittedAt:new Date().toISOString(),paymentMethod:'bank_transfer',paymentStatus:'bank_transfer_pending'});
 const data=(await f.read()).json();assert.equal(data.carrierRequest.canUseDodosi,true);assert.equal(data.carrierRequest.canRequest,false);assert(data.destinations.some(d=>d.id==='dodosi'));
});
test('practice requests suppress SMS unless enabled and cannot redirect the enabled test recipient',async t=>{
 const id='checkout-test-1111111111111111';
 for(const enabled of [false,true]){
  const f=await setup(t,{checkoutTestDeliveryChannels:enabled?id:''}),catalog=await f.repository.getCatalog();
  await f.repository.saveCatalog([...catalog.channels,{...catalog.channels[0],id}]);
  await f.repository.upsertRecord(id,'vendor',{id:'v1',name:'가상 업체'});
  await f.repository.upsertRecord(id,'item',item('practice','v1',{winnerPhone:'01049278600'}));
  await f.repository.upsertRows([{key:'creo_organizer_shipping_bank::'+id,value:JSON.stringify({notificationPhone:'01000000009'})}]);
  const link=await f.request('POST','/channels/'+id+'/buyer-shipping-link',{itemId:'practice'});assert.equal(link.status,200,link.body);
  const r=await f.submit({code:link.json().code});assert.equal(r.status,200,r.body);
  const notices=await f.repository.listRecords(id,'notification');assert.equal(notices.length,enabled?1:0);
  if(enabled)assert.equal(notices[0].recipientPhone,'01049278600');
  const listed=(await f.request('GET','/channels/'+id+'/carrier-requests')).json().records;
  assert.equal(listed.length,1);if(!enabled)assert.equal(listed[0].notificationStatus,'test_no_send');
 }
});
test('payment confirmation ordered before approval leaves the request pending and destination locked',{timeout:5000},async t=>{
 const f=await setup(t);await f.submit();const [record]=await f.rows();
 assert.equal((await f.request('POST','/buyer-shipping',f.saveBody,false)).status,200);
 const original=f.repository.upsertRows.bind(f.repository);let enter,release;
 const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);let blocked=false;
 f.repository.upsertRows=async rows=>{if(!blocked&&rows.some(r=>r.key.includes('::shipment::')&&JSON.parse(r.value).paymentStatus==='paid')){blocked=true;enter();await gate;}return original(rows)};
 const confirm=f.request('POST','/channels/national-cre/buyer-shipping-payment',{itemId:'a01',requestId:'confirm-before-carrier',expectedAmount:226000});
 await entered;const approval=f.review(record.id);release();
 const [paid,result]=await Promise.all([confirm,approval]);assert.equal(paid.status,200,paid.body);assert.equal(result.status,409,result.body);
 assert.equal((await f.rows())[0].state,'pending');const data=(await f.read()).json();assert.equal(data.canEditDestination,false);assert.equal(data.carrierRequest.canUseDodosi,false);
});
test('new wins in the same round keep the approval but current ownership still gates a different buyer',async t=>{
 const f=await setup(t);await f.submit();const [record]=await f.rows();assert.equal((await f.review(record.id)).status,200);
 await f.repository.upsertRecord('national-cre','item',item('extra','v2'));
 const extra=(await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'extra'})).json();
 assert.equal((await f.request('GET','/buyer-shipping?code='+extra.code,null,false)).json().carrierRequest.canUseDodosi,true);
 for(const id of record.itemIds)await f.repository.upsertRecord('national-cre','item',{...await f.repository.getRecord('national-cre','item',id),winnerPhone:'01000000005'});
 const changed=(await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'a01'})).json();
 assert.equal((await f.request('GET','/buyer-shipping?code='+changed.code,null,false)).json().carrierRequest.canUseDodosi,false);
});
test('pending status polling is read-only and returns carrier choices only after approval',async t=>{
 const f=await setup(t);await f.submit();const [record]=await f.rows();const original=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=async()=>{throw Error('A status read must not write')};
 const pending=await f.request('GET','/buyer-shipping/carrier-request?code='+f.code,null,false);assert.equal(pending.status,200,pending.body);assert.deepEqual(Object.keys(pending.json()),['carrierRequest']);assert.equal(pending.json().carrierRequest.state,'pending');
 f.repository.upsertRows=original;await f.review(record.id);const approved=await f.request('GET','/buyer-shipping/carrier-request?code='+f.code,null,false);
 assert.equal(approved.status,200);assert(approved.json().destinations.some(d=>d.id==='dodosi'));assert(approved.json().carriers.dodosi.regions.length);
});

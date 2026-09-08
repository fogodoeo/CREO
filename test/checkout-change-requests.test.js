'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel}=require('../platform-core');
const {CheckoutNotificationService}=require('../checkout-notifications');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-change-'));
 const options={dbPath:path.join(dir,'test.sqlite'),durable:true,adminSecret:'secret',startWorker:false};
 let repo=new SQLitePlatformRepository(options),api;
 const provider={readiness:()=>({ready:true,missing:[]}),status:()=>({}),send:async()=>{throw Error('No external messages in tests');}};
 function restartApi(){api=createPlatformApi({repository:repo,notificationService:new CheckoutNotificationService({repository:repo,provider}),adminSessionSecret:'stable-change-secret',logger:{error(){},warn(){}}});}
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['서울 직수령','부산 직수령']}})));
 await repo.upsertRecord('alpha','vendor',{id:'vendor',name:'테스트업체',phone:'01011112222',paymentMethods:['bank_transfer','card'],bankName:'테스트은행',bankAccount:'123',bankHolder:'업체'});
 await repo.upsertRecord('alpha','item',{id:'item',name:'A01',vendorId:'vendor',vendorName:'테스트업체',lotNumber:1,status:'sold',soldPrice:100000,winnerName:'구매자',winnerPhone:'01012345678'});
 restartApi();
 async function call(method,url,body,admin='secret'){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'creo.test',...(admin?{'x-creo-admin':admin}:{})};
  const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL('https://creo.test'+url));return res;
 }
 const link=await call('POST','/api/platform/channels/alpha/buyer-shipping-link',{itemId:'item'});assert.equal(link.status,200,link.body);
 const code=link.json().code||new URL(link.json().url).pathname.split('/').at(-1);
 const selection={code,destinationId:'pickup-1',payments:[{vendorKey:'vendor',method:'bank_transfer'}]};
 const saved=await call('POST','/api/platform/buyer-shipping',{...selection,requestId:'initial-save'},'');assert.equal(saved.status,200,saved.body);
 t.after(()=>{repo.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {call,code,selection,get repo(){return repo},async restart(){repo.close();repo=new SQLitePlatformRepository(options);restartApi();},
  request:(extra={})=>call('POST','/api/platform/buyer-shipping/change-request',{...selection,destinationId:'pickup-2',requestId:'change-request-1',...extra},''),
  get:()=>call('GET','/api/platform/buyer-shipping?code='+code,null,''),
  review:(id,extra={})=>call('POST','/api/platform/channels/alpha/checkout-changes/'+id,{action:'approve',confirmedUnpaid:true,...extra})};
}
test('change request is durable, isolated, idempotent, and applies only on authenticated approval',async t=>{
 const f=await fixture(t),before=await f.repo.listRecords('alpha','shipment');
 const results=await Promise.all([f.request(),f.request()]);for(const r of results)assert.equal(r.status,200,r.body);
 assert.equal(results.filter(r=>r.json().duplicate).length,1);
 const record=(await f.repo.listRecords('alpha','checkoutchange'))[0];assert.equal(record.state,'pending');
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);
 let notifications=await f.repo.listRecords('alpha','notification');
 const op=notifications.filter(n=>n.templateKey==='operator_checkout_change');assert.equal(op.length,1);assert.equal(op[0].recipientRole,'operator');assert.equal(op[0].recipientPhone,'01049278600');assert.equal(op[0].failureSmsFallback,true);assert.equal(op[0].variables['#{업체접속코드}'],record.operatorCode);
 const publicData=(await f.get()).json();assert.equal(publicData.selection.destinationId,'pickup-1');assert.equal(publicData.changeRequest.after.selection.destinationId,'pickup-2');assert.doesNotMatch(JSON.stringify(publicData),/01012345678|op_|fingerprint|phoneHash/);
 assert.equal((await f.call('GET','/api/platform/channels/alpha/checkout-changes',null,'')).status,401);
 assert.equal((await f.call('GET','/api/platform/checkout-change-link?code='+record.operatorCode,null,'')).status,401);
 assert.equal((await f.call('GET','/api/platform/checkout-change-link?code='+record.operatorCode)).json().id,record.id);
 assert.equal((await f.call('POST','/api/platform/channels/beta/checkout-changes/'+record.id,{action:'approve',confirmedUnpaid:true})).status,404);
 assert.equal((await f.request({requestId:'another-request'})).status,409);
 assert.equal((await f.call('POST','/api/platform/buyer-shipping',{...f.selection,requestId:'overwrite-now'},'')).status,409);
 assert.equal((await f.call('POST','/api/platform/channels/alpha/buyer-shipping-payment',{itemId:'item',requestId:'confirm-while-pending'})).status,409);
 assert.equal((await f.review(record.id,{confirmedUnpaid:false})).status,422);
 await f.restart();assert.equal((await f.get()).json().changeRequest.state,'pending');
 const approved=await f.review(record.id);assert.equal(approved.status,200,approved.body);
 assert.equal((await f.get()).json().selection.destinationId,'pickup-2');assert.equal((await f.get()).json().changeRequest.state,'approved');
 assert.equal((await f.review(record.id)).json().duplicate,true);
 assert.equal((await f.review(record.id,{action:'reject',reason:'늦은 반려'})).status,409);
 notifications=await f.repo.listRecords('alpha','notification');assert.equal(notifications.filter(n=>n.templateKey==='buyer_checkout_change_reviewed').length,1);
 assert.equal(notifications.filter(n=>n.eventKey.startsWith('checkout-change-approved:')).length,1);
 await f.restart();assert.equal((await f.get()).json().selection.destinationId,'pickup-2');
});
test('rejection preserves original selection, requires a reason, and allows a new request',async t=>{
 const f=await fixture(t);const r=await f.request();const id=r.json().changeRequest.id;
 assert.equal((await f.review(id,{action:'reject',reason:''})).status,422);
 assert.equal((await f.review(id,{action:'reject',reason:'기존 입금 여부 확인 필요'})).status,200);
 const data=(await f.get()).json();assert.equal(data.selection.destinationId,'pickup-1');assert.equal(data.changeRequest.reason,'기존 입금 여부 확인 필요');
 assert.equal((await f.request({requestId:'request-after-rejection'})).status,200);
});
test('stale auction data prevents approval and leaves a request rejectable',async t=>{
 const f=await fixture(t);const id=(await f.request()).json().changeRequest.id;
 await f.repo.upsertRecord('alpha','item',{...(await f.repo.getRecord('alpha','item','item')),soldPrice:120000});
 assert.equal((await f.review(id)).status,409);
 assert.equal((await f.get()).json().changeRequest.state,'pending');
 assert.equal((await f.review(id,{action:'reject',reason:'낙찰금 변경으로 재요청 필요'})).status,200);
});
test('failed atomic approval cannot partially update shipments, decision, or notifications',async t=>{
 const f=await fixture(t);const id=(await f.request()).json().changeRequest.id;
 const before=await f.repo.listRecords('alpha','shipment'),notifications=await f.repo.listRecords('alpha','notification');
 const original=f.repo.upsertRows.bind(f.repo);f.repo.upsertRows=async rows=>original(rows.some(r=>r.key.includes('checkoutchange'))?[...rows,{key:{invalid:true},value:'force SQLITE binding failure after preceding writes'}]:rows);
 assert.equal((await f.review(id)).status,500);assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);assert.deepEqual(await f.repo.listRecords('alpha','notification'),notifications);
 f.repo.upsertRows=original;assert.equal((await f.review(id)).status,200);
});
for(const paymentStatus of ['paid','bank_transfer_reported','card_payment_reported'])test(paymentStatus+' prevents change requests',async t=>{
 const f=await fixture(t);const s=(await f.repo.listRecords('alpha','shipment'))[0];await f.repo.upsertRecord('alpha','shipment',{...s,paymentStatus});
 assert.equal((await f.request()).status,409);assert.equal((await f.repo.listRecords('alpha','checkoutchange')).length,0);
});
test('existing external card link requires cancellation and is removed on approval',async t=>{
 const f=await fixture(t);const s=(await f.repo.listRecords('alpha','shipment'))[0];await f.repo.upsertRecord('alpha','shipment',{...s,paymentMethod:'card',paymentStatus:'card_payment_pending',cardPaymentUrl:'https://pay.example.test/old',cardLinkPreparedAt:new Date().toISOString(),cardLinkRequestId:'old-card'});
 const requested=await f.request({payments:[{vendorKey:'vendor',method:'card'}]});assert.equal(requested.status,200,requested.body);const id=requested.json().changeRequest.id;
 assert.equal((await f.review(id)).status,422);
 const result=await f.review(id,{confirmedCardLinksCancelled:true});assert.equal(result.status,200,result.body);
 const after=(await f.repo.listRecords('alpha','shipment'))[0];assert.equal(after.cardPaymentUrl,'');assert.equal(after.paymentStatus,'card_link_pending');
});
test('pending request blocks buyer report, vendor actions, and generic shipment writes',async t=>{
 const f=await fixture(t);await f.request();
 assert.equal((await f.call('POST','/api/platform/buyer-shipping/report-payment',{code:f.code,vendorKey:'vendor',requestId:'report-pending'},'')).status,409);
 const l=await f.call('POST','/api/platform/channels/alpha/vendor-checkout-link',{vendorKey:'vendor',vendorId:'vendor'});assert.equal(l.status,200,l.body);
 const code=l.json().code;const vendor=await f.call('GET','/api/platform/vendor-checkout?code='+code,null,'');assert.equal(vendor.status,200,vendor.body);const buyer=vendor.json().buyers[0];assert.equal(buyer.changePending,true);
 for(const action of ['card-link','confirm-payment'])assert.equal((await f.call('POST','/api/platform/vendor-checkout/'+action,{code,buyerId:buyer.id,requestId:'vendor-pending-'+action,cardPaymentUrl:'https://pay.example.test/new'},'')).status,409);
 const shipment=(await f.repo.listRecords('alpha','shipment'))[0];
 assert.equal((await f.call('PUT','/api/platform/channels/alpha/shipments/'+shipment.id,{record:{...shipment,address:'bypass'}})).status,409);
 assert.equal((await f.call('DELETE','/api/platform/channels/alpha/shipments/'+shipment.id)).status,409);
});
test('other buyers remain independent while a change is pending',async t=>{
 const f=await fixture(t);await f.request();
 await f.repo.upsertRecord('alpha','item',{...(await f.repo.getRecord('alpha','item','item')),id:'other',lotNumber:2,winnerName:'다른구매자',winnerPhone:'01088889999'});
 const l=await f.call('POST','/api/platform/channels/alpha/buyer-shipping-link',{itemId:'other'});const code=l.json().code||new URL(l.json().url).pathname.split('/').at(-1);
 const get=await f.call('GET','/api/platform/buyer-shipping?code='+code,null,'');assert.equal(get.json().changeRequest,null);
 assert.equal((await f.call('POST','/api/platform/buyer-shipping',{...f.selection,code,requestId:'other-initial'},'')).status,200);
 assert.equal((await f.call('POST','/api/platform/buyer-shipping/report-payment',{code,vendorKey:'vendor',requestId:'other-report'},'')).status,200);
});
test('atomic request failure leaves neither request nor operator alert and retry succeeds',async t=>{
 const f=await fixture(t);const before=await f.repo.listRecords('alpha','notification'),original=f.repo.upsertRows.bind(f.repo);
 f.repo.upsertRows=async rows=>original(rows.some(r=>r.key.includes('checkoutchange'))?[...rows,{key:{invalid:true},value:'failure'}]:rows);
 assert.equal((await f.request()).status,500);assert.equal((await f.repo.listRecords('alpha','checkoutchange')).length,0);assert.deepEqual(await f.repo.listRecords('alpha','notification'),before);
 f.repo.upsertRows=original;assert.equal((await f.request()).status,200);
});
test('approval and rejection racing can produce only one terminal decision',async t=>{
 const f=await fixture(t),id=(await f.request()).json().changeRequest.id;
 const responses=await Promise.all([f.review(id),f.review(id,{action:'reject',reason:'중복 처리'})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const record=await f.repo.getRecord('alpha','checkoutchange',id);assert.equal(record.state,'approved');
 assert.equal((await f.repo.listRecords('alpha','notification')).filter(n=>n.templateKey==='buyer_checkout_change_reviewed').length,1);
});
test('shipment and closed channel lifecycle boundaries fail closed',async t=>{
 const f=await fixture(t),shipment=(await f.repo.listRecords('alpha','shipment'))[0];
 await f.repo.upsertRecord('alpha','shipment',{...shipment,trackingNumber:'TRACK123'});assert.equal((await f.request()).status,409);
 await f.repo.upsertRecord('alpha','shipment',shipment);const id=(await f.request()).json().changeRequest.id;
 const catalog=await f.repo.getCatalog();await f.repo.saveCatalog(catalog.channels.map(c=>c.id==='alpha'?{...c,status:'archived'}:c));
 assert.equal((await f.review(id)).status,409);assert.equal((await f.review(id,{action:'reject',reason:'경매 종료'})).status,200);
});

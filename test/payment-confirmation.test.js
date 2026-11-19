'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core'),{CheckoutNotificationService}=require('../checkout-notifications');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-payment-confirmation-'));
 const options={dbPath:path.join(dir,'isolated.sqlite'),durable:true,startWorker:false,adminSecret:'secret'};
 let repository,api,service,ready=true;const sent=[];
 const provider={testMode:false,readiness:()=>({ready,missing:ready?[]:['isolated configuration']}),status:()=>({}),send:async record=>{sent.push(record);return {messageId:'fake-'+record.id}}};
 function start(){repository=new SQLitePlatformRepository(options);service=new CheckoutNotificationService({repository,provider,beforeSend:(c,n)=>api.assertBuyerNotificationLink(c,n),logger:{warn(){}}});api=createPlatformApi({repository,notificationService:service,adminSessionSecret:'isolated-payment-secret',logger:{error(){},warn(){}}});}start();
 await repository.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['가상 행사장','다른 행사장']}})));
 for(const channel of ['alpha','beta']){
  await repository.upsertRecord(channel,'vendor',{id:'vendor',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'0000000',bankHolder:'예시 업체'});
  for(const [id,price] of [['first',30000],['second',20000]])await repository.upsertRecord(channel,'item',{id,name:id==='first'?'A01':'A02',lotNumber:id==='first'?1:2,status:'sold',soldPrice:price,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 }
 async function call(method,route,body,admin=false){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'secret'}:{})};
  const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;
 }
 const link=(await call('POST','channels/alpha/buyer-shipping-link',{itemId:'first'},true)).json();
 const selection={code:link.code,destinationId:'pickup-1',payments:[{vendorKey:'vendor',method:'bank_transfer'}]};
 const save=await call('POST','buyer-shipping',{...selection,requestId:'initial-selection'});assert.equal(save.status,200,save.body);
 const vendor=(await call('POST','channels/alpha/vendor-checkout-link',{vendorId:'vendor'},true)).json();
 const buyer=(await call('GET','vendor-checkout?code='+vendor.code)).json().buyers[0];
 t.after(()=>{repository.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-payment-confirmation-'))throw Error('Unsafe cleanup target');fs.rmSync(target,{recursive:true,force:true});});
 const confirm=(role='operator',extra={})=>role==='operator'?call('POST','channels/alpha/buyer-shipping-payment',{itemId:'first',requestId:'confirm-initial',...extra},true):call('POST','vendor-checkout/confirm-payment',{code:vendor.code,buyerId:buyer.id,requestId:'confirm-initial',...extra});
 return {call,confirm,selection,link,vendor,buyer,sent,get repository(){return repository},get service(){return service},setReady(value){ready=value},restart(){repository.close();start()},notices:async()=> (await repository.listRecords('alpha','notification')).filter(n=>n.templateKey==='buyer_payment_confirmed')};
}
async function secondVendor(f,method='bank_transfer'){
 await f.repository.upsertRecord('alpha','vendor',{id:'other',name:'다른 업체',bankName:'가상은행',bankAccount:'123',bankHolder:'다른 업체'});
 await f.repository.upsertRecord('alpha','item',{id:'other-item',name:'B01',status:'sold',soldPrice:70000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'other',vendorName:'다른 업체'});
 const save=await f.call('POST','buyer-shipping',{...f.selection,payments:[...f.selection.payments,{vendorKey:'other',method}],requestId:'save-other-vendor'});assert.equal(save.status,200,save.body);
 const link=(await f.call('POST','channels/alpha/vendor-checkout-link',{vendorId:'other'},true)).json();
 return {link,buyer:(await f.call('GET','vendor-checkout?code='+link.code)).json().buyers[0],data:save.json()};
}
test('another vendor can report and confirm from an open payment screen while the first remains unconfirmed',async t=>{
 const f=await fixture(t),other=await secondVendor(f);
 const firstVersion=other.data.vendors.find(v=>v.key==='vendor').payment.editVersion;
 const otherVersion=other.data.vendors.find(v=>v.key==='other').payment.editVersion;
 const report=(vendorKey,expectedVersion,requestId)=>f.call('POST','buyer-shipping/report-payment',{code:f.link.code,vendorKey,expectedVersion,requestId});
 assert.equal((await report('vendor',firstVersion,'report-first-vendor')).status,200);
 f.restart();
 const otherReport=await report('other',otherVersion,'report-other-vendor');assert.equal(otherReport.status,200,otherReport.body);
 const snapshot=(await f.call('GET','vendor-checkout?code='+other.link.code)).json().buyers[0];
 // An additional win and activity at A do not invalidate B's confirmation.
 await f.repository.upsertRecord('alpha','item',{id:'later',name:'A03',status:'sold',soldPrice:10000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor'});
 const response=await f.call('POST','vendor-checkout/confirm-payment',{code:other.link.code,buyerId:snapshot.id,expectedVersion:snapshot.payment.editVersion,requestId:'confirm-other-vendor'});
 assert.equal(response.status,200,response.body);
 const shipments=await f.repository.listRecords('alpha','shipment');
 assert.equal(shipments.find(s=>s.itemId==='other-item').paymentStatus,'paid');
 assert.ok(shipments.filter(s=>['first','second'].includes(s.itemId)).every(s=>s.paymentStatus==='bank_transfer_reported'));
 assert.equal((await f.notices()).length,1);
});
test('both vendors can independently confirm concurrently using versions captured before either confirmation',async t=>{
 const f=await fixture(t),other=await secondVendor(f);
 const first=(await f.call('GET','vendor-checkout?code='+f.vendor.code)).json().buyers[0];
 const responses=await Promise.all([
  f.confirm('vendor',{expectedVersion:first.payment.editVersion}),
  f.call('POST','vendor-checkout/confirm-payment',{code:other.link.code,buyerId:other.buyer.id,expectedVersion:other.buyer.payment.editVersion,requestId:'confirm-second-vendor'})
 ]);
 for(const response of responses)assert.equal(response.status,200,response.body);
 assert.ok((await f.repository.listRecords('alpha','shipment')).every(s=>s.paymentStatus==='paid'));
 assert.equal((await f.notices()).length,2);
});
test('a pending vendor does not block another vendor card guide or card payment report',async t=>{
 const f=await fixture(t),other=await secondVendor(f,'card');
 const pending=await f.call('POST','buyer-shipping/report-payment',{code:f.link.code,vendorKey:'vendor',requestId:'report-first-bank'});assert.equal(pending.status,200,pending.body);
 const guide=await f.call('POST','vendor-checkout/card-link',{code:other.link.code,buyerId:other.buyer.id,expectedVersion:other.buyer.payment.editVersion,expectedAmount:70000,cardPaymentUrl:'https://pay.example.test/isolated',requestId:'other-card-guide'});
 assert.equal(guide.status,200,guide.body);
 const data=(await f.call('GET','buyer-shipping?code='+f.link.code)).json();
 assert.equal((await f.confirm()).status,200);
 const report=await f.call('POST','buyer-shipping/report-payment',{code:f.link.code,vendorKey:'other',expectedVersion:data.vendors.find(v=>v.key==='other').payment.editVersion,requestId:'report-other-card'});
 assert.equal(report.status,200,report.body);
 assert.equal(report.json().vendors.find(v=>v.key==='other').payment.status,'card_payment_reported');
});
test('a vendor scoped version still rejects changed own amount, destination, or another vendor version',async t=>{
 for(const mutation of ['amount','destination','wrong-vendor']){
  const f=await fixture(t),other=await secondVendor(f),version=other.buyer.payment.editVersion;
  if(mutation==='amount'){const item=await f.repository.getRecord('alpha','item','other-item');await f.repository.upsertRecord('alpha','item',{...item,soldPrice:80000});}
  if(mutation==='destination'){const shipment=(await f.repository.listRecords('alpha','shipment')).find(s=>s.itemId==='other-item');await f.repository.upsertRecord('alpha','shipment',{...shipment,destinationId:'pickup-2',address:'다른 행사장'});}
  const response=await f.call('POST','vendor-checkout/confirm-payment',{code:other.link.code,buyerId:other.buyer.id,expectedVersion:mutation==='wrong-vendor'?f.buyer.payment.editVersion:version,requestId:'stale-scoped-confirm'});
  assert.equal(response.status,409,response.body);assert.equal((await f.notices()).length,0);
 }
});
test('operator confirmation atomically queues the buyer completion notice and all roles see paid',async t=>{
 const f=await fixture(t),response=await f.confirm();assert.equal(response.status,200,response.body);
 const notices=await f.notices();assert.equal(notices.length,1);assert.equal(response.json().notification.status,'queued');
 assert.equal(notices[0].recipientPhone,'01000000002');assert.equal(notices[0].variables['#{결제금액}'],'50,000원');assert.equal(notices[0].failureSmsFallback,true);
 assert.equal((await f.call('GET','buyer-shipping?code='+f.link.code)).json().payment.status,'paid');
 assert.equal((await f.call('GET','vendor-checkout?code='+f.vendor.code)).json().buyers[0].payment.status,'paid');
 f.restart();await f.service.flushChannel('alpha');await f.service.flushChannel('alpha');assert.equal(f.sent.filter(n=>n.templateKey==='buyer_payment_confirmed').length,1);
 assert.equal((await f.repository.listRecords('beta','notification')).length,0);
});
test('both confirmation paths roll back every shipment and notice when the transaction fails',async t=>{
 for(const role of ['operator','vendor']){
  const f=await fixture(t),before=await f.repository.listRecords('alpha','shipment'),upsert=f.repository.upsertRows.bind(f.repository);
  f.repository.upsertRows=async rows=>upsert(rows.some(r=>r.key.includes('::shipment::')&&JSON.parse(r.value).itemId==='second')?[...rows,{key:{invalid:true},value:'force SQLite transaction rollback'}]:rows);
  const failed=await f.confirm(role);assert.equal(failed.status,500,failed.body);assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);assert.equal((await f.notices()).length,0);
  f.repository.upsertRows=upsert;const retried=await f.confirm(role);assert.equal(retried.status,200,retried.body);assert.equal((await f.notices()).length,1);
 }
});
test('concurrent operator/vendor clicks, restart and an old request after more wins never confirm twice',async t=>{
 const f=await fixture(t),responses=await Promise.all([f.confirm('operator'),f.confirm('vendor')]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);assert.equal((await f.notices()).length,1);
 f.restart();assert.equal((await f.confirm()).json().duplicate,true);
 await f.repository.upsertRecord('alpha','item',{id:'third',name:'A03',lotNumber:3,status:'sold',soldPrice:40000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 assert.equal((await f.call('POST','buyer-shipping',{...f.selection,requestId:'additional-selection'})).status,200);
 const retry=await f.confirm();assert.equal(retry.json().duplicate,true);assert.equal((await f.notices()).length,1);
 assert.notEqual((await f.repository.listRecords('alpha','shipment')).find(s=>s.itemId==='third').paymentStatus,'paid');
 const additional=await f.confirm('vendor',{requestId:'confirm-additional'});assert.equal(additional.status,200,additional.body);
 assert.equal((await f.notices()).length,2);assert.equal((await f.notices()).find(n=>n.variables['#{결제금액}']==='40,000원')?.recipientPhone,'01000000002');
});
test('a reported earlier amount is confirmed without claiming a later additional win was paid',async t=>{
 const f=await fixture(t);assert.equal((await f.call('POST','buyer-shipping/report-payment',{code:f.link.code,vendorKey:'vendor',requestId:'report-earlier-amount'})).status,200);
 await f.repository.upsertRecord('alpha','item',{id:'third',name:'A03',status:'sold',soldPrice:40000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 const response=await f.confirm('vendor');assert.equal(response.status,200,response.body);assert.equal(response.json().buyers[0].payment.status,'additional_payment');
 assert.equal((await f.notices())[0].variables['#{결제금액}'],'50,000원');
});
test('revoked buyer links do not prevent recording actual payment and missing provider configuration stays queued for recovery',async t=>{
 const f=await fixture(t);assert.equal((await f.call('POST','channels/alpha/buyer-link-access',{itemId:'first',action:'revoke',expectedRevision:0,requestId:'revoke-before-confirm'},true)).status,200);
 const response=await f.confirm();assert.equal(response.status,200,response.body);assert.equal(response.json().notification.status,'link_revoked');assert.equal((await f.notices()).length,0);assert.equal(response.json().payment.status,'paid');
 const configured=await fixture(t);configured.setReady(false);const waiting=await configured.confirm('vendor');assert.equal(waiting.status,200,waiting.body);assert.equal(waiting.json().notification.status,'configuration_pending');
 configured.restart();configured.setReady(true);await configured.service.flushChannel('alpha');assert.equal(configured.sent.filter(n=>n.templateKey==='buyer_payment_confirmed').length,1);
});
test('stale payment versions, paused auctions and unauthorized callers cannot confirm or notify',async t=>{
 const f=await fixture(t);assert.equal((await f.call('POST','channels/alpha/buyer-shipping-payment',{itemId:'first',requestId:'unauthorized-request'})).status,401);
 assert.equal((await f.confirm('operator',{expectedVersion:'stale-version'})).status,409);
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id==='alpha'?{...c,status:'paused'}:c));
 for(const role of ['operator','vendor'])assert.equal((await f.confirm(role)).status,409);
 assert.equal((await f.notices()).length,0);assert.ok((await f.repository.listRecords('alpha','shipment')).every(s=>s.paymentStatus!=='paid'));
});
test('notification preparation failure leaves payment unchanged and a retry creates one durable notice',async t=>{
 const f=await fixture(t),before=await f.repository.listRecords('alpha','shipment'),prepare=f.service.prepare.bind(f.service);
 f.service.prepare=async(c,event)=>{if(event.templateKey==='buyer_payment_confirmed')throw Error('isolated outbox unavailable');return prepare(c,event)};
 const failed=await f.confirm('vendor');assert.equal(failed.status,500);assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);assert.equal((await f.notices()).length,0);
 f.restart();const retried=await f.confirm('operator');assert.equal(retried.status,200,retried.body);assert.equal(retried.json().duplicate,false);assert.equal((await f.notices()).length,1);
});

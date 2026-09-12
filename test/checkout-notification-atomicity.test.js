'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core'),{CheckoutNotificationService}=require('../checkout-notifications');

async function fixture(t,method='card') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-checkout-outbox-'));
 const options={dbPath:path.join(dir,'isolated.sqlite'),durable:true,startWorker:false,adminSecret:'secret'};
 let repository,api,service,ready=true;const sent=[];
 const provider={testMode:false,readiness:()=>({ready,missing:ready?[]:['fixture configuration']}),status:()=>({}),send:async record=>{sent.push(record);return {messageId:'fake-'+record.id}}};
 function start(){repository=new SQLitePlatformRepository(options);service=new CheckoutNotificationService({repository,provider,beforeSend:(c,n)=>api.assertBuyerNotificationLink(c,n),logger:{warn(){}}});api=createPlatformApi({repository,notificationService:service,adminSessionSecret:'isolated-outbox-secret',logger:{error(){},warn(){}}});}start();
 t.after(()=>{repository.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-checkout-outbox-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});});
 await repository.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['가상 행사장']}})));
 for(const channel of ['alpha','beta']){
  await repository.upsertRecord(channel,'vendor',{id:'vendor',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'0000000',bankHolder:'가상 업체',cardEnabled:true,paymentMethods:['bank_transfer','card']});
  for(const [id,price] of [['first',30000],['second',20000]])await repository.upsertRecord(channel,'item',{id,name:id,status:'sold',soldPrice:price,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 }
 async function call(method,route,body,admin=false){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'secret'}:{})};
  const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;
 }
 const link=(await call('POST','channels/alpha/buyer-shipping-link',{itemId:'first'},true)).json();
 const selection={code:link.code,destinationId:'pickup-1',payments:[{vendorKey:'vendor',method}]};
 const saved=await call('POST','buyer-shipping',{...selection,requestId:'initial-selection'});assert.equal(saved.status,200,saved.body);
 const vendor=(await call('POST','channels/alpha/vendor-checkout-link',{vendorId:'vendor'},true)).json();
 const buyer=(await call('GET','vendor-checkout?code='+vendor.code)).json().buyers[0];
 const card=extra=>call('POST','vendor-checkout/card-link',{code:vendor.code,buyerId:buyer.id,requestId:'card-initial',cardPaymentUrl:'https://pay.example.test/fixture',expectedAmount:50000,...extra});
 const report=extra=>call('POST','buyer-shipping/report-payment',{code:link.code,vendorKey:'vendor',requestId:'report-initial',...extra});
 return {call,card,report,selection,link,vendor,buyer,sent,get repository(){return repository},get service(){return service},setReady(v){ready=v},restart(){repository.close();start()},notices:async key=>(await repository.listRecords('alpha','notification')).filter(n=>n.templateKey===key)};
}

test('card registration and buyer report remain unchanged if their notification cannot be prepared',async t=>{
 for(const kind of ['card','report']){
  const f=await fixture(t,kind==='card'?'card':'bank_transfer'),key=kind==='card'?'buyer_card_link_ready':'vendor_payment_reported';
  const before=await f.repository.listRecords('alpha','shipment'),prepare=f.service.prepare.bind(f.service);
  f.service.prepare=async(c,event)=>{if(event.templateKey===key)throw Error('isolated preparation failure');return prepare(c,event)};
  const failed=await f[kind]();assert.equal(failed.status,500,failed.body);
  assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);assert.equal((await f.notices(key)).length,0);
  f.restart();const retried=await f[kind]();assert.equal(retried.status,200,retried.body);assert.equal((await f.notices(key)).length,1);
 }
});

test('a SQLite transaction failure rolls back all items, action receipt and outbox together',async t=>{
 for(const kind of ['card','report']){
  const f=await fixture(t,kind==='card'?'card':'bank_transfer'),key=kind==='card'?'buyer_card_link_ready':'vendor_payment_reported';
  const before=await f.repository.listRecords('alpha','shipment'),upsert=f.repository.upsertRows.bind(f.repository);
  f.repository.upsertRows=async rows=>upsert(rows.some(r=>r.key.includes('::shipment::')&&JSON.parse(r.value).itemId==='second')?[...rows,{key:{invalid:true},value:'force transaction rollback'}]:rows);
  const failed=await f[kind]();assert.equal(failed.status,500,failed.body);assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);assert.equal((await f.notices(key)).length,0);
  f.repository.upsertRows=upsert;const retried=await f[kind]();assert.equal(retried.status,200,retried.body);assert.equal(retried.json().duplicate,false);assert.equal((await f.notices(key)).length,1);
 }
});

test('concurrent repeated actions survive restart and produce one notice per recipient',async t=>{
 const f=await fixture(t);
 for(const [action,key,recipient] of [['card','buyer_card_link_ready','01000000002'],['report','vendor_payment_reported','01000000001']]){
  const responses=await Promise.all([f[action](),f[action]()]);
  assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);
  const notices=await f.notices(key);assert.equal(notices.length,1);assert.equal(notices[0].recipientPhone,recipient);assert.equal(notices[0].variables['#{결제금액}'],'50,000원');
  assert.equal(notices[0].failureSmsFallback,true);assert.equal(f.sent.length,0,'no provider call inside the user action');
  f.restart();const retry=await f[action]();assert.equal(retry.status,200,retry.body);assert.equal(retry.json().duplicate,true);assert.equal(retry.json().notification.status,'queued');
 }
 await f.service.flushChannel('alpha');await f.service.flushChannel('alpha');
 assert.equal(f.sent.filter(n=>n.templateKey==='buyer_card_link_ready').length,1);assert.equal(f.sent.filter(n=>n.templateKey==='vendor_payment_reported').length,1);
 assert.equal((await f.repository.listRecords('beta','notification')).length,0);
 const retry=await f.card();assert.equal(retry.json().notification.status,'sent');
});

test('late retries cannot overwrite a later card guide or report new auction items',async t=>{
 const f=await fixture(t);assert.equal((await f.card()).status,200);assert.equal((await f.report()).status,200);
 const confirmed=await f.call('POST','vendor-checkout/confirm-payment',{code:f.vendor.code,buyerId:f.buyer.id,requestId:'confirm-first'});assert.equal(confirmed.status,200,confirmed.body);
 await f.repository.upsertRecord('alpha','item',{id:'third',name:'third',status:'sold',soldPrice:40000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 const saved=await f.call('POST','buyer-shipping',{...f.selection,requestId:'additional-selection'});assert.equal(saved.status,200,saved.body);
 const before=await f.repository.listRecords('alpha','shipment');
 for(const action of ['card','report']){const retry=await f[action]();assert.equal(retry.status,200,retry.body);assert.equal(retry.json().duplicate,true);}
 assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);
 const current=(await f.call('GET','vendor-checkout?code='+f.vendor.code)).json().buyers[0];
 const card=await f.card({requestId:'additional-card',cardPaymentUrl:'https://pay.example.test/additional',expectedAmount:90000,expectedCardCancellationVersion:current.payment.cardCancellationVersion,confirmedOldCardLinkCancelled:true});assert.equal(card.status,200,card.body);
 const additionalReport=await f.report({requestId:'additional-report'});assert.equal(additionalReport.status,200,additionalReport.body);
 assert.ok((await f.notices('vendor_payment_reported')).some(n=>n.variables['#{결제금액}']==='40,000원'));
 assert.ok((await f.notices('buyer_card_link_ready')).some(n=>n.variables['#{결제금액}']==='40,000원'));
 f.restart();const after=await f.repository.listRecords('alpha','shipment');await f.card();await f.report();assert.deepEqual(await f.repository.listRecords('alpha','shipment'),after);
 const completed=await f.call('POST','vendor-checkout/confirm-payment',{code:f.vendor.code,buyerId:f.buyer.id,requestId:'confirm-additional'});assert.equal(completed.status,200,completed.body);assert.equal(completed.json().buyers[0].payment.status,'paid');
});

test('stale, incomplete and conflicting card registration never changes an existing guide or buyer report',async t=>{
 const f=await fixture(t);assert.equal((await f.card({expectedVersion:'stale'})).status,409);assert.equal((await f.card()).status,200);
 assert.equal((await f.card({cardPaymentUrl:'https://pay.example.test/changed'})).status,409,'same id cannot contain different content');
 assert.equal((await f.report()).status,200);const before=await f.repository.listRecords('alpha','shipment');
 assert.equal((await f.card({requestId:'different-card-id'})).status,409,'new request cannot silently reset buyer report');
 assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);
 const other=await fixture(t);await other.repository.upsertRecord('alpha','item',{id:'third',name:'third',status:'sold',soldPrice:10000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 const unchanged=await other.repository.listRecords('alpha','shipment');assert.equal((await other.card()).status,409);assert.deepEqual(await other.repository.listRecords('alpha','shipment'),unchanged);assert.equal((await other.notices('buyer_card_link_ready')).length,0);
});

test('external notification records stay silent and configuration-pending notices recover after restart',async t=>{
 const external=await fixture(t);external.service.prepare=async()=>{throw Error('external guide must not prepare a notice')};
 const sent=await external.card({cardNoticeMethod:'external'});assert.equal(sent.status,200,sent.body);assert.equal(sent.json().notification.reason,'external_notice');assert.equal((await external.notices('buyer_card_link_ready')).length,0);
 external.restart();assert.equal((await external.card({cardNoticeMethod:'external'})).json().duplicate,true);assert.equal((await external.report()).status,409);
 for(const kind of ['card','report']){
  const f=await fixture(t,kind==='card'?'card':'bank_transfer');f.setReady(false);const saved=await f[kind]();assert.equal(saved.status,200,saved.body);assert.equal(saved.json().notification.status,'configuration_pending');
  f.restart();f.setReady(true);await f.service.flushChannel('alpha');assert.equal(f.sent.filter(n=>n.templateKey===(kind==='card'?'buyer_card_link_ready':'vendor_payment_reported')).length,1);
 }
});

test('even a second no-op report request is remembered after confirmation and new wins',async t=>{
 const f=await fixture(t,'bank_transfer');assert.equal((await f.report()).status,200);
 assert.equal((await f.report({requestId:'no-op-alias'})).json().duplicate,true);
 assert.equal((await f.call('POST','vendor-checkout/confirm-payment',{code:f.vendor.code,buyerId:f.buyer.id,requestId:'confirm-first'})).status,200);
 assert.equal((await f.report({requestId:'already-paid-alias'})).json().duplicate,true);
 await f.repository.upsertRecord('alpha','item',{id:'third',name:'third',status:'sold',soldPrice:40000,winnerName:'가상 구매자',winnerPhone:'01000000002',vendorId:'vendor',vendorName:'가상 업체'});
 assert.equal((await f.call('POST','buyer-shipping',{...f.selection,requestId:'additional-selection'})).status,200);
 f.restart();const before=await f.repository.listRecords('alpha','shipment');
 for(const requestId of ['no-op-alias','already-paid-alias'])assert.equal((await f.report({requestId})).json().duplicate,true);
 assert.deepEqual(await f.repository.listRecords('alpha','shipment'),before);assert.equal((await f.notices('vendor_payment_reported')).length,1);
});

test('revoked buyer links and absent vendor contacts are explicit while archived or unauthorized writes fail',async t=>{
 const f=await fixture(t);assert.equal((await f.call('POST','channels/alpha/buyer-link-access',{itemId:'first',action:'revoke',expectedRevision:0,requestId:'revoke-before-card'},true)).status,200);
 const saved=await f.card();assert.equal(saved.status,200,saved.body);assert.equal(saved.json().notification.status,'link_revoked');assert.equal((await f.notices('buyer_card_link_ready')).length,0);assert.equal((await f.report()).status,401);
 const missing=await fixture(t,'bank_transfer'),vendor=await missing.repository.getRecord('alpha','vendor','vendor');await missing.repository.upsertRecord('alpha','vendor',{...vendor,phone:''});
 const reported=await missing.report();assert.equal(reported.status,200,reported.body);assert.equal(reported.json().notification.skipped,'missing_vendor_phone');assert.equal((await missing.notices('vendor_payment_reported')).length,0);
 const archived=await fixture(t);assert.equal((await archived.card({code:'invalid-code'})).status,401);assert.equal((await archived.report({code:'invalid-code'})).status,401);
 const catalog=await archived.repository.getCatalog();await archived.repository.saveCatalog(catalog.channels.map(c=>c.id==='alpha'?{...c,status:'archived'}:c));
 assert.equal((await archived.card()).status,409);assert.equal((await archived.report()).status,401,'archived buyer mutation credentials are invalid');
 assert.equal((await archived.notices('buyer_card_link_ready')).length,0);assert.equal((await archived.notices('vendor_payment_reported')).length,0);
});

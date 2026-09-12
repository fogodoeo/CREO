'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel}=require('../platform-core');
const {CheckoutNotificationService}=require('../checkout-notifications');

async function fixture(t,{initial=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-preferences-'));
 const options={dbPath:path.join(dir,'test.sqlite'),durable:true,adminSecret:'secret',startWorker:false};
 let repo=new SQLitePlatformRepository(options),api;
 const provider={readiness:()=>({ready:true,missing:[]}),status:()=>({}),send:async()=>{throw Error('External sends forbidden in tests')}};
 const start=()=>{api=createPlatformApi({repository:repo,notificationService:new CheckoutNotificationService({repository:repo,provider}),adminSessionSecret:'preferences-test-secret',logger:{error(){},warn(){}}})};
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['행사장'],enabledCarriers:['parge']}})));
 await repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{서울:[{shop:'수령점',cost:10000}]}})}]);
 for(const ch of ['alpha','beta']){
  await repo.upsertRecord(ch,'vendor',{id:'vendor',name:'주업체',phone:'01011112222',paymentMethods:['bank_transfer','card'],bankName:'은행',bankAccount:'123',bankHolder:'주업체'});
  await repo.upsertRecord(ch,'item',{id:'item',name:'개체',lotNumber:1,status:'sold',soldPrice:100000,winnerName:'구매자',winnerPhone:'01012345678',vendorId:'vendor',vendorName:'주업체'});
 }
 start();
 async function call(method,url,body,admin=''){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':admin}:{})};
  const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL('https://test.invalid'+url));return res;
 }
 async function buyerCode(ch='alpha',itemId='item'){const r=await call('POST',`/api/platform/channels/${ch}/buyer-shipping-link`,{itemId},'secret');assert.equal(r.status,200,r.body);return r.json().code}
 const code=await buyerCode();
 const selection={code,destinationId:'pickup-1',payments:[{vendorKey:'vendor',method:'bank_transfer'}]};
 if(initial){const r=await call('POST','/api/platform/buyer-shipping',{...selection,requestId:'initial-save'});assert.equal(r.status,200,r.body)}
 t.after(()=>{repo.close();fs.rmSync(dir,{recursive:true,force:true})});
 const get=(c=code)=>call('GET','/api/platform/buyer-shipping?code='+c);
 async function change(method,extra={}){const p=(await get()).json();return call('POST','/api/platform/buyer-shipping',{...selection,payments:[{vendorKey:'vendor',method}],requestId:'method-'+method,expectedVersion:p.editVersion,...extra})}
 async function vendor(ch='alpha',id='vendor'){const r=await call('POST',`/api/platform/channels/${ch}/vendor-checkout-link`,{vendorId:id,vendorKey:id},'secret');assert.equal(r.status,200,r.body);const code=r.json().code;return {code,data:(await call('GET','/api/platform/vendor-checkout?code='+code)).json()}}
 return {call,code,selection,get,change,buyerCode,vendor,get repo(){return repo},async restart(){repo.close();repo=new SQLitePlatformRepository(options);start()}};
}

test('direct method save, notification and duplicate retry persist together across restart',async t=>{
 const f=await fixture(t),p=(await f.get()).json();
 const body={...f.selection,payments:[{vendorKey:'vendor',method:'card'}],requestId:'direct-card',expectedVersion:p.editVersion};
 const responses=await Promise.all([f.call('POST','/api/platform/buyer-shipping',body),f.call('POST','/api/platform/buyer-shipping',body)]);
 for(const r of responses)assert.equal(r.status,200,r.body);
 assert.equal(responses.filter(r=>r.json().duplicate).length,1);
 assert.equal((await f.repo.listRecords('alpha','checkoutchange')).length,0);
 let notices=await f.repo.listRecords('alpha','notification');assert.equal(notices.length,2);assert.ok(notices.every(n=>n.recipientRole==='vendor'));
 assert.equal(notices.at(-1).variables['#{결제방식}'],'카드결제');
 await f.restart();assert.equal((await f.get()).json().vendors[0].payment.method,'card');
 assert.equal((await f.call('POST','/api/platform/buyer-shipping',body)).json().duplicate,true);
 assert.equal((await f.repo.listRecords('alpha','notification')).length,2);
 assert.equal((await f.repo.listRecords('beta','shipment')).length,0);
});
test('stale competing changes and replay after a newer selection cannot overwrite it',async t=>{
 const f=await fixture(t),version=(await f.get()).json().editVersion;
 const first=await f.change('card',{expectedVersion:version,requestId:'first-card'});assert.equal(first.status,200,first.body);
 const competing=await f.change('card',{expectedVersion:version,requestId:'competing-card'});assert.equal(competing.status,409);
 assert.equal((await f.change('bank_transfer',{requestId:'back-to-bank'})).status,200);
 assert.equal((await f.change('card',{expectedVersion:version,requestId:'first-card'})).status,409);
 assert.equal((await f.get()).json().vendors[0].payment.method,'bank_transfer');
});
test('failed transaction keeps the old method, notice and saved destination; retry succeeds',async t=>{
 const f=await fixture(t),before=await f.repo.listRecords('alpha','shipment'),notices=await f.repo.listRecords('alpha','notification');
 const original=f.repo.upsertRows.bind(f.repo);
 f.repo.upsertRows=async rows=>original(rows.some(r=>r.key.includes('::notification::'))?[...rows,{key:{invalid:true},value:'fail after writes'}]:rows);
 assert.equal((await f.change('card',{destinationId:'parge',pargeRegion:'서울',pargeShop:'수령점'})).status,500);
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);assert.deepEqual(await f.repo.listRecords('alpha','notification'),notices);
 const beta=await f.buyerCode('beta');assert.equal((await f.get(beta)).json().savedDestination,null);
 f.repo.upsertRows=original;assert.equal((await f.change('card')).status,200);
});
for(const state of ['bank_transfer_reported','card_payment_reported','paid','partial','shipped'])test(`${state} cannot change method even with a fresh version`,async t=>{
 const f=await fixture(t),s=(await f.repo.listRecords('alpha','shipment'))[0];
 await f.repo.upsertRecord('alpha','shipment',{...s,paymentStatus:state==='partial'?'additional_payment':state==='shipped'?'bank_transfer_pending':state,...(state==='partial'?{paymentConfirmedAmount:10000}:{}),...(state==='shipped'?{trackingNumber:'TRACK'}:{})});
 assert.equal((await f.get()).json().vendors[0].payment.canChangeMethod,false);
 assert.equal((await f.change('card')).status,409);
 assert.equal((await f.repo.listRecords('alpha','shipment'))[0].paymentMethod,'bank_transfer');
});
test('report and method-change race has one winner and leaves a coherent state',async t=>{
 for(const reportFirst of [true,false]){
  const f=await fixture(t),p=(await f.get()).json();
  const report=()=>f.call('POST','/api/platform/buyer-shipping/report-payment',{code:f.code,vendorKey:'vendor',requestId:'race-report',expectedVersion:p.editVersion});
  const change=()=>f.change('card',{requestId:'race-change',expectedVersion:p.editVersion});
  const responses=await Promise.all(reportFirst?[report(),change()]:[change(),report()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const result=(await f.get()).json().vendors[0].payment;
  assert.ok((result.method==='bank_transfer'&&result.status==='bank_transfer_reported')||(result.method==='card'&&result.status==='card_link_pending'));
 }
});
for(const external of [false,true])test(`card to bank keeps ${external?'external':'link'} cancellation work until vendor acknowledges`,async t=>{
 const f=await fixture(t),s=(await f.repo.listRecords('alpha','shipment'))[0];
 await f.repo.upsertRecord('alpha','shipment',{...s,paymentMethod:'card',paymentStatus:'card_payment_pending',cardPaymentUrl:external?'':'https://pay.example.test/old',cardNoticeMethod:external?'external':'link',cardLinkPreparedAt:'2026-09-01'});
 const changed=await f.change('bank_transfer');assert.equal(changed.status,200,changed.body);const p=changed.json().vendors[0].payment;
 assert.equal(p.cardPaymentUrl,'');assert.equal(p.cardLinkCancellationRequired,true);assert.doesNotMatch(JSON.stringify(changed.json()),/retiredCardPaymentUrl|pay\.example/);
 await f.restart();const v=await f.vendor(),buyer=v.data.buyers[0];assert.equal(buyer.payment.previousMethod,'card');assert.equal(buyer.payment.retiredCardNoticeMethod,external?'external':'link');
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/confirm-payment',{code:v.code,buyerId:buyer.id,requestId:'unsafe-confirm'})).status,409);
 const body={code:v.code,buyerId:buyer.id,confirmed:true,expectedCardCancellationVersion:buyer.payment.cardCancellationVersion};
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/confirm-card-cancellation',{...body,expectedCardCancellationVersion:'old'})).status,409);
 const ack=await f.call('POST','/api/platform/vendor-checkout/confirm-card-cancellation',body);assert.equal(ack.status,200,ack.body);assert.equal(ack.json().buyers[0].payment.cardLinkCancellationRequired,false);
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/confirm-card-cancellation',body)).json().duplicate,true);
 assert.equal((await f.repo.listRecords('alpha','notification')).filter(n=>n.recipientRole==='buyer').length,0);
 assert.equal((await f.change('card',{requestId:'new-card-after-cancel'})).status,200);
 const fresh=await f.vendor();const link=await f.call('POST','/api/platform/vendor-checkout/card-link',{code:v.code,buyerId:buyer.id,requestId:'new-link-after-cancel',cardPaymentUrl:'https://pay.example.test/new',expectedAmount:100000});assert.equal(link.status,200,link.body);
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/confirm-payment',{code:v.code,buyerId:buyer.id,requestId:'stale-confirm',expectedVersion:buyer.payment.editVersion})).status,409);
 assert.equal(fresh.data.buyers[0].payment.status,'card_link_pending');
});
test('previous destination follows an authenticated phone across auctions, reprices and never auto-submits',async t=>{
 const f=await fixture(t),p=(await f.get()).json();
 const saved=await f.call('POST','/api/platform/buyer-shipping',{...f.selection,destinationId:'parge',pargeRegion:'서울',pargeShop:'수령점',requestId:'save-delivery',expectedVersion:p.editVersion});assert.equal(saved.status,200,saved.body);
 await f.repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{서울:[{shop:'수령점',cost:24000}]}})}]);
 await f.restart();const beta=await f.buyerCode('beta');const next=(await f.get(beta)).json();
 assert.equal(next.savedDestination.pargeShop,'수령점');assert.equal(next.selection,null);assert.equal(next.submittedAt,'');assert.equal(next.vendors[0].payment.method,'');
 assert.equal((await f.repo.listRecords('beta','shipment')).length,0);
 const result=await f.call('POST','/api/platform/buyer-shipping',{code:beta,...next.savedDestination,payments:[{vendorKey:'vendor',method:'bank_transfer'}],requestId:'reuse-address',expectedVersion:next.editVersion});
 assert.equal(result.status,200,result.body);assert.equal(result.json().totals.shippingAmount,24000);
});
test('saved destination is unavailable to another phone and raw-phone or forged credential requests',async t=>{
 const f=await fixture(t);await f.change('bank_transfer',{destinationId:'parge',pargeRegion:'서울',pargeShop:'수령점'});
 const item=await f.repo.getRecord('beta','item','item');await f.repo.upsertRecord('beta','item',{...item,winnerPhone:'01099998888'});
 const other=await f.buyerCode('beta');assert.equal((await f.get(other)).json().savedDestination,null);
 assert.equal((await f.call('GET','/api/platform/buyer-shipping?phone=01012345678')).status,401);
 assert.equal((await f.get('forged')).status,401);
});
test('old records can suggest a valid destination, but disabled carriers and old pickup locations cannot',async t=>{
 const f=await fixture(t,{initial:false});
 await f.repo.upsertRecord('alpha','shipment',{id:'legacy',itemId:'legacy-item',recipientPhone:'01012345678',buyerSubmittedAt:'2026-09-01',destinationType:'parge',destinationId:'parge',pargeRegion:'서울',pargeShop:'수령점',status:'complete'});
 const beta=await f.buyerCode('beta');assert.equal((await f.get(beta)).json().savedDestination.pargeShop,'수령점');
 const catalog=await f.repo.getCatalog();await f.repo.saveCatalog(catalog.channels.map(c=>c.id==='beta'?{...c,shippingDefaults:{...c.shippingDefaults,enabledCarriers:[]}}:c));
 assert.equal((await f.get(beta)).json().savedDestination,null);
 await f.repo.upsertRecord('alpha','shipment',{id:'legacy',itemId:'legacy-item',recipientPhone:'01012345678',buyerSubmittedAt:'2026-09-02',destinationType:'pickup',destinationId:'pickup-1',address:'행사장',status:'complete'});
 assert.equal((await f.get(beta)).json().savedDestination,null);
});
test('removed receiving shop is not offered from a saved profile',async t=>{
 const f=await fixture(t);await f.change('bank_transfer',{destinationId:'parge',pargeRegion:'서울',pargeShop:'수령점'});
 await f.repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{서울:[{shop:'새 점포',cost:10000}]}})}]);await f.restart();
 assert.equal((await f.get(await f.buyerCode('beta'))).json().savedDestination,null);
});
test('vendor contact directory reveals only other participants in the selected authorized auction',async t=>{
 const f=await fixture(t);
 await f.repo.upsertRecord('alpha','vendor',{id:'peer',name:'함께하는 업체',phone:'01033334444',bankAccount:'private-account',manager:'private-manager'});
 await f.repo.upsertRecord('beta','vendor',{id:'elsewhere',name:'다른 경매 업체',phone:'01055556666'});
 const v=await f.vendor();assert.deepEqual(v.data.vendorContacts,[{name:'함께하는 업체',phone:'01033334444'}]);
 assert.doesNotMatch(JSON.stringify(v.data.vendorContacts),/private|55556666|bank|manager/);
 assert.equal((await f.call('GET','/api/platform/vendor-checkout?phone=01011112222')).status,401);
 assert.equal((await f.call('GET','/api/platform/vendor-checkout?code='+v.code+'&event=beta')).status,401);
 assert.equal((await f.get()).json().vendorContacts,undefined);
});

test('vendor inquiry settings validate, retain on older clients, share by membership and survive restart',async t=>{
 const f=await fixture(t,{initial:false}),{createVendorDirectory}=require('../vendor-directory');
 const current=await f.repo.getRecord('alpha','vendor','vendor');await f.repo.upsertRecord('alpha','vendor',{...current,bankAccount:'12345'});
 const directory=createVendorDirectory(f.repo),profile=await directory.enroll('alpha','vendor');await directory.attach(profile.id,'beta');
 let v=await f.vendor();const body={code:v.code,directoryRevision:v.data.vendor.directoryRevision,phone:current.phone,bankName:current.bankName,bankAccount:'12345',bankHolder:current.bankHolder,cardEnabled:true,kakaoUrl:'https://pf.kakao.com/_Example'};
 const saved=await f.call('POST','/api/platform/vendor-checkout/settings',body);assert.equal(saved.status,200,saved.body);assert.equal(saved.json().vendor.kakaoUrl,'https://pf.kakao.com/_Example/chat');
 assert.equal((await directory.find('beta','shared-'+profile.id.replaceAll('-',''))).kakaoUrl,saved.json().vendor.kakaoUrl);
 const stale=await f.call('POST','/api/platform/vendor-checkout/settings',{...body,kakaoUrl:'https://pf.kakao.com/_Stale'});assert.equal(stale.status,409);
 await f.restart();v=await f.vendor();const revision=v.data.vendor.directoryRevision;
 for(const value of ['javascript:alert(1)','https://evil.test/_Example'])assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',{...body,directoryRevision:revision,kakaoUrl:value})).status,422);
 assert.equal((await f.vendor()).data.vendor.directoryRevision,revision,'invalid contact must not save any profile fields');
 const oldClient={...body,directoryRevision:revision};delete oldClient.kakaoUrl;
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',oldClient)).json().vendor.kakaoUrl,'https://pf.kakao.com/_Example/chat');
 const buyer=(await f.get()).json();assert.deepEqual(buyer.items[0].inquiry,{name:current.name,phone:current.phone,kakaoUrl:'https://pf.kakao.com/_Example/chat'});
 assert.doesNotMatch(JSON.stringify(buyer.items[0].inquiry),/bank|account|manager|directory|private/);
 v=await f.vendor();assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',{...body,directoryRevision:v.data.vendor.directoryRevision,kakaoUrl:''})).json().vendor.kakaoUrl,'');
 assert.equal((await f.get()).json().items[0].inquiry.kakaoUrl,'');assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
});

test('item inquiry is scoped to the exact vendor and does not guess from a matching vendor name',async t=>{
 const f=await fixture(t,{initial:false}),item=await f.repo.getRecord('alpha','item','item');
 await f.repo.upsertRecord('alpha','item',{...item,vendorId:'missing'});
 assert.equal((await f.get()).json().items[0].inquiry,null);
 await f.repo.upsertRecord('alpha','item',item);const vendor=await f.repo.getRecord('alpha','vendor','vendor');await f.repo.upsertRecord('alpha','vendor',{...vendor,active:false});
 assert.equal((await f.get()).json().items[0].inquiry,null);
 assert.equal((await f.get('forged')).status,401);
});

test('buyer and peer contacts use inquiry phone, while payment notices still go to the business phone',async t=>{
 const f=await fixture(t,{initial:false}),{createVendorDirectory}=require('../vendor-directory');
 const current=await f.repo.getRecord('alpha','vendor','vendor');await f.repo.upsertRecord('alpha','vendor',{...current,bankAccount:'12345'});
 await createVendorDirectory(f.repo).enroll('alpha','vendor');let v=await f.vendor();
 const body={code:v.code,directoryRevision:v.data.vendor.directoryRevision,phone:'01070000001',inquiryPhone:'01070000002',kakaoUrl:'https://pf.kakao.com/_Staff',bankName:current.bankName,bankAccount:'12345',bankHolder:current.bankHolder,cardEnabled:true};
 let save=await f.call('POST','/api/platform/vendor-checkout/settings',body);assert.equal(save.status,200,save.body);
 let buyer=(await f.get()).json();assert.equal(buyer.items[0].inquiry.phone,'01070000002');assert.equal(buyer.vendors[0].contact.phone,'01070000002');assert.doesNotMatch(JSON.stringify(buyer),/01070000001/);
 await f.repo.upsertRecord('alpha','vendor',{id:'peer',name:'다른 참여업체',phone:'01070000003',bankName:'은행',bankAccount:'12345',bankHolder:'참여업체'});const peer=await f.vendor('alpha','peer');assert.equal(peer.data.vendorContacts[0].phone,'01070000002');assert.doesNotMatch(JSON.stringify(peer.data.vendorContacts),/01070000001/);
 // A buyer's save/report queues an operational notification; no provider is called.
 assert.equal((await f.call('POST','/api/platform/buyer-shipping',{...f.selection,requestId:'separated-save',expectedVersion:buyer.editVersion})).status,200);
 buyer=(await f.get()).json();assert.equal((await f.call('POST','/api/platform/buyer-shipping/report-payment',{code:f.code,vendorKey:'vendor',requestId:'separated-report',expectedVersion:buyer.editVersion})).status,200);
 const notices=(await f.repo.listRecords('alpha','notification')).filter(n=>n.recipientRole==='vendor');assert.ok(notices.length>=2);assert.ok(notices.every(n=>n.recipientPhone==='01070000001'));
 // An old client's phone-only save cannot move or republish the inquiry number.
 const legacy={...body,directoryRevision:save.json().vendor.directoryRevision,phone:'01070000004'};delete legacy.inquiryPhone;
 save=await f.call('POST','/api/platform/vendor-checkout/settings',legacy);assert.equal(save.status,200,save.body);assert.equal(save.json().vendor.inquiryPhone,'01070000002');await f.restart();assert.equal((await f.get()).json().items[0].inquiry.phone,'01070000002');
 v=await f.vendor();save=await f.call('POST','/api/platform/vendor-checkout/settings',{...legacy,directoryRevision:v.data.vendor.directoryRevision,inquiryPhone:'',kakaoUrl:''});assert.equal(save.status,200,save.body);buyer=(await f.get()).json();assert.equal(buyer.items[0].inquiry,null);assert.equal(buyer.vendors[0].contact.phone,'');assert.doesNotMatch(JSON.stringify(buyer),/0107000000[124]/);
});

test('legacy public phone is frozen before changing an operational number',async t=>{
 const f=await fixture(t,{initial:false}),{createVendorDirectory}=require('../vendor-directory'),directory=createVendorDirectory(f.repo),old=await directory.find('alpha','vendor');
 await directory.update('alpha',{...old,phone:'01077778888'});assert.equal((await f.get()).json().items[0].inquiry.phone,old.phone);
 const profile=await directory.enroll('alpha','vendor'),current=await directory.find('alpha','vendor');await directory.update('alpha',{...current,phone:'01099990000'},profile.revision);
 await f.restart();assert.equal((await f.get()).json().items[0].inquiry.phone,old.phone);
});

test('vendor personal open-chat link persists without changing the business alert phone',async t=>{
 const f=await fixture(t,{initial:false}),current=await f.repo.getRecord('alpha','vendor','vendor');await f.repo.upsertRecord('alpha','vendor',{...current,bankAccount:'12345'});let v=await f.vendor();
 const base={code:v.code,phone:current.phone,bankName:current.bankName,bankAccount:'12345',bankHolder:current.bankHolder,inquiryPhoneMode:'separate',inquiryPhone:''};
 for(const kakaoUrl of ['https://open.kakao.com/o/sStaffExample','https://open.kakao.com/me/staff_example']){const saved=await f.call('POST','/api/platform/vendor-checkout/settings',{...base,directoryRevision:v.data.vendor.directoryRevision,kakaoUrl});assert.equal(saved.status,200,saved.body);await f.restart();v=await f.vendor();assert.equal(v.data.vendor.kakaoUrl,kakaoUrl);assert.equal(v.data.vendor.phone,current.phone);const buyer=(await f.get()).json();assert.equal(buyer.items[0].inquiry.kakaoUrl,kakaoUrl);assert.equal(buyer.items[0].inquiry.phone,'');}
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',{...base,directoryRevision:v.data.vendor.directoryRevision,kakaoUrl:'https://open.kakao.com/o/gGroupExample'})).status,422);assert.equal((await f.vendor()).data.vendor.kakaoUrl,'https://open.kakao.com/me/staff_example');assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
});

test('one vendor phone follows explicit shared mode across auctions, old-client edits and restart',async t=>{
 const f=await fixture(t,{initial:false}),{createVendorDirectory}=require('../vendor-directory'),directory=createVendorDirectory(f.repo);
 const current=await f.repo.getRecord('alpha','vendor','vendor');await f.repo.upsertRecord('alpha','vendor',{...current,bankAccount:'12345'});
 const profile=await directory.enroll('alpha','vendor'),member=await directory.attach(profile.id,'beta');let v=await f.vendor();
 const body={code:v.code,directoryRevision:v.data.vendor.directoryRevision,phone:'01070000001',inquiryPhoneMode:'shared',inquiryPhone:'01070000002',bankName:current.bankName,bankAccount:'12345',bankHolder:current.bankHolder};
 let saved=await f.call('POST','/api/platform/vendor-checkout/settings',body);assert.equal(saved.status,200,saved.body);assert.equal(saved.json().vendor.inquiryPhone,'01070000001');assert.equal(saved.json().vendor.inquiryPhoneMode,'shared');
 assert.equal((await directory.find('beta',member.vendorId)).inquiryPhone,'01070000001');assert.equal((await f.get()).json().items[0].inquiry.phone,'01070000001');
 const oldClient={...body,directoryRevision:saved.json().vendor.directoryRevision,phone:'01070000003'};delete oldClient.inquiryPhone;delete oldClient.inquiryPhoneMode;
 saved=await f.call('POST','/api/platform/vendor-checkout/settings',oldClient);assert.equal(saved.status,200,saved.body);await f.restart();
 v=await f.vendor();assert.equal(v.data.vendor.inquiryPhoneMode,'shared');assert.equal((await f.get()).json().items[0].inquiry.phone,'01070000003');
 // An explicit old-client inquiry clear still means no public phone.
 saved=await f.call('POST','/api/platform/vendor-checkout/settings',{...oldClient,directoryRevision:v.data.vendor.directoryRevision,inquiryPhone:''});assert.equal(saved.status,200,saved.body);assert.equal(saved.json().vendor.inquiryPhoneMode,'separate');assert.equal((await f.get()).json().items[0].inquiry,null);
 assert.equal((await f.repo.listRecords('alpha','notification')).length,0,'settings must not send notices');
});

test('shared/separate phone choices reject stale duplicates, conflicting saves, invalid modes and failed storage',async t=>{
 const f=await fixture(t,{initial:false}),{createVendorDirectory}=require('../vendor-directory'),directory=createVendorDirectory(f.repo);
 const current=await f.repo.getRecord('alpha','vendor','vendor');await f.repo.upsertRecord('alpha','vendor',{...current,bankAccount:'12345',inquiryPhone:''});await directory.enroll('alpha','vendor');
 let v=await f.vendor();const body={code:v.code,directoryRevision:v.data.vendor.directoryRevision,phone:'01070000001',inquiryPhoneMode:'shared',bankName:current.bankName,bankAccount:'12345',bankHolder:current.bankHolder};
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',{...body,inquiryPhoneMode:'automatic'})).status,422);assert.equal((await f.get()).json().items[0].inquiry,null);
 const write=f.repo.upsertRows.bind(f.repo);f.repo.upsertRows=async rows=>{if(rows.some(row=>row.key==='vendor_directory_v1'))throw Error('offline');return write(rows)};
 assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',body)).status,500);assert.equal((await f.get()).json().items[0].inquiry,null,'failed directory commit cannot publish a private number');f.repo.upsertRows=write;
 const results=await Promise.all([f.call('POST','/api/platform/vendor-checkout/settings',body),f.call('POST','/api/platform/vendor-checkout/settings',{...body,inquiryPhoneMode:'separate',inquiryPhone:'01070000002'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=(await f.vendor()).data.vendor;assert.equal((await f.call('POST','/api/platform/vendor-checkout/settings',body)).status,409);await f.restart();v=await f.vendor();assert.equal(v.data.vendor.inquiryPhone,saved.inquiryPhone);assert.equal(v.data.vendor.inquiryPhoneMode,saved.inquiryPhoneMode);
 assert.equal((await f.repo.listRecords('alpha','shipment')).length,0);assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
});

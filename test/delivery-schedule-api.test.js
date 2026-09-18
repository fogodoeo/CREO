'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel}=require('../platform-core');
const {createDeliveryScheduleService,KEY}=require('../delivery-schedule-service');
const now=Date.parse('2026-09-18T00:00:00Z');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-schedule-test-'));let repo,service,api;
 function start(){repo=new SQLitePlatformRepository({dbPath:path.join(dir,'test.sqlite'),startWorker:false,adminSecret:'test'});service=createDeliveryScheduleService({repository:repo,now:()=>now,reader:{async parge(){throw Error('No external requests in test')}},logger:{warn(){}}});api=createPlatformApi({repository:repo,deliverySchedules:service,adminSessionSecret:'schedule-test',logger:{warn(){},error(){}}})}start();
 t.after(async()=>{await service.stop();repo.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-schedule-test-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true})});
 const config={enabled:true,auctionDate:'2026-09-17',pargeOrigin:'대구 출발점'};
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{enabledCarriers:['parge'],pickupLocations:['현장 수령'],deliverySchedule:id==='alpha'?config:{...config,auctionDate:'2026-09-21'}}})));
 await repo.upsertRows([{key:KEY,value:JSON.stringify({version:1,sources:{parge:{checkedAt:new Date(now).toISOString(),revision:'first',partners:[{name:'대구 출발점',region:'경상권'},{name:'수령점',region:'강원도'}],schedules:[{partnerName:'대구 출발점',collectDayLabel:'월요일'}],regionDays:{gangwon:[5]}}}})},{key:'shipping_rate_parge',value:JSON.stringify({data:{강원도:[{shop:'수령점',cost:40000}]}})}]);
 for(const c of ['alpha','beta']){
  await repo.upsertRecord(c,'vendor',{id:'v1',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'000',bankHolder:'가상',paymentMethods:['bank_transfer']});
  for(const id of ['first','second'])await repo.upsertRecord(c,'item',{id,vendorId:'v1',name:id,status:'sold',soldPrice:100000,winnerName:'가상 구매자',winnerPhone:'01000000002'});
  for(const id of ['first','second'])await repo.upsertRecord(c,'shipment',{id:'shipment-'+id,itemId:id,vendorId:'v1',recipientPhone:'01000000002',recipientName:'가상 구매자',method:'delivery',carrier:'파르게',destinationType:'parge',destinationId:'parge',pargeRegion:'강원도',pargeShop:'수령점',address:'강원도 수령점',cost:id==='first'?40000:7000,paymentMethod:'bank_transfer',paymentStatus:'pending',buyerSubmittedAt:'2026-09-18T00:00:00Z'});
 }
 async function call(method,route,body,admin=false){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'test'}:{})};const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;}
 const code=(await call('POST','channels/alpha/buyer-shipping-link',{itemId:'first'},true)).json().code;
 const vendor=(await call('POST','channels/alpha/vendor-checkout-link',{vendorId:'v1'},true)).json().code;
 return{call,code,vendor,get repo(){return repo},get service(){return service},async restart(){await service.stop();repo.close();start()}};
}
test('buyer, vendor and organizer share estimates; reads never mutate payment, fees or notifications',async t=>{
 const f=await fixture(t);
 const before={shipments:await f.repo.listRecords('alpha','shipment'),items:await f.repo.listRecords('alpha','item'),notifications:await f.repo.listRecords('alpha','notification')};
 const read=async()=>{
  const responses=await Promise.all([f.call('GET','buyer-shipping?code='+f.code),f.call('GET','vendor-checkout?code='+f.vendor),f.call('GET','channels/alpha/organizer-shipping',null,true)]);
  for(const r of responses)assert.equal(r.status,200,r.body);
  const [buyer,vendor,organizer]=responses.map(r=>r.json());
  assert.equal(buyer.deliverySchedule.dispatchDate,'2026-09-21');assert.equal(buyer.deliverySchedule.arrivalDate,'2026-09-25');
  assert.deepEqual(vendor.buyers[0].deliverySchedule,buyer.deliverySchedule);
  for(const item of organizer.auctionItems)assert.deepEqual(item.deliverySchedule,buyer.deliverySchedule);
  assert.deepEqual(buyer.carriers.parge.regions[0].shops[0].deliverySchedule,buyer.deliverySchedule);
  assert.equal(buyer.totals.shippingAmount,47000);assert.equal(buyer.payment.status,'in_progress');
  return buyer;
 };
 const first=await read();await Promise.all([read(),read()]);await f.restart();assert.deepEqual((await read()).deliverySchedule,first.deliverySchedule);
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before.shipments);assert.deepEqual(await f.repo.listRecords('alpha','item'),before.items);assert.deepEqual(await f.repo.listRecords('alpha','notification'),before.notifications);
});
test('separate auctions, pickup edits and disabled settings have isolated schedule results',async t=>{
 const f=await fixture(t);
 const betaCode=(await f.call('POST','channels/beta/buyer-shipping-link',{itemId:'first'},true)).json().code;
 assert.equal((await f.call('GET','buyer-shipping?code='+betaCode)).json().deliverySchedule.dispatchDate,'2026-09-28');
 for(const s of await f.repo.listRecords('alpha','shipment'))await f.repo.upsertRecord('alpha','shipment',{...s,destinationType:'pickup',destinationId:'pickup-1',method:'pickup',address:'현장 수령',cost:0,pargeRegion:'',pargeShop:''});
 assert.equal((await f.call('GET','buyer-shipping?code='+f.code)).json().deliverySchedule,null);
 const catalog=await f.repo.getCatalog();catalog.channels[1].shippingDefaults.deliverySchedule.enabled=false;await f.repo.saveCatalog(catalog.channels);await f.restart();
 assert.equal((await f.call('GET','buyer-shipping?code='+betaCode)).json().deliverySchedule,null);
});
test('payment-only saves preserve the destination registration time, destination edits reset it',async t=>{
 const f=await fixture(t);
 await f.repo.upsertRecord('alpha','vendor',{...(await f.repo.listRecords('alpha','vendor'))[0],paymentMethods:['bank_transfer','card']});
 const before=(await f.call('GET','buyer-shipping?code='+f.code)).json();
 const res=await f.call('POST','buyer-shipping',{code:f.code,requestId:'payment-only-save',expectedVersion:before.editVersion,destinationId:'parge',pargeRegion:'강원도',pargeShop:'수령점',payments:[{vendorKey:'v1',method:'card'}]});
 assert.equal(res.status,200,res.body);
 for(const s of await f.repo.listRecords('alpha','shipment'))assert.equal(s.destinationRegisteredAt,'2026-09-18T00:00:00Z');
 const next=(await f.call('GET','buyer-shipping?code='+f.code)).json();
 const changed=await f.call('POST','buyer-shipping',{code:f.code,requestId:'destination-change',expectedVersion:next.editVersion,destinationId:next.destinations.find(d=>d.type==='pickup').id,payments:[{vendorKey:'v1',method:'card'}]});
 assert.equal(changed.status,200,changed.body);
 for(const s of await f.repo.listRecords('alpha','shipment'))assert.equal(s.destinationRegisteredAt,s.buyerSubmittedAt);
});
test('refresh automation settings require an operator session and preserve the configured phone',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('GET','shipping-rates/automation')).status,401);
 assert.equal((await f.call('PUT','shipping-rates/automation',{enabled:true,alertPhone:'01000000001'})).status,401);
 const saved=await f.call('PUT','shipping-rates/automation',{enabled:false,alertPhone:'01000000001'},true);assert.equal(saved.status,200,saved.body);
 await f.restart();const state=(await f.call('GET','shipping-rates/automation',null,true)).json();assert.equal(state.enabled,false);assert.equal(state.alertPhone,'01000000001');
});
test('updated shared rates do not reprice already registered buyer or vendor charges',async t=>{
 const f=await fixture(t);const before=await f.repo.listRecords('alpha','shipment');
 await f.repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{강원도:[{shop:'수령점',cost:90000}]}})}]);
 const buyer=(await f.call('GET','buyer-shipping?code='+f.code)).json(),vendor=(await f.call('GET','vendor-checkout?code='+f.vendor)).json();
 assert.equal(buyer.totals.shippingAmount,47000);assert.equal(vendor.buyers[0].totals.shippingAmount,47000);assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);
});

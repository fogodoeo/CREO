'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel,channelKey}=require('../platform-core');
const {createDeliveryScheduleService,KEY}=require('../delivery-schedule-service');
const {CheckoutNotificationService,AligoNotificationProvider}=require('../checkout-notifications');
const Delay=require('../parge-november-delay'),Rules=require('../checkout-core');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-delay-'));
 let clock=Date.parse('2026-11-16T23:00:00Z'),repo=new SQLitePlatformRepository({dbPath:path.join(dir,'test.sqlite'),startWorker:false,adminSecret:'test'});
 const sent=[],notifications=new CheckoutNotificationService({repository:repo,now:()=>clock,provider:{readiness:()=>({ready:true}),status:()=>({smsConfigured:true,testMode:false}),send:async n=>{sent.push(n);return {messageId:'fake'};}}});
 const service=createDeliveryScheduleService({repository:repo,now:()=>clock,reader:{async parge(){throw Error('offline')}},logger:{warn(){}}});
 const api=createPlatformApi({repository:repo,deliverySchedules:service,notificationService:notifications,bookingNow:()=>clock,adminSessionSecret:'fixture',logger:{warn(){},error(){}}});
 t.after(async()=>{await service.stop();repo.close();fs.rmSync(dir,{recursive:true,force:true})});
 await repo.saveCatalog([Delay.FROM,Delay.TO,'national-cre-20261123'].map((id,i)=>normalizeChannel({id,name:id,status:'active',nationalRound:{parentId:'national-cre',date:['2026-11-16','2026-11-18','2026-11-23'][i]},shippingDefaults:{enabledCarriers:['parge'],pickupLocations:['현장'],deliverySchedule:{enabled:true,auctionDate:['2026-11-16','2026-11-18','2026-11-23'][i],pargeOrigin:'크레오 대구본점'}}})));
 await repo.upsertRows([{key:KEY,value:JSON.stringify({version:1,sources:{parge:{checkedAt:new Date(clock).toISOString(),revision:'fixture',partners:[{name:'크레오 대구본점',region:'경상권'},{name:'테스트 거점',region:'강원도'}],schedules:[{partnerName:'크레오 대구본점',collectDayLabel:'금요일'}],regionDays:{gangwon:[0,4]}}}})},{key:'shipping_rate_parge',value:JSON.stringify({data:{강원도:[{shop:'테스트 거점',cost:40000}]}})}]);
 for(const c of [Delay.FROM,Delay.TO]){
  await repo.upsertRecord(c,'vendor',{id:'v',name:'가상 업체',phone:'01000000001',paymentMethods:['bank_transfer'],bankName:'가상',bankAccount:'000',bankHolder:'가상'});
  for(const id of ['a','b'])await repo.upsertRecord(c,'item',{id,vendorId:'v',name:id,status:'sold',soldPrice:100000,winnerName:'가상구매자',winnerPhone:'01000000002'});
 }
 for(const id of ['a','b'])await repo.upsertRecord(Delay.FROM,'shipment',{id:'s'+id,itemId:id,vendorId:'v',recipientName:'가상구매자',recipientPhone:'01000000002',method:'delivery',carrier:'파르게',destinationType:'parge',destinationId:'parge',pargeRegion:'강원도',pargeShop:'테스트 거점',address:'강원도 테스트 거점',buyerSubmittedAt:'2026-11-16T14:00:00Z',cost:id==='a'?40000:7000,paymentMethod:'bank_transfer',paymentStatus:'paid'});
 async function call(method,route,body,admin=false){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'fixture.invalid',...(admin?{'x-creo-admin':'test'}:{})};const res={writeHead(s){this.status=s},end(b=''){this.body=String(b)},json(){return JSON.parse(this.body||'{}')}};await api.handle(req,res,new URL('https://fixture.invalid/api/platform/'+route));return res;}
 const code=(await call('POST',`channels/${Delay.FROM}/buyer-shipping-link`,{itemId:'a'},true)).json().code;
 return {repo,call,code,service,notifications,sent,setClock:n=>clock=n};
}
test('Monday follows Wednesday per-shop schedule; unrelated round remains independent',async t=>{
 const f=await fixture(t),catalog=await f.repo.getCatalog(),selection={destinationType:'parge',pargeRegion:'강원도',pargeShop:'테스트 거점'};
 const a=await f.service.estimate(catalog.channels[0],selection),b=await f.service.estimate(catalog.channels[1],selection);
 assert.deepEqual(a,b);assert.equal(a.dispatchDate,'2026-11-20');assert.equal(a.arrivalDate,'2026-11-22');
 assert.equal((await f.service.estimate(catalog.channels[2],selection)).dispatchDate,'2026-11-24');
 const response=await f.call('GET','buyer-shipping?code='+f.code);assert.equal(response.status,200,response.body);
 assert.equal(response.json().deliveryNotice.acknowledged,false);assert.equal(response.json().totals.shippingAmount,47000);
 const before=await f.repo.listRecords(Delay.FROM,'shipment');
 assert.equal((await f.call('POST','buyer-shipping/delivery-notice-ack',{code:f.code})).status,200);
 assert.equal((await f.call('GET','buyer-shipping?code='+f.code)).json().deliveryNotice.acknowledged,true);
 assert.deepEqual(await f.repo.listRecords(Delay.FROM,'shipment'),before);
 for(const s of before)await f.repo.upsertRecord(Delay.FROM,'shipment',{...s,destinationType:'pickup',destinationId:'pickup-1',method:'pickup'});
 assert.equal((await f.call('GET','buyer-shipping?code='+f.code)).json().deliveryNotice,null);
 assert.equal((await f.call('POST','buyer-shipping/delivery-notice-ack',{code:f.code})).status,409);
});
test('SMS deduplicates people and repeated concurrent requests; no send before 09:00 KST',async t=>{
 const f=await fixture(t),route=`channels/${Delay.FROM}/parge-delay-notice`;
 assert.equal((await f.call('POST',route,{confirmed:true})).status,401);
 const preview=await f.call('GET',route,null,true);assert.equal(preview.status,200,preview.body);assert.equal(preview.json().entries.length,1);assert.equal(preview.json().entries[0].itemCount,2);
 const res=await Promise.all([f.call('POST',route,{confirmed:true},true),f.call('POST',route,{confirmed:true},true)]);res.forEach(r=>assert.equal(r.status,200,r.body));
 const records=await f.repo.listRecords(Delay.FROM,'notification');assert.equal(records.length,1);assert.equal(records[0].nextAttemptAt,'2026-11-17T00:00:00.000Z');
 await f.notifications.flushChannel(Delay.FROM);assert.equal(f.sent.length,0);
 f.setClock(Date.parse('2026-11-17T00:00:01Z'));await f.notifications.flushChannel(Delay.FROM);await f.notifications.flushChannel(Delay.FROM);assert.equal(f.sent.length,1);
 const service=Delay.create({repository:f.repo,channelKey,workspace:async()=>({items:[],shipments:[]})});
 await assert.rejects(service.assertCurrent(Delay.FROM,records[0]),e=>e.code==='BUYER_LINK_INACTIVE');
});
test('Wednesday matching buyer receives cross-round shipping quote; mismatch keeps base fee',async t=>{
 const f=await fixture(t),code=(await f.call('POST',`channels/${Delay.TO}/buyer-shipping-link`,{itemId:'a'},true)).json().code;
 const r=await f.call('GET','buyer-shipping?code='+code);assert.equal(r.status,200,r.body);const data=r.json();assert.equal(data.deliveryNotice,null);assert.equal(data.combinedShipping.eligible,true);
 const selection={destinationType:'parge',pargeRegion:'강원도',pargeShop:'테스트 거점'},channel={combinedShipping:data.combinedShipping},rates=[{region:'강원도',shops:[{name:'테스트 거점',baseCost:40000}]}];
 assert.equal(Rules.allocateShipping(data.items,selection,channel,rates).total,14000);
 assert.equal(Rules.allocateShipping(data.items,selection,{combinedShipping:{...data.combinedShipping,eligible:false}},rates).total,47000);
 const saved=await f.call('POST','buyer-shipping',{code,expectedVersion:data.editVersion,requestId:'combined-test-1',destinationId:'parge',pargeRegion:'강원도',pargeShop:'테스트 거점',payments:[{vendorKey:'v',method:'bank_transfer'}]});assert.equal(saved.status,200,saved.body);
 assert.equal(saved.json().totals.shippingAmount,14000);
 assert.equal((await f.call('GET','buyer-shipping?code='+code)).json().totals.shippingAmount,14000);
});
test('campaign uses LMS and morning timing is explicit',async()=>{
 assert.equal(Delay.sendAfter(Date.parse('2026-11-16T23:59:59Z')),'2026-11-17T00:00:00.000Z');
 assert.equal(Delay.sendAfter(Date.parse('2026-11-17T01:00:00Z')),'2026-11-17T01:00:00.000Z');
 let form;const provider=new AligoNotificationProvider({fetchImpl:async(_u,o)=>{form=new URLSearchParams(o.body);return {ok:true,status:200,json:async()=>({result_code:1,msg_id:'fake'})};}});
 await provider.sendSms({templateKey:Delay.TEMPLATE,recipientPhone:'01000000002',fallbackText:Delay.description+'\n'+Delay.combined});assert.equal(form.get('msg_type'),'LMS');
});

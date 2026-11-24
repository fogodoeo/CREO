'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core'),{createDeliveryScheduleService}=require('../delivery-schedule-service');
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-dodosi-test-')),now=Date.now(),today=require('../dodosi-routes').today(now);let repo,service,api;
 const shops=Array.from({length:20},(_,i)=>({id:`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`,label:i?'[서울/강동] 가상점'+i:'[대구/북구] 크레용(대구)',region:i?'수도권':'경상A'}));
 const quote={base:28000,zoneSurcharge:0,petSurcharge:0,total:28000},slots=[{dropoff:add(today,1),pickup:add(today,2),arrival:add(today,5)}];
 const data={schema:'creo.dodosi.routes.v1',checkedAt:new Date(now).toISOString(),origin:shops[0].id,shops,discountBp:5000,routes:shops.slice(1).flatMap(s=>[[shops[0].id,s.id],[s.id,shops[0].id]].map(([from,to])=>({from,to,available:true,slots,quote,quantity:1})))};
 function start(){repo=new SQLitePlatformRepository({dbPath:path.join(dir,'test.sqlite'),startWorker:false,adminSecret:'test'});service=createDeliveryScheduleService({repository:repo,now:()=>now,reader:{async parge(){throw Error('offline')},async dodosi(){throw Error('offline')}},logger:{warn(){}}});api=createPlatformApi({repository:repo,deliverySchedules:service,adminSessionSecret:'test-dodosi',logger:{warn(){},error(){}}});}start();
 t.after(async()=>{await service.stop();repo.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-dodosi-test-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{enabledCarriers:['dodosi'],deliverySchedule:{enabled:true,auctionDate:today,dodosiOrigin:'크레용(대구)'}}})));
 await repo.upsertRecord('alpha','vendor',{id:'v',name:'가상업체'});
 await repo.upsertRecord('alpha','item',{id:'i',vendorId:'v',status:'sold',name:'A01',soldPrice:100000,winnerName:'가상낙찰자',winnerPhone:'01000000001'});
 await repo.upsertRecord('alpha','shipment',{id:'s',itemId:'i',vendorId:'v',method:'delivery',destinationType:'dodosi',carrier:'도도시',recipientName:'가상낙찰자',recipientPhone:'01000000001',pargeRegion:'수도권',pargeShop:'가상점1',paymentStatus:'paid',paymentMethod:'bank_transfer',cost:28000});
 async function call(method,route,body,admin=false){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'test'}:{})};const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;}
 return{call,data,today,get repo(){return repo},get service(){return service},async restart(){await service.stop();repo.close();start();}};
}
test('Dodosi import is admin-only, strips account discount publicly, duplicate/stale writes remain safe',async t=>{
 const f=await setup(t),route='shipping-rates/dodosi-routes';
 assert.equal((await f.call('PUT',route,f.data)).status,401);
 assert.equal((await f.call('PUT',route,f.data,true)).status,200);
 assert.equal((await f.call('PUT',route,f.data,true)).status,200);
 const pub=(await f.call('GET',route)).json();assert.equal(pub.shops.length,20);assert.equal(pub.fresh,true);assert.equal(pub.discountBp,undefined);assert.doesNotMatch(JSON.stringify(pub),/01000000001|가상낙찰자/);
 assert.equal((await f.call('PUT',route,{...f.data,checkedAt:new Date(Date.parse(f.data.checkedAt)-1000).toISOString()},true)).status,409);
 await f.restart();assert.equal((await f.call('GET',route)).json().routes.length,38);
});
test('preparing a Dodosi form is isolated, concurrency guarded, cannot book, notify, reprice or dispatch',async t=>{
 const f=await setup(t),route='channels/alpha/dodosi-dispatch';await f.call('PUT','shipping-rates/dodosi-routes',f.data,true);
 const before=await f.repo.listRecords('alpha','shipment');assert.equal((await f.call('GET',route)).status,401);
 let state=(await f.call('GET',route,null,true)).json();assert.equal(state.groups.length,1);assert.equal(state.groups[0].schedule.dropoffDate,add(f.today,1));
 assert.equal(state.broadcastDate,f.today);assert.equal(state.labelSenderDefault,null);
 const save=await f.call('POST',route,{action:'save-sender',name:'가상발송인',phone:'01000000002',expectedRevision:0},true);assert.equal(save.status,200,save.body);
 assert.equal((await f.call('POST',route,{action:'save-sender',name:'늦은저장',phone:'01000000003',expectedRevision:0},true)).status,409);
 const body={action:'prepare',expectedRevision:1,groupId:state.groups[0].id};
 const results=await Promise.all([f.call('POST',route,body,true),f.call('POST',route,body,true)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const plan=results.find(r=>r.status===200).json().plan;assert.equal(plan.sender.name,'가상발송인');assert.equal(plan.originId,f.data.origin);
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);assert.deepEqual(await f.repo.listRecords('alpha','notification'),[]);
 assert.equal((await f.call('GET','channels/beta/dodosi-dispatch',null,true)).json().groups.length,0);
 await f.restart();state=(await f.call('GET',route,null,true)).json();assert.equal(state.prepared.length,1);assert.equal(state.sender.name,'가상발송인');
 await f.repo.upsertRecord('alpha','shipment',{...before[0],paymentStatus:'pending'});
 assert.equal((await f.call('POST',route,{...body,expectedRevision:state.revision},true)).status,409);
});
test('unpaid dispatch requires explicit per-group selection and never changes payment or sends notifications',async t=>{
 const f=await setup(t),route='channels/alpha/dodosi-dispatch';await f.call('PUT','shipping-rates/dodosi-routes',f.data,true);
 const shipment=(await f.repo.listRecords('alpha','shipment'))[0];await f.repo.upsertRecord('alpha','shipment',{...shipment,paymentStatus:'pending'});
 const before=await f.repo.listRecords('alpha','shipment');
 await f.call('POST',route,{action:'save-sender',name:'가상발송인',phone:'01000000002',expectedRevision:0},true);
 let state=(await f.call('GET',route,null,true)).json();const id=state.groups[0].id;assert.equal(state.groups[0].paid,false);
 const body={action:'prepare-many',groupIds:[id],expectedRevision:state.revision};
 assert.equal((await f.call('POST',route,body,true)).status,409);
 assert.equal((await f.call('POST',route,{...body,includeUnpaidGroupIds:['missing']},true)).status,422);
 assert.equal((await f.call('POST',route,{...body,includeUnpaidGroupIds:[id,id]},true)).status,422);
 assert.equal((await f.call('POST',route,{...body,includeUnpaidGroupIds:[id]})).status,401);
 const prepared=await f.call('POST',route,{...body,includeUnpaidGroupIds:[id]},true);assert.equal(prepared.status,200,prepared.body);assert.equal(prepared.json().plans[0].paid,false);
 await f.restart();state=(await f.call('GET',route,null,true)).json();assert.equal(state.prepared[0].unpaidManuallySelected,true);
 const resumed=await f.call('POST',route,{...body,resume:true,includeUnpaidGroupIds:[id],expectedRevision:state.revision},true);assert.equal(resumed.status,200,resumed.body);
 const single=await f.call('POST',route,{action:'prepare',groupId:id,includeUnpaidGroupIds:[id],expectedRevision:resumed.json().revision},true);assert.equal(single.status,200,single.body);
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);assert.deepEqual(await f.repo.listRecords('alpha','notification'),[]);
});

test('buyer and vendor projections use official route dates without changing frozen fees',async t=>{
 const f=await setup(t);await f.call('PUT','shipping-rates/dodosi-routes',f.data,true);
 const channel=(await f.repo.getCatalog()).channels.find(c=>c.id==='alpha');
 const selection={destinationType:'dodosi',pargeRegion:'수도권',pargeShop:'가상점1'};
 const schedule=await f.service.estimate(channel,selection);assert.equal(schedule.arrivalDate,add(f.today,5));
 const groups=await f.service.enrichRates(channel,'dodosi',[{region:'수도권',shops:[{name:'가상점1',cost:28000}]}]);assert.equal(groups[0].shops[0].deliverySchedule.arrivalDate,schedule.arrivalDate);
 assert.equal((await f.repo.listRecords('alpha','shipment'))[0].cost,28000);
});

test('managed booking batches guard concurrent creation, survive restart and confirm only from receipt data',async t=>{
 const f=await setup(t),route='channels/alpha/dodosi-dispatch';await f.call('PUT','shipping-rates/dodosi-routes',f.data,true);
 await f.call('POST',route,{action:'save-sender',name:'가상발송인',phone:'01000000002',expectedRevision:0},true);
 const before=await f.repo.listRecords('alpha','shipment');let state=(await f.call('GET',route,null,true)).json(),g=state.groups[0];
 const snapshot={source:'https://www.dodosi.co.kr/deliveries',complete:true,checkedAt:new Date().toISOString(),records:[]};
 let r=await f.call('POST',route,{action:'reconcile',snapshot,expectedRevision:state.revision},true);assert.equal(r.status,200,r.body);
 const body={action:'prepare-batch',groupIds:[g.id],expectedRevision:r.json().revision};
 const results=await Promise.all([f.call('POST',route,body,true),f.call('POST',route,body,true)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 await f.restart();state=(await f.call('GET',route,null,true)).json();assert.equal(state.batches.length,1);assert.equal(state.batches[0].status,'prepared');
 r=await f.call('POST',route,{action:'record-fill',batchId:state.batches[0].id,expectedRevision:state.revision,result:{filled:true,stage:'review',count:1,groupIds:[g.id]}},true);assert.equal(r.status,200,r.body);assert.equal(r.json().batches[0].status,'review');
 const receipt={id:'fixture-order',status:'paid',originId:f.data.origin,destinationId:g.destinationId,name:g.name,phone:g.phone,quantity:g.quantity,dropoffDate:g.schedule.dropoffDate,arrivalDate:g.schedule.arrivalDate};
 r=await f.call('POST',route,{action:'reconcile',expectedRevision:r.json().revision,snapshot:{...snapshot,checkedAt:new Date().toISOString(),records:[receipt]}},true);assert.equal(r.status,200,r.body);assert.equal(r.json().batches[0].status,'confirmed');
 assert.equal((await f.call('POST',route,{...body,expectedRevision:r.json().revision},true)).status,409);
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);assert.deepEqual(await f.repo.listRecords('alpha','notification'),[]);
 assert.equal((await f.call('GET','channels/beta/dodosi-dispatch',null,true)).json().batches,undefined);
});

test('bulk preparation validates the entire selection, blocks repeats across restart and leaves money/shipping untouched',async t=>{
 const f=await setup(t),route='channels/alpha/dodosi-dispatch';await f.call('PUT','shipping-rates/dodosi-routes',f.data,true);
 await f.repo.upsertRecord('alpha','item',{id:'i2',vendorId:'v',status:'sold',name:'A02',soldPrice:100000,winnerName:'가상둘',winnerPhone:'01000000003'});
 await f.repo.upsertRecord('alpha','shipment',{id:'s2',itemId:'i2',vendorId:'v',method:'delivery',destinationType:'dodosi',carrier:'도도시',recipientName:'가상둘',recipientPhone:'01000000003',pargeRegion:'수도권',pargeShop:'가상점2',paymentStatus:'paid',paymentMethod:'bank_transfer',cost:28000});
 const before=await f.repo.listRecords('alpha','shipment');
 await f.call('POST',route,{action:'save-sender',name:'가상발송인',phone:'01000000002',expectedRevision:0},true);
 let state=(await f.call('GET',route,null,true)).json();const ids=state.groups.map(g=>g.id),body={action:'prepare-many',expectedRevision:1,groupIds:ids};assert.equal(ids.length,2);
 assert.equal((await f.call('POST',route,{...body,groupIds:[ids[0],'missing']},true)).status,409);
 assert.equal((await f.call('POST',route,{...body,groupIds:[ids[0],ids[0]]},true)).status,422);
 assert.equal((await f.call('GET',route,null,true)).json().prepared.length,0);
 const responses=await Promise.all([f.call('POST',route,body,true),f.call('POST',route,body,true)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(responses.find(r=>r.status===200).json().plans.length,2);
 await f.restart();state=(await f.call('GET',route,null,true)).json();assert.equal(state.prepared.length,2);
 assert.equal((await f.call('POST',route,{...body,expectedRevision:state.revision},true)).status,409);
 assert.equal((await f.call('POST',route,{...body,resume:true,groupIds:[ids[0]],expectedRevision:state.revision},true)).status,409);
 const resumed=await f.call('POST',route,{...body,resume:true,expectedRevision:state.revision},true);assert.equal(resumed.status,200,resumed.body);assert.equal(resumed.json().plans.length,2);
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);assert.deepEqual(await f.repo.listRecords('alpha','notification'),[]);
});

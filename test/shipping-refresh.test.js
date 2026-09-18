'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {CheckoutNotificationService,notificationTransport}=require('../checkout-notifications');
const {createDeliveryScheduleService,KEY,STATUS_KEY,SYSTEM_CHANNEL}=require('../delivery-schedule-service');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-refresh-test-'));
 const repository=new SQLitePlatformRepository({dbPath:path.join(dir,'test.sqlite'),startWorker:false});
 await repository.saveCatalog([]);
 let clock=Date.parse('2026-09-18T00:00:00Z'),fail=false,calls=0,service;
 const sent=[];
 const reader=Object.fromEntries(['parge','dodosi'].map(carrier=>[carrier,async origins=>{calls++;if(fail)throw Error('offline');return {origins:(origins||[]).map(name=>({name})),ratePayload:carrier==='parge'?{data:{서울:[{shop:'가상지점',cost:30000}]}}:{items:[{route:'서울A',shop:'가상지점',price:30000}]}}}]));
 // In-memory send implementation: exercises the real outbox without an external provider.
 const notifications=new CheckoutNotificationService({repository,now:()=>clock,provider:{testMode:false,readiness:()=>({ready:true,missing:[]}),send:async record=>{sent.push(record);return{messageId:'fake-'+sent.length}}},beforeSend:(_channel,record)=>service.assertAlertCurrent(record)});
 const start=()=>service=createDeliveryScheduleService({repository,notificationService:notifications,reader,now:()=>clock,logger:{warn(){}}});start();
 t.after(async()=>{await service.stop();await notifications.stopAndDrain();repository.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-refresh-test-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true})});
 return{repository,notifications,sent,get service(){return service},get calls(){return calls},setFail(value){fail=value},advance(ms){clock+=ms},async restart(){await service.stop();start()},async enable(){await service.configure({enabled:true,alertPhone:'01000000001'})}};
}
test('shared automatic/manual refresh commits rates and schedules together and uses daily cache after restart',async t=>{
 const f=await fixture(t);await f.service.refresh();assert.equal(f.calls,2);
 const rows=await f.repository.getRowsByKeys([KEY,'shipping_rate_parge','shipping_rate_dodosi']);assert.equal(rows.length,3);
 await f.service.refreshCarrier('파르게');await f.service.refreshCarrier('도도시');assert.equal(f.calls,2);
 await f.restart();await f.service.refresh();assert.equal(f.calls,2);
 f.advance(86400001);await f.service.refresh();assert.equal(f.calls,4);
});
test('one SMS for an ongoing combined outage; two retries, restart dedupe, and a new alert only after recovery',async t=>{
 const f=await fixture(t);await f.enable();await f.service.refresh();f.setFail(true);f.advance(86400001);
 await f.service.refresh();assert.equal((await f.service.status()).providers.parge.failures,1);
 await f.service.refresh();assert.equal(f.calls,4);
 f.advance(60001);await f.service.refresh();assert.equal((await f.notifications.list(SYSTEM_CHANNEL)).length,0);
 f.advance(300001);await f.service.refresh();assert.equal((await f.notifications.list(SYSTEM_CHANNEL)).length,1);
 await f.notifications.flushChannel(SYSTEM_CHANNEL);assert.equal(f.sent.length,1);assert.equal(f.sent[0].transport,'sms');assert.equal(f.sent[0].recipientPhone,'01000000001');assert.ok(Buffer.byteLength(f.sent[0].fallbackText,'utf8')<=90);
 await f.restart();f.advance(3600001);await f.service.refresh();await f.notifications.flushChannel(SYSTEM_CHANNEL);assert.equal(f.sent.length,1);
 f.setFail(false);f.advance(3600001);await f.service.refresh();assert.equal((await f.service.status()).alertQueued,false);
 f.setFail(true);f.advance(86400001);await f.service.refresh();f.advance(60001);await f.service.refresh();f.advance(300001);await f.service.refresh();await f.notifications.flushChannel(SYSTEM_CHANNEL);assert.equal(f.sent.length,2);
});
test('recovery or disabling automation invalidates an unsent failure notice',async t=>{
 const f=await fixture(t);await f.enable();f.setFail(true);
 await f.service.refresh();f.advance(60001);await f.service.refresh();f.advance(300001);await f.service.refresh();
 f.setFail(false);f.advance(3600001);await f.service.refresh();await f.notifications.flushChannel(SYSTEM_CHANNEL);assert.equal(f.sent.length,0);
 assert.equal((await f.notifications.list(SYSTEM_CHANNEL))[0].status,'expired');
 await f.service.configure({enabled:false,alertPhone:'01000000001'});f.advance(86400001);const before=f.calls;await f.service.refresh();assert.equal(f.calls,before);
});
test('failed atomic write preserves the previous rates and schedule together',async t=>{
 const f=await fixture(t);await f.service.refresh();const before=await f.repository.getRowsByKeys([KEY,'shipping_rate_parge','shipping_rate_dodosi']);
 const upsert=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key===KEY))throw Error('storage failure');return upsert(rows)};
 f.advance(86400001);await f.service.refresh();assert.deepEqual(await f.repository.getRowsByKeys([KEY,'shipping_rate_parge','shipping_rate_dodosi']),before);
 assert.equal((await f.service.status()).providers.parge.failures,1);
});
test('invalid alert numbers cannot be saved; the refresh alert is an SMS action',async t=>{
 const f=await fixture(t);await assert.rejects(f.service.configure({enabled:true,alertPhone:'0149278600'}),/수신번호/);
 assert.equal(notificationTransport('shipping_data_refresh_failed'),'sms');
});
test('a partial provider response cannot remove most of the saved shipping directory',async t=>{
 const f=await fixture(t);const old={items:Array.from({length:50},(_,i)=>({shop:'지점'+i,price:30000}))};
 await f.repository.upsertRows([{key:'shipping_rate_dodosi',value:JSON.stringify(old)}]);await f.service.refresh();
 assert.equal((await f.service.status()).providers.dodosi.failures,1);
 assert.deepEqual(JSON.parse((await f.repository.getRowsByKeys(['shipping_rate_dodosi']))[0].value),old);
});

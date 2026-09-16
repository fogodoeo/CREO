'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core'),{CheckoutNotificationService}=require('../checkout-notifications');

async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-sale-atomic-'));
 const options={dbPath:path.join(dir,'test.sqlite'),durable:true,startWorker:false,adminSecret:'secret'};
 let repo,api,service,ready=true;const sent=[];
 function start(){repo=new SQLitePlatformRepository(options);service=new CheckoutNotificationService({repository:repo,provider:{testMode:false,readiness:()=>({ready,missing:ready?[]:['template']}),status:()=>({}),send:async n=>{sent.push(n);return {messageId:'fake-'+n.id}}},beforeSend:(c,n)=>api.assertBuyerNotificationLink(c,n),logger:{warn(){}}});api=createPlatformApi({repository:repo,notificationService:service,adminSessionSecret:'sale-fixture',logger:{error(){},warn(){}}});}
 start();t.after(()=>{repo.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-sale-atomic-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['가상 행사장']}})));await repo.setActiveChannel('alpha');
 await repo.upsertRecord('alpha','vendor',{id:'v',name:'가상 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'000000',bankHolder:'가상업체'});
 await repo.upsertRecord('alpha','item',{id:'one',name:'A01',lotNumber:1,status:'live',vendorId:'v',vendorName:'가상 업체',attributes:{bid_log:JSON.stringify([{name:'구매자',amount:3}])}});
 await repo.upsertRecord('alpha','broadcast',{id:'state',mode:'live',page:2,activeItemId:'one'});
 async function call(method,route,body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid','x-creo-admin':'secret'};const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;}
 const transition=body=>call('PUT','channels/alpha/auction-transition',body);
 const sell=extra=>transition({itemId:'one',status:'sold',mode:'sold',item:{soldPrice:30000,winnerName:'가상 구매자',winnerPhone:'01000000002'},...extra});
 return {call,transition,sell,sent,setReady(value){ready=value},get repo(){return repo},get service(){return service},restart(){repo.close();start()}};
}

test('sale preparation failure keeps the auction live with no half-created notification queue',async t=>{
 const f=await fixture(t),before=await f.repo.getRecord('alpha','item','one'),state=await f.repo.getRecord('alpha','broadcast','state'),prepare=f.service.prepare.bind(f.service);
 f.service.prepare=async(c,e)=>{if(e.recipientRole==='vendor')throw Error('temporary queue failure');return prepare(c,e)};
 const failed=await f.sell();assert.equal(failed.status,500,failed.body);assert.deepEqual(await f.repo.getRecord('alpha','item','one'),before);assert.deepEqual(await f.repo.getRecord('alpha','broadcast','state'),state);assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
 f.restart();assert.equal((await f.sell()).status,200);assert.equal((await f.repo.listRecords('alpha','notification')).length,2);
});

test('sale item, broadcast and both notices commit in one durable transaction',async t=>{
 const f=await fixture(t),before=await f.repo.getRecord('alpha','item','one'),state=await f.repo.getRecord('alpha','broadcast','state'),upsert=f.repo.upsertRows.bind(f.repo);
 f.repo.upsertRows=rows=>upsert(rows.some(r=>r.key.includes('::item::'))&&rows.some(r=>r.key.includes('::notification::'))?[...rows,{key:{invalid:true},value:'rollback'}]:rows);
 const failed=await f.sell();assert.equal(failed.status,500,failed.body);assert.deepEqual(await f.repo.getRecord('alpha','item','one'),before);assert.deepEqual(await f.repo.getRecord('alpha','broadcast','state'),state);assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
 f.restart();const results=await Promise.all([f.sell(),f.sell()]);assert.ok(results.every(r=>r.status===200));assert.equal((await f.repo.listRecords('alpha','notification')).length,2);assert.equal((await f.repo.getRecord('alpha','broadcast','state')).mode,'sold');
 f.restart();await f.sell();await f.service.flushChannel('alpha');await f.service.flushChannel('alpha');assert.equal(f.sent.length,2);assert.equal((await f.repo.listRecords('beta','notification')).length,0);
 for(const notice of f.sent){assert.equal(notice.variables['#{개체명}'],'A01');assert.equal(notice.variables['#{낙찰금액}'],'30,000원');assert.equal(notice.failureSmsFallback,true)}
});

test('queued notices for a reopened sale expire instead of reaching the former buyer or vendor',async t=>{
 const f=await fixture(t);assert.equal((await f.sell()).status,200);
 assert.equal((await f.transition({itemId:'one',status:'waiting',mode:'standby'})).status,200);
 f.restart();await f.service.flushChannel('alpha');assert.equal(f.sent.length,0);assert.ok((await f.repo.listRecords('alpha','notification')).every(n=>n.status==='expired'));
 assert.equal((await f.sell()).status,200);await f.service.flushChannel('alpha');assert.equal(f.sent.length,2);assert.equal((await f.repo.listRecords('alpha','notification')).length,4);
});

test('missing buyer phone still permits the vendor notice and an additional win uses the additional template',async t=>{
 const f=await fixture(t);assert.equal((await f.sell({item:{soldPrice:30000,winnerName:'연락처 미상'}})).status,200);assert.equal((await f.repo.listRecords('alpha','notification')).length,1);
 await f.repo.upsertRecord('alpha','item',{id:'two',name:'A02',lotNumber:2,status:'waiting',vendorId:'v',vendorName:'가상 업체'});
 const second=await f.transition({itemId:'two',status:'sold',mode:'sold',item:{soldPrice:20000,winnerName:'가상 구매자',winnerPhone:'01000000002'}});assert.equal(second.status,200,second.body);
 await f.repo.upsertRecord('alpha','item',{id:'three',name:'A03',lotNumber:3,status:'waiting',vendorId:'v',vendorName:'가상 업체'});
 const third=await f.transition({itemId:'three',status:'sold',mode:'sold',item:{soldPrice:10000,winnerName:'가상 구매자',winnerPhone:'01000000002'}});assert.equal(third.status,200,third.body);
 const extra=(await f.repo.listRecords('alpha','notification')).find(n=>n.templateKey==='buyer_win_additional');assert.equal(extra.variables['#{개체명}'],'A03');assert.equal(extra.variables['#{낙찰금액}'],'10,000원');
});

test('cancel and resell before dispatch sends only the latest sale after restart',async t=>{
 const f=await fixture(t);assert.equal((await f.sell()).status,200);
 assert.equal((await f.transition({itemId:'one',status:'waiting',mode:'standby'})).status,200);
 assert.equal((await f.sell({item:{soldPrice:10000,winnerName:'새 구매자',winnerPhone:'01000000003'}})).status,200);
 f.restart();await f.service.flushChannel('alpha');assert.equal(f.sent.length,2);
 assert.ok(f.sent.every(n=>n.variables['#{구매자명}']==='새 구매자'&&n.variables['#{낙찰금액}']==='10,000원'));
 assert.equal(f.sent.find(n=>n.recipientRole==='buyer').recipientPhone,'01000000003');
 assert.equal((await f.repo.listRecords('alpha','notification')).filter(n=>n.status==='expired').length,2);
});

for(const correction of [{soldPrice:50000},{winnerName:'정정한 이름'}])test('queued sale notices do not send obsolete '+Object.keys(correction)[0],async t=>{
 const f=await fixture(t);assert.equal((await f.sell()).status,200);
 const item=await f.repo.getRecord('alpha','item','one');await f.repo.upsertRecord('alpha','item',{...item,...correction});
 f.restart();await f.service.flushChannel('alpha');assert.equal(f.sent.length,0);
 assert.ok((await f.repo.listRecords('alpha','notification')).every(n=>n.status==='expired'));
});

test('provider configuration outage preserves sold state and recovers both queued notices',async t=>{
 const f=await fixture(t);f.setReady(false);assert.equal((await f.sell()).status,200);
 assert.equal((await f.repo.getRecord('alpha','item','one')).status,'sold');
 assert.ok((await f.repo.listRecords('alpha','notification')).every(n=>n.status==='configuration_pending'));
 f.restart();f.setReady(true);await f.service.flushChannel('alpha');await f.service.flushChannel('alpha');assert.equal(f.sent.length,2);
});

test('part identifiers survive public broadcast, buyer display and both sale notifications',async t=>{
 const f=await fixture(t),item=await f.repo.getRecord('alpha','item','one');
 await f.repo.upsertRecord('alpha','item',{...item,name:'2부 B01',lotNumber:17,attributes:{...item.attributes,displayNumber:'2부 B01'}});
 const broadcast=await f.call('GET','channels/alpha/broadcast');assert.equal(broadcast.status,200,broadcast.body);
 const publicItem=broadcast.json().items.find(i=>i.id==='one');
 const legacy=require('../public/channel-broadcast-bridge').toLegacyItem(publicItem);
 assert.equal(legacy.name,'2부 B01');assert.equal(legacy.num,17);
 assert.equal(require('../public/checkout-item-view').itemTitle(require('../checkout-item-data').checkoutItem(publicItem)),'2부 B01');
 assert.equal((await f.sell()).status,200);f.restart();await f.service.flushChannel('alpha');
 assert.equal(f.sent.length,2);assert.ok(f.sent.every(n=>n.variables['#{개체명}']==='2부 B01'));
});

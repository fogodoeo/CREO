'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel}=require('../platform-core');
const {prepareNextAuction}=require('../tools/prepare-next-auction.cjs');
const options={sourceId:'finished',targetId:'next-event',name:'다음 경매',apply:true};

async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-next-auction-'));
 const dbPath=path.join(dir,'test.sqlite');
 let repo=new SQLitePlatformRepository({dbPath,adminSecret:'test-only',startWorker:false}),api;
 const reset=()=>{api=createPlatformApi({repository:repo,adminSessionSecret:'fixture-only',logger:{error(){},warn(){}}})};
 reset();t.after(()=>{repo.close();fs.rmSync(dir,{recursive:true,force:true})});
 await repo.saveCatalog([normalizeChannel({id:'finished',name:'이전 경매',status:'active',broadcastTheme:'pixel',shippingDefaults:{enabledCarriers:['parge','dodosi'],pickupLocations:['이전 직수령'],deliverySchedule:{enabled:true,auctionDate:'2026-01-01',pargeOrigin:'이전 출발지'}}})]);
 await repo.setActiveChannel('finished');
 await repo.upsertRecord('finished','vendor',{id:'old-vendor',name:'이전 업체',phone:'01000000001',bankName:'테스트',bankAccount:'000000',bankHolder:'가상'});
 await repo.upsertRecord('finished','item',{id:'same-id',name:'A01',lotNumber:1,status:'sold',soldPrice:250000,vendorId:'old-vendor',winnerName:'이전 구매자',winnerPhone:'01000000002',attributes:{bid_log:'[{"name":"이전 구매자","amount":25}]'}});
 await repo.upsertRecord('finished','shipment',{id:'old-shipment',itemId:'same-id',recipientName:'이전 구매자',recipientPhone:'01000000002',paymentStatus:'card_payment_pending',paymentMethod:'card',cost:7000});
 const call=async(method,p,body,admin=true)=>{const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'fixture.local',...(admin?{'x-creo-admin':'test-only'}:{})};const res={writeHead(s){this.status=s},end(b=''){this.body=String(b)}};await api.handle(req,res,new URL('http://fixture.local/api/platform/'+p));let json=JSON.parse(res.body||'{}');if(res.status>=400){const e=Error(p+' '+res.status+' '+json.error);e.status=res.status;e.code=json.code;throw e}return json};
 await call('PUT','channels/finished/broadcast-state',{mode:'sold',activeItemId:'same-id',hostName1:'이전 진행자',page1Ticker:'이전 업체 안내',selectedBannerIds:['old-ad'],bannerSelectionConfigured:true,layoutPlacements:{'p2-parents':{x:80,y:70,width:25,height:35,opacity:94},'p2-info':{x:25,y:3,width:70,height:9,fontScale:0.9}}});
 await call('PUT','channels/finished/broadcast-config',{patch:{host_name1:'이전 진행자',ticker:'이전 업체 안내',badge_text:'OLD',active_event_module:'old-event',banner1:'/old.mp4',p2_item_font_size:'70',banner_opacity:'0.9',crewart_participants:'이전 참가자'}});
 await call('PUT','channels/finished/entry-policy',{open:true,expectedRevision:0});
 return {call,get repo(){return repo},restart(){repo.close();repo=new SQLitePlatformRepository({dbPath,adminSecret:'test-only',startWorker:false});reset()}};
}

test('prepare clean next event, preserve unpaid checkout rows, archive once, and survive restart',async t=>{
 const f=await fixture(t),oldItem=await f.repo.getRecord('finished','item','same-id'),oldShipment=await f.repo.getRecord('finished','shipment','old-shipment');
 await prepareNextAuction(f.call,options);
 const w=await f.call('GET','channels/next-event/workspace');
 assert.deepEqual(w.items,[]);assert.deepEqual(w.vendors,[]);assert.deepEqual(w.shipments,[]);
 assert.equal(w.broadcast.mode,'standby');assert.equal(w.broadcast.activeItemId,'');assert.equal(w.broadcast.hostName1,'');assert.equal(w.broadcast.page1HostsOn,false);assert.deepEqual(w.broadcast.selectedBannerIds,[]);
 assert.equal(w.channel.shippingDefaults.deliverySchedule.enabled,false);assert.equal(w.channel.shippingDefaults.deliverySchedule.auctionDate,'');assert.deepEqual(w.channel.shippingDefaults.pickupLocations,[]);
 assert.equal(w.channel.shippingDefaults.deliverySchedule.pargeOrigin,'');assert.equal(w.channel.shippingDefaults.deliverySchedule.dodosiOrigin,'');
 assert.deepEqual(w.broadcast.layoutPlacements['p2-info'],{x:25,y:3,width:70,height:9,fontScale:0.9,opacity:100,visible:true});
 const parent=w.broadcast.layoutPlacements['p2-parents'];assert.ok(parent.x+parent.width<=100);assert.ok(parent.y+parent.height<=100);
 const cfg=(await f.call('GET','channels/next-event/broadcast-config')).config;
 assert.equal(cfg.p2_item_font_size,'70');assert.doesNotMatch(JSON.stringify(cfg),/이전|OLD|old\.mp4|old-event/);
 const previous=(await f.call('GET','channels/finished/workspace')).channel;
 assert.equal(previous.status,'active');assert.equal(previous.features.shipping,true);assert.equal(previous.features.broadcast,false);
 assert.deepEqual(await f.repo.getRecord('finished','item','same-id'),oldItem);assert.deepEqual(await f.repo.getRecord('finished','shipment','old-shipment'),oldShipment);
 assert.equal((await f.call('GET','channels/next-event/entry-policy')).open,true);assert.equal((await f.call('GET','channels/finished/entry-policy')).open,false);
 await prepareNextAuction(f.call,options);assert.equal((await f.call('GET','channels/finished/archives')).archives.length,1);
 f.restart();assert.equal((await f.call('GET','active-channel')).channelId,'next-event');
 assert.deepEqual((await f.call('GET','channels/next-event/workspace')).items,[]);
 assert.equal((await f.repo.listRecords('finished','notification')).length,0);assert.equal((await f.repo.listRecords('next-event','notification')).length,0);
});

test('future vendor and item registration can start, sell and move to lower-price next lot without source leakage',async t=>{
 const f=await fixture(t);await prepareNextAuction(f.call,options);
 await f.call('POST','channels/next-event/vendors',{record:{id:'new-vendor',name:'새 업체'}});
 for(const [i,id] of ['same-id','next-lot'].entries())await f.call('POST','channels/next-event/items',{record:{id,name:'1부 A0'+(i+1),lotNumber:i+1,vendorId:'new-vendor',status:'waiting'}});
 await f.call('PUT','channels/next-event/auction-transition',{itemId:'same-id',status:'live',mode:'live'});
 const sale={itemId:'same-id',status:'sold',mode:'sold',item:{soldPrice:30000,winnerName:'새 구매자',winnerPhone:'01000000003'}};
 const results=await Promise.all([f.call('PUT','channels/next-event/auction-transition',sale),f.call('PUT','channels/next-event/auction-transition',sale)]);
 assert.equal(results[0].item.soldPrice,30000);assert.equal(results[1].item.soldPrice,30000);
 await f.call('PUT','channels/next-event/auction-transition',{itemId:'next-lot',status:'live',mode:'live'});
 const publicState=await f.call('GET','channels/next-event/broadcast',null,false);
 assert.equal(publicState.state.activeItemId,'next-lot');assert.doesNotMatch(JSON.stringify(publicState),/이전 구매자|01000000003|250000/);
 const next=publicState.items.find(i=>i.id==='next-lot');assert.equal(next.soldPrice,0);assert.ok(!next.winnerName);
 await assert.rejects(f.call('PUT','channels/finished/auction-transition',{itemId:'same-id',status:'live'}),e=>e.code==='ACTIVE_CHANNEL_CHANGED');
 await assert.rejects(prepareNextAuction(f.call,options),/already contains/);
 f.restart();assert.equal((await f.call('GET','channels/next-event/broadcast')).state.activeItemId,'next-lot');
 assert.equal((await f.repo.getRecord('finished','item','same-id')).soldPrice,250000);
});

test('source still live prevents any new-channel write',async t=>{
 const f=await fixture(t);await f.repo.upsertRecord('finished','item',{id:'live',status:'live'});
 await assert.rejects(prepareNextAuction(f.call,options),/Source auction is live/);
 assert.equal((await f.repo.getCatalog()).channels.length,1);
});

test('competing preparations fail catalog CAS safely instead of duplicating channel or archiving twice',async t=>{
 const f=await fixture(t);const results=await Promise.allSettled([prepareNextAuction(f.call,options),prepareNextAuction(f.call,options)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));
 assert.equal((await f.repo.getCatalog()).channels.filter(c=>c.id==='next-event').length,1);
 assert.equal((await f.call('GET','channels/finished/archives')).archives.length,1);
});

for(let failAt=1;failAt<=10;failAt++)test('interruption at mutation '+failAt+' preserves transaction records and resumes safely',async t=>{
 const f=await fixture(t),item=await f.repo.getRecord('finished','item','same-id'),shipment=await f.repo.getRecord('finished','shipment','old-shipment');let n=0;
 const flaky=async(...args)=>{if(args[0]!=='GET'&&++n===failAt)throw Error('injected interruption');return f.call(...args)};
 await assert.rejects(prepareNextAuction(flaky,options),/injected interruption/);
 assert.deepEqual(await f.repo.getRecord('finished','item','same-id'),item);assert.deepEqual(await f.repo.getRecord('finished','shipment','old-shipment'),shipment);
 f.restart();await prepareNextAuction(f.call,options);
 assert.equal((await f.call('GET','active-channel')).channelId,'next-event');assert.equal((await f.call('GET','channels/finished/archives')).archives.length,1);
});

for(const failAt of [1,5,8,10])test('response lost after committed mutation '+failAt+' is safe to retry',async t=>{
 const f=await fixture(t);let n=0;
 const uncertain=async(...args)=>{const result=await f.call(...args);if(args[0]!=='GET'&&++n===failAt)throw Error('response lost');return result};
 await assert.rejects(prepareNextAuction(uncertain,options),/response lost/);f.restart();await prepareNextAuction(f.call,options);
 assert.equal((await f.repo.getCatalog()).channels.filter(c=>c.id==='next-event').length,1);
 assert.equal((await f.call('GET','channels/finished/archives')).archives.length,1);
 assert.equal((await f.repo.getRecord('finished','shipment','old-shipment')).paymentStatus,'card_payment_pending');
});

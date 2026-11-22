'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../dodosi-routes'),Dispatch=require('../dodosi-dispatch');
const now=Date.parse('2026-11-23T00:00:00Z');
function fixture(){
 const shops=Array.from({length:20},(_,i)=>({id:`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`,label:i?'[서울/강동] 가상점'+i:'[대구/북구] 크레용(대구)',region:i?'수도권':'경상A'}));
 const slots=[{dropoff:'2026-11-24',pickup:'2026-11-25',arrival:'2026-11-28'},{dropoff:'2026-11-28',pickup:'2026-11-29',arrival:'2026-12-02'}],quote={base:28000,zoneSurcharge:0,petSurcharge:0,total:28000};
 const routes=shops.slice(1).flatMap(s=>[{from:shops[0].id,to:s.id,available:true,slots,quote,quantity:1},{from:s.id,to:shops[0].id,available:true,slots:[{dropoff:'2026-11-26',pickup:'2026-11-27',arrival:'2026-11-29'}],quote,quantity:1}]);
 return{schema:'creo.dodosi.routes.v1',checkedAt:new Date(now).toISOString(),origin:shops[0].id,shops,routes,discountBp:5000};
}
test('dated Dodosi routes distinguish dropoff, pickup, arrival; Wednesday and regional differences',()=>{
 const d=D.validate(fixture(),now),cfg={dodosiOrigin:'크레용(대구)',auctionDate:'2026-11-23'},dest={shop:'가상점1',region:'수도권'};
 assert.equal(D.match(d,'서울 강동 - 가상점1','수도권').id,d.shops[1].id);
 assert.deepEqual(D.outbound(d,cfg,dest,'',now),{status:'estimated',dropoffDate:'2026-11-24',dispatchDate:'2026-11-25',arrivalDate:'2026-11-28',checkedAt:d.checkedAt,sameDayDropoff:false});
 assert.equal(D.outbound(d,{...cfg,auctionDate:'2026-11-25'},dest,'',now).dispatchDate,'2026-11-29');
 d.routes[0].slots=d.routes[0].slots.slice(1);assert.equal(D.outbound(d,cfg,dest,'',now).dispatchDate,'2026-11-29');
 assert.equal(D.outbound(d,cfg,dest,'2026-11-25T00:00:00Z',now).dropoffDate,'2026-11-28');
 assert.equal(D.outbound(d,cfg,dest,'',now+4*86400000).status,'review');
 assert.equal(D.outbound(d,{...cfg,dodosiDispatchDate:'2026-11-26'},dest,'',now).status,'review');
});
test('vendor inbound requires arrival before broadcast, never assumes same-day delivery time',()=>{
 const d=fixture(),from=d.shops[1].id;
 assert.equal(D.inbound(d,from,d.origin,'2026-11-30',now).dropoffDate,'2026-11-26');
 assert.equal(D.inbound(d,from,d.origin,'2026-11-29',now).status,'review');
 assert.equal(D.inbound(d,from,d.origin,'2026-11-25',now).status,'review');
});
test('ambiguous shops, missing legs, stale imports and malformed quotes fail closed',()=>{
 const d=fixture();d.shops[2].label=d.shops[1].label;assert.equal(D.match(d,'가상점1','수도권'),null);
 for(const mutate of [x=>x.routes.pop(),x=>x.routes.push(x.routes[0]),x=>x.routes[0].quote.total++,x=>x.routes[0].slots[0].pickup='2026-11-22',x=>x.checkedAt='2026-11-20T00:00:00Z',x=>x.discountBp=10001]){const x=fixture();mutate(x);assert.throws(()=>D.validate(x,now));}
 const x=fixture();x.privateAccount='secret';x.shops[0].phone='private';const clean=D.validate(x,now);assert.equal(clean.privateAccount,undefined);assert.equal(clean.shops[0].phone,undefined);
});
test('store rejects old data, survives restart, keeps previous snapshot on write failure',async()=>{
 const rows=new Map();let fail=false;const repo={getRowsByKeys:async keys=>keys.filter(k=>rows.has(k)).map(key=>({key,value:rows.get(key)})),upsertRows:async values=>{if(fail)throw Error('storage');for(const r of values)rows.set(r.key,r.value)}};
 let store=D.createStore(repo,()=>now);const d=fixture();await store.put(d);await store.put(d);assert.equal((await store.get()).routes.length,38);
 store=D.createStore(repo,()=>now);assert.equal((await store.get()).origin,d.origin);
 const older={...d,checkedAt:new Date(now-1000).toISOString()};await assert.rejects(store.put(older),/최근/);
 fail=true;await assert.rejects(store.put({...d,discountBp:3000}),/storage/);assert.equal((await store.get()).discountBp,5000);
});
function workspace(){return{items:[{id:'i',channelId:'a',name:'A01',status:'sold',soldPrice:100000,winnerName:'가상',winnerPhone:'01000000001',buyerSaleId:'sale'}],shipments:[{id:'s',channelId:'a',itemId:'i',destinationType:'dodosi',recipientName:'가상',recipientPhone:'01000000001',pargeShop:'가상점1',pargeRegion:'수도권',paymentStatus:'paid',buyerSaleId:'sale',updatedAt:'1'}]};}
test('dispatch separates channels and carriers, merges exact recipient, rejects duplicates and obsolete sales',()=>{
 const w=workspace(),cfg={dodosiOrigin:'크레용(대구)',auctionDate:'2026-11-23'},build=w=>Dispatch.build(w,'a',fixture(),cfg,now);
 const before=JSON.stringify(w),first=build(w);assert.equal(first.groups.length,1);assert.equal(first.groups[0].paid,true);assert.equal(JSON.stringify(w),before);
 w.shipments[0].updatedAt='2';assert.notEqual(build(w).groups[0].id,first.groups[0].id);
 w.items.push({...w.items[0]});assert.equal(build(w).groups.length,0);w.items.pop();
 w.shipments[0].buyerSaleId='old';assert.equal(build(w).groups.length,0);w.shipments[0].buyerSaleId='sale';
 w.shipments[0].destinationType='parge';assert.equal(build(w).groups.length,0);w.shipments[0].destinationType='dodosi';
 w.items[0].channelId='b';assert.equal(build(w).groups.length,0);w.items[0].channelId='a';
 w.shipments[0].shippedAt='done';assert.equal(build(w).groups.length,0);
});
module.exports={fixture,now,workspace};

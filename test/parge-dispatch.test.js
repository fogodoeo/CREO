'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Core=require('../public/parge-dispatch-core');
const channelId='national-cre',opts={channelId,date:'2026-10-14'};
function fixture(){return {items:[{id:'a',channelId,name:'A01',status:'sold',winnerName:'테스트',winnerPhone:'01011112222',soldPrice:100000,attributes:{broadcastDate:'2026-10-14'}},{id:'b',channelId,name:'A02',status:'sold',winnerName:'테스트',winnerPhone:'01011112222',soldPrice:250000,attributes:{broadcastDate:'2026-10-14'}}],shipments:['a','b'].map(id=>({id:'s'+id,channelId,itemId:id,method:'delivery',destinationType:'parge',recipientName:'테스트',recipientPhone:'01011112222',pargeShop:'테스트 매장',paymentStatus:'paid'}))};}
const build=w=>Core.build(w,opts);
function plan(){return Core.manifest(build(fixture()).groups,{channelId,date:'2099-10-24'});}
test('same buyer and destination becomes one row: two animals and summed sale prices',()=>{const r=build(fixture());assert.equal(r.groups.length,1);assert.equal(r.groups[0].quantity,2);assert.equal(r.groups[0].price,350000);assert.deepEqual(r.groups[0].items.map(i=>i.lot),['A01','A02']);assert.equal(r.groups[0].paid,true);});
for(const [name,change] of Object.entries({
 'other carrier':w=>w.shipments[0].destinationType='dodosi',
 'pickup':w=>w.shipments[0].method='pickup',
 'shipped':w=>w.shipments[0].shippedAt='2026-10-15',
 'cancelled':w=>w.shipments[0].status='cancelled',
 'missing phone':w=>{w.shipments[0].recipientPhone='123';},
 'missing shop':w=>w.shipments[0].pargeShop='',
 'missing shipping':w=>w.shipments.shift(),
 'duplicate shipping':w=>w.shipments.push({...w.shipments[0],id:'duplicate'}),
 'resale mismatch':w=>{w.items[0].buyerSaleId='new';w.shipments[0].buyerSaleId='old';},
 'missing price':w=>w.items[0].soldPrice=null,
 'fractional price':w=>w.items[0].soldPrice=1.5,
 'unsold':w=>w.items[0].status='live',
 'wrong channel':w=>w.items[0].channelId='clab-1015',
 'wrong round':w=>w.items[0].attributes.broadcastDate='2026-10-19',
})){test('excludes '+name,()=>{const w=fixture();change(w);assert.equal(build(w).groups.reduce((n,g)=>n+g.quantity,0),1);});}
test('duplicate item IDs exclude all copies, never keep the first',()=>{const w=fixture();w.items.push({...w.items[0]});assert.deepEqual(build(w).groups[0].items.map(i=>i.id),['b']);});
test('different recipients at the same shop stay separate',()=>{const w=fixture();w.shipments[1].recipientName='다른 사람';w.shipments[1].recipientPhone='01033334444';w.items[1].winnerPhone='01033334444';assert.equal(build(w).groups.length,2);});
test('same winner different destinations stay separate',()=>{const w=fixture();w.shipments[1].pargeShop='다른 매장';assert.equal(build(w).groups.length,2);});
test('legacy complete means payment complete, not dispatched',()=>{const w=fixture();w.shipments[0].status='complete';assert.equal(build(w).groups[0].quantity,2);});
test('unpaid group never defaults to ready',()=>{const w=fixture();w.shipments[1].paymentStatus='pending';assert.equal(build(w).groups[0].paid,false);});
test('region address resolves only an exact unique catalog shop',()=>{const w=fixture();w.shipments[0].pargeShop='';w.shipments[0].address='경기 (테스트 매장)';const shops=Core.shopNames({data:{경기:[{shop:'테스트 매장'}]}});assert.equal(Core.build(w,{...opts,shops}).groups[0].quantity,2);assert.equal(Core.build(w,{...opts,shops:[...shops,...shops]}).groups[0].quantity,1);});
test('shipping charges are never part of declared sale price',()=>{const w=fixture();w.shipments.forEach(s=>{s.shippingFee=30000;s.totalAmount=999999});assert.equal(build(w).groups[0].price,350000);});
test('export contains fixed sender, memo, count and sum',()=>{const p=plan();assert.equal(p.senderPhone,'01050029163');assert.equal(p.groups[0].memo,'전크자');assert.equal(p.groups[0].price,350000);assert.equal(p.groups[0].quantity,2);});
for(const [name,change]of Object.entries({
 'past date':p=>p.date='2000-01-01','invalid date':p=>p.date='2099-02-30',
 'wrong sender':p=>p.senderPhone='01099998888','wrong origin':p=>p.origin='다른 매장',
 'tampered sum':p=>p.groups[0].price=100000,'wrong count':p=>p.groups[0].quantity=1,
 'wrong memo':p=>p.groups[0].memo='A01','duplicate ID':p=>p.groups[0].items[1].id='a',
 'negative price':p=>p.groups[0].items[0].price=-1,'blank phone':p=>p.groups[0].phone='',
 'duplicate group':p=>p.groups.push({...p.groups[0]}), 'empty batch':p=>p.groups=[],
})){test('rejects '+name,()=>{const p=plan();change(p);assert.throws(()=>Core.validate(p));});}
test('reservation worker serializes concurrent tabs and survives restart',async()=>{
 let receive;const data={},chrome={runtime:{onMessage:{addListener:fn=>{receive ||= fn}}},storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,data[k]])),set:async rows=>Object.assign(data,rows)}}};
 const load=()=>{receive=null;vm.runInNewContext(fs.readFileSync(require.resolve('../tools/parge-helper/background.js'),'utf8'),{chrome})};load();
 const keys=['creo-parge:'+crypto.createHash('sha256').update('test').digest('hex')],send=()=>new Promise(resolve=>receive({type:'creo-parge-reserve',keys},{tab:{url:'https://parge.co.kr/booking'}},resolve));
 const results=await Promise.all([send(),send()]);assert.equal(results.filter(r=>r.reserved).length,1);assert.equal(results.filter(r=>r.error).length,1);load();assert.ok((await send()).error);assert.ok(!JSON.stringify(data).includes('010'));
});
test('reservation write failure prevents submission',async()=>{let receive;vm.runInNewContext(fs.readFileSync(require.resolve('../tools/parge-helper/background.js'),'utf8'),{chrome:{runtime:{onMessage:{addListener:fn=>{receive ||= fn}}},storage:{local:{get:async()=>({}),set:async()=>{throw Error('disk')}}}}});const result=await new Promise(r=>receive({type:'creo-parge-reserve',keys:['creo-parge:'+'a'.repeat(64)]},{tab:{url:'https://parge.co.kr/booking'}},r));assert.ok(result.error);});

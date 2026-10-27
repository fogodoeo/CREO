'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {normalizeChannel}=require('../platform-core');
test('vendor tasks include authorized dated settlements, keep round receipts separate and clear when confirmed',async t=>{
 const f=await createFixture();t.after(f.close);f.advance(30*86400000);const owner=await f.login('01000000001'),other=await f.login('01000000002');
 const id=(await f.post(owner,'register',{name:'회차 할 일 업체',region:'서울·인천',phone:'01000000001'})).json().id;
 const directory=createVendorDirectory(f.repository),profile=await directory.enroll('national-cre',id),catalog=await f.repository.getCatalog();
 const children=['national-cre-20261019','national-cre-20261021'];
 await f.repository.saveCatalog([...catalog.channels,...children.map((child,i)=>normalizeChannel({id:child,name:'가상 방송 '+i,status:'active',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:i?'2026-10-21':'2026-10-19'},vendorSettlement:{enabled:true,entryFee:10000,ratePercent:0}}))]);
 const members=[];
 for(const [index,child]of children.entries()){
  const member=await directory.attach(profile.id,child);members.push(member);
  await f.repository.upsertRecord(child,'item',{id:'sold-'+index,lotNumber:1,name:'가상 개체',vendorId:member.vendorId,status:'sold',soldPrice:100000,winnerName:'가상 낙찰자',winnerPhone:'01000000003',attributes:{broadcastDate:index?'2026-10-21':'2026-10-19'}});
  await f.repository.upsertRecord(child,'shipment',{id:'paid-'+index,itemId:'sold-'+index,vendorId:member.vendorId,method:'pickup',address:'가상 직수령',paymentStatus:'paid',paymentConfirmedAmount:100000,recipientPhone:'01000000003'});
  await f.repository.upsertRows([{key:'creo_organizer_shipping_bank::'+child,value:JSON.stringify({bankName:'가상은행',bankAccount:'000000',bankHolder:'가상 주관사',notificationPhone:'01000000009'})}]);
 }
 const read=(client=owner)=>f.call(client,'GET','/api/platform/vendor-access/tasks?company='+id);
 const before=await Promise.all(children.map(c=>f.repository.listRecords(c,'item')));
 const [one,two]=await Promise.all([read(),read()]);assert.equal(one.status,200,one.body);assert.deepEqual(one.json(),two.json());
 const tasks=one.json();assert.equal(tasks.settlementAttention,true);assert.equal(tasks.settlementRoundCount,2);assert.equal(tasks.settlementCount,2);assert.equal(tasks.defaultSection,'settlement');assert.deepEqual(tasks.settlementTarget,{channelId:children[1],round:'date:2026-10-21'});
 assert.doesNotMatch(JSON.stringify(tasks),/01000000003|000000|sold-0|sold-1|winnerName|bankAccount/);
 assert.equal((await read(other)).status,403);assert.equal((await read(f.client())).status,401);
 for(const [index,child]of children.entries())await f.repository.upsertRows([{key:'creo_organizer_shipping_ledger::'+child,value:JSON.stringify([{id:'receipt-'+index,vendorId:members[index].vendorId,amount:10000,status:index?'confirmed':'pending',itemIds:['sold-'+index]}])}]);
 const waiting=(await read()).json();assert.equal(waiting.settlementAttention,false);assert.equal(waiting.settlementCount,0);assert.equal(waiting.settlementWaitingCount>=1,true);assert.equal(waiting.hasSales,true);
 assert.deepEqual(waiting.settlementTarget,{channelId:children[0],round:'date:2026-10-19'},'pending older settlement precedes a completed newer round');
 f.restart();assert.deepEqual((await read()).json(),waiting);assert.deepEqual(await Promise.all(children.map(c=>f.repository.listRecords(c,'item'))),before);
});

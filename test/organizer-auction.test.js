'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {organizerAuctionItems}=require('../shipping-settlement');
test('results include unpaid, paid pickup and missing destinations; ignore waiting and unrelated shipments',()=>{
 const items=['a','b','c','d'].map((id,i)=>({id,name:id,lotNumber:i+1,vendorId:'v',winnerName:id,soldPrice:(i+1)*10000,status:i===3?'waiting':'sold'}));
 const shipments=[{itemId:'a',vendorId:'v',method:'delivery',paymentStatus:'paid',address:'이전 배송지',updatedAt:'1'},
  {itemId:'a',vendorId:'v',method:'delivery',paymentStatus:'pending',address:'새 배송지',updatedAt:'2'},
  {itemId:'a',vendorId:'other',method:'pickup',paymentStatus:'paid',updatedAt:'9'},
  {itemId:'b',vendorId:'v',method:'pickup',paymentStatus:'paid',address:'대구본점'}];
 const result=organizerAuctionItems(items,shipments,[{id:'v',name:'업체'}],i=>i.winnerName);
 assert.deepEqual(result.map(i=>[i.code,i.paymentStatus,i.method,i.destination]),[['a','pending','delivery','새 배송지'],['b','paid','pickup','대구본점'],['c','pending','','']]);
});
test('reassigned winner cannot inherit prior recipient payment or address; cancellations stay identifiable',()=>{
 const items=[{id:'a',vendorId:'v',status:'sold',winnerPhone:'01022223333'},{id:'b',vendorId:'v',status:'sold'}];
 const shipments=[{itemId:'a',vendorId:'v',recipientPhone:'01011112222',paymentStatus:'paid',address:'직전 낙찰자 주소'},
  {itemId:'b',vendorId:'v',paymentStatus:'cancelled'}];
 const result=organizerAuctionItems(items,shipments,[]);
 assert.equal(result[0].paymentStatus,'pending');assert.equal(result[0].destination,'');assert.equal(result[1].paymentStatus,'cancelled');
});

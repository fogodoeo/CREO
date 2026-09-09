const test=require('node:test'), assert=require('node:assert/strict');
const {summarizeShipping,summarizeCarriers}=require('../shipping-settlement');
test('organizer totals use paid allocated shipping fees, not auction prices or bundle totals',()=>{
 const items=['a','b','c','d'].map(id=>({id,vendorId:'v',status:'sold'}));
 const shipments=[{itemId:'a',vendorId:'v',method:'delivery',cost:3500,paymentStatus:'paid'},
 {itemId:'b',vendorId:'v',method:'delivery',cost:3500,paymentStatus:'card_payment_pending'},
 {itemId:'c',vendorId:'v',method:'pickup',cost:9000,paymentStatus:'paid'},
 {itemId:'d',vendorId:'other',method:'delivery',cost:9000,paymentStatus:'paid'}];
 assert.deepEqual(summarizeShipping(items,shipments,[{id:'v',name:'업체'}]),[{vendorId:'v',vendorName:'업체',totalAmount:7000,collectedAmount:3500,pendingAmount:3500,itemCount:2}]);
});
test('carrier totals include pending buyer payments and reconcile allocated vendor fees without replay',()=>{
 const vendors=[{id:'v1'},{id:'v2'}];
 const items=['a','b','c','d','e'].map((id,i)=>({id,vendorId:i%2?'v2':'v1',status:id==='e'?'cancelled':'sold'}));
 const shipments=[
  {itemId:'a',vendorId:'v1',method:'delivery',carrier:'파르게',cost:3500,paymentStatus:'paid',updatedAt:'2'},
  {itemId:'a',vendorId:'v1',method:'delivery',carrier:'도도시',cost:9000,paymentStatus:'paid',updatedAt:'1'},
  {itemId:'b',vendorId:'v2',method:'delivery',carrier:'파르게',cost:3500,paymentStatus:'pending'},
  {itemId:'c',vendorId:'v1',method:'delivery',carrier:'도도시',cost:12000,paymentStatus:'pending'},
  {itemId:'d',vendorId:'v2',method:'pickup',carrier:'파르게',cost:9000},
  {itemId:'e',vendorId:'v1',method:'delivery',carrier:'파르게',cost:9000}
 ];
 const result=summarizeCarriers(items,shipments,vendors);
 assert.equal(result.find(c=>c.carrier==='파르게').totalAmount,7000);
 assert.equal(result.find(c=>c.carrier==='도도시').totalAmount,12000);
 assert.equal(result.reduce((n,c)=>n+c.totalAmount,0),summarizeShipping(items,shipments,vendors).reduce((n,v)=>n+v.totalAmount,0));
 assert.equal(result.find(c=>c.carrier==='파르게').vendorAmounts.v2,3500);
 for(const s of shipments)s.paymentStatus='paid';
 assert.deepEqual(summarizeCarriers(items,shipments,vendors),result);
 assert.deepEqual(summarizeCarriers(items,shipments,vendors),result);
});
test('carrier without a name stays explicit and unknown vendors do not inflate totals',()=>{
 const items=[{id:'a',vendorId:'v',status:'sold'},{id:'b',vendorId:'unknown',status:'sold'}];
 const shipments=items.map(i=>({itemId:i.id,vendorId:i.vendorId,method:'delivery',cost:7000}));
 const result=summarizeCarriers(items,shipments,[{id:'v'}]);
 assert.equal(result.length,1);assert.equal(result[0].carrier,'배송업체 미지정');assert.equal(result[0].totalAmount,7000);
});
test('duplicate or stale shipment rows do not double count; cancelled items are excluded',()=>{
 const items=[{id:'a',vendorId:'v',status:'sold'},{id:'b',vendorId:'v',status:'cancelled'}];
 const base={itemId:'a',vendorId:'v',method:'delivery',paymentStatus:'paid'};
 assert.equal(summarizeShipping(items,[{...base,cost:7000,updatedAt:'2'},{...base,cost:9000,updatedAt:'1'},{...base,itemId:'b',cost:9000}],[{id:'v'}])[0].collectedAmount,7000);
});

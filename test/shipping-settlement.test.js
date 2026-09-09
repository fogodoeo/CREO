const test=require('node:test'), assert=require('node:assert/strict');
const {summarizeShipping}=require('../shipping-settlement');
test('organizer totals use paid allocated shipping fees, not auction prices or bundle totals',()=>{
 const items=['a','b','c','d'].map(id=>({id,vendorId:'v',status:'sold'}));
 const shipments=[{itemId:'a',vendorId:'v',method:'delivery',cost:3500,paymentStatus:'paid'},
 {itemId:'b',vendorId:'v',method:'delivery',cost:3500,paymentStatus:'card_payment_pending'},
 {itemId:'c',vendorId:'v',method:'pickup',cost:9000,paymentStatus:'paid'},
 {itemId:'d',vendorId:'other',method:'delivery',cost:9000,paymentStatus:'paid'}];
 assert.deepEqual(summarizeShipping(items,shipments,[{id:'v',name:'업체'}]),[{vendorId:'v',vendorName:'업체',collectedAmount:3500,pendingAmount:3500,itemCount:2}]);
});
test('duplicate or stale shipment rows do not double count; cancelled items are excluded',()=>{
 const items=[{id:'a',vendorId:'v',status:'sold'},{id:'b',vendorId:'v',status:'cancelled'}];
 const base={itemId:'a',vendorId:'v',method:'delivery',paymentStatus:'paid'};
 assert.equal(summarizeShipping(items,[{...base,cost:7000,updatedAt:'2'},{...base,cost:9000,updatedAt:'1'},{...base,itemId:'b',cost:9000}],[{id:'v'}])[0].collectedAmount,7000);
});

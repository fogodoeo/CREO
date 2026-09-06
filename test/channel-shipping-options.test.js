'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeShippingDefaults}=require('../platform-core');
const {allocateShipping}=require('../checkout-core');
test('shipping settings preserve explicit empty choices, zero fees and channel isolation',()=>{
 const fallback={pickupLocations:['이전 지점'],enabledCarriers:['parge']};
 const empty=normalizeShippingDefaults({pickupLocations:[],enabledCarriers:[],pargeAdditionalFee:0},fallback);
 assert.deepEqual(empty.pickupLocations,[]);assert.deepEqual(empty.enabledCarriers,[]);assert.equal(empty.pargeAdditionalFee,0);
 const first=normalizeShippingDefaults({enabledCarriers:['dodosi','invalid','dodosi'],pickupLocations:['지점'],disabledPickupLocations:['지점']});
 assert.deepEqual(first.enabledCarriers,['dodosi']);assert.deepEqual(first.disabledPickupLocations,['지점']);
 assert.deepEqual(normalizeShippingDefaults().enabledCarriers,['parge']);
});
test('dodosi fees are distinct from parge and zero additional fee stays zero',()=>{
 const items=[{id:'a',lotNumber:1},{id:'b',lotNumber:2}];
 const rates=[{region:'부산',shops:[{name:'거점',baseCost:16000}]}];
 const channel={shippingDefaults:{dodosiAdditionalFee:3000,pargeAdditionalFee:0}};
 assert.equal(allocateShipping(items,{destinationType:'dodosi',pargeRegion:'부산',pargeShop:'거점'},channel,rates).total,19000);
 assert.equal(allocateShipping(items,{destinationType:'parge',pargeRegion:'부산',pargeShop:'거점'},channel,rates).total,16000);
 assert.equal(allocateShipping(items,{destinationType:'pickup'},channel,rates).total,0);
});

'use strict';const test=require('node:test'),assert=require('node:assert/strict');const actions=require('../public/checkout-actions');
test('bank app copy strips formatting and retains leading zero',()=>{assert.equal(actions.digits('045601-00-035929'),'04560100035929')});
test('telephone targets reject non-phone inputs',()=>{assert.equal(actions.phoneHref('010-4927-8600'),'tel:01049278600');assert.equal(actions.phoneHref('javascript:alert(1)'), '')});
test('vendor work sorts reported payments before completed records',()=>{assert.ok(actions.priority('bank_transfer_reported')<actions.priority('card_link_pending'));assert.ok(actions.priority('awaiting_information')<actions.priority('paid'))});
test('saved buyer quote keeps authoritative shipping cost until a draft change',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/buyer-shipping.html'),'utf8').split('\n').find(line=>line.startsWith('function vendorDue('));
 const state={dirty:false,data:{submittedAt:'saved'}};
 const due=require('node:vm').runInNewContext(source+';vendorDue',{state});
 const vendor={items:[{id:'one'}],totals:{shippingAmount:19000,payableAuctionAmount:100000},payment:{confirmedAmount:50000}};
 assert.equal(due(vendor,new Map([['one',30000]])).due,69000);
 state.dirty=true;assert.equal(due(vendor,new Map([['one',30000]])).due,80000);
});

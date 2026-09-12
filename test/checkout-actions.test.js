'use strict';const test=require('node:test'),assert=require('node:assert/strict');const actions=require('../public/checkout-actions');
test('bank app copy strips formatting and retains leading zero',()=>{assert.equal(actions.digits('045601-00-035929'),'04560100035929')});
test('telephone targets reject non-phone inputs',()=>{assert.equal(actions.phoneHref('010-4927-8600'),'tel:01049278600');assert.equal(actions.phoneHref('javascript:alert(1)'), '')});
test('vendor work sorts reported payments before completed records',()=>{assert.ok(actions.priority('bank_transfer_reported')<actions.priority('card_link_pending'));assert.ok(actions.priority('awaiting_information')<actions.priority('paid'))});
test('payment feedback never calls a queued or unavailable notification delivered',()=>{
 for(const status of ['queued','sending']){const feedback=actions.paymentConfirmationFeedback({status});assert.match(feedback.text,/발송 대기/);assert.equal(feedback.warning,false);}
 assert.match(actions.paymentConfirmationFeedback({status:'sent'}).text,/알림 접수/);
 for(const notification of [{status:'configuration_pending'},{configured:false},{status:'link_revoked'},{status:'delivery_unknown'},{failed:true}])assert.equal(actions.paymentConfirmationFeedback(notification).warning,true);
 assert.match(actions.paymentConfirmationFeedback({status:'link_revoked'}).text,/링크 사용 중지/);
 assert.match(actions.paymentConfirmationFeedback({suppressed:true}).text,/테스트 알림 꺼짐/);
 assert.equal(actions.paymentConfirmationFeedback({duplicate:true}).text,'결제 확인 완료');
});
test('saved buyer quote keeps authoritative shipping cost until a draft change',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/buyer-shipping.html'),'utf8').split('\n').find(line=>line.startsWith('function vendorDue('));
 const state={dirty:false,data:{submittedAt:'saved'}};
 const due=require('node:vm').runInNewContext(source+';vendorDue',{state});
 const vendor={items:[{id:'one'}],totals:{shippingAmount:19000,payableAuctionAmount:100000},payment:{confirmedAmount:50000}};
 assert.equal(due(vendor,new Map([['one',30000]])).due,69000);
 state.dirty=true;assert.equal(due(vendor,new Map([['one',30000]])).due,80000);
});
test('buyer report feedback distinguishes a saved report from a missing or pending vendor notice',()=>{
 for(const status of ['queued','sending']){const feedback=actions.paymentReportFeedback({status});assert.equal(feedback.warning,false);assert.match(feedback.text,/발송 대기/);}
 assert.match(actions.paymentReportFeedback({status:'sent'}).text,/알림 접수/);
 for(const notice of [{skipped:'missing_vendor_phone'},{configured:false},{status:'configuration_pending'},{status:'delivery_unknown'},{failed:true}])assert.equal(actions.paymentReportFeedback(notice).warning,true);
 assert.match(actions.paymentReportFeedback({skipped:'missing_vendor_phone'}).text,/신고 저장.*연락처/);
});

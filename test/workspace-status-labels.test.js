'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/channel-workspace.html'),'utf8');
test('workspace translates checkout and cancellation states instead of leaking internal codes',()=>{
    const context={};vm.createContext(context);
    for(const name of ['statusName','shippingStatusName']){
        const start=html.indexOf('function '+name+'(value)');
        const end=html.indexOf('\n',start);
        vm.runInContext(html.slice(start,end),context);
    }
    assert.equal(context.shippingStatusName('payment_pending'),'결제 대기');
    assert.equal(context.shippingStatusName('paid'),'결제 확인 완료');
    assert.equal(context.shippingStatusName('card_payment_reported'),'카드결제 확인 필요');
    assert.equal(context.statusName('cancelled'),'취소');
    assert.equal(context.shippingStatusName('unknown-status'),'상태 확인 필요');
});

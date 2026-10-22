'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8');
function render(row){
 const {document}=parseHTML(html),data={vendor:{id:'v',bankRegistered:true},shippingSettlement:{vendors:[{vendorId:'v',...row}],bank:{bankAccount:'000'},notificationReady:true}};
 const before=JSON.stringify(data),context=vm.createContext({document,data,$:id=>document.getElementById(id),money:n=>Number(n||0).toLocaleString('ko-KR')+'원',esc:String});
 vm.runInContext(html.slice(html.indexOf('function renderShippingSettlement()'),html.indexOf('function renderWorkFilters()')),context);vm.runInContext('renderShippingSettlement()',context);
 assert.equal(JSON.stringify(data),before);return document.getElementById('shipping-settlement');
}
test('overpaid and not-yet-priced shipping stay visible without a misleading completed badge',()=>{
 const overpaid=render({remainingAmount:0,receivedAmount:9000,totalAmount:6000,overpaidAmount:3000});
 assert.ok(overpaid);assert.equal(overpaid.querySelector('.settlement-status.done'),null);assert.equal(overpaid.classList.contains('settlement-complete'),false);assert.match(overpaid.textContent,/초과 입금 3,000원 · 주관사 확인/);
 const missing=render({remainingAmount:0,totalAmount:0,missingDestinationItems:[{id:'item'}]});
 assert.ok(missing);assert.match(missing.textContent,/배송비가 추가될 수 있습니다/);assert.equal(missing.classList.contains('settlement-complete'),false);
 assert.equal(missing.querySelector('#report-organizer-shipping').disabled,true);
});
test('completed and empty rounds retain their existing settlement behavior',()=>{
 assert.ok(render({remainingAmount:0,receivedAmount:6000,totalAmount:6000}).querySelector('.settlement-status.done'));
 assert.equal(render({remainingAmount:0,receivedAmount:0,totalAmount:0}),null);
});

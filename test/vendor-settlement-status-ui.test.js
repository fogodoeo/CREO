'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8');
function screen(row,options={}){
 const {document}=parseHTML(html),data={vendor:{id:'v',bankRegistered:true},shippingSettlement:{vendors:[{vendorId:'v',...row}],bank:options.bank||{bankAccount:'000'},notificationReady:true}};
 const context=vm.createContext({document,data,busy:false,navigator:{clipboard:options.clipboard},$:id=>document.getElementById(id),money:n=>Number(n||0).toLocaleString('ko-KR')+'원',esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
 vm.runInContext(html.slice(html.indexOf('function renderShippingSettlement()'),html.indexOf('function renderWorkFilters()')),context);
 const draw=()=>{const before=JSON.stringify(data);vm.runInContext('renderShippingSettlement()',context);assert.equal(JSON.stringify(data),before);return document.getElementById('shipping-settlement');};
 return {panel:draw(),draw,data};
}
function render(row){return screen(row).panel;}
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

test('pending reports keep the current organizer account in details without enabling another report',async()=>{
 const copied=[],row={remainingAmount:248000,totalAmount:248000,pendingReport:{id:'pending',amount:248000}},bank={bankName:'가상은행',bankHolder:'가상 주관사',bankAccount:'000-123'};
 const {panel}=screen(row,{bank,clipboard:{writeText:async value=>copied.push(value)}});
 const details=panel.querySelector('details');
 assert.match(details.querySelector('summary').textContent,/계좌/);
 assert.match(details.textContent,/현재 정산 계좌/);assert.match(details.textContent,/가상은행 · 가상 주관사/);assert.match(details.textContent,/000-123/);
 assert.equal(panel.querySelectorAll('#copy-organizer-bank').length,1);
 assert.equal(panel.querySelector('#report-organizer-shipping').disabled,true);
 await panel.querySelector('#report-organizer-shipping').onclick();
 await details.querySelector('#copy-organizer-bank').onclick();assert.deepEqual(copied,['000-123']);
 assert.equal(panel.querySelector('.settlement-amount').textContent,'248,000원');
});

test('pending account refresh preserves disclosure and copies the current account, with safe fallback on clipboard failure',async()=>{
 const copied=[],view=screen({remainingAmount:10000,totalAmount:10000,pendingReport:{amount:10000}},{bank:{bankName:'<은행>',bankHolder:'<img src=x>',bankAccount:'000-old'},clipboard:{writeText:async value=>copied.push(value)}});
 view.panel.querySelector('details').open=true;
 view.data.shippingSettlement.bank.bankAccount='000-new';const panel=view.draw();
 assert.equal(panel.querySelector('details').hasAttribute('open'),true);assert.doesNotMatch(panel.textContent,/000-old/);
 assert.equal(panel.querySelector('img'),null);assert.match(panel.textContent,/<은행> · <img src=x>/);
 await panel.querySelector('#copy-organizer-bank').onclick();assert.deepEqual(copied,['000-new']);
 const failed=screen({remainingAmount:10000,pendingReport:{amount:10000}},{bank:{bankAccount:'000-visible'},clipboard:{writeText:async()=>{throw Error('denied')}}}).panel;
 await failed.querySelector('#copy-organizer-bank').onclick();assert.match(failed.textContent,/000-visible/);assert.match(failed.textContent,/위 계좌번호를 복사해 주세요/);
});

test('missing account stays explicit in pending details and payable accounts stay directly visible',()=>{
 const pending=screen({remainingAmount:10000,pendingReport:{amount:10000}},{bank:{}}).panel;
 assert.match(pending.querySelector('details').textContent,/주관사 계좌 등록 대기/);assert.equal(pending.querySelector('#copy-organizer-bank'),null);
 const payable=render({remainingAmount:10000,totalAmount:10000});
 assert.ok(payable.querySelector('#copy-organizer-bank'));assert.equal(payable.querySelector('details #copy-organizer-bank'),null);
 assert.equal(payable.querySelector('#report-organizer-shipping').disabled,false);
});

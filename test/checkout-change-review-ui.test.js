'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const {render}=require('../public/checkout-change-review');
const snapshot={address:'가상 서울점',totals:{totalAmount:119000},vendors:[{name:'가상 업체',method:'bank_transfer',amount:119000,shippingAmount:19000}]};
const record=(id='one',extra={})=>({id,state:'pending',buyerName:'가상 낙찰자',phone:'01000000003',createdAt:'2026-10-21T10:00:00Z',before:snapshot,after:{...snapshot,address:'가상 경기점'},...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
function page(records=[record()],review=async id=>({record:{id,state:'approved'}})){
 const {document,window}=parseHTML('<main id="list"></main>');let focused;
 window.HTMLElement.prototype.focus=function(){focused=this};
 const container=document.getElementById('list'),calls=[],busy=[];
 const opts={document,container,records,review:async(id,body)=>{calls.push({id,body:structuredClone(body)});return review(id,body)},onBusy:v=>busy.push(v)};
 render(opts);return{document,container,calls,busy,opts,get focused(){return focused},row:id=>container.querySelector(`[data-change-id="${id}"]`),button:(id,action)=>container.querySelector(`[data-change-id="${id}"] [data-change-action="${action}"]`)};
}
test('pending first, completed folded, SMS focus opens completed and all data are escaped',()=>{
 const s=page([record('done',{state:'approved'}),record('one',{buyerName:'<img src=x onerror=alert(1)>',before:{...snapshot,address:'<script>bad</script>'}})]);
 assert.equal(s.container.querySelector('[data-change-id]').dataset.changeId,'one');assert.equal(s.container.querySelector('.request-completed').hasAttribute('open'),false);assert.equal(s.container.querySelector('img,script'),null);assert.match(s.container.textContent,/환불이나 카드 취소/);
 render({...s.opts,focusId:'done'});assert.equal(s.container.querySelector('.request-completed').hasAttribute('open'),true);
 render({...s.opts,records:[]});assert.match(s.container.textContent,/지금 확인할 변경 요청이 없어요/);
});
test('approval prerequisites and rejection reason validate before any write with useful focus',async()=>{
 const s=page([record('one',{cardLinks:['old-link']})]),row=s.row('one');
 await s.button('one','approve').onclick();assert.equal(s.calls.length,0);assert.equal(s.focused,row.querySelector('[data-unpaid]'));
 row.querySelector('[data-unpaid]').checked=true;await s.button('one','approve').onclick();assert.equal(s.calls.length,0);assert.equal(s.focused,row.querySelector('[data-cancelled]'));
 await s.button('one','reject').onclick();assert.equal(s.calls.length,0);assert.equal(s.focused,row.querySelector('textarea'));assert.equal(s.focused.getAttribute('aria-invalid'),'true');
 row.querySelector('textarea').value='기존 입금을 확인해 주세요.';await s.button('one','reject').onclick();assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.action,'reject');assert.equal(s.calls[0].body.confirmedCardLinksCancelled,false);
});
test('one active review locks all rows and accepted decision updates without another POST or read',async()=>{
 const d=deferred(),s=page([record(),record('other')],()=>d.promise),button=s.button('one','approve');s.row('one').querySelector('[data-unpaid]').checked=true;s.row('other').querySelector('textarea').value='다른 초안';
 const pending=button.onclick();assert.equal(s.container.dataset.busy,'true');assert.equal(s.button('other','approve').disabled,true);await button.onclick();await s.button('other','reject').onclick();assert.equal(s.calls.length,1);
 d.resolve({record:{id:'one',state:'approved'}});await pending;assert.equal(s.button('one','approve'),null);assert.equal(s.row('other').querySelector('textarea').value,'다른 초안');assert.match(s.focused.textContent,/승인했어요/);assert.deepEqual(s.busy,[true,false]);
});
test('lost response freezes original decision and retries it once without accepting changed fields',async()=>{
 let attempts=0;const s=page([record()],async(id,body)=>{if(++attempts===1)throw Error('network');return{record:{id,state:body.action==='approve'?'approved':'rejected'}}});
 const input=s.row('one').querySelector('textarea');input.value='기존 방식 유지';await s.button('one','reject').onclick();assert.match(s.focused.textContent,/같은 버튼/);assert.equal(input.disabled,true);assert.equal(s.button('one','approve').disabled,true);
 input.value='응답 뒤 달라진 값';await s.button('one','reject').onclick();assert.deepEqual(s.calls[1],s.calls[0]);assert.match(s.focused.textContent,/거절/);
});
test('stale or unauthorized review requires reload, validation errors remain editable',async()=>{
 for(const status of [401,403,409,422]){const s=page([record()],async()=>{throw Object.assign(Error('조건 변경'),{status})});s.row('one').querySelector('[data-unpaid]').checked=true;await s.button('one','approve').onclick();assert.match(s.focused.textContent,/조건 변경/);assert.equal(s.button('one','approve').disabled,status!==422);assert.equal(s.row('one').querySelector('textarea').disabled,status!==422);}
});
test('refresh preserves only same-record same-snapshot drafts and changed records require fresh checks',()=>{
 const s=page();let row=s.row('one');row.querySelector('textarea').value='확인 중';row.querySelector('[data-unpaid]').checked=true;
 render(s.opts);row=s.row('one');assert.equal(row.querySelector('textarea').value,'확인 중');assert.equal(row.querySelector('[data-unpaid]').checked,true);
 render({...s.opts,records:[record('one',{after:{...snapshot,address:'새 요청'}})]});row=s.row('one');assert.equal(row.querySelector('textarea').value,'');assert.equal(!!row.querySelector('[data-unpaid]').checked,false);
});

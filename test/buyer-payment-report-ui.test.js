'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const Report=require('../public/buyer-payment-report');
const fs=require('node:fs'),vm=require('node:vm'),html=fs.readFileSync(require.resolve('../public/buyer-shipping.html'),'utf8');
function setup(){
 const {document,window}=parseHTML('<html><body><button id="opener">입금했어요</button><h1 id="flow-title" tabindex="-1">결제</h1></body></html>'),focus=[],calls=[],finished=[],busy=[];
 let data={channel:{id:'national-cre'},round:{key:'round-19'},editVersion:'v1',vendors:[{key:'v',name:'가상 <업체>',payment:{method:'bank_transfer',status:'bank_transfer_pending',account:{bankName:'가상은행',accountNumber:'000-123',holder:'가상 대표'}}}]},handler=async()=>({...data,editVersion:'v2'}),refresh=async()=>true,apply=value=>{data=value},ids=0;
 const report=Report.create({document,getCheckout:()=>data,canReport:v=>!['paid','bank_transfer_reported','card_payment_reported'].includes(v.payment.status),getAmount:()=>126000,request:async body=>{calls.push({...body});return handler(body)},requestId:()=>`request-${++ids}`,apply:value=>apply(value),setBusy:value=>busy.push(value),refresh:()=>refresh(),onFinish:(value,key)=>finished.push({value,key})});
 const dialog=document.querySelector('dialog');dialog.showModal=()=>{dialog.open=true};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'))};
 for(const node of document.querySelectorAll('*'))node.focus=()=>focus.push(node.id||node.getAttribute('data-cancel')!==null&&'cancel'||node.getAttribute('data-error')!==null&&'error'||node.tagName);
 const $=selector=>dialog.querySelector(selector),open=()=>report.open('v',document.getElementById('opener'));
 return {report,dialog,document,window,$,open,focus,calls,finished,busy,get data(){return data},setData:value=>{data=value},handler:value=>{handler=value},refresh:value=>{refresh=value},apply:value=>{apply=value}};
}
test('report confirmation identifies the exact vendor, amount and account; opening or cancelling never reports',async()=>{
 const s=setup();s.open();assert.equal(s.report.isOpen(),true);assert.equal(s.calls.length,0);assert.equal(s.$('[data-vendor]').textContent,'가상 <업체>');assert.equal(s.$('[data-vendor]').children.length,0);assert.equal(s.$('[data-amount]').textContent,'126,000원');assert.match(s.$('[data-account]').textContent,/000-123/);assert.equal(s.focus.at(-1),'cancel');
 s.$('[data-cancel]').click();assert.equal(s.report.isOpen(),false);assert.equal(s.calls.length,0);assert.equal(s.focus.at(-1),'opener');
 s.data.vendors[0].payment.method='card';s.open();assert.equal(s.$('[data-account]').hidden,true);assert.match(s.$('#payment-report-title').textContent,/카드결제/);
});
test('failed report remains visible and retry preserves one request identity; in-flight input and escape are blocked',async()=>{
 const s=setup();s.open();s.handler(async()=>{throw Error('연결이 끊겼어요. 다시 요청해 주세요.')});await s.$('[data-confirm]').onclick();
 assert.equal(s.dialog.open,true);assert.equal(s.$('[data-error]').hidden,false);assert.match(s.$('[data-error-message]').textContent,/다시 요청/);assert.equal(s.focus.at(-1),'error');assert.equal(s.$('[data-confirm]').textContent,'다시 요청');
 let resolve;s.handler(()=>new Promise(r=>resolve=r));const saving=s.$('[data-confirm]').onclick();await s.$('[data-confirm]').onclick();s.$('[data-cancel]').onclick();const cancel=new s.window.Event('cancel',{cancelable:true});s.dialog.dispatchEvent(cancel);
 assert.equal(cancel.defaultPrevented,true);assert.equal(s.dialog.open,true);assert.equal(s.$('[data-cancel]').disabled,true);assert.equal(s.calls.length,2);assert.equal(s.calls[0].requestId,s.calls[1].requestId);
 resolve({...s.data,editVersion:'v2'});await saving;assert.equal(s.dialog.open,false);assert.equal(s.finished.length,1);assert.equal(s.finished[0].key,'v');assert.equal(s.data.editVersion,'v2');assert.deepEqual(s.busy,[true,false,true,false]);
});
test('stale version, another round, and completed payments require refresh without sending old confirmation',async()=>{
 for(const mutate of [s=>s.data.editVersion='new',s=>s.data.round.key='round-21',s=>s.data.channel.id='clab',s=>s.data.vendors[0].payment.status='paid']){
  const s=setup();s.open();mutate(s);await s.$('[data-confirm]').onclick();assert.equal(s.calls.length,0);assert.equal(s.$('[data-reload]').hidden,false);assert.equal(s.$('[data-confirm]').disabled,true);
  await s.$('[data-reload]').onclick();assert.equal(s.dialog.open,false);
 }
});
test('server conflict offers reload; failed refresh retains the explanation and a changed scope gets a new request',async()=>{
 const s=setup();s.open();s.handler(async()=>{throw Object.assign(Error('업체에서 금액을 수정했어요.'),{status:409})});await s.$('[data-confirm]').onclick();assert.equal(s.$('[data-confirm]').disabled,true);assert.equal(s.$('[data-reload]').hidden,false);
 s.refresh(async()=>{throw Error('offline')});await s.$('[data-reload]').onclick();assert.equal(s.dialog.open,true);assert.match(s.$('[data-error-message]').textContent,/다시 불러/);
 s.refresh(async()=>true);await s.$('[data-reload]').onclick();s.data.round.key='round-21';s.handler(async()=>s.data);s.open();await s.$('[data-confirm]').onclick();assert.notEqual(s.calls[0].requestId,s.calls[1].requestId);
});
test('closing after an uncertain response and reopening retries the same request; different vendors remain separate',async()=>{
 const s=setup();s.handler(async()=>{throw Error('응답을 받지 못했어요.')});s.open();await s.$('[data-confirm]').onclick();s.$('[data-cancel]').click();s.open();await s.$('[data-confirm]').onclick();assert.equal(s.calls[0].requestId,s.calls[1].requestId);
 s.$('[data-cancel]').click();s.data.vendors.push({...s.data.vendors[0],key:'another'});s.report.open('another',s.document.getElementById('opener'));await s.$('[data-confirm]').onclick();assert.notEqual(s.calls[0].requestId,s.calls[2].requestId);assert.equal(s.calls[2].vendorKey,'another');
});
test('a successful request with failed rendering retains its identity for recovery, and duplicate open is inert',async()=>{
 const s=setup();s.open();s.report.open('v',s.document.getElementById('opener'));s.apply(()=>{throw Error('화면을 다시 확인해 주세요.')});await s.$('[data-confirm]').onclick();assert.equal(s.finished.length,0);
 s.apply(value=>s.setData(value));await s.$('[data-confirm]').onclick();assert.equal(s.calls.length,2);assert.equal(s.calls[0].requestId,s.calls[1].requestId);assert.equal(s.finished.length,1);
});
test('buyer totals separate amounts already reported from money still to pay, including partial and complete payment',()=>{
 const {document}=parseHTML(html),$=id=>document.getElementById(id),vendor=(key,amount,status,confirmed=0)=>({key,items:[],totals:{payableAuctionAmount:amount,shippingAmount:0},payment:{status,confirmedAmount:confirmed}});
 const state={data:{submittedAt:'saved',payment:{status:'in_progress'},vendors:[vendor('a',200000,'bank_transfer_reported'),vendor('b',100000,'bank_transfer_pending')]},dirty:false};
 const ctx=vm.createContext({state,$,money:v=>Number(v).toLocaleString('ko-KR')+'원',globalShipping:()=>new Map(),vendorSaved:()=>true,pendingConfirmation:v=>['bank_transfer_reported','card_payment_reported'].includes(v.payment.status)});
 vm.runInContext(html.slice(html.indexOf('function vendorDue('),html.indexOf('function vendorAction('))+html.slice(html.indexOf('function renderPaymentSummary('),html.indexOf('function render(){')),ctx);
 ctx.renderPaymentSummary();assert.equal($('payable-amount').textContent,'100,000원');assert.equal($('payable-title').textContent,'결제할 금액');assert.match($('payable-note').textContent,/200,000원/);
 state.data.vendors[1]=vendor('b',100000,'additional_payment',70000);ctx.renderPaymentSummary();assert.equal($('payable-amount').textContent,'30,000원');
 state.data.vendors[1]=vendor('b',100000,'card_payment_reported',70000);ctx.renderPaymentSummary();assert.equal($('payable-amount').textContent,'230,000원');assert.equal($('payable-title').textContent,'결제 확인 중');
 state.data.vendors=[vendor('a',200000,'paid',200000),vendor('b',100000,'paid',100000)];state.data.payment.status='paid';ctx.renderPaymentSummary();assert.equal($('payable-amount').textContent,'300,000원');assert.equal($('payable-title').textContent,'결제 확인 완료');
 state.dirty=true;ctx.renderPaymentSummary();assert.match($('payable-note').textContent,/저장 후/);
});
test('destination lock explains pending review or completed processing and exposes only an available contact route',()=>{
 const {document}=parseHTML(html),$=id=>document.getElementById(id),state={data:{canEditDestination:false,submittedAt:'saved',payment:{status:'paid'},vendors:[{payment:{status:'paid'},contact:{phone:'01000000001'}}],items:[{paymentStatus:'paid'}]},payments:{},dirty:false,saving:false};
 const ctx=vm.createContext({state,$,document,destination:()=>({type:'pickup',label:'가상 현장'}),selectedRate:()=>null});
 vm.runInContext(html.slice(html.indexOf('let editingDestination='),html.indexOf(' const destination=')),ctx);ctx.renderFlow();
 assert.equal($('destination-lock').hidden,false);assert.match($('destination-lock-message').textContent,/결제 확인 또는 발송/);assert.equal($('destination-contact').hidden,false);
 const contact=document.createElement('a');contact.className='vendor-contact';let focused=false,scrolled=false;contact.focus=()=>{focused=true};contact.scrollIntoView=()=>{scrolled=true};$('vendors').append(contact);$('destination-contact').click();assert.equal(focused,true);assert.equal(scrolled,true);assert.equal($('destination-contact').getAttribute('href'),null);
 state.data.changeRequest={state:'pending'};ctx.renderFlow();assert.match($('destination-lock-message').textContent,/변경 요청/);
 state.data.vendors[0].contact.phone='';ctx.renderFlow();assert.equal($('destination-contact').hidden,true);
 state.data.canEditDestination=true;ctx.renderFlow();assert.equal($('destination-lock').hidden,true);
});

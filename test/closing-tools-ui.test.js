'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function screen(organizer=false){
 const {window,document}=parseHTML(`<html><body data-shipping-admin="true" data-closing-admin="true"><section id="closing-tools" ${organizer?'data-surface="organizer"':''}></section></body></html>`);
 const requests=[],context={channelId:'round-a',archiveId:'old',refresh:async()=>{}};
 window.getOrganizerClosingContext=window.getShippingClosingContext=()=>context;
 window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 const data={round:{name:'회차'},delivery:{smsConfigured:true},vendors:[{id:'v1',name:'업체',phoneLabel:'010-****-0001',itemCount:2,remainingAmount:40000,unpaidCount:1,paymentReadyCount:1,settlementBlocked:''}],buyers:[{id:'b1',name:'구매자',phoneLabel:'010-****-0002',itemCount:2,companies:['업체'],missing:true}],history:[{role:'vendor',name:'업체 이력',status:'sent'},{role:'buyer',name:'구매자 이력',status:'sent'}]};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/closing-tools.js'),'utf8'),{window,document,URLSearchParams,Intl,Date,Set,setTimeout:()=>0,clearTimeout(){},CreoPlatform:{api:async(path,options)=>{requests.push({path,...options,body:options.body?JSON.parse(options.body):null});return options.method==='GET'?data:{id:'plan',entries:[],excluded:[]};}}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));
 const el=id=>document.getElementById('closing-'+id);el('panel').open=true;el('panel').dispatchEvent(new window.Event('toggle'));await flush();
 return {window,document,requests,context,el};
}
test('shipping defaults to buyer reminders; payment tab cannot dispatch vendor SMS',async()=>{
 const f=await screen();assert.equal(f.el('send').textContent,'낙찰자 문자 미리보기');assert.equal(f.el('payment').hidden,true);assert.match(f.el('history').textContent,/구매자 이력/);assert.doesNotMatch(f.el('history').textContent,/업체 이력/);
 f.el('quick').onclick();f.el('send').onclick();await flush();assert.equal(f.requests.at(-1).body.action,'buyer_sms');assert.deepEqual(f.requests.at(-1).body.ids,['b1']);
 f.el('vendor-tab').onclick();assert.equal(f.el('send').hidden,true);assert.equal(f.el('payment').hidden,false);f.el('quick').onclick();f.el('payment').onclick();await flush();assert.equal(f.requests.at(-1).body.action,'payment');assert.equal(f.requests.at(-1).body.archiveId,'old');
 const count=f.requests.length;f.el('send').onclick();await flush();assert.equal(f.requests.length,count);
 assert.match(f.document.querySelector('.closing-route').getAttribute('href'),/archive=old&view=organizer/);
});
test('organizer exposes vendor settlement reminders only with its own history',async()=>{
 const f=await screen(true);assert.equal(f.document.querySelector('.closing-tabs').hidden,true);assert.equal(f.el('payment').hidden,true);assert.match(f.el('history').textContent,/업체 이력/);assert.doesNotMatch(f.el('history').textContent,/구매자 이력/);
 f.el('quick').onclick();f.el('send').onclick();await flush();assert.equal(f.requests.at(-1).body.action,'vendor_sms');assert.deepEqual(f.requests.at(-1).body.ids,['v1']);
 const count=f.requests.length;f.el('payment').onclick();await flush();assert.equal(f.requests.length,count);
 f.document.body.dataset.closingAdmin='false';f.window.dispatchEvent(new f.window.Event('organizer-closing-state'));assert.equal(f.document.getElementById('closing-tools').hidden,true);
});

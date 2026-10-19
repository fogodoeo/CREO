'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const flush=()=>new Promise(setImmediate);
const html=fs.readFileSync(require.resolve('../public/shipping-status.html'),'utf8');
function source(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));}
function loadingFixture(){
 const {document}=parseHTML(html),toasts=[],pending=[];
 const ctx=vm.createContext({document,statusLoadEpoch:0,activeMode:'winner',SHIPPING_CHANNEL_ID:'test',soldItems:[],auditLogs:[],notificationState:{},console:{error(){}},shippingOperation:{ready:async()=>({adapter:{id:'platform'},context:{}}),loadShippingItems:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))},CreoPlatform:{api:async()=>({notifications:[]})},CreoAuctionContract:{isSoldStatus:status=>status==='sold'},buildGroups(){},buildCompanyGroups(){},renderStats(){},renderCompanies(){},renderAuditLogs(){},renderNotifications(){},renderWinnerDirectory(){assert.ok(document.getElementById('winner-search'),'search controls must survive failure')},openMode(){},showToast:message=>toasts.push(message)});
 vm.runInContext(source('        async function loadData()','        if (MOBILE_STATUS_HISTORY) window.addEventListener'),ctx);
 return {ctx,document,toasts,pending};
}
test('shipping query failure preserves controls and never announces refresh success; retry can recover',async()=>{
 const f=loadingFixture(),button=f.document.querySelector('.refresh');
 const failed=f.ctx.reloadData(button);await flush();f.pending[0].reject(Error('offline'));await failed;
 assert.ok(f.document.getElementById('winner-search'),'a failed query must not delete the search UI');assert.deepEqual(f.toasts,[]);assert.equal(button.disabled,false);
 assert.equal(f.document.getElementById('status-load-error').hidden,false);
 const retry=f.ctx.reloadData(button);await flush();f.pending[1].resolve([{id:'current',status:'sold'}]);await retry;
 assert.equal(f.document.getElementById('status-load-error').hidden,true);assert.equal(f.toasts.length,1);assert.equal(f.ctx.soldItems[0].id,'current');
});
test('an older shipping response or failure cannot overwrite a newer successful query',async()=>{
 const f=loadingFixture(),old=f.ctx.loadData();await flush();const fresh=f.ctx.loadData();await flush();
 f.pending[1].resolve([{id:'fresh',status:'sold'}]);await fresh;f.pending[0].reject(Error('late offline'));await old;
 assert.equal(f.ctx.soldItems[0].id,'fresh');assert.equal(f.document.getElementById('status-load-error').hidden,true);assert.equal(f.document.getElementById('loading').style.display,'none');
});
test('winner selection treats quoted identities as data and moves focus into details and back to search',()=>{
 const {document}=parseHTML(html),focus=[],key='O\'Brien "buyer" <record>',group={key,name:'가상 구매자',phone:'01000000003',companies:['가상 업체'],items:[{}],status:'complete'};
 const get=document.getElementById.bind(document);document.getElementById=id=>{const node=get(id);if(node)node.focus=()=>focus.push(id);return node;};get('winner-result').scrollIntoView=options=>assert.equal(options.behavior,'auto');
 const ctx=vm.createContext({document,winnerGroups:[group],MOBILE_STATUS_HISTORY:false,selectedWinnerKey:'',winnerSearchActive:false,esc:require('../public/checkout-client').escapeHtml,fmtPhone:v=>v,statusMeta:()=>['등록 완료','complete'],recordHtml:()=>'<article>가상 개체</article>',window:{scrollTo:options=>assert.equal(options.behavior,'auto')}});
 vm.runInContext(source('        function renderWinnerDirectory(','        function auditLogHtml('),ctx);ctx.renderWinnerDirectory('');
 const button=document.querySelector('.directory-btn');assert.equal(button.getAttribute('onclick'),null);assert.equal(button.dataset.winner,key);assert.equal(button.querySelector('record'),null);button.click();
 assert.equal(focus.at(-1),'winner-detail-title');assert.equal(ctx.selectedWinnerKey,key);assert.equal(get('winner-search-controls').hidden,true);ctx.resetWinnerSelection();assert.equal(focus.at(-1),'winner-search');assert.equal(get('winner-search-controls').hidden,false);
 for(const id of ['winner-search','company-search'])assert.ok(document.querySelector('label[for="'+id+'"]'));
});
test('shipping query recovery never presents partial render failures as fresh results',async()=>{
 const f=loadingFixture();f.ctx.renderCompanies=()=>{throw Error('invalid display data')};const loading=f.ctx.loadData();await flush();f.pending[0].resolve([{id:'new',status:'sold'}]);assert.equal(await loading,false);
 assert.equal(f.document.getElementById('status-load-error').hidden,false);assert.ok([...f.document.querySelectorAll('[data-status-content]')].every(node=>node.hidden));assert.ok(f.document.getElementById('winner-search'));
});
test('company prices use the shared won conversion, including explicit zero and legacy ten-thousand-won rows',()=>{
 const {document}=parseHTML(html),items=[{num:1,soldPrice:10,sold_price:10,sold_amount_won:100000},{num:2,soldPrice:10,sold_amount_won:0},{num:3,soldPrice:25.5}];
 const ctx=vm.createContext({document,soldItems:items,companyGroups:[{name:'가상 업체',items}],esc:require('../public/checkout-client').escapeHtml,CreoPrintShippingSummary:require('../public/print-shipping-summary'),companyItemShippingInfo:()=>({label:'직접 수령',cost:'배송비 없음',complete:true}),companyItemName:()=> '가상 개체',companyWinner:()=> '가상 구매자',companyPhone:()=> '01000000003'});
 vm.runInContext(source('        function renderCompanies(','        function openMode('),ctx);ctx.renderCompanies('');
 assert.deepEqual([...document.querySelectorAll('.company-item>div>small')].filter(node=>node.textContent.startsWith('낙찰가')).map(node=>node.textContent),['낙찰가 100,000원','낙찰가 0원','낙찰가 255,000원']);
});

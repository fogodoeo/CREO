const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/buyer-shipping.html'),'utf8');
function setup({type='',shop=false,submitted=false,payment=false,dirty=false}={}){
 const nodes={};const state={data:{submittedAt:submitted?'saved':null,payment:{status:'awaiting_information'},vendors:[{key:'v',payment:{status:'awaiting_information'}}]},payments:payment?{v:'bank_transfer'}:{},dirty,saving:false,pargeRegion:'서울',pargeShop:'테스트점'};
 let chosen=type?{type,label:'테스트 수령지'}:null,rate=shop?{baseCost:10000}:null;
 const ctx=vm.createContext({state,$:id=>nodes[id]??=( {}),destination:()=>chosen,selectedRate:()=>rate});
 vm.runInContext(html.slice(html.indexOf('let editingDestination='),html.indexOf(' const destination=')),ctx);
 return{ctx,nodes,state,setDestination:(t,s)=>{chosen=t?{type:t,label:'변경 지점'}:null;rate=s?{}:null},run:()=>ctx.renderFlow()};
}
test('payment stays hidden until pickup or a complete carrier destination is selected',()=>{
 for(const [type,shop,visible] of [['',false,false],['parge',false,false],['dodosi',false,false],['pickup',false,true],['parge',true,true],['dodosi',true,true]]){const s=setup({type,shop});s.run();assert.equal(s.nodes['payment-section'].hidden,!visible);assert.equal(s.nodes['destination-editor'].hidden,visible);assert.equal(s.nodes.submit.disabled,true)}
});
test('changing carrier invalidates payment display without losing payment choice',()=>{const s=setup({type:'parge',shop:true,payment:true});s.run();assert.equal(s.nodes.submit.disabled,false);s.setDestination('dodosi',false);s.run();assert.equal(s.nodes['payment-section'].hidden,true);assert.equal(s.nodes.submit.disabled,true);assert.equal(s.state.payments.v,'bank_transfer')});
test('saved reload shows payment instructions, editing can return without a write',()=>{const s=setup({type:'pickup',submitted:true,payment:true});s.run();assert.equal(s.nodes['payment-section'].hidden,false);assert.equal(s.nodes.submit.disabled,true);vm.runInContext('editingDestination=true',s.ctx);s.run();assert.equal(s.nodes['payment-section'].hidden,true);assert.equal(s.nodes['cancel-destination'].hidden,false);vm.runInContext('editingDestination=false',s.ctx);s.run();assert.equal(s.nodes['payment-section'].hidden,false)});
test('dirty change and saving disable duplicate submission appropriately',()=>{const s=setup({type:'pickup',submitted:true,payment:true,dirty:true});s.run();assert.equal(s.nodes.submit.disabled,false);s.state.saving=true;s.run();assert.equal(s.nodes.submit.disabled,true)});
test('additional wins require saving even after a prior successful submission',()=>{const s=setup({type:'pickup',submitted:true,payment:true});s.state.data.items=[{paymentStatus:'paid'},{paymentStatus:''}];s.run();assert.equal(s.nodes.submit.disabled,false);assert.equal(s.nodes.submit.textContent,'추가 낙찰 내역 저장');assert.equal(s.nodes['flow-title'].textContent,'추가 낙찰 내역을 확인해 주세요');assert.equal(s.ctx.needsShippingSave(),true)});
test('reported payment blocks resubmission but permits destination editing until vendor confirmation',()=>{const s=setup({type:'pickup',submitted:true,payment:true,dirty:true});s.state.data.vendors[0].payment.status='bank_transfer_reported';s.run();assert.equal(s.nodes.submit.disabled,true);assert.equal(s.nodes['change-destination'].disabled,false);assert.equal(s.nodes.submit.textContent,'업체 결제 확인 중');s.state.data.canEditDestination=false;s.run();assert.equal(s.nodes['change-destination'].disabled,true);s.state.data.canEditDestination=true;s.state.data.vendors[0].payment.status='additional_payment';s.run();assert.equal(s.nodes.submit.disabled,false);assert.equal(s.nodes['change-destination'].disabled,false)});
test('initial choice prefers bank, preserving saved card and dirty draft across refresh',()=>{
 const state={dirty:false},ctx=vm.createContext({state,roundPicker:{update(){}},render(){}});
 vm.runInContext(html.slice(html.indexOf('function hydrate('),html.indexOf('async function load(')),ctx);
 const data={vendors:[{key:'v',payment:{method:''},paymentMethods:['bank_transfer','card']}]};
 ctx.hydrate(data);assert.equal(state.payments.v,'bank_transfer');
 data.vendors[0].payment.method='card';ctx.hydrate(data);assert.equal(state.payments.v,'card');
 state.dirty=true;state.payments.v='bank_transfer';ctx.hydrate(data,true);assert.equal(state.payments.v,'bank_transfer');
 data.vendors[0].payment.method='';data.vendors[0].paymentMethods=['card'];state.dirty=false;ctx.hydrate(data);assert.equal(state.payments.v,'');
});
test('paid and reported cards hide payment actions, ready card uses Alimtalk copy',()=>{
 const state={data:{submittedAt:'saved'},dirty:false};const ctx=vm.createContext({state,vendorSaved:()=>true,esc:x=>x});
 vm.runInContext(html.slice(html.indexOf('function vendorAction('),html.indexOf('function renderVendors(')),ctx);
 assert.equal(ctx.vendorAction({payment:{status:'paid'}},{}),'');
 const reported=ctx.vendorAction({payment:{status:'card_payment_reported'}},{});assert.doesNotMatch(reported,/data-report|card-link/);
 assert.match(ctx.vendorAction({payment:{method:'card'}},{}),/알림톡/);
 assert.match(ctx.vendorAction({payment:{method:'card',cardPaymentUrl:'https://example.com'}},{}),/카드로 결제하기/);
});
test('a saved destination is a top-level choice and does not select or save until the buyer chooses',()=>{
 const nodes={},state={data:{savedDestination:{label:'파르게 · 서울 · 수령점',destinationId:'parge',pargeRegion:'서울',pargeShop:'수령점'}},destinationId:'',dirty:false};
 const ctx=vm.createContext({state,$:id=>nodes[id]??={},esc:String,render(){},document:{querySelector:()=>({focus(){}})}});
 vm.runInContext(html.slice(html.indexOf('let editingDestination='),html.indexOf(' const destination=')),ctx);
 assert.equal(typeof ctx.renderSavedDestination,'function');ctx.renderSavedDestination();
 assert.equal(nodes['saved-destination'].hidden,false);assert.equal(nodes['destination-options'].hidden,true);
 assert.equal(state.destinationId,'');assert.equal(state.dirty,false);
 nodes['reuse-destination'].onclick();assert.equal(state.destinationId,'parge');assert.equal(state.pargeShop,'수령점');assert.equal(state.dirty,true);
 ctx.renderSavedDestination();assert.equal(nodes['saved-destination'].hidden,true);
});
test('choosing another destination dismisses the suggestion without copying it',()=>{
 const nodes={},state={data:{savedDestination:{label:'이전 수령지'}},destinationId:''};
 const ctx=vm.createContext({state,$:id=>nodes[id]??={},esc:String,render(){},document:{querySelector:()=>({focus(){}})}});
 vm.runInContext(html.slice(html.indexOf('let editingDestination='),html.indexOf(' const destination=')),ctx);
 ctx.renderSavedDestination();nodes['new-destination'].onclick();ctx.renderSavedDestination();
 assert.equal(state.destinationId,'');assert.equal(nodes['saved-destination'].hidden,true);assert.equal(nodes['destination-options'].hidden,false);
});

function vendorCase(key,status,registered=true){return{key,name:key,paymentMethods:['bank_transfer','card'],items:[{id:key,paymentStatus:registered?status:''}],payment:{status,method:registered?'bank_transfer':'',canChangeMethod:!status.endsWith('_reported'),confirmedAmount:0,account:{bankName:'테스트은행',accountNumber:'12345',holder:key}},totals:{payableAuctionAmount:100000,auctionAmount:100000,shippingAmount:0}}}
test('an earlier payment report does not present a new win as already reported',()=>{
 const s=multiVendorFlow(),v=s.pending;s.state.data.vendors=[v];s.state.data.items=v.items;v.payment.confirmationDue=100000;v.totals.payableAuctionAmount=200000;v.totals.auctionAmount=200000;v.items.push({id:'later',paymentStatus:''});
 Object.assign(s.ctx,{globalShipping:()=>new Map(),esc:String,money:String,shippingQuote:()=>({allocations:new Map()}),paymentStatus:()=>['확인 대기',''],CreoCheckoutActions:{priority:()=>0,phoneHref:()=>''},document:{querySelectorAll:()=>[]}});
 vm.runInContext(html.slice(html.indexOf('function vendorDue('),html.indexOf('function render(){')),s.ctx);s.ctx.renderVendors();s.ctx.renderPaymentSummary();
 const markup=s.nodes.vendors.innerHTML;assert.match(markup,/<strong>100000<\/strong>/);assert.doesNotMatch(markup,/<strong>200000<\/strong>/);assert.match(markup,/추가 낙찰/);assert.equal(s.nodes['payable-amount'].textContent,'100000');assert.match(s.nodes['payable-note'].textContent,/추가/);assert.doesNotMatch(markup,/data-report=/);
});
test('shipping changes distinguish original reported amount from the current outstanding amount',()=>{
 const s=multiVendorFlow(),v=s.pending;s.state.data.vendors=[v];s.state.data.items=v.items;Object.assign(v.payment,{confirmedAmount:50000,confirmationDue:50000,shippingChangedAfterReport:true,reportedAmount:100000,requestedAmount:120000});v.totals.payableAuctionAmount=120000;
 Object.assign(s.ctx,{globalShipping:()=>new Map(),esc:String,money:String,shippingQuote:()=>({allocations:new Map()}),paymentStatus:()=>['확인 대기',''],CreoCheckoutActions:{priority:()=>0,phoneHref:()=>''},document:{querySelectorAll:()=>[]}});
 vm.runInContext(html.slice(html.indexOf('function vendorDue('),html.indexOf('function render(){')),s.ctx);s.ctx.renderVendors();assert.match(s.nodes.vendors.innerHTML,/<strong>50000<\/strong>/);assert.match(s.nodes.vendors.innerHTML,/배송비.*70000/s);assert.doesNotMatch(s.nodes.vendors.innerHTML,/추가 낙찰/);
});
function multiVendorFlow(){
 const s=setup({type:'pickup',submitted:true,payment:true});
 const pending=vendorCase('pending','bank_transfer_reported'),ready=vendorCase('ready','awaiting_information',false);
 s.state.data.vendors=[pending,ready];s.state.data.items=[...pending.items,...ready.items];s.state.data.editVersion='test-version';
 s.state.data.selection={destinationId:'pickup-1',pargeRegion:'',pargeShop:''};
 Object.assign(s.state,{destinationId:'pickup-1',pargeRegion:'',pargeShop:'',payments:{pending:'bank_transfer',ready:'bank_transfer'}});
 return{...s,pending,ready};
}
test('another vendor can save additional wins while a payment report stays pending',()=>{
 const s=multiVendorFlow();s.run();assert.equal(s.nodes.submit.disabled,false);assert.equal(s.nodes.submit.textContent,'추가 낙찰 내역 저장');
 s.pending.items.push({id:'pending-new',paymentStatus:''});s.state.data.items.push(s.pending.items[1]);s.run();assert.equal(s.nodes.submit.disabled,false,'pending vendor additions must not block a different vendor');
 s.ready.items[0].paymentStatus='bank_transfer_pending';s.ready.payment.method='bank_transfer';s.ready.payment.status='bank_transfer_pending';s.run();
 assert.equal(s.nodes.submit.disabled,true,'only the same pending vendor now needs a save');assert.equal(s.nodes['flow-title'].textContent,'결제를 진행해 주세요');
 s.ready.payment.status='bank_transfer_reported';s.run();assert.equal(s.nodes['flow-title'].textContent,'결제 확인 중이에요');
});
test('editing another vendor method stays available and only its own unsaved draft hides actions',()=>{
 const s=multiVendorFlow();s.ready.items[0].paymentStatus='bank_transfer_pending';s.ready.payment.method='bank_transfer';s.ready.payment.status='bank_transfer_pending';
 s.state.dirty=true;s.state.payments.ready='card';s.run();assert.equal(s.nodes.submit.disabled,false);assert.equal(s.ctx.vendorHasDraft(s.ready),true);assert.equal(s.ctx.vendorHasDraft(s.pending),false);
 s.state.payments.ready='bank_transfer';assert.equal(s.ctx.vendorSaved(s.ready),true);
 s.state.destinationId='pickup-2';assert.equal(s.ctx.vendorSaved(s.ready),false,'shared destination draft still affects every vendor');
});
test('pending and unsaved vendors do not hide another vendor account or lock its controls',()=>{
 const s=multiVendorFlow();const ready=vendorCase('ready','bank_transfer_pending');s.state.data.vendors[1]=ready;
 const extra=vendorCase('extra','awaiting_information',false);s.state.data.vendors.push(extra);s.state.data.items.push(...extra.items);s.state.payments.extra='bank_transfer';
 Object.assign(s.ctx,{globalShipping:()=>new Map(),esc:String,money:String,shippingQuote:()=>({allocations:new Map()}),paymentStatus:()=>['확인 대기',''],CreoCheckoutActions:{priority:()=>0,phoneHref:()=>''},document:{querySelectorAll:()=>[]}});
 vm.runInContext(html.slice(html.indexOf('function vendorDue('),html.indexOf('function render(){')),s.ctx);s.ctx.renderVendors();
 const markup=s.nodes.vendors.innerHTML,articles=markup.split('<article class="vendor">').slice(1);
 assert.doesNotMatch(articles[0],/data-payment-vendor="ready"[^>]*disabled/);assert.match(articles[0],/12345/);assert.match(articles[0],/data-report="ready"/);
 assert.doesNotMatch(articles[1],/data-payment-vendor="extra"[^>]*disabled/);
 assert.match(articles[2],/method-readonly/);assert.match(articles[2],/확인 중인 금액/);assert.doesNotMatch(articles[2],/data-payment-vendor="pending"/);
 s.state.dirty=true;s.state.payments.extra='card';assert.match(s.ctx.vendorAction(ready,{}),/data-report="ready"/);
 assert.doesNotMatch(s.ctx.vendorAction(extra,{}),/data-report|account-panel/);
});
test('payment report for a saved vendor can proceed beside another vendor draft',async()=>{
 const s=multiVendorFlow(),ready=vendorCase('ready','bank_transfer_pending');s.state.data.vendors[1]=ready;
 s.state.dirty=true;const extra=vendorCase('extra','awaiting_information',false);s.state.data.vendors.push(extra);s.state.payments.extra='card';
 let config;Object.assign(s.ctx,{document:{},uuid:()=> 'isolated-report',render(){},CreoBuyerPaymentReport:{create:c=>{config=c;return{open(){}}}}});
 vm.runInContext(html.slice(html.indexOf('const paymentReport='),html.indexOf('const revisionSync=')),s.ctx);
 assert.equal(config.canReport(s.pending),false);assert.equal(config.canReport(extra),false);assert.equal(config.canReport(ready),true);s.state.saving=true;assert.equal(config.canReport(ready),false);s.state.saving=false;
 let preserved=false;s.ctx.hydrate=(data,preserveDraft)=>{preserved=preserveDraft;};config.apply({});assert.equal(preserved,true);
});

test('payment choices put bank first without changing an existing card choice or vendor capabilities',()=>{
 const s=multiVendorFlow();s.state.data.vendors=[s.ready];s.ready.paymentMethods=['card','bank_transfer'];s.state.payments.ready='card';
 Object.assign(s.ctx,{globalShipping:()=>new Map(),esc:String,money:String,shippingQuote:()=>({allocations:new Map()}),paymentStatus:()=>['',''],CreoCheckoutActions:{priority:()=>0,phoneHref:()=>''},document:{querySelectorAll:()=>[]}});
 vm.runInContext(html.slice(html.indexOf('function vendorDue('),html.indexOf('function render(){')),s.ctx);
 s.ctx.renderVendors();let markup=s.nodes.vendors.innerHTML;
 assert.ok(markup.indexOf('data-method="bank_transfer"')<markup.indexOf('data-method="card"'));
 assert.match(markup,/<button class="choice selected"[^>]*aria-pressed="true"[^>]*data-method="card"/);
 assert.match(markup,/role="group" aria-label="ready 결제 방법"/);
 assert.equal(s.state.payments.ready,'card');assert.deepEqual(s.ready.paymentMethods,['card','bank_transfer']);
 s.ready.paymentMethods=['card'];s.ctx.renderVendors();markup=s.nodes.vendors.innerHTML;
 assert.doesNotMatch(markup,/bank-first|data-method="bank_transfer"/);assert.match(markup,/data-method="card"/);
 s.ready.paymentMethods=['bank_transfer'];s.state.payments.ready='bank_transfer';s.ctx.renderVendors();
 assert.doesNotMatch(s.nodes.vendors.innerHTML,/data-method="card"/);
});

test('buyer payment work comes before prepared/reported waiting states while the underlying order stays intact',()=>{
 const s=multiVendorFlow(),guide=vendorCase('guide','card_link_pending'),bank=vendorCase('bank','bank_transfer_pending'),paid=vendorCase('paid','paid');
 guide.payment.method='card';s.state.data.vendors=[s.pending,guide,bank,paid];s.state.data.items=s.state.data.vendors.flatMap(v=>v.items);
 s.state.payments={pending:'bank_transfer',guide:'card',bank:'bank_transfer',paid:'bank_transfer'};
 Object.assign(s.ctx,{globalShipping:()=>new Map(),esc:String,money:String,shippingQuote:()=>({allocations:new Map()}),paymentStatus:()=>['',''],CreoCheckoutActions:{phoneHref:()=>''},document:{querySelectorAll:()=>[]}});
 vm.runInContext(html.slice(html.indexOf('function vendorDue('),html.indexOf('function render(){')),s.ctx);s.ctx.renderVendors();
 const markup=s.nodes.vendors.innerHTML;
 assert.ok(markup.indexOf('<b>bank</b>')<markup.indexOf('<b>pending</b>'));assert.ok(markup.indexOf('<b>pending</b>')<markup.indexOf('<b>guide</b>'));assert.ok(markup.indexOf('<b>guide</b>')<markup.indexOf('<b>paid</b>'));
 assert.deepEqual(s.state.data.vendors.map(v=>v.key),['pending','guide','bank','paid']);s.run();assert.equal(s.nodes['flow-title'].textContent,'결제를 진행해 주세요');
 bank.payment.status='bank_transfer_reported';s.run();assert.equal(s.nodes['flow-title'].textContent,'결제 안내·확인 중이에요');
 guide.payment.cardPaymentUrl='https://example.test/pay';s.run();assert.equal(s.nodes['flow-title'].textContent,'결제를 진행해 주세요');
 delete guide.payment.cardPaymentUrl;guide.payment.cardNoticeMethod='external';s.run();assert.equal(s.nodes['flow-title'].textContent,'결제를 진행해 주세요');
});

test('missing bank or card instructions show preparation instead of asking the buyer to pay',()=>{
 const s=setup({type:'pickup',submitted:true,payment:true}),bank=vendorCase('bank','bank_transfer_pending');
 bank.payment.account={};s.state.data.vendors=[bank];s.state.data.items=bank.items;s.state.payments={bank:'bank_transfer'};
 s.run();assert.equal(s.nodes['flow-title'].textContent,'결제 안내를 준비 중이에요');
 bank.payment.status='paid';s.state.data.payment.status='paid';s.run();assert.equal(s.nodes['flow-title'].textContent,'결제가 완료됐어요');
});

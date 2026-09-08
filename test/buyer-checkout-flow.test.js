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
test('additional wins require saving even after a prior successful submission',()=>{const s=setup({type:'pickup',submitted:true,payment:true});s.state.data.items=[{paymentStatus:'paid'},{paymentStatus:''}];s.run();assert.equal(s.nodes.submit.disabled,false);assert.equal(s.nodes.submit.textContent,'추가 낙찰 내역 저장');assert.equal(s.ctx.needsShippingSave(),true)});
test('reported payment blocks resubmission but permits destination editing until vendor confirmation',()=>{const s=setup({type:'pickup',submitted:true,payment:true,dirty:true});s.state.data.vendors[0].payment.status='bank_transfer_reported';s.run();assert.equal(s.nodes.submit.disabled,true);assert.equal(s.nodes['change-destination'].disabled,false);assert.equal(s.nodes.submit.textContent,'업체 결제 확인 중');s.state.data.canEditDestination=false;s.run();assert.equal(s.nodes['change-destination'].disabled,true);s.state.data.canEditDestination=true;s.state.data.vendors[0].payment.status='additional_payment';s.run();assert.equal(s.nodes.submit.disabled,false);assert.equal(s.nodes['change-destination'].disabled,false)});
test('initial choice prefers bank, preserving saved card and dirty draft across refresh',()=>{
 const state={dirty:false},ctx=vm.createContext({state,render(){}});
 vm.runInContext(html.slice(html.indexOf('function hydrate('),html.indexOf('async function load(')),ctx);
 const data={vendors:[{key:'v',payment:{method:''},paymentMethods:['bank_transfer','card']}]};
 ctx.hydrate(data);assert.equal(state.payments.v,'bank_transfer');
 data.vendors[0].payment.method='card';ctx.hydrate(data);assert.equal(state.payments.v,'card');
 state.dirty=true;state.payments.v='bank_transfer';ctx.hydrate(data,true);assert.equal(state.payments.v,'bank_transfer');
 data.vendors[0].payment.method='';data.vendors[0].paymentMethods=['card'];state.dirty=false;ctx.hydrate(data);assert.equal(state.payments.v,'');
});
test('paid and reported cards hide payment actions, ready card uses Alimtalk copy',()=>{
 const state={data:{submittedAt:'saved'},dirty:false};const ctx=vm.createContext({state,needsShippingSave:()=>false,esc:x=>x});
 vm.runInContext(html.slice(html.indexOf('function vendorAction('),html.indexOf('function renderVendors(')),ctx);
 assert.equal(ctx.vendorAction({payment:{status:'paid'}},{}),'');
 const reported=ctx.vendorAction({payment:{status:'card_payment_reported'}},{});assert.doesNotMatch(reported,/data-report|card-link/);
 assert.match(ctx.vendorAction({payment:{method:'card'}},{}),/알림톡/);
 assert.match(ctx.vendorAction({payment:{method:'card',cardPaymentUrl:'https://example.com'}},{}),/카드로 결제하기/);
});

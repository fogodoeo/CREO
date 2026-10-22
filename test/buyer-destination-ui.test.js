'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const Checkout=require('../public/checkout-client'),Rules=require('../public/checkout-rules');
const html=fs.readFileSync(require.resolve('../public/buyer-shipping.html'),'utf8');
const part=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end));
function setup(count=2){
 const {document,window}=parseHTML(html),$=id=>document.getElementById(id),focus=[];
 for(const node of document.querySelectorAll('button,input,h1,[tabindex]')){node.focus=()=>focus.push(node.id);node.select=()=>{};node.scrollIntoView=()=>{};}
 const regions=[{region:'경기',shops:Array.from({length:count},(_,i)=>({name:'수령점 '+i,baseCost:10000+i}))},{region:'전라',shops:[{name:'별빛점',baseCost:15000}]}];
 const state={data:{submittedAt:'saved',editVersion:'version-1',channel:{name:'가상 방송'},selection:{destinationId:'parge',pargeRegion:'경기',pargeShop:'수령점 0'},destinations:[{id:'parge',type:'parge',label:'파르게'},{id:'dodosi',type:'dodosi',label:'도도시'},{id:'pickup',type:'pickup',label:'현장'}],carriers:{parge:{regions,additionalFee:7000},dodosi:{regions,additionalFee:7000}},items:[{id:'one',paymentStatus:'bank_transfer_pending'}],payment:{status:'in_progress'},vendors:[{key:'v',items:[{id:'one',paymentStatus:'bank_transfer_pending'}],paymentMethods:['bank_transfer','card'],payment:{status:'bank_transfer_pending',method:'bank_transfer'}}]},destinationId:'parge',pargeRegion:'경기',pargeShop:'수령점 0',query:'경기 수령점 0',region:'전체',payments:{v:'bank_transfer'},dirty:false,saved:false,saving:false};
 const ctx=vm.createContext({document,window,state,$,Rules,CreoCarrierSearch:require('../public/carrier-search'),carrierAccess:{render(){},refresh(){}},esc:Checkout.escapeHtml,money:Checkout.money,roundPicker:{update(){}},render(){},confirm:()=>true});
 vm.runInContext(part('let editingDestination=','function vendorDue('),ctx);
 vm.runInContext(part('function applyCarrierAccess(','const carrierAccess='),ctx);
 ctx.render=()=>{ctx.renderDestinations();ctx.renderParge();ctx.renderFlow();ctx.renderSaveFeedback()};
 vm.runInContext(part('function hydrate(','async function load('),ctx);
 Object.assign(ctx,{Checkout:{createAdaptivePoller:()=>({start(){}})},revisionSync:{stop(){}},load:async()=>true,save(){}});
 vm.runInContext(part('const poller=','load().finally('),ctx);
 ctx.render();return{ctx,state,$,document,window,focus};
}
test('approval polling preserves the selected control and unsaved search, payment and version',()=>{
 const s=setup(),button=s.$('destinations').querySelector('[data-dest="parge"]');s.state.query='없는 지역';s.state.dirty=true;s.state.payments.v='card';
 const data={destinations:structuredClone(s.state.data.destinations),carriers:s.state.data.carriers,carrierRequest:{state:'pending'}};
 s.ctx.applyCarrierAccess(data);assert.equal(s.$('destinations').querySelector('[data-dest="parge"]'),button);
 s.ctx.applyCarrierAccess({carrierRequest:{state:'pending'}});assert.equal(s.state.data.destinations,data.destinations);assert.equal(s.state.data.carriers,data.carriers);assert.equal(s.$('destinations').querySelector('[data-dest="parge"]'),button);
 assert.equal(s.state.query,'없는 지역');assert.equal(s.state.payments.v,'card');assert.equal(s.state.dirty,true);assert.equal(s.state.data.editVersion,'version-1');
});
test('search without results keeps cancellation and restores the exact previous draft without a write',()=>{
 const s=setup(),before=JSON.stringify(s.state.data);
 s.ctx.beginDestinationEdit();s.$('parge-search').value='없는 지역';s.$('parge-search').oninput({target:s.$('parge-search')});
 assert.equal(s.$('cancel-destination').hidden,false);assert.equal(s.$('parge-count').textContent,'찾은 지점이 없어요');assert.equal(s.$('parge-reset').hidden,false);
 assert.equal(s.state.pargeShop,'');assert.equal(s.state.dirty,true);
 s.ctx.cancelDestinationEdit();assert.equal(s.state.pargeShop,'수령점 0');assert.equal(s.state.query,'경기 수령점 0');assert.equal(s.state.dirty,false);assert.equal(s.$('destination-summary').hidden,false);assert.equal(s.focus.at(-1),'change-destination');assert.equal(JSON.stringify(s.state.data),before);
 s.state.dirty=true;s.state.payments.v='card';s.ctx.beginDestinationEdit();s.$('parge-search').oninput({target:{value:'다른 검색'}});s.ctx.cancelDestinationEdit();assert.equal(s.state.dirty,true);assert.equal(s.state.payments.v,'card');
});
test('switching carriers keeps cancel available, choosing pickup completes a local choice only',()=>{
 const s=setup();s.ctx.beginDestinationEdit();s.$('destinations').querySelector('[data-dest="dodosi"]').click();
 assert.equal(s.$('cancel-destination').hidden,false);assert.equal(s.state.destinationId,'dodosi');s.ctx.cancelDestinationEdit();assert.equal(s.state.destinationId,'parge');
 s.ctx.beginDestinationEdit();s.$('destinations').querySelector('[data-dest="pickup"]').click();assert.equal(s.$('payment-section').hidden,false);assert.equal(s.state.destinationId,'pickup');assert.equal(s.state.data.selection.destinationId,'parge');assert.equal(s.focus.at(-1),'flow-title');
});
test('search reset and more expose all shops, keep selection explicit, escape names and announce filters',()=>{
 const s=setup(85);s.ctx.beginDestinationEdit();s.$('parge-reset').click();
 assert.equal(s.$('parge-results').querySelectorAll('[data-shop]').length,40);assert.match(s.$('parge-count').textContent,/86곳 · 40곳/);assert.equal(s.$('parge-more').hidden,false);
 s.$('parge-more').click();assert.equal(s.$('parge-results').querySelectorAll('[data-shop]').length,80);s.$('parge-more').click();assert.equal(s.$('parge-results').querySelectorAll('[data-shop]').length,86);assert.equal(s.$('parge-more').hidden,true);assert.equal(s.state.pargeShop,'수령점 0');
 s.$('parge-tabs').querySelector('[data-region="전라"]').click();assert.equal(s.$('parge-results').querySelectorAll('[data-shop]').length,1);assert.equal(s.$('parge-tabs').querySelector('[data-region="전라"]').getAttribute('aria-pressed'),'true');
 s.$('parge-search').oninput({target:{value:'ㅂㅂ'}});assert.match(s.$('parge-results').textContent,/별빛점/);
 s.state.data.carriers.parge.regions[1].shops[0].name='<img src=x onerror=x>';s.state.query='';s.ctx.renderParge();assert.equal(s.$('parge-results').querySelector('img'),null);assert.match(s.$('parge-results').textContent,/<img/);
 s.$('parge-results').querySelector('[data-shop]').click();assert.equal(s.state.pargeShop,'<img src=x onerror=x>');assert.equal(s.$('destination-summary').hidden,false);
});
test('background hydration preserves a deliberately cleared destination and a new round drops old cancellation state',()=>{
 const s=setup();s.ctx.beginDestinationEdit();s.$('parge-search').oninput({target:{value:'찾는 중'}});
 s.ctx.hydrate(s.state.data,true);assert.equal(s.state.pargeShop,'');assert.equal(s.state.pargeRegion,'');assert.equal(s.state.query,'찾는 중');assert.equal(s.$('cancel-destination').hidden,false);
 const next=structuredClone(s.state.data);next.selection=null;next.submittedAt='';s.ctx.hydrate(next);s.ctx.cancelDestinationEdit();assert.equal(s.state.pargeShop,'');assert.equal(s.state.destinationId,'');assert.equal(s.state.dirty,false);assert.equal(s.$('cancel-destination').hidden,true);
});
test('save failure retains fields and request id, prevents duplicate in-flight input and retries once',async()=>{
 const s=setup(),calls=[];s.state.dirty=true;s.state.payments.v='card';let fail=true,sequence=0,resolve;
 Object.assign(s.ctx,{uuid:()=>`request-${++sequence}`,api:async(path,body)=>{calls.push(structuredClone(body));if(fail)throw Error('연결을 확인해 주세요.');return new Promise(r=>resolve=r)},revisionSync:{publish(){}}});
 vm.runInContext(part('async function save(){','const paymentReport='),s.ctx);s.ctx.render();
 await s.ctx.save();assert.equal(s.state.payments.v,'card');assert.equal(s.state.pargeShop,'수령점 0');assert.equal(s.state.dirty,true);assert.equal(s.$('save-feedback').hidden,false);assert.equal(s.$('submit').textContent,'다시 저장');assert.equal(s.focus.at(-1),'save-feedback');
 fail=false;const pending=s.ctx.save();await s.ctx.save();assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(s.$('submit').disabled,true);
 assert.equal(s.$('change-destination').disabled,true);assert.equal(s.$('parge-search').disabled,true);assert([...s.$('destinations').querySelectorAll('button')].every(b=>b.disabled));
 s.ctx.beginDestinationEdit();assert.equal(s.$('destination-editor').hidden,true,'in-flight save cannot open another draft');
 const data=structuredClone(s.state.data);data.vendors[0].payment.method='card';resolve(data);await pending;
 assert.equal(s.$('save-feedback').hidden,true);assert.equal(s.state.dirty,false);assert.equal(s.state.saveRequestId,null);assert.equal(s.$('submit').parentElement.hidden,true);assert.equal(s.focus.at(-1),'flow-title');
});
test('version conflict offers explicit reload and changed input receives a new retry id',async()=>{
 const s=setup(),calls=[];let sequence=0;
 Object.assign(s.ctx,{uuid:()=>`request-${++sequence}`,api:async(path,body)=>{calls.push(body);throw Object.assign(Error('정보가 변경되었습니다.'),{status:409})},revisionSync:{publish(){}}});
 vm.runInContext(part('async function save(){','const paymentReport='),s.ctx);s.state.dirty=true;s.state.payments.v='card';s.ctx.render();await s.ctx.save();
 assert.equal(s.$('reload-checkout').hidden,false);assert.match(s.$('save-feedback-help').textContent,/최신 정보/);
 s.state.pargeRegion='전라';s.state.pargeShop='별빛점';s.ctx.render();await s.ctx.save();assert.notEqual(calls[0].requestId,calls[1].requestId);
 let loads=0;s.ctx.load=async()=>{loads++;return true};s.ctx.confirm=()=>false;await s.$('reload-checkout').onclick();assert.equal(loads,0);assert.equal(s.state.pargeShop,'별빛점');
 s.ctx.confirm=()=>true;await s.$('reload-checkout').onclick();assert.equal(loads,1);assert.equal(s.$('save-feedback').hidden,true);
});

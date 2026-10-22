'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),work=require('../public/operator-shipping-worklist');
const identity=item=>({key:item.winner_phone,name:item.winner_name,phone:item.winner_phone});
const item=(id,company='A',extra={})=>({id,_platformItemId:id,name:id,company,winner_name:'가상 낙찰자',winner_phone:'01000000003',soldAmountWon:100000,buyer_submitted_at:'2026-10-14',payment_status:'bank_transfer_pending',shipping_type:'배송',shipping_company:'파르게',shipping_region:'서울 (가상점)',shipping_cost:7000,...extra});
const amount=items=>({grandTotal:items.reduce((sum,i)=>sum+i.soldAmountWon+i.shipping_cost,0),totalShipping:items.reduce((sum,i)=>sum+i.shipping_cost,0)});
test('whole-round rows keep each vendor amount and buyer identity separate',()=>{
    const items=[item('a01','A',{shipping_cost:19000}),item('a02'),item('b03','B'),item('a04','A',{winner_phone:'01000000004'})],before=JSON.stringify(items);
    const rows=work.build(items,{identity,amount});assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.key)).size,3);
    assert.deepEqual(rows.filter(r=>r.phone==='01000000003').map(r=>[r.company,r.grandTotal,r.allItems.length]),[['A',226000,3],['B',107000,3]]);
    assert.equal(JSON.stringify(items),before);
});
test('review states are surfaced before unregistered, pending and paid work',()=>{
    const rows=[item('paid','paid',{payment_confirmed_amount:107000}),item('pending','pending'),item('information','information',{buyer_submitted_at:''}),item('reported','reported',{payment_status:'bank_transfer_reported'})];
    const built=work.build(rows,{identity,amount});assert.deepEqual(built.map(r=>r.payment.kind),['review','information','pending','paid']);
    for(const [extra,label] of [[{payment_confirmed_amount:108000},'초과 입금 확인'],[{_checkoutShipment:{cardLinkCancellationRequired:true}},'이전 카드 안내 확인'],[{_checkoutShipment:{shippingChangedAfterReport:true}},'변경된 입금액 확인']])assert.equal(work.paymentState([item('x','A',extra)],107000).label,label);
    assert.equal(work.paymentState([item('x','A',{payment_status:'card_link_pending'})],107000).label,'카드 안내 준비');
});
test('filters count the selected company and search own buyer, company or lot without leaking another vendor lot',()=>{
    const rows=work.build([item('A01'),item('B03','B',{payment_status:'bank_transfer_reported'})],{identity,amount});
    assert.equal(work.select(rows).counts.all,2);assert.equal(work.select(rows,{status:'review'}).rows[0].company,'B');
    const only=work.select(rows,{company:'A',query:'b03'});assert.equal(only.rows.length,0);assert.equal(only.counts.all,1);assert.equal(only.counts.review,0);
    assert.equal(work.select(rows,{query:'낙찰자 0003'}).rows.length,2);
    assert.equal(work.select(rows,{query:'010-0000-0003'}).rows.length,2);
    assert.equal(work.select(rows,{company:'없는 업체'}).rows.length,0);
});
test('cards use native buttons, escaped labels, correct callback and additional balance',()=>{
    const {document}=parseHTML('<html><body></body></html>');let opened;
    const row=work.build([item('a01',`A ' <img src=x>`,{winner_name:'<script>bad</script>',payment_confirmed_amount:100000})],{identity,amount})[0];
    const card=work.card(document,row,{label:i=>i.name,phone:v=>v,onOpen:r=>opened=r});
    assert.equal(card.tagName,'BUTTON');assert.equal(card.getAttribute('aria-controls'),'winner-edit-modal');assert.equal(card.querySelector('script,img'),null);assert.match(card.textContent,/추가 7,000원/);assert.match(card.textContent,/<script>bad<\/script>/);card.click();assert.equal(opened,row);
});

const html=fs.readFileSync(require.resolve('../public/shipping.html'),'utf8');
function page(){
    const {document}=parseHTML(html),opened=[];
    const select=document.getElementById('shipping-work-company');let selected='';Object.defineProperty(select,'value',{get:()=>selected,set:value=>{selected=value;}});
    const source=html.slice(html.indexOf("const shippingWorkFilters={"),html.indexOf('        function renderGrid('));
    const ctx=vm.createContext({document,Option:function(label,value){const o=document.createElement('option');o.textContent=label;o.value=value;return o;},CreoShippingWorklist:work,allItems:[item('a01','A',{shipping_cost:19000}),item('a02'),item('b03','B')],uniqueSellerCompanies:['A','B','No sale'],activeEditorWinner:null,winnerStateMap:{},activeSellerCompany:'',editingShippingVendorId:'',shippingOperation:{channel:{dataAdapter:'platform'}},SHIPPING_DATA:{},CreoOperatorShippingPricing:{calculate:items=>({companies:Object.fromEntries([...new Set(items.map(i=>i.company))].map(company=>[company,items.filter(i=>i.company===company).reduce((sum,i)=>sum+i.shipping_cost,0)]))})},getWinnerIdentity:identity,settlementDiscountFor:items=>({payableAuctionAmount:items.reduce((s,i)=>s+i.soldAmountWon,0),discountAmount:0}),auctionItemWon:i=>i.soldAmountWon,auctionItemLabel:i=>i.name,fmtPhone:x=>x,parseSavedShippingRegion:()=>({region:'서울',hub:'가상점',memo:''}),updateCurrentCompanyBar(){},closeWinnerEditor(){ctx.activeEditorWinner=null;},openWinnerEditor(key){ctx.activeEditorWinner=key;opened.push({key,company:ctx.activeSellerCompany,item:ctx.activeBuyerLinkItem().id})}});
    vm.runInContext(source,ctx);
    vm.runInContext(html.slice(html.indexOf('        function activeBuyerLinkItem('),html.indexOf('        async function openActiveBuyerPage(')),ctx);
    ctx.renderGrid=options=>ctx.renderPlatformShippingGrid(options);
    ctx.populateShippingWorkCompanies();ctx.renderGrid();return {ctx,document,opened};
}
test('page opens all companies without a modal and each vendor card anchors the right item',()=>{
    const f=page(),cards=[...f.document.querySelectorAll('.shipping-work-card')];assert.equal(cards.length,2);assert.equal(f.document.getElementById('shipping-work-tools').hidden,false);assert.equal(f.document.getElementById('company-select-modal').hasAttribute('open'),false);
    cards[1].click();assert.equal(f.opened[0].company,'B');assert.equal(f.opened[0].item,'b03');cards[0].click();assert.equal(f.opened[1].item,'a01');
});
test('page keeps search and status during refresh, supports empty result recovery and registered vendors with no sale',()=>{
    const f=page(),query=f.document.getElementById('shipping-work-query');query.value='missing';query.oninput({target:query});assert.equal(f.document.querySelectorAll('.shipping-work-card').length,0);assert.match(f.document.getElementById('winner-list-container').textContent,/전체 보기/);
    f.ctx.populateShippingWorkCompanies();f.ctx.renderGrid();assert.equal(query.value,'missing');assert.equal(f.document.querySelectorAll('.shipping-work-card').length,0);
    f.document.getElementById('shipping-work-reset').onclick();assert.equal(f.document.querySelectorAll('.shipping-work-card').length,2);
    const select=f.document.getElementById('shipping-work-company');assert.match(select.textContent,/No sale/);select.value='No sale';select.onchange();assert.equal(f.document.querySelectorAll('.shipping-work-card').length,0);
    f.ctx.uniqueSellerCompanies=['A','B'];f.ctx.populateShippingWorkCompanies();f.ctx.renderGrid();assert.equal(f.document.querySelectorAll('.shipping-work-card').length,2);
});
test('after payment refresh the editor stays on its original vendor and item',()=>{
    const f=page();f.document.querySelectorAll('.shipping-work-card')[1].click();const key=f.opened[0].key;
    f.ctx.allItems=f.ctx.allItems.map(i=>i.company==='B'?{...i,payment_status:'paid',payment_confirmed_amount:107000}:i);f.ctx.renderGrid({restoreWinnerKey:key});
    assert.equal(f.opened.at(-1).item,'b03');assert.equal(f.opened.at(-1).company,'B');assert.equal(f.ctx.winnerStateMap[key].payment_confirmed_amount,107000);
    const paid=f.document.querySelector('#shipping-work-filters button[data-status="paid"]');assert.match(paid.textContent,/1/);paid.click();assert.equal(f.document.querySelectorAll('.shipping-work-card').length,1);
});

test('unsaved editor input survives cancelled filter or buyer changes and selecting the same card',()=>{
    const f=page(),cards=f.document.querySelectorAll('.shipping-work-card');cards[0].click();const key=f.opened[0].key;
    f.ctx.operatorShippingDraft=()=>({type:'배송'});f.ctx.winnerStateMap[key].operatorInitialDraft=JSON.stringify({type:'배송'});f.document.getElementById('editor-memo').value='아직 저장하지 않은 메모';let confirms=0;
    f.ctx.confirm=()=>{confirms++;return false};cards[0].click();assert.equal(confirms,0);assert.equal(f.opened.length,1);
    cards[1].click();assert.equal(confirms,1);assert.equal(f.opened.length,1);assert.equal(f.ctx.activeSellerCompany,'A');
    const query=f.document.getElementById('shipping-work-query');query.value='다른 낙찰자';query.oninput({target:query});assert.equal(query.value,'');assert.equal(f.ctx.activeEditorWinner,key);assert.equal(f.document.getElementById('editor-memo').value,'아직 저장하지 않은 메모');
    const select=f.document.getElementById('shipping-work-company');select.value='B';select.onchange();assert.equal(select.value,'');assert.equal(f.ctx.activeSellerCompany,'A');
    f.ctx.confirm=()=>true;select.value='B';select.onchange();assert.equal(f.ctx.activeEditorWinner,null);assert.equal(f.document.querySelectorAll('.shipping-work-card').length,1);
});

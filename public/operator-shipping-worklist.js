(function (root, factory) {
    'use strict';
    const api=factory();
    if(typeof module==='object' && module.exports)module.exports=api;
    else root.CreoShippingWorklist=api;
})(typeof window!=='undefined'?window:globalThis,function(){
    'use strict';
    const filters=[['all','전체'],['review','확인 필요'],['information','수령지 미입력'],['pending','결제 대기'],['paid','결제 완료']];
    const order={review:0,information:1,pending:2,paid:3};
    const text=value=>String(value??'').trim();
    const esc=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function paymentState(items,total) {
        const confirmed=Math.max(0,...items.map(item=>Number(item.payment_confirmed_amount)||0));
        const due=Math.max(0,total-confirmed),rows=items.map(item=>item._checkoutShipment||{});
        if(rows.some(row=>row.cardLinkCancellationRequired))return {kind:'review',label:'이전 카드 안내 확인',confirmed,due};
        if(confirmed>total && total>0)return {kind:'review',label:'초과 입금 확인',confirmed,due};
        if(rows.some(row=>row.shippingChangedAfterReport))return {kind:'review',label:'변경된 입금액 확인',confirmed,due};
        if(items.some(item=>['bank_transfer_reported','card_payment_reported'].includes(item.payment_status)))return {kind:'review',label:'입금·결제 확인 필요',confirmed,due};
        if(total>0 && confirmed>=total)return {kind:'paid',label:'결제 완료',confirmed,due};
        if(!items.every(item=>item.buyer_submitted_at))return {kind:'information',label:confirmed>0?'추가 낙찰 안내':'수령지 미입력',confirmed,due};
        if(due>0 && confirmed>0)return {kind:'pending',label:'추가 결제 대기',confirmed,due};
        if(items.some(item=>item.payment_status==='card_link_pending'))return {kind:'pending',label:'카드 안내 준비',confirmed,due};
        return {kind:'pending',label:'결제 대기',confirmed,due};
    }
    function build(items,{identity,amount}) {
        const buyers=new Map();
        for(const item of items){const who=identity(item);if(!buyers.has(who.key))buyers.set(who.key,{who,items:[]});buyers.get(who.key).items.push(item);}
        const result=[];
        for(const [buyerKey,buyer] of buyers) {
            const companies=new Map();
            for(const item of buyer.items){const company=text(item.company);if(!companies.has(company))companies.set(company,[]);companies.get(company).push(item);}
            for(const [company,ownItems] of companies) {
                const prices=amount(ownItems,buyer.items,company),payment=paymentState(ownItems,prices.grandTotal);
                result.push({key:JSON.stringify([company,buyerKey]),company,name:buyer.who.name,phone:buyer.who.phone,items:ownItems,allItems:buyer.items,companies:[...companies.keys()],...prices,payment,
                    search:[company,buyer.who.name,buyer.who.phone,...ownItems.flatMap(item=>[item.name,item.lotNumber,item.num,item.publicCode,item.attributes?.displayCode])].map(text).join(' ').toLocaleLowerCase('ko-KR')});
            }
        }
        return result.sort((a,b)=>order[a.payment.kind]-order[b.payment.kind] || a.company.localeCompare(b.company,'ko') || a.name.localeCompare(b.name,'ko') || a.key.localeCompare(b.key));
    }
    function select(rows,{company='',status='all',query=''}={}) {
        const scoped=rows.filter(row=>!company || row.company===company);
        const counts=Object.fromEntries(filters.map(([key])=>[key,key==='all'?scoped.length:scoped.filter(row=>row.payment.kind===key).length]));
        const words=text(query).toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
        return {counts,total:scoped.length,rows:scoped.filter(row=>(status==='all'||row.payment.kind===status) && words.every(word=>row.search.includes(word)||row.phone.replace(/\D/g,'').includes(word.replace(/[-\s]/g,''))))};
    }
    function card(document,row,{label,phone,onOpen}) {
        const button=document.createElement('button');button.type='button';button.className='winner-card shipping-work-card';button.dataset.winner=row.key;
        button.setAttribute('aria-controls','winner-edit-modal');button.setAttribute('aria-expanded','false');
        const item=row.items[0],route=item.shipping_type==='직접수령'?'직수령 · '+(item.shipping_region||'장소 확인 필요'):item.shipping_region?((item.shipping_company||'배송')+' · '+item.shipping_region):'수령 정보를 기다리고 있어요';
        button.innerHTML=`<span class="shipping-work-company">${esc(row.company||'업체 미지정')}</span><span class="shipping-work-person"><strong>${esc(row.name)}</strong><span>${esc(phone(row.phone)||'연락처 확인 필요')}</span></span><span class="shipping-work-items">${esc(row.items.map(label).join(' · '))}</span><span class="shipping-work-route">${esc(route.replace(/\s*\[(?:메모|요청):[\s\S]*\]\s*$/,''))}</span><span class="shipping-work-bottom"><span class="shipping-work-status is-${row.payment.kind}">${esc(row.payment.label)}</span><strong>${row.payment.confirmed>0&&row.payment.due>0?'추가 ':''}${Number(row.payment.confirmed>0&&row.payment.due>0?row.payment.due:row.grandTotal).toLocaleString('ko-KR')}원</strong></span>${row.companies.length>1?`<span class="shipping-work-combined">다른 업체 ${row.companies.length-1}곳과 합배송</span>`:''}`;
        button.onclick=()=>onOpen(row);return button;
    }
    return {filters,build,select,card,paymentState};
});

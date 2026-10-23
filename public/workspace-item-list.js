(function(root,factory){
    'use strict';const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoWorkspaceItemList=api;
})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    const text=value=>String(value??'').trim();
    const esc=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const states=[['','전체 상태'],['waiting','대기'],['live','진행 중'],['sold','낙찰'],['passed','유찰'],['cancelled','취소'],['other','상태 확인 필요']];
    const stateOf=item=>states.some(([key])=>key&&key===item.status)?item.status:'other';
    function select(context,filters={}){
        const vendors=new Map((context.vendors||[]).map(v=>[v.id,v.name]));
        const words=text(filters.query).toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
        return (context.items||[]).filter(item=>{
            if(filters.vendor&&item.vendorId!==filters.vendor)return false;
            if(filters.status&&stateOf(item)!==filters.status)return false;
            const search=[item.name,item.lotNumber,vendors.get(item.vendorId)||item.vendorName,item.category,context.groupName?.(item.groupId)||item.teamName,context.buyerName?.(item.winnerName)].map(text).join(' ').toLocaleLowerCase('ko-KR');
            return words.every(word=>search.includes(word));
        }).slice().sort((a,b)=>(Number(a.lotNumber)||0)-(Number(b.lotNumber)||0));
    }
    function table(context,filters={}){
        const rows=select(context,filters),items=context.items||[],vendors=new Map((context.vendors||[]).map(v=>[v.id,v.name]));
        if(!rows.length)return `<div class="workspace-item-empty"><strong>${items.length?'조건에 맞는 개체가 없어요':'아직 편성된 개체가 없어요'}</strong><p>${items.length?'검색어나 업체·상태 조건을 바꿔 주세요.':'업체 출품을 검토하거나 개체를 추가해 주세요.'}</p></div>`;
        const group=items.some(i=>context.groupName?.(i.groupId)||i.teamName);
        const cell=(label,content,kind)=>`<td role="cell" class="item-cell item-${kind}"><span class="item-cell-label" aria-hidden="true">${esc(label)}</span><div>${content}</div></td>`;
        const headers=['순서','개체 · 업체',...(group?[context.groupLabel||'그룹']:[]),'상태','낙찰 내역','관리'];
        return `<table class="workspace-item-table" role="table"><caption class="item-sr-only">선택한 회차의 경매 진행 순서</caption><thead role="rowgroup"><tr role="row">${headers.map(label=>`<th scope="col" role="columnheader">${esc(label)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(item=>{
            const state=stateOf(item),name=text(item.name)||'이름 미등록',vendor=vendors.get(item.vendorId)||item.vendorName||'업체 미지정';
            const result=item.soldPrice?`${esc(context.money(item.soldPrice))}원`:'—';
            const buyer=context.buyerName?.(item.winnerName)||'';
            return `<tr role="row" data-item-id="${esc(item.id)}">${cell('진행 순서',`<b>${esc(item.lotNumber||'—')}</b>`,'order')}<th scope="row" role="rowheader" class="item-identity"><strong>${esc(name)}</strong><span>${esc(vendor)}</span>${item.category?`<small>${esc(item.category)}</small>`:''}</th>${group?cell(context.groupLabel||'그룹',esc(context.groupName?.(item.groupId)||item.teamName||'—'),'group'):''}${cell('상태',`<span class="item-state is-${state}">${esc(context.statusName(item.status))}</span>`,'status')}${cell('낙찰 내역',`<b>${result}</b>${buyer?`<span class="item-buyer">${esc(buyer)}</span>`:''}`,'result')}${cell('관리',`<div role="group" aria-label="${esc(name)} 관리">${context.actions('items',item.id)}</div>`,'actions')}</tr>`;
        }).join('')}</tbody></table>`;
    }
    function create({document,onChange}){
        const $=id=>document.getElementById(id),host=$('item-list-tools');
        let context={items:[],vendors:[]},scope='',filters={query:'',vendor:'',status:''};
        host.innerHTML='<div class="item-list-fields"><label for="item-list-query">개체 찾기<input id="item-list-query" type="search" placeholder="번호 · 업체 · 낙찰자" autocomplete="off"></label><label for="item-list-vendor">업체<select id="item-list-vendor"></select></label><label for="item-list-status">경매 상태<select id="item-list-status">'+states.map(([key,label])=>`<option value="${key}">${label}</option>`).join('')+'</select></label></div><div class="item-list-feedback"><p id="item-list-count" role="status" aria-live="polite"></p><button type="button" class="btn" id="item-list-reset" hidden>전체 개체 보기</button></div>';
        function feedback(){
            $('item-list-count').textContent=select(context,filters).length+' / '+context.items.length+'개체 · 진행 순서대로 표시';
            $('item-list-reset').hidden=!filters.query&&!filters.vendor&&!filters.status;
        }
        function changed(){feedback();onChange(table(context,filters));}
        $('item-list-query').oninput=()=>{filters.query=$('item-list-query').value;changed();};
        $('item-list-vendor').onchange=()=>{filters.vendor=$('item-list-vendor').value;changed();};
        $('item-list-status').onchange=()=>{filters.status=$('item-list-status').value;changed();};
        $('item-list-reset').onclick=()=>{filters={query:'',vendor:'',status:''};$('item-list-query').value='';$('item-list-vendor').value='';$('item-list-status').value='';changed();$('item-list-query').focus();};
        return {render(next){
            context=next;
            if(scope!==next.channelId){scope=next.channelId;filters={query:'',vendor:'',status:''};$('item-list-query').value='';$('item-list-status').value='';}
            const companies=new Map(next.vendors.map(v=>[v.id,v.name]));
            next.items.forEach(item=>{if(item.vendorId&&!companies.has(item.vendorId))companies.set(item.vendorId,item.vendorName||'업체 정보 확인 필요');});
            if(filters.vendor&&!companies.has(filters.vendor))filters.vendor='';
            $('item-list-vendor').innerHTML='<option value="">전체 업체</option>'+[...companies].sort((a,b)=>text(a[1]).localeCompare(text(b[1]),'ko')).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
            $('item-list-vendor').value=filters.vendor;
            feedback();return table(context,filters);
        }};
    }
    return {select,table,create};
});

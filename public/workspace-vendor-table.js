(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.CreoWorkspaceVendorTable=api;
})(typeof globalThis==='object'?globalThis:this,function(){
    'use strict';
    const REGIONS=['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남'];
    const LEGACY_REGIONS=[0,0,1,1,2,2,3,4];
    const text=value=>String(value??'').trim();
    const escape=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function regionForVendor(vendor){
        const region=text(vendor.broadcastRegion);
        if(['서울','인천','서울+인천','서울/인천'].includes(region))return REGIONS[0];
        if(REGIONS.includes(region))return region;
        const legacy=vendor.bookingRegion;
        if(legacy!==null&&legacy!==undefined&&text(legacy)!==''&&Number.isInteger(Number(legacy)))return REGIONS[LEGACY_REGIONS[Number(legacy)]]||'';
        return '';
    }
    function contactForVendor(vendor){
        if(text(vendor.manager))return {name:text(vendor.manager),source:'manager'};
        if(text(vendor.bankHolder))return {name:text(vendor.bankHolder),source:'bankHolder'};
        return {name:'',source:''};
    }
    function formatPhone(value){
        const phone=text(value),digits=phone.replace(/[\s()-]/g,'');
        if(/^01\d\d{7,8}$/.test(digits))return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');
        if(/^02\d{7,8}$/.test(digits))return digits.replace(/^(02)(\d{3,4})(\d{4})$/,'$1-$2-$3');
        if(/^0[3-6]\d\d{7,8}$/.test(digits))return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');
        return phone;
    }
    function visibleVendors(vendors,national){
        const rows=(vendors||[]).filter(v=>!national||v.active!==false);
        if(!national)return rows;
        const rank=v=>{const index=REGIONS.indexOf(regionForVendor(v));return index<0?REGIONS.length:index;};
        return rows.sort((a,b)=>rank(a)-rank(b)||text(a.name).localeCompare(text(b.name),'ko'));
    }
    const missing=()=>'<span class="vendor-missing">미등록</span>';
    const valueOrMissing=value=>text(value)?escape(value):missing();
    function cell(label,content,kind){
        return `<td class="vendor-cell vendor-${kind}" role="cell"><span class="vendor-mobile-label" aria-hidden="true">${escape(label)}</span><div class="vendor-cell-content">${content}</div></td>`;
    }
    function render({vendors=[],channelId='',vendorLabel='업체',groupLabel='그룹',groupName=()=>'',actions=()=>''}={}){
        const national=channelId==='national-cre',groupHeading=national?'지역':groupLabel,rows=visibleVendors(vendors,national);
        const headers=[vendorLabel,groupHeading,'담당자','연락처','주소','계좌번호','관리'];
        const hasFallback=rows.some(v=>contactForVendor(v).source==='bankHolder');
        const caption=[national?'방송 참여 지역순으로 표시합니다.':'업체 연락처와 정산 정보를 확인합니다.',hasFallback?'담당자 미등록 시 예금주 이름을 구분해 표시합니다.':''].filter(Boolean).join(' ');
        return `<table class="vendor-directory" role="table"><caption>${escape(caption)}</caption><colgroup><col class="vendor-col-name"><col class="vendor-col-region"><col class="vendor-col-contact"><col class="vendor-col-phone"><col class="vendor-col-address"><col class="vendor-col-bank"><col class="vendor-col-actions"></colgroup><thead role="rowgroup"><tr role="row">${headers.map(label=>`<th scope="col" role="columnheader">${escape(label)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.length?rows.map(v=>{
            const contact=contactForVendor(v),region=national?regionForVendor(v):groupName(v.groupId);
            const contactMarkup=contact.name?`<span class="vendor-contact-name">${escape(contact.name)}</span>${contact.source==='bankHolder'?'<small class="vendor-detail">예금주 기준</small>':''}`:missing();
            const bankMarkup=`${text(v.bankName)?`<span class="vendor-bank-name">${escape(v.bankName)}</span>`:''}<span class="vendor-account">${valueOrMissing(v.bankAccount)}</span>${text(v.bankHolder)?`<small class="vendor-detail">예금주 ${escape(v.bankHolder)}</small>`:''}`;
            return `<tr class="vendor-record" role="row"><th scope="row" role="rowheader" class="vendor-company"><strong>${escape(v.name)||'이름 미등록'}</strong>${text(v.code)?`<small class="vendor-detail">${escape(v.code)}</small>`:''}</th>${cell(groupHeading,region?`<span class="vendor-region-name">${escape(region)}</span>`:missing(),'region')}${cell('담당자',contactMarkup,'contact')}${cell('연락처',valueOrMissing(formatPhone(v.phone)),'phone')}${cell('주소',valueOrMissing(v.address),'address')}${cell('계좌번호',bankMarkup,'bank')}${cell('관리',actions('vendors',v.id),'actions')}</tr>`;
        }).join(''):`<tr class="vendor-empty-row" role="row"><td colspan="7" class="empty">등록된 ${escape(vendorLabel)}가 없습니다.</td></tr>`}</tbody></table>`;
    }
    return {REGIONS,regionForVendor,contactForVendor,formatPhone,visibleVendors,render};
});

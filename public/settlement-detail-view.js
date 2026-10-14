(function(root){'use strict';
 const money=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR')+'원';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function fees(row){if(!row?.feeItems)return '';
  return `<div class="settlement-pair"><span>출품 수수료</span><b>${money(row.entryFeeAmount)}</b></div><div class="settlement-pair"><span>낙찰 수수료</span><b>${money(row.commissionAmount)}</b></div><div class="settlement-pair"><span>낙찰자 부담 배송비</span><b>${money(row.shippingAmount)}</b></div>${row.shippingSupportAmount?`<div class="settlement-pair"><span>배송비 지원 · 정산금 제외</span><b>${money(row.shippingSupportAmount)}</b></div>`:''}<details class="settlement-history"><summary>개체별 수수료 · ${row.feeItems.length}마리</summary>${row.feeItems.map(item=>`<div class="settlement-fee-item"><div class="settlement-pair"><b>${escape(item.code)}</b><b>${item.event?'수수료 면제':money(item.totalAmount)}</b></div><div class="settlement-muted">${item.event?'이벤트':({waiting:'출품 대기',live:'진행',sold:'낙찰',passed:'유찰'}[item.status]||'출품')}${item.event?'':` · 출품 ${money(item.entryFee)} + 낙찰 ${money(item.commission)}`}</div></div>`).join('')}</details>`;
 }
 root.CreoSettlementDetail={fees};
})(typeof window==='object'?window:globalThis);

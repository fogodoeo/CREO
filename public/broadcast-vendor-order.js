(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoVendorOrder=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const key=value=>String(value||'').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function names(value){const seen=new Set();return String(value||'').split(/\r?\n/).map(s=>s.trim().slice(0,60)).filter(s=>{const id=key(s);if(!id||seen.has(id))return false;seen.add(id);return true}).slice(0,12)}
 function model(channel,state,items){
  const first=names(state.page3VendorOrder),second=names(state.page3VendorOrderSecond),parts=[first,second.length?second:[...first].reverse()];
  // Never infer the current vendor from totals, list position, or the previous show's sale.
  const item=(items||[]).find(i=>i.id===state.activeItemId&&(!i.channelId||i.channelId===channel.id)&&!i.auctionArchiveId);
  const code=String(item?.attributes?.displayNumber||item?.name||'').trim().toUpperCase();
  const part=/^A\d/.test(code)?0:/^B\d/.test(code)?1:-1;
  const active=item&&['live','sold'].includes(state.mode)&&part>=0?key(item.vendorName):'';
  return parts.map((rows,index)=>({part:index+1,rows:rows.map((name,order)=>({name,order:order+1,current:index===part&&!!active&&key(name)===active}))}));
 }
 function render(channel,state,items){
  if(state.page3On===false)return '';
  const parts=model(channel,state,items),body=parts.some(p=>p.rows.length)?`<div class="vendor-order-columns">${parts.map(p=>`<section class="vendor-order-part"><h2>${p.part}부</h2><ol style="--order-count:${Math.max(1,p.rows.length)}">${p.rows.map(r=>`<li${r.current?' class="is-current" aria-current="step"':''}><span class="vendor-order-number">${String(r.order).padStart(2,'0')}</span><strong>${escape(r.name)}</strong><span class="vendor-order-status">${r.current?'진행 중':''}</span></li>`).join('')}</ol></section>`).join('')}</div>`:'<p class="vendor-order-empty">참여업체 순서를 등록해 주세요</p>';
  return `<section class="layer" data-page3-renderer="vendor-order"><div class="board vendor-order-board"><header class="vendor-order-header"><h1>참여업체 진행 순서</h1><span>1부 → 2부</span></header>${body}</div></section>`;
 }
 return Object.freeze({names,model,render});
});

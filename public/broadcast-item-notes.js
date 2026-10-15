(function(root){
  'use strict';
  function text(...values){
    return [...new Set(values.map(value=>String(value??'').replace(/\s+/g,' ').trim())
      .filter(value=>value&&!['none','null','undefined'].includes(value.toLowerCase())))].join(' · ');
  }
  const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function markup(...values){const note=text(...values);return note?`<div class="broadcast-item-note"><span>${escape(note)}</span></div>`:'';}
  function pricingTerms(item={},pricing={}){
    const checklist=String(item.attributes?.checklist||item.checklist||'');
    if(/(?:^|\|)\s*sale_mode\s*:\s*(?:quiz|buy_now)\s*(?:\||$)/i.test(checklist))return [];
    const terms=[],start=Number(item.startPrice),unit=Number(pricing.bidUnitManwon);
    const amount=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:4});
    if(Number.isFinite(start)&&start>0)terms.push(`시작가 ${amount(start/10000)}만원`);
    if(Number.isFinite(unit)&&unit>0&&unit<=999999)terms.push(`입찰단위 ${amount(unit)}만원`);
    return terms;
  }
  let current=null,observer=null;
  function measure(){
    if(!current?.isConnected)return;
    const travel=Math.max(0,current.firstElementChild.scrollWidth-current.clientWidth);
    current.style.setProperty('--note-travel',`-${travel}px`);
    current.style.setProperty('--note-duration',`${Math.max(8,travel/45+6)}s`);
    current.dataset.overflow=travel>1?'1':'0';
  }
  function hydrate(container){
    const next=container.querySelector('.broadcast-item-note');
    if(next!==current){observer?.disconnect();current=next;if(next&&root.ResizeObserver){observer=new root.ResizeObserver(measure);observer.observe(next);observer.observe(next.firstElementChild);}}
    measure();
  }
  if(root.document)root.document.fonts?.ready.then(measure);
  const api={text,markup,pricingTerms,hydrate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CreoBroadcastItemNotes=api;
})(typeof window==='object'?window:globalThis);

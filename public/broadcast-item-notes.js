(function(root){
  'use strict';
  function text(...values){
    return [...new Set(values.map(value=>String(value??'').replace(/\s+/g,' ').trim())
      .filter(value=>value&&!['none','null','undefined'].includes(value.toLowerCase())))].join(' · ');
  }
  const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function markup(...values){const note=text(...values);return note?`<div class="broadcast-item-note"><span>${escape(note)}</span></div>`:'';}
  function itemText(item={},checklist={}){
    const description=text(checklist.memo,item.note);
    const morph=text(checklist.morph)||text(item.attributes?.entry_traits?.morph)||text(item.category);
    // Treat spacing and the two common probability spellings as the same text.
    const key=value=>value.normalize('NFKC').toLowerCase().replace(/헷\s*(\d+(?:\.\d+)?)\s*%?/g,'$1헷').replace(/[\s%]+/g,'');
    return text(morph&&!key(description).includes(key(morph))?morph:'',description);
  }
  function pricingTerms(item={},pricing={}){
    const checklist=String(item.attributes?.checklist||item.checklist||'');
    if(/(?:^|\|)\s*sale_mode\s*:\s*(?:quiz|buy_now)\s*(?:\||$)/i.test(checklist))return [];
    const terms=[],start=Number(item.startPrice),unit=Number(pricing.bidUnitManwon);
    const amount=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:4});
    if(Number.isFinite(start)&&start>0)terms.push(`시작가 ${amount(start/10000)}만원`);
    if(Number.isFinite(unit)&&unit>0&&unit<=999999)terms.push(`입찰단위 ${amount(unit)}만원`);
    return terms;
  }
  function pricingMarkup(item,pricing){const value=text(...pricingTerms(item,pricing));return value?`<div class="broadcast-item-pricing"><span>${escape(value)}</span></div>`:'';}
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
  const api={text,markup,itemText,pricingTerms,pricingMarkup,hydrate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CreoBroadcastItemNotes=api;
})(typeof window==='object'?window:globalThis);

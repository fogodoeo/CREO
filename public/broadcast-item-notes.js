(function(root){
  'use strict';
  function text(...values){
    return [...new Set(values.map(value=>String(value??'').replace(/\s+/g,' ').trim())
      .filter(value=>value&&!['none','null','undefined'].includes(value.toLowerCase())))].join(' · ');
  }
  const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function markup(...values){const note=text(...values);return note?`<div class="broadcast-item-note"><span>${escape(note)}</span></div>`:'';}
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
  const api={text,markup,hydrate};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CreoBroadcastItemNotes=api;
})(typeof window==='object'?window:globalThis);

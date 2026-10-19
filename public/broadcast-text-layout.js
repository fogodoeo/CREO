(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.CreoBroadcastTextLayout=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const slots=new Set(['p2-info','p2-progress','p2-bidders','p2-price','p2-sold']);
 const supports=(theme,slot)=>theme==='national-stage'&&slots.has(slot);
 const automatic=(theme,slot,value)=>supports(theme,slot)&&value?.autoWidth!==false;
 let infoElement=null,infoObserver=null;
 function fitInfoRows(element){
  for(const row of element.querySelectorAll?.('.national-item-detail .vendor-tag,.national-item-detail .item-inline-traits')||[]){
   row.style.setProperty('--national-row-fit','1');
   if(!row.clientWidth||row.scrollWidth<=row.clientWidth)continue;
   let low=0,high=1;
   for(let i=0;i<12;i++){
    const scale=(low+high)/2;row.style.setProperty('--national-row-fit',String(scale));
    if(row.scrollWidth>row.clientWidth)high=scale;else low=scale;
   }
   row.style.setProperty('--national-row-fit',String(low));
  }
 }
 function watchInfo(element){
  fitInfoRows(element);
  if(infoElement===element||typeof ResizeObserver!=='function')return;
  infoObserver?.disconnect();infoElement=element;
  let width=element.clientWidth;
  const observer=new ResizeObserver(()=>{
   if(!element.isConnected){observer.disconnect();return;}
   if(element.clientWidth!==width){width=element.clientWidth;fitInfoRows(element);}
  });
  observer.observe(element);infoObserver=observer;
  element.ownerDocument?.fonts?.ready.then(()=>{if(element.isConnected)fitInfoRows(element);});
 }
 function apply(element,theme,slot,value){
  if(!supports(theme,slot)){delete element.dataset.textAutoWidth;element.style?.removeProperty('--text-anchor-y');return;}
  element.dataset.textAutoWidth=automatic(theme,slot,value)?'1':'0';
  const y=Number(value?.y);element.style?.setProperty('--text-anchor-y',`${Number.isFinite(y)?Math.max(0,Math.min(96,y)):0}vh`);
  if(slot==='p2-info')watchInfo(element);
 }
 return Object.freeze({supports,automatic,apply,fitInfoRows});
});

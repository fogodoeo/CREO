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
 function apply(element,theme,slot,value){
  if(!supports(theme,slot)){delete element.dataset.textAutoWidth;element.style?.removeProperty('--text-anchor-y');return;}
  element.dataset.textAutoWidth=automatic(theme,slot,value)?'1':'0';
  const y=Number(value?.y);element.style?.setProperty('--text-anchor-y',`${Number.isFinite(y)?Math.max(0,Math.min(96,y)):0}vh`);
 }
 return Object.freeze({supports,automatic,apply});
});

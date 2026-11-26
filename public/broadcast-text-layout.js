(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.CreoBroadcastTextLayout=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const slots=new Set(['p2-info','p2-progress','p2-bidders','p2-price','p2-sold']);
 const nationalLayout=theme=>['national-stage','clab-boxing'].includes(theme);
 const separatedInfo=theme=>['national-stage','clab-boxing','clab-gallery','departure-blue'].includes(theme);
 const supports=(theme,slot)=>(nationalLayout(theme)&&slots.has(slot))||(separatedInfo(theme)&&slot==='p2-info');
 const automatic=(theme,slot,value)=>supports(theme,slot)&&value?.autoWidth!==false;
 const rightAnchored=(theme,slot)=>separatedInfo(theme)&&slot==='p2-info';
 const rightEdge=(value,theme='national-stage')=>Number.isFinite(Number(value?.rightEdge))&&value?.rightEdge!==null?Math.max(4,Math.min(120,Number(value.rightEdge))):!nationalLayout(theme)&&Number.isFinite(value?.x)&&Number.isFinite(value?.width)?Math.max(4,Math.min(120,value.x+value.width)):98;
 function move(theme,slot,value,dx,dy){return {...value,...(rightAnchored(theme,slot)?{rightEdge:rightEdge(value,theme)+dx}:{x:value.x+dx}),y:value.y+dy};}
 function resize(theme,slot,value,dx,dy){const anchored=rightAnchored(theme,slot);return {...value,...(anchored?{rightEdge:rightEdge(value,theme)}:{}),width:value.width+(anchored?-dx:dx),height:value.height+dy};}
 let infoElement=null,infoObserver=null;
 function fitInfoRows(element){
  // Notes must never make the sex, weight or hatch date smaller.
  for(const row of element.querySelectorAll?.('.national-item-detail .item-inline-traits')||[])row.style.setProperty('--national-row-fit','1');
  // Notes wrap at their original size; shrinking them hides important details.
  const rows=element.querySelectorAll?.('.item-inline-identity .vendor-tag')||[];
  for(const row of rows)row.style.setProperty('--national-row-fit','1');
  for(const row of rows){
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
  const container=element.parentElement;
  let width=element.clientWidth,containerWidth=container?.clientWidth;
  const observer=new ResizeObserver(()=>{
   if(!element.isConnected){observer.disconnect();return;}
   if(element.clientWidth===width&&container?.clientWidth===containerWidth)return;
   fitInfoRows(element);
   width=element.clientWidth;containerWidth=container?.clientWidth;
  });
  observer.observe(element);
  if(container)observer.observe(container);
  infoObserver=observer;
  element.ownerDocument?.fonts?.ready.then(()=>{if(element.isConnected)fitInfoRows(element);});
 }
 function apply(element,theme,slot,value){
  if(!supports(theme,slot)){delete element.dataset.textAutoWidth;element.style?.removeProperty('--text-anchor-y');element.style?.removeProperty('--text-anchor-right');return;}
  element.dataset.textAutoWidth=automatic(theme,slot,value)?'1':'0';
  const y=Number(value?.y);element.style?.setProperty('--text-anchor-y',`${Number.isFinite(y)?Math.max(0,Math.min(96,y)):0}vh`);
  if(rightAnchored(theme,slot))element.style?.setProperty('--text-anchor-right',`${rightEdge(value,theme)}%`);
  if(slot==='p2-info')watchInfo(element);
 }
 return Object.freeze({supports,separatedInfo,automatic,rightAnchored,rightEdge,move,resize,apply,fitInfoRows});
});

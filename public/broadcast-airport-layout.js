(function(){
 'use strict';
 const theme='departure-blue';let scheduled=false;
 function apply(stage){
  if(!stage)return;
  for(const el of stage.querySelectorAll('[data-airport-clamped]')){el.style.removeProperty('left');el.style.removeProperty('top');delete el.dataset.airportClamped;}
  if(document.body.dataset.broadcastTheme!==theme){for(const el of stage.querySelectorAll('[data-airport-fit]')){el.style.removeProperty('--airport-fit');delete el.dataset.airportFit;delete el.dataset.airportOverflow;}return;}
  const canvas=stage.getBoundingClientRect();stage.style.setProperty('--airport-unit',canvas.width/1920+'px');
  const roots=[...stage.querySelectorAll('.host-card,.item-progress,.item-copy,.live-bid-row:not(.is-exiting),.simple-ranking,.ticker,.studio-plate,.price-card,.sold-notice,.standby-note')];
  for(const root of roots){
   if(!root.getClientRects().length||getComputedStyle(root).visibility==='hidden')continue;
   root.dataset.airportFit='1';root.style.setProperty('--airport-fit','1');
   const isInfo=root.matches('.item-copy');
   if(isInfo){const right=parseFloat(root.style.getPropertyValue('--text-anchor-right'));if(Number.isFinite(right))root.style.setProperty('--text-anchor-right',Math.min(98,right)+'%');}
   // Legacy saved boxes may slightly cross a canvas edge. Clamp rendering only;
   // never rewrite saved layout coordinates or shrink text to fix a bad anchor.
   if(!isInfo&&root.dataset.layoutCustom==='1'){
    root.dataset.airportClamped='1';
    const w=root.getBoundingClientRect().width,h=root.getBoundingClientRect().height;
    const x=parseFloat(root.style.getPropertyValue('--layout-x'))/100*canvas.width,y=parseFloat(root.style.getPropertyValue('--layout-y'))/100*canvas.height;
    if(Number.isFinite(x))root.style.setProperty('left',Math.max(0,Math.min(x,canvas.width-w-canvas.width*.015))+'px','important');
    if(Number.isFinite(y))root.style.setProperty('top',Math.max(0,Math.min(y,canvas.height-h-canvas.height*.015))+'px','important');
   }
   let limitBottom=isInfo?canvas.top+canvas.height*.83:canvas.bottom-canvas.height*.015;
   if(isInfo){const r=root.getBoundingClientRect();for(const other of stage.querySelectorAll('.parent-photos,.item-photo,.banner-frame,.ticker')){const o=other.getBoundingClientRect();if(getComputedStyle(other).visibility!=='hidden'&&o.width&&o.height&&o.top>r.top&&o.left<r.right&&o.right>r.left)limitBottom=Math.min(limitBottom,o.top-12*canvas.width/1920);}}
   const fits=()=>{
    const r=root.getBoundingClientRect();
    if(r.right>canvas.right+1||r.bottom>limitBottom+1||root.scrollWidth>root.clientWidth+1||(!isInfo&&root.scrollHeight>root.clientHeight+1))return false;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const t of range.getClientRects())if(t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>Math.min(r.bottom,limitBottom)+1)return false;}
    return true;
   };
   if(!fits()){let low=.1,high=1;for(let i=0;i<11;i++){const mid=(low+high)/2;root.style.setProperty('--airport-fit',String(mid));if(fits())low=mid;else high=mid;}root.style.setProperty('--airport-fit',String(low));}
   root.dataset.airportOverflow=String(!fits());
  }
  const bids=roots.filter(e=>e.matches('.live-bid-row'));const bidFit=Math.min(1,...bids.map(e=>Number(e.style.getPropertyValue('--airport-fit'))||1));
  for(const row of bids)row.style.setProperty('--airport-fit',String(bidFit));
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply(document.getElementById('stage'));});}
 window.CreoAirportLayout={apply,schedule};
 window.addEventListener('DOMContentLoaded',()=>{const stage=document.getElementById('stage');if(!stage)return;new MutationObserver(schedule).observe(stage,{childList:true,subtree:true,characterData:true});new ResizeObserver(schedule).observe(stage);document.fonts?.ready.then(schedule);schedule();});
})();

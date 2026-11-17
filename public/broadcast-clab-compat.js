(function(){
 'use strict';
 let scheduled=false;
 function fitHosts(stage){
  if(!stage||!['clab-gallery','departure-blue'].includes(document.body.dataset.broadcastTheme))return;
  for(const panel of stage.querySelectorAll('.host-card')){
   const content=panel.querySelector('strong');if(!content||!panel.clientWidth)continue;
   panel.style.setProperty('--clab-host-fit','1');
   const fits=()=>{
    const box=panel.getBoundingClientRect(),style=getComputedStyle(panel),unit=box.width/panel.offsetWidth;
    const left=box.left+parseFloat(style.paddingLeft)*unit,right=box.right-parseFloat(style.paddingRight)*unit;
    const top=box.top+parseFloat(style.paddingTop)*unit,bottom=box.bottom-parseFloat(style.paddingBottom)*unit;
    const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
     if(!node.textContent.trim())continue;
     const range=document.createRange();range.selectNodeContents(node);
     for(const r of range.getClientRects())if(r.left<left-1||r.right>right+1||r.top<top-1||r.bottom>bottom+1)return false;
    }
    return true;
   };
   if(!fits()){
    let low=.1,high=1;
    for(let i=0;i<12;i++){const mid=(low+high)/2;panel.style.setProperty('--clab-host-fit',String(mid));if(fits())low=mid;else high=mid;}
    panel.style.setProperty('--clab-host-fit',String(low));
   }
   panel.dataset.clabHostOverflow=String(!fits());
  }
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;fitHosts(document.getElementById('stage'));});}
 window.CreoClabCompat={fitHosts,schedule};
 window.addEventListener('DOMContentLoaded',()=>{
  const stage=document.getElementById('stage');if(!stage)return;
  new MutationObserver(schedule).observe(stage,{childList:true,subtree:true,characterData:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(stage);
  window.addEventListener('resize',schedule);
  if(document.fonts){document.fonts.ready.then(schedule);document.fonts.addEventListener('loadingdone',schedule);}
  schedule();
 });
})();

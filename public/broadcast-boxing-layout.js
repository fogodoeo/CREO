(function(){
 'use strict';
 // Reuse the existing host glyph measurement, after fonts and scene updates.
 let queued=false;
 function fit(){
  queued=false;if(document.body.dataset.broadcastVariant!=='clab-boxing')return;
  const stage=document.getElementById('stage');if(!stage)return;
  window.CreoClabCompat?.fitHosts(stage);
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(fit)}}
 window.addEventListener('DOMContentLoaded',()=>{
  const stage=document.getElementById('stage');if(!stage)return;
  new MutationObserver(schedule).observe(stage,{childList:true,subtree:true,characterData:true});
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(stage);
  window.addEventListener('resize',schedule);document.fonts?.ready.then(schedule);schedule();
 });
})();

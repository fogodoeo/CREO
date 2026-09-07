(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBannerMedia=api})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function createSwapper(prepare){
  const pending=new WeakMap();
  const discard=media=>{if(media.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load()}};
  const swap=function(current,next,source,commit){
   if(pending.get(current)?.source===source){discard(next);return}
   const ticket={source};pending.set(current,ticket);
   Promise.resolve().then(()=>prepare(next)).then(()=>{
    if(pending.get(current)!==ticket||!current.isConnected){discard(next);return}
    commit();pending.delete(current);
   }).catch(()=>{discard(next);if(pending.get(current)===ticket)pending.delete(current)});
  };swap.cancel=current=>pending.delete(current);return swap;
 }
 function prepare(media){
  if(media.tagName==='IMG')return media.decode();
  if(media.tagName!=='VIDEO')return Promise.resolve();
  if(media.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const done=error=>{clearTimeout(timer);media.removeEventListener('loadeddata',ready);media.removeEventListener('error',failed);error?reject(error):resolve()};
   const ready=()=>done(),failed=()=>done(new Error('banner unavailable'));
   const timer=setTimeout(failed,15000);media.addEventListener('loadeddata',ready,{once:true});media.addEventListener('error',failed,{once:true});media.preload='auto';media.load();
  });
 }
 const warmed=new Map();
 function warm(url){if(!url||warmed.has(url)||typeof Image==='undefined')return;const image=new Image();image.src=url;warmed.set(url,image);image.decode().catch(()=>warmed.delete(url));if(warmed.size>12)warmed.delete(warmed.keys().next().value)}
 return {createSwapper,prepare,warm};
});

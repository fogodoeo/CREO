(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBroadcastStandby=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Broadcast mode is authoritative. A selected/stale item cannot reveal a waiting lot.
 function view(state={},items=[],channelId=''){
  if(!['live','sold'].includes(state.mode))return {phase:'standby',item:null,key:''};
  const candidates=items.filter(item=>!item.channelId||item.channelId===channelId);
  const live=candidates.filter(item=>item.status==='live');
  const item=state.activeItemId?candidates.find(item=>item.id===state.activeItemId):(state.mode==='live'&&live.length===1?live[0]:null);
  return item?{phase:state.mode,item,key:channelId+':'+item.id}:{phase:'standby',item:null,key:''};
 }
 function shouldReveal(previous,current){return Boolean(previous&&current.phase==='live'&&(previous.phase!=='live'||previous.key!==current.key));}
 function markup(){return `<section class="standby-note mystery-card" aria-label="다음 개체 공개 대기"><div class="mystery-orbit" aria-hidden="true"><svg viewBox="0 0 320 220"><path d="M245 31c-35-3-54 23-73 41-22 6-37 23-48 46-11 24-30 33-55 26-22-7-32-22-20-38-24 4-32 22-21 42 17 32 61 39 88 19 22-16 35-20 52-15 18 4 35-11 48-25 13-13 28-16 37-29 14-5 24-15 20-26 18-8 26-24 21-36-14-5-28-6-49-5Z"/><path d="m189 86-25-32-23-4m70 68 24 32 24 3m-96-31-32-31-26 4m42 49 4 30-20 19" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="m142 50-7-13m6 13-17 4m-19 41-14-9m14 9-12 10m166 48 10-12m-10 12 14 8m-142 32-14-4m14 4-3 15" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg><strong>???</strong></div><span class="standby-caption">다음 개체</span></section>`;}
 return Object.freeze({view,shouldReveal,markup});
});

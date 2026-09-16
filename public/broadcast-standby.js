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
 function markup(){return '';}
 return Object.freeze({view,shouldReveal,markup});
});

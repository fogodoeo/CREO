(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoRoundPhase=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function phase(round={},now=Date.now()){
  const today=new Date(Number(now)+9*3600000).toISOString().slice(0,10);
  if(round.archiveId||['history','archived'].includes(round.status))return 'finished';
  if(round.liveCount>0)return 'live';
  if(round.date&&round.date<today)return 'finished';
  if(round.itemCount>0&&round.finishedCount===round.itemCount&&(!round.date||round.date<=today))return 'finished';
  return 'preparing';
 }
 function fromItems(items,date,status='',now=Date.now()){
  return phase({date,status,itemCount:items.length,liveCount:items.filter(i=>i.status==='live').length,finishedCount:items.filter(i=>['sold','passed'].includes(i.status)).length},now);
 }
 return {phase,fromItems};
});

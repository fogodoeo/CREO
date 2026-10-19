'use strict';
const CheckoutRounds=require('./checkout-rounds');

function captureRound(context){
 const round=context.round;
 return round?{key:round.key,name:round.name,scope:context.token.roundScope||''}:null;
}

function recordRounds(grant,records,context){
 const archives=context.archives||[],closed=archives.filter(a=>a.closedAt).sort((a,b)=>String(a.closedAt).localeCompare(String(b.closedAt))||a.id.localeCompare(b.id));
 const liveIds=new Set(records.filter(r=>r.recordState==='current').map(r=>r.itemId));
 const live=(context.items||[]).filter(i=>liveIds.has(i.id));
 const rounds=CheckoutRounds.groups(context.channel||{name:grant.channelName},live,[],archives);
 const byItem=new Map();
 for(const round of rounds)for(const item of round.items){
  const index=item.auctionArchiveId?closed.findIndex(a=>a.id===item.auctionArchiveId):-1;
  const known=!item.auctionArchiveId||index>=0,previous=item.auctionArchiveId?closed[index-1]:closed.at(-1);
  byItem.set(item.id,{key:round.key,name:round.name,scope:known?(previous?'after:'+previous.id:''):null});
 }
 const grouped=new Map();
 for(const record of records){
  const current=record.recordState==='current'?byItem.get(record.itemId):null,frozen=record.round;
  const info=current||frozen||{key:'record:'+record.identity,name:'보관 기록 · '+(record.item.name||'개체'),scope:null};
  // A saved scoped grant retains its original revocation boundary even after
  // archival or removal of the source auction rows.
  const scope=grant.schema===2?grant.roundScope:typeof frozen?.scope==='string'?frozen.scope:info.scope;
  // Archival can rename date/current groups, but a captured round keeps its
  // selection identity so an already open library can resume after closing.
  const key=(frozen?.key||info.key)+'|'+(scope===null?'legacy':scope||'first');
  if(!grouped.has(key))grouped.set(key,{key,name:info.name,scope,records:[]});
  grouped.get(key).records.push(record);
 }
 return [...grouped.values()].sort((a,b)=>Math.max(...b.records.map(r=>r.capturedAt||0))-Math.max(...a.records.map(r=>r.capturedAt||0))||a.key.localeCompare(b.key));
}

module.exports={captureRound,recordRounds};

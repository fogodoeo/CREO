'use strict';
const National=require('./national-broadcast');
function roundName(channel,round){
 const date=round.date?.slice(0,10)||channel.nationalRound?.date||'';
 if(channel.id==='national-cre'||channel.nationalRound?.parentId==='national-cre'){
  const region=date&&National.REGIONS[National.regionAt(date)];
  return '전국크레자랑'+(date?' · '+date:'')+(region?' '+region+'편':date?'':' · 낙찰 내역');
 }
 return channel.name+(date&&!channel.name.includes(date)?' · '+date:'');
}
// Navigation only: use the same authorized contexts as the financial page and
// retain both channel and round identity, even when two shows share a date.
async function listVendorSettlementRounds(context,{resolve,settlement}){
 const ids=[...new Set([context.channel.id,...(context.profile?.members||[]).map(m=>m.channelId)])];
 const result=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
  while(cursor<ids.length){
   const id=ids[cursor++],own=id===context.channel.id?context:await resolve({...context.token,checkoutRound:''},id);
   if(!own)continue;
   for(const round of own.financialRounds||[]){
    const itemIds=new Set(round.items.map(i=>i.id));
    const totals=await settlement(id,round.items,own.roundShipments.filter(s=>itemIds.has(s.itemId)),[own.vendor]),vendor=totals?.vendors[0];
    result.push({channelId:id,key:round.key,name:roundName(own.channel,round),date:round.date||'',itemCount:round.itemCount,openCount:round.openCount,settlementRemaining:vendor?.remainingAmount||0,settlementPending:!!vendor?.pendingReport,settlementNeedsReview:!!totals?.unassignedReceiptCount});
   }
  }
 }));
 return result.sort((a,b)=>b.date.localeCompare(a.date)||a.channelId.localeCompare(b.channelId)||a.key.localeCompare(b.key));
}
module.exports={listVendorSettlementRounds,roundName};

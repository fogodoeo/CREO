'use strict';
const {settlementStage}=require('./public/vendor-task-state');
// Counts only, from the same membership and financial-round boundaries as checkout.
// Never combine shipments or receipts from different broadcasts.
async function summarize(root,{resolve,bundles,settlement,publicBuyer,pendingChange,canReport}){
 const ids=[...new Set([root.channel.id,...(root.profile?.members||[]).map(m=>m.channelId)])]
  .filter(id=>id===root.channel.id||root.catalog.channels.some(c=>c.id===id&&c.nationalRound?.parentId===root.channel.id));
 const rounds=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
  while(cursor<ids.length){
   const channelId=ids[cursor++],context=channelId===root.channel.id?root:await resolve({...root.token,checkoutRound:''},channelId);
   if(!context)continue;
   for(const round of context.financialRounds||[]){
    if(!round.itemCount)continue;
    const itemIds=new Set(round.items.map(i=>i.id)),shipments=context.roundShipments.filter(s=>itemIds.has(s.itemId));
    const scoped={...context,items:round.items,shipments,round:{...round,items:undefined}};
    const buyers=await bundles(scoped),stages=await Promise.all(buyers.map(async b=>settlementStage({...publicBuyer(b),changePending:Boolean(await pendingChange(b.context))},{...context.channel,checkoutOpen:['active','archived'].includes(context.channel.status)})));
    const totals=await settlement(channelId,round.items,shipments,[context.vendor]),money=totals.vendors.find(v=>v.vendorId===context.vendor.id);
    const paymentCount=stages.filter(s=>s==='action').length;
    const organizerCount=Number(Boolean(money?.remainingAmount>0&&money.remittance?.ready&&!money.pendingReport&&!totals.unassignedReceiptCount&&canReport(totals)));
    rounds.push({channelId,round:round.key,date:round.date||'',paymentCount,organizerCount,actionCount:paymentCount+organizerCount,waitingCount:stages.filter(s=>s==='waiting').length+Number(Boolean(money?.pendingReport)),openCount:round.openCount||0});
   }
  }
 }));
 rounds.sort((a,b)=>Number(b.actionCount>0)-Number(a.actionCount>0)||Number(b.openCount>0||b.waitingCount>0)-Number(a.openCount>0||a.waitingCount>0)||b.date.localeCompare(a.date)||a.channelId.localeCompare(b.channelId)||a.round.localeCompare(b.round));
 const paymentActionCount=rounds.reduce((n,r)=>n+r.paymentCount,0),settlementRoundCount=rounds.reduce((n,r)=>n+r.organizerCount,0),settlementCount=paymentActionCount+settlementRoundCount;
 return {settlementAttention:settlementCount>0,settlementCount,paymentActionCount,settlementRoundCount,settlementWaitingCount:rounds.reduce((n,r)=>n+r.waitingCount,0),hasSales:rounds.length>0,
  settlementTarget:rounds[0]?{channelId:rounds[0].channelId,round:rounds[0].round}:null};
}
module.exports={summarize};

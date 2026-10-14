'use strict';
const money=value=>Math.max(0,Math.round(Number(value)||0));
function normalizePolicy(value={}){return {enabled:value.enabled===true,entryFee:Math.min(1000000,money(value.entryFee)),ratePercent:Math.max(0,Math.min(100,Number(value.ratePercent)||0))};}
function isEvent(item){return item?.attributes?.auctionKind==='event';}
function itemPolicy(item,channel){return normalizePolicy(item.attributes?.organizerFeePolicy||channel.vendorSettlement);}
function stamp(item,channel,current={}){
 if(!channel.vendorSettlement?.enabled)return item;
 const attributes={...(current.attributes||{}),...(item.attributes||{})};
 if(/^E\d{2,}$/i.test(String(item.name||'')))attributes.auctionKind='event';
 attributes.broadcastDate=attributes.broadcastDate||attributes.vendor_entry?.broadcastDate||new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 attributes.organizerFeePolicy=current.attributes?.organizerFeePolicy||normalizePolicy(channel.vendorSettlement);
 return {...item,attributes};
}
function summarize(items,shipments,vendors,channel){
 const latest=new Map();for(const row of shipments){const old=latest.get(row.itemId);if(!old||String(row.updatedAt||'')>String(old.updatedAt||''))latest.set(row.itemId,row);}
 return vendors.map(v=>{
  const seen=new Set(),details=[];
  for(const item of items){
   if(item.vendorId!==v.id||seen.has(item.id)||!['waiting','live','sold','passed'].includes(item.status))continue;seen.add(item.id);
   const policy=itemPolicy(item,channel);if(!policy.enabled)continue;
   const exempt=isEvent(item),cancelled=['cancelled','refunded'].includes(latest.get(item.id)?.paymentStatus);
   const entryFee=exempt?0:policy.entryFee,commission=exempt||item.status!=='sold'||cancelled?0:Math.floor(money(item.soldPrice)*policy.ratePercent/100);
   details.push({id:item.id,code:item.attributes?.displayNumber||item.name||'',status:item.status,broadcastDate:item.attributes?.broadcastDate||item.attributes?.vendor_entry?.broadcastDate||'',event:exempt,entryFee,commission,totalAmount:entryFee+commission,soldAmount:item.status==='sold'?money(item.soldPrice):0});
  }
  return {vendorId:v.id,entryFeeAmount:details.reduce((n,i)=>n+i.entryFee,0),commissionAmount:details.reduce((n,i)=>n+i.commission,0),feeAmount:details.reduce((n,i)=>n+i.totalAmount,0),feeItems:details};
 });
}
module.exports={normalizePolicy,isEvent,summarize,stamp};

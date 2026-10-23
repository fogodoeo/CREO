'use strict';
const Checkout=require('./checkout-core'),Phase=require('./public/round-phase');
const {normalizePhone}=require('./band-membership');
function readiness(channel,items,shipments,vendor,changes=[],now=Date.now()){
 const date=channel.nationalRound?.date||[...new Set(items.map(i=>i.attributes?.broadcastDate||i.attributes?.vendor_entry?.broadcastDate).filter(Boolean))].filter((_,i,a)=>a.length===1)[0]||'';
 const broadcastFinished=items.length>0&&items.every(i=>i.auctionArchiveId)||Phase.fromItems(items,date,channel.status,now)==='finished';
 const own=items.filter(i=>i.vendorId===vendor.id&&i.status==='sold'),ids=new Set(own.map(i=>i.id)),unpaid=new Set();let missingDestinationCount=0;
 for(const item of own){
  const phone=normalizePhone(item.winnerPhone||''),latest=Checkout.newestShipment(shipments.filter(s=>s.itemId===item.id&&s.vendorId===vendor.id&&(!phone||!s.recipientPhone||normalizePhone(s.recipientPhone)===phone)));
  if(['cancelled','refunded'].includes(latest?.paymentStatus))continue;
  if(latest?.paymentStatus!=='paid')unpaid.add(phone||item.id);
  const destination=latest?.method==='pickup'?(latest.address||latest.destinationId):latest?.method==='delivery'?(latest.address||latest.pargeRegion&&latest.pargeShop):'';
  if(!String(destination||'').trim())missingDestinationCount++;
 }
 const pendingChangeCount=changes.filter(r=>r.state==='pending'&&r.itemIds?.some(id=>ids.has(id))).length;
 const unpaidCount=unpaid.size,ready=broadcastFinished&&!unpaidCount&&!missingDestinationCount&&!pendingChangeCount;
 const reason=!broadcastFinished?'방송 종료 후 전체 정산할 수 있어요.':missingDestinationCount?'배송지 입력 '+missingDestinationCount+'건을 기다리고 있어요.':pendingChangeCount?'배송 변경 '+pendingChangeCount+'건을 확인 중이에요.':unpaidCount?'낙찰자 결제 '+unpaidCount+'건을 먼저 확인해 주세요.':'';
 return {ready,broadcastFinished,unpaidCount,missingDestinationCount,pendingChangeCount,reason};
}
module.exports={readiness};

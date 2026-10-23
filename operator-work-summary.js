'use strict';
const {newestShipment}=require('./checkout-core');
const {normalizePhone}=require('./band-membership');
function summarize(data,settlement,changes=[],requests=[]){
 const items=data.items.filter(i=>i.status==='sold'),ids=new Set(data.items.map(i=>i.id)),groups=new Map();
 for(const item of items){
  const phone=normalizePhone(item.winnerPhone||item.winner?.phone||''),key=JSON.stringify([item.vendorId,phone||item.id]);
  if(!groups.has(key))groups.set(key,{vendorId:item.vendorId,phone,ids:[]});groups.get(key).ids.push(item.id);
 }
 let shipping=0;
 for(const own of groups.values()){
  const latest=newestShipment(data.shipments.filter(s=>own.ids.includes(s.itemId)&&s.vendorId===own.vendorId&&(!own.phone||!s.recipientPhone||normalizePhone(s.recipientPhone)===own.phone)));
  if(latest&&(latest.cardLinkCancellationRequired||latest.shippingChangedAfterReport||['bank_transfer_reported','card_payment_reported'].includes(latest.paymentStatus)))shipping++;
 }
 const scoped=rows=>rows.filter(r=>r.state==='pending'&&r.itemIds?.length&&r.itemIds.every(id=>ids.has(id))).length;
 const organizer=settlement.vendors.filter(v=>v.pendingReport||v.overpaidAmount>0||v.unassignedReceiptCount>0).length;
 return {shipping,organizer,changes:scoped(changes)+scoped(requests)};
}
module.exports={summarize};

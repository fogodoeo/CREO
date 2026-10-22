(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoVendorTasks=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function settlementStage(buyer,channel){
  if(buyer.changePending)return 'waiting';
  if(buyer.payment.status==='paid')return 'paid';
  if(channel.checkoutOpen!==true&&channel.status&&channel.status!=='active')return 'waiting';
  if(!buyer.destination)return 'waiting';
  if(buyer.payment.cardLinkCancellationRequired)return 'action';
  if(['bank_transfer_reported','card_payment_reported'].includes(buyer.payment.status)||(buyer.payment.method==='card'&&(!buyer.payment.cardPaymentUrl||buyer.payment.cardNoticeMethod==='external')))return 'action';
  return 'waiting';
 }
 function broadcastRegistrationComplete(reservation){
  return reservation.completed>=4&&reservation.completed<=(reservation.entryLimit??4)&&!reservation.excessSubmitted&&!reservation.entries?.slice(0,reservation.entryLimit??4).some(e=>e?.status==='changes_requested');
 }
 function broadcastNeedsAction(date,reservation,now,entriesOpen=true){
  if(!date||date.startsAt<=now||!entriesOpen)return false;
  if(!reservation)return date.maxQuantityAvailable>=4;
  return !broadcastRegistrationComplete(reservation)&&(!reservation.session.entriesDueAt||reservation.session.entriesDueAt>now);
 }
  function vendorBroadcasts(state){
   const items=state.entryState?.auctionItems||[],parents=state.entryState?.parents||[];
   const today=new Date(Date.parse(state.now)+9*3600000).toISOString().slice(0,10);
   return state.dates.filter(d=>d.regionName===state.vendor.region||state.reservations.some(r=>r.date===d.date&&r.status==='confirmed')||items.some(i=>i.date===d.date)).map(date=>{
    const reservation=state.reservations.find(r=>r.date===date.date&&r.status==='confirmed'),lots=items.filter(i=>i.date===date.date);
    const entries=reservation?.entries.slice(0,reservation.entryLimit??4).filter(Boolean)||[],assigned=lots.length>=(reservation?.entryLimit??1);
    const complete=assigned||!!reservation&&broadcastRegistrationComplete(reservation),count=assigned?lots.length:entries.length;
    const missing=side=>assigned?lots.filter(i=>!i.parents?.some(p=>p.role===side&&p.media?.length)).length:entries.filter(e=>!parents.find(p=>p.id===e[side+'Id'])?.photoId).length;
    return {date:date.date,region:date.regionName,past:date.date<today,reservation:!!reservation,assigned,complete,count,submitted:reservation?.completed||0,canStart:date.maxQuantityAvailable>=4,missingSire:missing('sire'),missingDam:missing('dam'),needsChanges:entries.some(e=>e.status==='changes_requested'),hasDraft:entries.some(e=>e.status==='draft')};
   });
  }
  return {settlementStage,broadcastNeedsAction,broadcastRegistrationComplete,vendorBroadcasts};
});

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoVendorTasks=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function settlementStage(buyer,channel){
  if(buyer.changePending)return 'waiting';
  if(buyer.payment.status==='paid')return 'paid';
  if(channel.status&&channel.status!=='active')return 'waiting';
  if(!buyer.destination)return 'waiting';
  if(buyer.payment.cardLinkCancellationRequired)return 'action';
  if(['bank_transfer_reported','card_payment_reported'].includes(buyer.payment.status)||(buyer.payment.method==='card'&&(!buyer.payment.cardPaymentUrl||buyer.payment.cardNoticeMethod==='external')))return 'action';
  return 'waiting';
 }
 function broadcastRegistrationComplete(reservation){
  return reservation.completed>=4&&reservation.completed<=(reservation.entryLimit??5)&&!reservation.excessSubmitted&&!reservation.entries?.slice(0,reservation.entryLimit??5).some(e=>e?.status==='changes_requested');
 }
 function broadcastNeedsAction(date,reservation,now,entriesOpen=true){
  if(!date||date.startsAt<=now||!entriesOpen)return false;
  if(!reservation)return date.maxQuantityAvailable>=4;
  return !broadcastRegistrationComplete(reservation)&&reservation.session.entriesDueAt>now;
 }
 return {settlementStage,broadcastNeedsAction,broadcastRegistrationComplete};
});

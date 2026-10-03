'use strict';
const {channelKey}=require('./platform-core');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
function createVendorLifecycle({repository,vendorDirectory,loadCatalog,booking,settlement,lock,touch,now=Date.now}){
 async function inspect(id,profile){
  profile=profile||await vendorDirectory.profileFor('national-cre',id);
  const members=profile?.members||[{channelId:'national-cre',vendorId:id}],catalog=await loadCatalog(),blockers=[];
  for(const m of members){
   const channel=catalog.channels.find(c=>c.id===m.channelId);
   if(!channel)throw fail('연결된 채널을 확인하지 못했어요. 운영자에게 문의해 주세요.',503);
   const [items,shipments,vendors]=await Promise.all(['item','shipment','vendor'].map(k=>repository.listRecords(m.channelId,k)));
   const name=vendors.find(v=>v.id===m.vendorId)?.name,owned=items.filter(i=>i.vendorId===m.vendorId||!i.vendorId&&name&&i.vendorName===name),live=['draft','active'].includes(channel.status);
   if(live&&owned.some(i=>!['sold','passed','cancelled','canceled','withdrawn'].includes(i.status)))blockers.push(channel.name+' · 진행 중인 출품');
   const cancelled=s=>['cancelled','canceled','refunded'].includes(s.status)||['cancelled','refunded'].includes(s.paymentStatus);
   const related=shipments.filter(s=>s.vendorId===m.vendorId&&!cancelled(s));
   if(related.some(s=>s.paymentStatus!=='paid')||owned.some(i=>i.status==='sold'&&!shipments.some(s=>s.itemId===i.id)))blockers.push(channel.name+' · 미완료 결제');
   if(related.some(s=>!['delivered','received','complete'].includes(s.status)))blockers.push(channel.name+' · 미완료 배송·수령');
   const money=(await settlement(m.channelId,items,shipments,vendors)).vendors.find(v=>v.vendorId===m.vendorId);
   if(money&&(money.remainingAmount>0||money.overpaidAmount>0||money.pendingReport))blockers.push(channel.name+' · 미완료 배송비 정산');
   if(m.channelId==='national-cre'){
     const schedules=await booking.operatorView(channel,await vendorDirectory.list(m.channelId));
     if(schedules.sessions.some(s=>Date.parse(s.startsAt)+4*3600000>now()&&s.reservations.some(r=>r.vendorId===m.vendorId&&r.status==='confirmed')))blockers.push('전국크레자랑 · 예정·진행 중인 방송');
   }
  }
  if(profile){
   const row=(await repository.getRowsByKeys(['vendor_entries_v1::'+profile.id]))[0];
   if(row){const entries=JSON.parse(row.value).entries;if(!Array.isArray(entries))throw fail('출품 자료를 확인하지 못했어요.',503);
    if(entries.some(e=>['submitted','changes_requested'].includes(e.status)))blockers.push('검토 중인 출품 개체');
   }
  }
  return {blockers:[...new Set(blockers)],channels:members.map(m=>catalog.channels.find(c=>c.id===m.channelId)?.name||m.channelId)};
 }
 async function review(id,approved,commit){
  // Lock all existing channels in a stable order, then the shared profile.
  // This serializes approval with reservations, checkout edits and attachments.
  const channels=(await loadCatalog()).channels.map(c=>c.id).sort();
  const nested=i=>i<channels.length?lock('channel:'+channels[i],()=>nested(i+1)):vendorDirectory.lifecycle('national-cre',id,async(profile,directory,key)=>{
   if(!approved)return commit([]);
   if(profile?.deletedAt)return commit([]);
   const result=await inspect(id,profile);
   if(result.blockers.length)throw fail('먼저 처리해 주세요: '+result.blockers.join(', '));
   const stamp=new Date(now()).toISOString(),rows=[];
   for(const m of profile?.members||[{channelId:'national-cre',vendorId:id}]){const v=await repository.getRecord(m.channelId,'vendor',m.vendorId);if(!v)throw fail('업체 정보를 다시 확인해 주세요.',503);rows.push({key:channelKey(m.channelId,'vendor',m.vendorId),value:JSON.stringify({...v,active:false,deletedAt:stamp})});}
   if(profile){profile.deletedAt=stamp;profile.revision++;rows.push({key,value:JSON.stringify(directory)});}
   const saved=await commit(rows);channels.forEach(touch);return saved;
  });
  return nested(0);
 }
 return {inspect,review};
}
module.exports={createVendorLifecycle};

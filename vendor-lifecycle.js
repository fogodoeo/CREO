'use strict';
const {channelKey}=require('./platform-core');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
function createVendorLifecycle({repository,vendorDirectory,loadCatalog,settlement,lock,touch,now=Date.now}){
 async function plan(id,profile){
  profile=profile||await vendorDirectory.profileFor('national-cre',id);
  const members=profile?.members||[{channelId:'national-cre',vendorId:id}],catalog=await loadCatalog(),blockers=[],rows=[];
  const stamp=new Date(now()).toISOString(),removing=new Set(),retained=new Set(),effects={reservations:[],entries:0,items:0};
  for(const m of members){
   const channel=catalog.channels.find(c=>c.id===m.channelId);
   if(!channel)throw fail('연결된 채널을 확인하지 못했어요. 운영자에게 문의해 주세요.',503);
   const [items,shipments,vendors,broadcast]=await Promise.all(['item','shipment','vendor'].map(k=>repository.listRecords(m.channelId,k)).concat(repository.getRecord(m.channelId,'broadcast','state')));
   const name=vendors.find(v=>v.id===m.vendorId)?.name,owned=items.filter(i=>i.vendorId===m.vendorId||!i.vendorId&&name&&i.vendorName===name);
   for(const item of owned){
    const identity=m.channelId+':'+item.id;
    if(item.status==='sold'){retained.add(identity);continue;}
    let bids;try{bids=typeof item.attributes?.bid_log==='string'?JSON.parse(item.attributes.bid_log):item.attributes?.bid_log||[];}catch{throw fail('입찰 이력을 확인하지 못했어요.',503);}
    if(item.status==='live'||(broadcast?.activeItemId===item.id&&broadcast.mode==='live')||!Array.isArray(bids)||bids.length||item.winnerName||item.winnerPhone||Number(item.soldPrice)>0){blockers.push(channel.name+' · 진행 중이거나 입찰 이력이 있는 개체');retained.add(identity);continue;}
    removing.add(identity);effects.items++;
    // Archive and remove unauctioned items atomically with access revocation.
    rows.push({key:'vendor_deleted_items_v1::'+m.channelId+'::'+item.id,value:JSON.stringify({...item,deletedAt:stamp,deletionReason:'vendor-deleted'})},{key:channelKey(m.channelId,'item',item.id),delete:true});
   }
   if(broadcast&&removing.has(m.channelId+':'+broadcast.activeItemId))rows.push({key:channelKey(m.channelId,'broadcast','state'),value:JSON.stringify({...broadcast,activeItemId:'',mode:'standby'})});
   const cancelled=s=>['cancelled','canceled','refunded'].includes(s.status)||['cancelled','refunded'].includes(s.paymentStatus);
   const related=shipments.filter(s=>(s.vendorId===m.vendorId||owned.some(i=>i.id===s.itemId))&&!cancelled(s));
   if(related.some(s=>s.paymentStatus!=='paid')||owned.some(i=>i.status==='sold'&&!shipments.some(s=>s.itemId===i.id)))blockers.push(channel.name+' · 미완료 결제');
   if(related.some(s=>!['delivered','received','complete'].includes(s.status)))blockers.push(channel.name+' · 미완료 배송·수령');
   if(related.some(s=>removing.has(m.channelId+':'+s.itemId)))blockers.push(channel.name+' · 거래에 연결된 개체');
   const money=(await settlement(m.channelId,items,shipments,vendors)).vendors.find(v=>v.vendorId===m.vendorId);
   if(money&&(money.remainingAmount>0||money.overpaidAmount>0||money.pendingReport))blockers.push(channel.name+' · 미완료 배송비 정산');
   if(m.channelId==='national-cre')for(const setting of ['national-broadcasts','broadcast-bookings']){
    const key=channelKey(m.channelId,'setting',setting),raw=(await repository.getRowsByKeys([key]))[0];if(!raw)continue;
    const state=JSON.parse(raw.value);if(!Array.isArray(state.reservations)||!Array.isArray(state.audit))throw fail('방송 자료를 확인하지 못했어요.',503);
    let changed=false;
    for(const r of state.reservations.filter(r=>r.vendorId===m.vendorId&&r.status==='confirmed')){
     if(require('./broadcast-booking').start(r.date)+4*3600000<=now())continue;
     r.status='cancelled';r.version++;r.noticeVersion=r.version;r.updatedAt=stamp;r.cancelReason='vendor-deleted';changed=true;effects.reservations.push(r.date);
     for(const p of state.proposals||[])if(p.reservationId===r.id&&p.status==='pending')p.status='cancelled';
     state.audit.push({reservationId:r.id,action:'업체 삭제로 예약 취소',date:r.date,quantity:r.quantity,at:stamp,actor:'operator'});
    }
    if(changed){state.version++;rows.push({key,value:JSON.stringify(state)});}
   }
  }
  if(profile){
   const key='vendor_entries_v1::'+profile.id,row=(await repository.getRowsByKeys([key]))[0];
   if(row){const state=JSON.parse(row.value);if(!Array.isArray(state.entries))throw fail('출품 자료를 확인하지 못했어요.',503);
    for(const entry of state.entries){
     if(entry.status==='deleted'||!members.some(m=>m.channelId===entry.channelId&&m.vendorId===entry.channelVendorId)||retained.has(entry.channelId+':'+entry.itemId))continue;
     entry.status='deleted';entry.deletedAt=stamp;entry.updatedAt=stamp;entry.version++;entry.deletionReason='vendor-deleted';effects.entries++;
    }
    if(effects.entries){state.version++;rows.push({key,value:JSON.stringify(state)});}
   }
  }
  return {blockers:[...new Set(blockers)],channels:members.map(m=>catalog.channels.find(c=>c.id===m.channelId)?.name||m.channelId),effects,rows};
 }
 async function inspect(id,profile){const {rows,...result}=await plan(id,profile);return result;}
 async function review(id,approved,commit){
  const channels=(await loadCatalog()).channels.map(c=>c.id).sort();
  const nested=i=>i<channels.length?lock('channel:'+channels[i],()=>nested(i+1)):vendorDirectory.lifecycle('national-cre',id,async(profile,directory,key)=>{
   if(!approved||profile?.deletedAt)return commit([]);
   const result=await plan(id,profile);
   if(result.blockers.length)throw fail('먼저 처리해 주세요: '+result.blockers.join(', '));
   const stamp=new Date(now()).toISOString(),rows=result.rows;
   for(const m of profile?.members||[{channelId:'national-cre',vendorId:id}]){const v=await repository.getRecord(m.channelId,'vendor',m.vendorId);if(!v)throw fail('업체 정보를 다시 확인해 주세요.',503);rows.push({key:channelKey(m.channelId,'vendor',m.vendorId),value:JSON.stringify({...v,active:false,deletedAt:stamp})});}
   if(profile){profile.deletedAt=stamp;profile.revision++;rows.push({key,value:JSON.stringify(directory)});}
   const saved=await commit(rows);channels.forEach(touch);return saved;
  });
  return nested(0);
 }
 return {inspect,review};
}
module.exports={createVendorLifecycle};

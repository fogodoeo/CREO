'use strict';
const National=require('./national-broadcast');
const {channelKey}=require('./platform-core');
const ROOT='national-cre';
const fail=message=>Object.assign(Error(message),{status:409});

// Stage participation with the caller's registration/booking transaction. Reads
// never attach identities, and the caller commits all rows or none of them.
function createNationalVendorParticipation({repository,directory,now=Date.now,touch=()=>{},lock=(_key,work)=>work()}){
 function transaction(work){
  return directory.lifecycle(ROOT,'',async(_profile,document,key)=>{
   const touched=new Set();
   const stage=async(vendor,{date='',reconcile=false}={})=>{
    if(!vendor?.id||vendor.active===false||vendor.deletedAt)throw fail('등록할 업체를 다시 확인해 주세요.');
    const next=structuredClone(document),stamp=new Date(now()).toISOString();
    const before=JSON.stringify(next),profile=directory.enrollInDocument(next,ROOT,vendor,stamp);
    if(profile.deletedAt)throw fail('삭제된 업체는 방송에 배정할 수 없어요.');
    const today=new Date(now()+9*3600000).toISOString().slice(0,10),region=National.regionForVendor(vendor);
    const catalog=await repository.getCatalog(),rows=[];
    const upcoming=catalog.channels.filter(c=>c.nationalRound?.parentId===ROOT&&['draft','active'].includes(c.status)&&c.dataAdapter==='platform'&&c.nationalRound.date>=today&&National.APPLICATION_DATES.includes(c.nationalRound.date));
    if(reconcile){
     const sourceItems=await repository.listRecords(ROOT,'item');
     if(sourceItems.some(i=>i.vendorId===vendor.id&&!i.auctionArchiveId&&(()=>{const d=i.attributes?.broadcastDate||i.attributes?.vendor_entry?.broadcastDate||'';return d>=today&&National.regionAt(d)!==region;})()))throw fail('다른 예정 방송일에 등록된 개체가 있어요. 출품 접수에서 해당 개체의 방송일을 먼저 확인해 주세요.');
    }
    // Retain identity and all past transactions. Only an unused future assignment
    // can be released; a prepared item must be resolved by the operator first.
    if(reconcile)for(const channel of upcoming.filter(c=>National.regionAt(c.nationalRound.date)!==region)){
     const member=profile.members.find(m=>m.channelId===channel.id);if(!member)continue;
     const existing=await repository.getRecord(channel.id,'vendor',member.vendorId);if(!existing||existing.active===false)continue;
     const [items,shipments]=await Promise.all(['item','shipment'].map(type=>repository.listRecords(channel.id,type)));
     if([...items,...shipments].some(row=>row.vendorId===member.vendorId))throw fail(channel.nationalRound.date+' 방송에 등록된 개체나 배송 내역이 있어요. 해당 방송의 출품을 먼저 확인해 주세요.');
     rows.push({key:channelKey(channel.id,'vendor',member.vendorId),value:JSON.stringify({...existing,active:false,nationalAssignmentReleasedAt:stamp,updatedAt:stamp})});
     touched.add(channel.id);
    }
    const targets=upcoming.filter(c=>date?c.nationalRound.date===date:National.regionAt(c.nationalRound.date)===region);
    for(const channel of targets){
     const member=profile.members.find(m=>m.channelId===channel.id),id=member?.vendorId||vendor.id;
     const owner=next.profiles.find(p=>p.members.some(m=>m.channelId===channel.id&&m.vendorId===id));
     if(owner&&owner.id!==profile.id)throw fail('같은 회차에 다른 업체 연결 정보가 있어요. 운영자에게 확인해 주세요.');
     const existing=await repository.getRecord(channel.id,'vendor',id);
     if(existing&&!member)throw fail('같은 회차의 기존 업체 정보를 먼저 연결해 주세요.');
     if(member){
      if(existing?.active===false&&existing.nationalAssignmentReleasedAt){
       const restored={...existing,active:true,updatedAt:stamp};delete restored.nationalAssignmentReleasedAt;
       rows.push({key:channelKey(channel.id,'vendor',id),value:JSON.stringify(restored)});touched.add(channel.id);
      }else if(!existing||existing.active===false)throw fail('방송 업체 연결이 중지되어 있어요. 운영자에게 확인해 주세요.');
      continue;
     }
     profile.members.push({channelId:channel.id,vendorId:id});profile.revision++;
     rows.push({key:channelKey(channel.id,'vendor',id),value:JSON.stringify({...vendor,...profile.info,id,channelId:channel.id,createdAt:stamp,updatedAt:stamp})});
     touched.add(channel.id);
    }
    if(JSON.stringify(next)!==before)rows.push({key,value:JSON.stringify(next)});
    return rows;
   };
   const result=await work(stage);
   touch(ROOT);for(const id of touched)touch(id);
   return result;
  });
 }
 // Caller already holds the root channel lock. Take child locks before the
 // directory lock, matching round preparation and preventing item/region races.
 async function reassign(vendorId,region,commit){
  const catalog=await repository.getCatalog(),ids=catalog.channels.filter(c=>c.nationalRound?.parentId===ROOT).map(c=>c.id).sort();
  const run=index=>index<ids.length?lock('channel:'+ids[index],()=>run(index+1)):transaction(async stage=>{
   const vendor=await directory.find(ROOT,vendorId);
   return commit(await stage({...vendor,broadcastRegion:National.REGIONS[region]},{reconcile:true}));
  });
  return run(0);
 }
 return {transaction,reassign};
}
module.exports={createNationalVendorParticipation};

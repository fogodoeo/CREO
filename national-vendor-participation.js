'use strict';
const National=require('./national-broadcast');
const {channelKey}=require('./platform-core');
const ROOT='national-cre';
const fail=message=>Object.assign(Error(message),{status:409});

// Stage participation with the caller's registration/booking transaction. Reads
// never attach identities, and the caller commits all rows or none of them.
function createNationalVendorParticipation({repository,directory,now=Date.now,touch=()=>{}}){
 function transaction(work){
  return directory.lifecycle(ROOT,'',async(_profile,document,key)=>{
   const touched=new Set();
   const stage=async(vendor,{date=''}={})=>{
    if(!vendor?.id||vendor.active===false||vendor.deletedAt)throw fail('등록할 업체를 다시 확인해 주세요.');
    const next=structuredClone(document),stamp=new Date(now()).toISOString();
    const before=JSON.stringify(next),profile=directory.enrollInDocument(next,ROOT,vendor,stamp);
    if(profile.deletedAt)throw fail('삭제된 업체는 방송에 배정할 수 없어요.');
    const today=new Date(now()+9*3600000).toISOString().slice(0,10),region=National.regionForVendor(vendor);
    const catalog=await repository.getCatalog(),rows=[];
    const targets=catalog.channels.filter(c=>c.nationalRound?.parentId===ROOT&&['draft','active'].includes(c.status)&&c.dataAdapter==='platform'&&c.nationalRound.date>=today&&National.APPLICATION_DATES.includes(c.nationalRound.date)&&(date?c.nationalRound.date===date:National.regionAt(c.nationalRound.date)===region));
    for(const channel of targets){
     const member=profile.members.find(m=>m.channelId===channel.id),id=member?.vendorId||vendor.id;
     const owner=next.profiles.find(p=>p.members.some(m=>m.channelId===channel.id&&m.vendorId===id));
     if(owner&&owner.id!==profile.id)throw fail('같은 회차에 다른 업체 연결 정보가 있어요. 운영자에게 확인해 주세요.');
     const existing=await repository.getRecord(channel.id,'vendor',id);
     if(existing&&!member)throw fail('같은 회차의 기존 업체 정보를 먼저 연결해 주세요.');
     if(member){if(!existing||existing.active===false)throw fail('방송 업체 연결이 중지되어 있어요. 운영자에게 확인해 주세요.');continue;}
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
 return {transaction};
}
module.exports={createNationalVendorParticipation};

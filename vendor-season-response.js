'use strict';
// A response belongs to this season only. It never deletes a vendor or a booking.
const CAMPAIGN=Object.freeze({id:'national-season-3',title:'전국크레자랑 시즌3 참가 확인',startsAt:'2026-11-16T00:00:00+09:00',deadline:null,endsAt:null});
function summary(company,now,role='owner'){
 const response=company?.seasonResponses?.[CAMPAIGN.id]||{};
 return {...CAMPAIGN,status:response.status||'pending',revision:response.revision||0,seenAt:response.seenAt||null,respondedAt:response.respondedAt||null,
  visible:now>=Date.parse(CAMPAIGN.startsAt)&&(!CAMPAIGN.endsAt||now<Date.parse(CAMPAIGN.endsAt)),
  open:now>=Date.parse(CAMPAIGN.startsAt)&&(!CAMPAIGN.deadline||now<=Date.parse(CAMPAIGN.deadline)),canRespond:role==='owner'};
}
function update(company,body,now,actorId){
 const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
 if(body.campaign!==CAMPAIGN.id)fail('안내가 변경됐어요. 새로고침해 주세요.');
 if(!['seen','accepted','declined'].includes(body.action))fail('참가 여부를 선택해 주세요.',422);
 const before=summary(company,now),responses=company.seasonResponses||(company.seasonResponses={}),previous=responses[CAMPAIGN.id]||{};
 if(body.action==='seen'){
  if(!before.open||before.status!=='pending'||previous.seenAt)return {...before,show:false};
  responses[CAMPAIGN.id]={...previous,seenAt:new Date(now).toISOString()};
  return {...summary(company,now),show:true};
 }
 if(previous.status===body.action)return {...before,duplicate:true};
 if(!before.open)fail('응답 기한이 지났어요. 참가 여부는 운영자에게 문의해 주세요.');
 if((body.expectedRevision??0)!==before.revision)fail('다른 화면에서 응답이 변경됐어요. 새로고침한 뒤 다시 선택해 주세요.');
 if(body.action==='declined'&&body.confirmDecline!==true)fail('불참 시 자리 충원 안내를 확인해 주세요.',422);
 responses[CAMPAIGN.id]={...previous,status:body.action,revision:before.revision+1,respondedAt:new Date(now).toISOString(),actorId};
 return summary(company,now);
}
module.exports={CAMPAIGN,summary,update};

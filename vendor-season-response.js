'use strict';
// A response belongs to this season only. It never deletes a vendor or a booking.
const CAMPAIGN=Object.freeze({id:'national-2026-11',title:'11월 전국크레자랑 참가 확인',startsAt:'2026-11-01T00:00:00+09:00',deadline:'2026-11-02T23:59:59+09:00',endsAt:'2026-11-24T00:00:00+09:00'});
function summary(company,now,role='owner'){
 const response=company?.seasonResponses?.[CAMPAIGN.id]||{};
 return {...CAMPAIGN,status:response.status||'pending',seenAt:response.seenAt||null,respondedAt:response.respondedAt||null,
  visible:now>=Date.parse(CAMPAIGN.startsAt)&&now<Date.parse(CAMPAIGN.endsAt),
  open:now>=Date.parse(CAMPAIGN.startsAt)&&now<=Date.parse(CAMPAIGN.deadline),canRespond:role==='owner'};
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
 if(previous.status){if(previous.status===body.action)return {...before,duplicate:true};fail('이미 참가 여부를 제출했어요. 변경은 운영자에게 문의해 주세요.');}
 if(!before.open)fail('응답 기한이 지났어요. 참가 여부는 운영자에게 문의해 주세요.');
 if(body.action==='declined'&&body.confirmDecline!==true)fail('불참 시 자리 충원 안내를 확인해 주세요.',422);
 responses[CAMPAIGN.id]={...previous,status:body.action,respondedAt:new Date(now).toISOString(),actorId};
 return summary(company,now);
}
module.exports={CAMPAIGN,summary,update};

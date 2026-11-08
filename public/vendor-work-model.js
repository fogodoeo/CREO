(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoVendorWork=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function state(row){
  if(row.unavailable)return {rank:0,label:'불러오기 실패',description:'새로고침해 주세요.'};
  if(row.setupRequired||row.canClaim)return {rank:1,label:'첫 등록',description:'업체 정보 확인 필요'};
  if(row.settlementAttention)return {rank:1,label:'처리할 일 있음',description:`입금·정산 확인 ${row.settlementCount||0}건`};
  if(row.bookingAttention)return {rank:1,label:'출품 등록 필요',description:`등록할 방송 ${row.bookingCount||0}회`};
  if(row.entriesOpen)return {rank:2,label:'출품 접수 중',description:`등록 ${row.entryCount||0}마리`};
  if(row.settlementWaitingCount)return {rank:3,label:'응답 대기',description:`낙찰자·입금 확인 대기 ${row.settlementWaitingCount}건`};
  if(row.hasSales)return {rank:4,label:'낙찰 내역',description:'입금·배송·정산 확인'};
  if(row.finished)return {rank:4,label:'지난 방송',description:'출품·낙찰 내역 확인'};
  return {rank:3,label:row.kind==='national'?'방송 일정':'접수 대기',description:row.kind==='national'?'방송일별 출품 관리':'운영자 접수 안내 대기'};
 }
 function isHistory(row){
  if(row.kind==='national'||!row.finished||row.unavailable||row.setupRequired||row.canClaim||row.entriesOpen||row.bookingAttention||row.settlementAttention||row.settlementWaitingCount)return false;
  // Payment completion alone does not establish delivery or organizer settlement completion.
  if(row.hasSales&&(row.workflow?.fulfillment!=='organizer'||!row.workRounds?.length))return false;
  return !(row.workRounds||[]).some(r=>r.openCount||r.settlementRemaining>0||r.settlementPending||r.settlementNeedsReview);
 }
 function primarySection(row){return row.defaultSection==='settlement'||(row.finished&&!row.entriesOpen)?'settlement':'entries';}
 function ordered(rows){return rows.map((r,i)=>({...r,index:i,work:state(r)})).sort((a,b)=>a.work.rank-b.work.rank||(a.date||'9999').localeCompare(b.date||'9999')||a.name.localeCompare(b.name,'ko'));}
 function destination(row,token,section='entries',target){
  const national=row.kind==='national',params=new URLSearchParams({event:target?.channelId||row.channelId||'national-cre',token});
  if(national)params.set('portal',row.companyId);
  if(target?.round)params.set('round',target.round);
  if(section==='profile'||section==='entries')params.set('section',section);
  return (section==='settlement'?'/vendor-checkout.html':national&&section==='booking'?'/vendor-broadcast.html':'/vendor-entries.html')+'?'+params;
 }
 return {state,ordered,destination,isHistory,primarySection};
});

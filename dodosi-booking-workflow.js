'use strict';
const crypto=require('node:crypto');
const fail=(message,status=409)=>{const e=new Error(message);e.statusCode=status;throw e;};
const recent=(s,now)=>Number.isFinite(Date.parse(s))&&now-Date.parse(s)>=-30000&&now-Date.parse(s)<300000;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const comparable=p=>[p.originId,p.destinationId,p.name,p.phone,p.quantity,p.schedule?.dropoffDate,p.schedule?.arrivalDate];
const statuses=new Set(['pending_payment','paid','pickup_pending','in_transit','delivered','cancelled']);
function reconcile(groups,originId,payload,now=Date.now()){
 if(payload?.source!=='https://www.dodosi.co.kr/deliveries'||payload.complete!==true||!recent(payload.checkedAt,now)||!Array.isArray(payload.records)||payload.records.length>5000)fail('도도시 접수 내역을 다시 확인해 주세요.');
 const ids=new Set();
 for(const r of payload.records){
  if(!r.id||typeof r.id!=='string'||r.id.length>100||ids.has(r.id)||!statuses.has(r.status)||!Number.isInteger(r.quantity)||r.quantity<1||!/^0\d{8,10}$/.test(r.phone||'')||!r.originId||!r.destinationId||!/^\d{4}-\d{2}-\d{2}$/.test(r.dropoffDate||'')||!/^\d{4}-\d{2}-\d{2}$/.test(r.arrivalDate||''))fail('도도시 예약 내역 형식이 바뀌었습니다. 확인이 필요합니다.');
  ids.add(r.id);
 }
 return groups.map(g=>{
  const candidates=payload.records.filter(r=>r.status!=='cancelled'&&r.originId===originId&&r.phone===g.phone&&r.dropoffDate===g.schedule.dropoffDate);
  const exact=candidates.filter(r=>equal(comparable({...g,originId}),[r.originId,r.destinationId,r.name,r.phone,r.quantity,r.dropoffDate,r.arrivalDate]));
  const r=exact[0],status=candidates.length===0?'missing':exact.length===1&&candidates.length===1?(r.status==='pending_payment'?'payment_pending':'confirmed'):'conflict';
  return {bookingKey:g.bookingKey,groupId:g.id,status,receiptId:status==='confirmed'||status==='payment_pending'?r.id:'',checkedAt:payload.checkedAt};
 });
}
function command(saved,body,groups,{originId,originName,channelId,sender,fresh,archived},now=Date.now()){
 const next={...saved,revision:saved.revision+1,batches:saved.batches||[],checks:saved.checks||[]};
 if(body.action==='reset-input'){
  if(archived)fail('보관된 회차는 변경할 수 없습니다.');
  if(next.checks.some(c=>c.status!=='missing'||c.receiptId)||next.batches.some(b=>b.status==='confirmed'))fail('예약번호가 있거나 대조가 필요한 배송은 입력 기록만 초기화할 수 없습니다.');
  if(!next.batches.length&&!saved.prepared?.length)return {next:saved};
  const reason=String(body.reason||'').trim();if(!reason||reason.length>300)fail('대기로 되돌리는 이유를 입력해 주세요.',422);
  next.inputResets=[...(saved.inputResets||[]),{at:new Date(now).toISOString(),reason,batches:next.batches,prepared:saved.prepared||[]}];
  next.batches=[];next.prepared=[];
  return {next};
 }
 if(body.action==='reconcile'){
  next.checks=reconcile(groups,originId,body.snapshot,now);next.checkedAt=body.snapshot.checkedAt;
  next.batches=next.batches.map(b=>({...b,status:b.plans.every(p=>next.checks.some(c=>c.bookingKey===p.bookingKey&&c.status==='confirmed'))?'confirmed':b.status==='confirmed'?'review':b.status}));
  return {next};
 }
 if(body.action==='record-fill'){
  const b=next.batches.find(b=>b.id===body.batchId);if(!b)fail('입력 묶음을 찾지 못했습니다.');
  if(b.status==='confirmed')return {next:saved};
  if(body.result?.filled!==true||body.result.stage!=='review'||!equal(body.result.groupIds,b.plans.map(p=>p.groupId))||body.result.count!==b.plans.length)fail('입력된 받는 분 목록이 다릅니다. 예약서를 확인해 주세요.');
  next.batches=next.batches.map(v=>v.id===b.id?{...v,status:'review',filledAt:new Date(now).toISOString()}:v);return {next};
 }
 if(body.action!=='prepare-batch')fail('지원하지 않는 작업입니다.',422);
 if(archived||!fresh)fail('운영 회차와 최신 도도시 일정을 확인해 주세요.');
 const ids=body.groupIds,unpaid=body.includeUnpaidGroupIds||[];
 if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length||!Array.isArray(unpaid)||unpaid.some(id=>!ids.includes(id)))fail('받는 분을 1~10명 선택해 주세요.',422);
 const selected=ids.map(id=>groups.find(g=>g.id===id));
 if(selected.some(g=>!g||(!g.paid&&!unpaid.includes(g.id))||g.schedule.status!=='estimated'))fail('결제·배송정보가 변경됐습니다. 목록을 새로고침해 주세요.');
 if(new Set(selected.map(g=>g.schedule.dropoffDate)).size!==1)fail('같은 맡김일의 받는 분만 함께 선택해 주세요.');
 if(!recent(saved.checkedAt,now))fail('먼저 도도시 접수 내역을 확인해 주세요.');
 if(selected.some(g=>!saved.checks?.some(c=>c.bookingKey===g.bookingKey&&c.status==='missing')))fail('이미 접수됐거나 대조가 필요한 배송입니다. 접수 내역을 확인해 주세요.');
 const plans=selected.map(g=>({...g,schema:'creo.dodosi.dispatch.v1',channelId,groupId:g.id,originId,originName,sender}));
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(plans.map(p=>[p.bookingKey,p.sender]))).digest('hex');
 const same=next.batches.find(b=>b.id===fingerprint);
 const overlaps=next.batches.filter(b=>b.id!==fingerprint&&!['confirmed','superseded'].includes(b.status)&&b.plans.some(p=>plans.some(g=>g.bookingKey===p.bookingKey)));
 for(const b of overlaps){
  const remaining=b.plans.filter(p=>saved.checks.some(c=>c.bookingKey===p.bookingKey&&c.status==='missing'));
  const others=b.plans.filter(p=>!remaining.includes(p));
  if(!others.length||others.some(p=>!saved.checks.some(c=>c.bookingKey===p.bookingKey&&['confirmed','payment_pending'].includes(c.status)))||remaining.length!==plans.length||remaining.some(p=>!plans.some(g=>g.bookingKey===p.bookingKey)))fail('진행 중인 묶음이 있습니다. 해당 묶음을 이어서 입력해 주세요.');
 }
 next.batches=next.batches.map(b=>overlaps.includes(b)?{...b,status:'superseded'}:b);
 const batch=same?{...same,plans}:{id:fingerprint,plans,status:'prepared',createdAt:new Date(now).toISOString()};
 next.batches=[...next.batches.filter(b=>b.id!==batch.id),batch].slice(-100);
 return {next,batch};
}
module.exports={command,reconcile};

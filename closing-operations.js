'use strict';
const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const MANUAL_TEMPLATES=['operator_vendor_reminder','operator_buyer_reminder'];
const actionTemplate=action=>action==='vendor_sms'?MANUAL_TEMPLATES[0]:MANUAL_TEMPLATES[1];
const mask=phone=>phone?phone.slice(0,3)+'-****-'+phone.slice(-4):'연락처 없음';
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
function createClosingOperations({repository,channelKey,read,confirmPayment,link,notifications,now=Date.now}){
 const key=(channel,id)=>channelKey(channel,'setting','closing-'+id);
 async function get(channel,id){return JSON.parse((await repository.getRowsByKeys([key(channel,id)]))[0]?.value||'null');}
 const row=(channel,id,value)=>({key:key(channel,id),value:JSON.stringify(value)});
 const fingerprint=target=>digest(target);
 const roundScope=round=>round.archiveId?'archive:'+round.archiveId:'date:'+(round.date||'current');
 async function recent(channel,round){return (await repository.listRecords(channel,'notification')).filter(n=>MANUAL_TEMPLATES.includes(n.templateKey)&&n.variables?.['#{회차범위}']===roundScope(round));}
 function previous(records,action,target){return records.filter(n=>n.templateKey===actionTemplate(action)&&n.variables?.['#{대상키}']===target.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];}
 function reason(target,action,records,resend){
  if(action==='payment')return target.blocked||'';
  if(!target.phone)return '연락처를 등록해 주세요.';
  if(action==='vendor_sms'&&target.settlementBlocked)return target.settlementBlocked;
  const last=previous(records,action,target);
  if(last&&['queued','sending','configuration_pending','delivery_unknown','failed'].includes(last.status))return '이전 문자가 대기·재시도 중이거나 결과 확인이 필요해요.';
  if(last?.status==='sent'&&now()-Date.parse(last.sentAt||last.createdAt)<86400000&&!resend)return '24시간 안에 안내했어요. 다시 보내려면 재안내를 선택해 주세요.';
  return '';
 }
 async function list(channel,archiveId){
  const data=await read(channel,archiveId),records=await recent(channel,data.round);
  const clean=(t,action)=>{const last=previous(records,action,t);return {...t,phone:undefined,version:undefined,evidence:undefined,shipmentEvidence:undefined,phoneLabel:mask(t.phone),smsBlocked:reason(t,action,records,false),lastNotice:last?{status:last.status,at:last.sentAt||last.createdAt,error:last.lastError}:null};};
  return {round:data.round,vendors:data.vendors.map(t=>clean(t,'vendor_sms')),buyers:data.buyers.map(t=>clean(t,'buyer_sms')),delivery:notifications?.health?.()||{smsConfigured:false},history:records.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,30).map(n=>({id:n.id,name:n.variables?.['#{대상명}']||'',role:n.recipientRole,status:n.status,at:n.sentAt||n.createdAt,error:n.lastError,phoneLabel:mask(n.recipientPhone)}))};
 }
 async function preview(channel,body,req){
  const action=body.action,archiveId=body.archiveId||'';
  if(!['payment','vendor_sms','buyer_sms'].includes(action)||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>100||body.ids.some(id=>typeof id!=='string'))throw fail('대상을 1~100명 선택해 주세요.',422);
  const data=await read(channel,archiveId),records=await recent(channel,data.round),ids=new Set(body.ids);
  const source=action==='buyer_sms'?data.buyers:data.vendors;
  if([...ids].some(id=>!source.some(t=>t.id===id)))throw fail('대상이 변경됐어요. 목록을 새로고침해 주세요.');
  const selected=action==='payment'?data.payments.filter(t=>ids.has(t.vendorId)):source.filter(t=>ids.has(t.id));
  const entries=[],excluded=[];
  for(const t of selected){
   const blocked=reason(t,action,records,body.resend===true);
   if(blocked){excluded.push({name:t.name,reason:blocked});continue;}
   if(action==='payment'&&t.paid)continue;
   let message='',variables={};
   if(action!=='payment'){
    const dest=await link(channel,archiveId,action,t,req);
    variables={...dest.variables,대상키:t.id,대상명:t.name,회차보관:archiveId,회차범위:roundScope(data.round),안내지문:fingerprint(t)};
    message=action==='vendor_sms'?`[옹동2 정산 안내]\n${data.round.name}\n\n${t.name} 정산금 ${money(t.remainingAmount)} 입금 부탁드립니다.\n정산내역·입금계좌 확인:\n${dest.url}\n\n이미 입금하셨다면 페이지에서 입금 신고를 부탁드립니다.`:`[옹동2 낙찰 안내]\n${data.round.name}\n\n${t.name}님, 낙찰 내역의 수령지와 결제 상태를 확인해 주세요.\n${t.missing?'배송 또는 직접수령 정보를 아직 입력하지 않으셨다면 등록 부탁드립니다.\n':''}${dest.url}\n\n입력하신 분도 위 링크에서 현재 진행 상태를 확인하실 수 있습니다.`;
   }
   entries.push({target:t,fingerprint:fingerprint(t),name:t.name,phoneLabel:mask(t.phone),amount:action==='payment'?t.amount:t.remainingAmount,message,variables});
  }
  if(action!=='payment'&&(!notifications?.health?.().smsConfigured||notifications.health().testMode))throw fail('문자 API 설정 또는 테스트 모드를 확인해 주세요.',503);
  const id=crypto.randomUUID(),plan={id,action,archiveId,round:data.round,resend:body.resend===true,entries,excluded,createdAt:now(),expiresAt:now()+15*60000};
  await repository.upsertRows([row(channel,id,plan)]);
  return publicPlan(plan);
 }
 function publicPlan(p){return {id:p.id,action:p.action,round:p.round,expiresAt:p.expiresAt,entries:p.entries.map(({name,phoneLabel,amount,message})=>({name,phoneLabel,amount,message})),excluded:p.excluded,result:p.result};}
 async function execute(channel,body,req){
  if(!/^[a-f0-9-]{36}$/.test(body.planId||'')||body.confirmed!==true)throw fail('미리보기에서 처리 내용을 확인해 주세요.',422);
  const p=await get(channel,body.planId);
  if(!p)throw fail('처리할 미리보기가 없어요. 다시 선택해 주세요.');
  if(p.result)return {...p.result,duplicate:true};
  if(p.expiresAt<now())throw fail('미리보기가 만료됐어요. 다시 확인해 주세요.');
  const data=await read(channel,p.archiveId),records=await recent(channel,data.round);
  if(roundScope(data.round)!==roundScope(p.round))throw fail('회차가 변경됐어요. 다시 선택해 주세요.');
  const results=[];
  if(p.action==='payment'){
   for(const e of p.entries){
    try{const result=await confirmPayment(channel,p.archiveId,e.target,p.id+'-'+digest(e.target.id).slice(0,12),req);results.push({name:e.name,status:'paid',duplicate:!!result.duplicate});}
    catch(error){results.push({name:e.name,status:'skipped',reason:error.message});}
   }
   p.result={results,excluded:p.excluded};await repository.upsertRows([row(channel,p.id,p)]);return p.result;
  }
  if(!notifications?.health?.().smsConfigured||notifications.health().testMode)throw fail('문자 API 설정 또는 테스트 모드를 확인해 주세요.',503);
  const source=p.action==='vendor_sms'?data.vendors:data.buyers,rows=[];
  for(const e of p.entries){
   const target=source.find(t=>t.id===e.target.id);
   if(!target||fingerprint(target)!==e.fingerprint)throw fail('수령지·입금·낙찰 정보가 변경됐어요. 목록을 새로고침하고 문자를 다시 확인해 주세요.');
   const blocked=reason(target,p.action,records,p.resend);if(blocked)throw fail(target.name+': '+blocked);
   const prepared=await notifications.prepare(channel,{eventKey:'closing:'+p.id+':'+digest(target.id).slice(0,12),templateKey:actionTemplate(p.action),transport:'sms',recipientRole:p.action==='vendor_sms'?'vendor':'buyer',recipientPhone:target.phone,itemIds:target.itemIds,variables:e.variables,fallbackText:e.message,allowSmsFallback:false});
   if(!prepared.duplicate)rows.push({key:channelKey(channel,'notification',prepared.record.id),value:JSON.stringify({...prepared.record,expiresAt:new Date(now()+15*60000).toISOString()})});
   results.push({name:e.name,status:prepared.record.status,notificationId:prepared.record.id});
  }
  p.result={results,excluded:p.excluded};rows.push(row(channel,p.id,p));await repository.upsertRows(rows);return p.result;
 }
 async function assertCurrent(channel,n){
  if(!MANUAL_TEMPLATES.includes(n.templateKey))return;
  const archiveId=n.variables?.['#{회차보관}']||'',data=await read(channel,archiveId),source=n.templateKey===MANUAL_TEMPLATES[0]?data.vendors:data.buyers;
  const target=source.find(t=>t.id===n.variables?.['#{대상키}']);
  if(!target||fingerprint(target)!==n.variables?.['#{안내지문}']||target.phone!==n.recipientPhone)throw Object.assign(Error('정산·낙찰·수령 정보가 변경되어 이전 안내를 중지했어요.'),{code:'BUYER_LINK_INACTIVE'});
 }
 return {list,preview,execute,assertCurrent};
}
module.exports={createClosingOperations,MANUAL_TEMPLATES};

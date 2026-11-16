'use strict';
// One-off studio move. Keep the exception isolated from future broadcasts.
const crypto = require('node:crypto');
const FROM = 'national-cre-20261116', TO = 'national-cre-20261118';
const ID = 'studio-move-20261116-v1', TEMPLATE = 'buyer_parge_schedule_changed';
const phone = value => String(value || '').replace(/\D/g, '');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const active = row => row && !row.shippedAt && !row.deliveredAt && !['cancelled','refunded','delivered','shipped'].includes(row.status) && !['cancelled','refunded'].includes(row.paymentStatus);
const parge = row => active(row) && (row.destinationType === 'parge' || (!row.destinationType && row.carrier === '파르게')) && Boolean(row.buyerSubmittedAt);
const description = '방송 스튜디오 이전으로 11월 16일(월) 파르게 신청 건은 11월 18일(수) 방송분과 함께 배송됩니다. 배송이 늦어지는 점 양해 부탁드립니다.';
const combined = '월요일 파르게 신청 고객님이 수요일 방송에서도 낙찰받으시면 월요일 신청 건과 합배송해 드립니다.';
function sendAfter(now) {
 const day = new Date(now + 9 * 3600000).toISOString().slice(0,10);
 return new Date(Math.max(now, Date.parse(day + 'T09:00:00+09:00'))).toISOString();
}
function create({repository,channelKey,workspace,notifications,estimate,now=Date.now}) {
 const ackKey = p => channelKey(FROM,'setting',ID+'-ack-'+hash(p));
 async function rows() {
  const w = await workspace(FROM), sold = new Map(w.items.filter(i=>['sold','낙찰'].includes(i.status)).map(i=>[i.id,i]));
  const latest = new Map();
  for(const s of w.shipments) {
   if(!sold.has(s.itemId))continue;
   const item=sold.get(s.itemId);
   if(item.buyerSaleId && s.buyerSaleId && item.buyerSaleId!==s.buyerSaleId)continue;
   if(phone(item.winnerPhone) && phone(item.winnerPhone)!==phone(s.recipientPhone))continue;
   const old=latest.get(s.itemId);
   if(!old || String(s.updatedAt||'')>String(old.updatedAt||''))latest.set(s.itemId,s);
  }
  return [...latest.values()].filter(s=>parge(s)&&/^010\d{8}$/.test(phone(s.recipientPhone)));
 }
 async function notice(context,selection,schedule) {
  if(context.channel.id!==FROM || selection?.destinationType!=='parge')return null;
  const ids=new Set(context.bundleItems.map(i=>i.id));
  if(!context.shipments.some(s=>ids.has(s.itemId)&&parge(s)&&phone(s.recipientPhone)===context.anchorPhone))return null;
  const ack=(await repository.getRowsByKeys([ackKey(context.anchorPhone)]))[0];
  return {id:ID,title:'파르게 배송 일정 변경',description,combined,schedule,acknowledged:Boolean(ack)};
 }
 async function acknowledge(context,selection) {
  if(!await notice(context,selection,null))throw Object.assign(Error('해당 배송 안내 대상이 아닙니다.'),{status:409});
  await repository.upsertRows([{key:ackKey(context.anchorPhone),value:JSON.stringify({id:ID,at:new Date(now()).toISOString()})}]);
  return {acknowledged:true};
 }
 async function preview() {
  const people=new Map();
  for(const row of await rows()) {
   const p=phone(row.recipientPhone);
   if(!people.has(p))people.set(p,{phone:p,name:row.recipientName||'고객',shipments:[]});
   people.get(p).shipments.push(row);
  }
  const entries=[];
  for(const person of people.values()) {
   const schedules=await Promise.all(person.shipments.map(s=>estimate(s)));
   const days=[...new Set(schedules.filter(s=>s?.status==='estimated').map(s=>s.arrivalDate))];
   const dateText=days.length?days.map(d=>`${Number(d.slice(5,7))}월 ${Number(d.slice(8,10))}일`).join(' / '):'수령 지점별 일정은 낙찰 페이지에서 확인해 주세요.';
   entries.push({...person,itemIds:person.shipments.map(s=>s.itemId),message:`[전국크레자랑 배송 안내]\n\n${description}\n\n${days.length?'변경된 수령 예정일: ':''}${dateText}\n\n${combined}\n\n수령 예정일은 운송 상황에 따라 변경될 수 있습니다. 기존 낙찰 안내 링크에서 확인해 주세요.`});
  }
  return {id:ID,sendAfter:sendAfter(now()),entries};
 }
 async function enqueue() {
  if(!notifications?.health().smsConfigured || notifications.health().testMode)throw Object.assign(Error('실제 문자 발송 설정을 확인해 주세요.'),{status:503});
  const plan=await preview(),writes=[],results=[];
  for(const person of plan.entries) {
   const prepared=await notifications.prepare(FROM,{eventKey:ID+':'+hash(person.phone).slice(0,24),templateKey:TEMPLATE,transport:'sms',recipientRole:'buyer',recipientPhone:person.phone,itemIds:person.itemIds,fallbackText:person.message,allowSmsFallback:false});
   if(!prepared.duplicate)writes.push({key:channelKey(FROM,'notification',prepared.record.id),value:JSON.stringify({...prepared.record,nextAttemptAt:plan.sendAfter,expiresAt:new Date(Date.parse(plan.sendAfter)+48*3600000).toISOString()})});
   results.push({name:person.name,phoneLast4:person.phone.slice(-4),status:prepared.record.status,id:prepared.record.id,duplicate:prepared.duplicate});
  }
  if(writes.length)await repository.upsertRows(writes);
  return {sendAfter:plan.sendAfter,results};
 }
 async function assertCurrent(channel,n) {
  if(channel!==FROM || !(await rows()).some(s=>phone(s.recipientPhone)===n.recipientPhone))throw Object.assign(Error('배송 변경 안내 대상이 변경됐습니다.'),{code:'BUYER_LINK_INACTIVE'});
 }
 async function bundle(context) {
  if(context.channel.id!==TO)return null;
  const previous=(await rows()).filter(s=>phone(s.recipientPhone)===context.anchorPhone);
  if(!previous.length)return null;
  const destinations=[...new Set(previous.map(s=>JSON.stringify([s.pargeRegion,s.pargeShop,s.recipientName?.replace(/\s/g,'')||''])))];
  const sameName = previous.every(s=>String(s.recipientName||'').replace(/\s/g,'')===String(context.bundleItems[0]?.winnerName||'').replace(/\s/g,''));
  return {sourceDate:'2026-11-16',eligible:destinations.length===1&&sameName,pargeRegion:previous[0].pargeRegion,pargeShop:previous[0].pargeShop,itemCount:previous.length,label:'11/16 월요일 건과 합배송',review:destinations.length!==1||!sameName};
 }
 return {notice,acknowledge,preview,enqueue,assertCurrent,bundle,rows};
}
module.exports={FROM,TO,ID,TEMPLATE,description,combined,sendAfter,parge,create};

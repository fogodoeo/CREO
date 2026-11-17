'use strict';
// Nov 17: original pickup restored. Retain old records but block the withdrawn campaign.
const crypto=require('node:crypto');
const FROM='national-cre-20261116',TO='national-cre-20261118';
const ID='studio-move-20261116-v1',CORRECTION_ID='pickup-restored-20261117-v1',TEMPLATE='buyer_parge_schedule_changed';
const description='파르게 측과 재협의가 완료되어 11월 17일(화) 바로 배송을 시작하며, 이번 주중 수령 예정입니다. 앞서 안내드린 배송 지연 일정은 취소되었습니다.';
const message='[전국크레자랑 배송 정정 안내]\n\n'+description+'\n\n수령 지점에 따라 도착일이 다를 수 있으며, 변경된 일정은 기존 낙찰 안내 링크에서 확인하실 수 있습니다.\n\n혼선을 드려 죄송합니다.';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const withdrawn=()=>Object.assign(Error('배송 지연 안내가 취소되었습니다. 기존 문자를 재발송할 수 없습니다.'),{status:409,code:'BUYER_LINK_INACTIVE'});
function create({repository,channelKey,now=Date.now,notifications}){
 const ackKey=p=>channelKey(FROM,'setting',CORRECTION_ID+'-ack-'+hash(p));
 async function recipients(){
  const records=await repository.listRecords(FROM,'notification');
  return [...new Map(records.filter(n=>n.templateKey===TEMPLATE&&n.eventKey.startsWith(ID+':')&&['sent','delivery_unknown'].includes(n.status)).map(n=>[n.recipientPhone,n])).values()];
 }
 async function notice(context,selection,schedule){
  if(context.channel.id!==FROM||selection?.destinationType!=='parge'||!(await recipients()).some(n=>n.recipientPhone===context.anchorPhone))return null;
  return {id:CORRECTION_ID,title:'파르게 배송 정상 진행 안내',description,schedule,combined:'',acknowledged:Boolean((await repository.getRowsByKeys([ackKey(context.anchorPhone)]))[0])};
 }
 async function acknowledge(context,selection){
  if(!await notice(context,selection,null))throw withdrawn();
  await repository.upsertRows([{key:ackKey(context.anchorPhone),value:JSON.stringify({id:CORRECTION_ID,at:new Date(now()).toISOString()})}]);
  return {acknowledged:true};
 }
 async function correctionPreview(){
  return {id:CORRECTION_ID,sendAfter:new Date(now()).toISOString(),entries:(await recipients()).map(n=>({phone:n.recipientPhone,itemIds:n.itemIds||[],message}))};
 }
 async function correctionEnqueue(){
  if(!notifications?.health().smsConfigured||notifications.health().testMode)throw Object.assign(Error('실제 문자 발송 설정을 확인해 주세요.'),{status:503});
  const plan=await correctionPreview(),writes=[],results=[];
  for(const p of plan.entries){
   const prepared=await notifications.prepare(FROM,{eventKey:CORRECTION_ID+':'+hash(p.phone).slice(0,24),templateKey:TEMPLATE,transport:'sms',recipientRole:'buyer',recipientPhone:p.phone,itemIds:p.itemIds,fallbackText:p.message,allowSmsFallback:false});
   if(!prepared.duplicate)writes.push({key:channelKey(FROM,'notification',prepared.record.id),value:JSON.stringify(prepared.record)});
   results.push({phoneLast4:p.phone.slice(-4),id:prepared.record.id,status:prepared.record.status,duplicate:prepared.duplicate});
  }
  if(writes.length)await repository.upsertRows(writes);
  return {sendAfter:plan.sendAfter,results};
 }
 async function assertCurrent(channel,n){
  if(channel!==FROM||!String(n.eventKey).startsWith(CORRECTION_ID+':')||!(await recipients()).some(p=>p.recipientPhone===n.recipientPhone))throw withdrawn();
 }
 return {notice,acknowledge,preview:async()=>({id:ID,cancelled:true,sendAfter:null,entries:[]}),enqueue:async()=>{throw withdrawn()},assertCurrent,bundle:async()=>null,rows:async()=>[],correctionPreview,correctionEnqueue};
}
module.exports={FROM,TO,ID,CORRECTION_ID,TEMPLATE,description,message,create};

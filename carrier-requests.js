'use strict';
const crypto=require('node:crypto');
const {channelKey,cleanText}=require('./platform-core');
const {shortSms}=require('./checkout-notifications');
const Search=require('./public/carrier-search');
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const configured=context=>context.channel.shippingDefaults?.enabledCarriers||['parge'];
const publicRecord=row=>row?{state:row.state,createdAt:row.createdAt,reviewedAt:row.reviewedAt||'',reason:row.reason||''}:null;
function createCarrierRequests({repository,notificationService,now=Date.now,origin='https://creok.onrender.com',locked,resolveContext,rates,touch,canNotify=()=>true}){
 async function find(context){
  const ids=new Set(context.bundleItems.map(i=>i.id));
  return (await repository.listRecords(context.channel.id,'carrierrequest')).find(r=>r.phoneHash===context.token.phoneHash&&r.itemIds?.some(id=>ids.has(id)))||null;
 }
 function legacy(context){return context.shipments.some(s=>context.bundleItems.some(i=>i.id===s.itemId)&&s.destinationType==='dodosi'&&s.buyerSubmittedAt);}
 async function status(context){
  const record=await find(context),enabled=configured(context),gated=enabled.includes('parge');
  const canUseDodosi=legacy(context)||record?.state==='approved'||(!gated&&enabled.includes('dodosi'));
  return {...(publicRecord(record)||{state:'available'}),canUseDodosi,canRequest:gated&&!record&&!canUseDodosi&&!await locked(context)};
 }
 async function allowed(context,id){
  if(id==='dodosi')return (await status(context)).canUseDodosi;
  return configured(context).includes(id);
 }
 async function submit(context,body){
  const existing=await find(context);if(existing)return{duplicate:true};
  if(!(await status(context)).canRequest)throw fail('이 내역에서는 배송업체 이용 신청을 할 수 없어요.',409);
  const query=cleanText(body.query,80),region=cleanText(body.region,80)||'전체';
  const currentRates=await rates('parge');
  if(query.length<2||!['전체',...currentRates.map(r=>r.region)].includes(region)||Search.find(currentRates,query,region).length)throw fail('먼저 파르게에서 수령할 지역을 검색해 주세요.');
  const notify=canNotify(context.channel.id);
  if(notify&&!notificationService?.prepare)throw fail('신청 알림을 준비하지 못했어요. 잠시 후 다시 신청해 주세요.',503);
  const stamp=new Date(now()).toISOString(),id='carrier-'+crypto.randomBytes(12).toString('hex'),code='ds_'+crypto.randomBytes(12).toString('base64url');
  const bankKey='creo_organizer_shipping_bank::'+context.channel.id;
  const bankRows=await repository.getRowsByKeys([bankKey]);
  const bank=JSON.parse(bankRows.find(r=>r.key===bankKey)?.value||'{}');
  const record={id,channelId:context.channel.id,state:'pending',createdAt:stamp,updatedAt:stamp,phoneHash:context.token.phoneHash,phone:context.anchorPhone,buyerName:cleanText(context.bundleItems[0].winnerName||context.bundleItems[0].winnerAlias||'낙찰자',100),itemIds:context.bundleItems.map(i=>i.id),round:context.round,query,region,operatorCode:code};
  const url=new URL('/w/'+code,origin).href,bodyText=shortSms('도도시 승인',url);
  if(!bodyText)throw fail('신청 알림 링크를 준비하지 못했어요. 운영자에게 문의해 주세요.',503);
  const prepared=notify?await notificationService.prepare(context.channel.id,{eventKey:'carrier-request:'+id,templateKey:'operator_carrier_request',recipientRole:'operator',recipientPhone:context.channel.id.startsWith('checkout-test-')?'01049278600':bank.notificationPhone||'01049278600',transport:'sms',allowSmsFallback:false,itemIds:record.itemIds,fallbackText:bodyText}):null;
  record.notificationId=prepared?.record.id||'';record.notificationSuppressed=!notify;
  await repository.upsertRows([{key:channelKey(context.channel.id,'carrierrequest',id),value:JSON.stringify(record)},{key:'creo_carrier_request_link::'+code,value:JSON.stringify({channelId:context.channel.id,id})},...(prepared?[{key:channelKey(context.channel.id,'notification',prepared.record.id),value:JSON.stringify(prepared.record)}]:[])]);
  touch(context.channel.id);return{duplicate:false};
 }
 async function review(channel,id,body){
  const record=await repository.getRecord(channel.id,'carrierrequest',id);
  if(!record)throw fail('이용 신청을 찾을 수 없어요.',404);
  if(!['approve','reject'].includes(body.action))throw fail('허용 또는 거절을 선택해 주세요.');
  const state=body.action==='approve'?'approved':'rejected';
  if(record.state!=='pending'){if(record.state===state)return{record,duplicate:true};throw fail('이미 처리한 신청입니다. 새로고침해 주세요.',409);}
  const reason=cleanText(body.reason,300);if(state==='rejected'&&!reason)throw fail('낙찰자에게 안내할 거절 사유를 적어 주세요.');
  if(state==='approved'){
   const context=await resolveContext({v:2,channelId:channel.id,phoneHash:record.phoneHash,itemId:record.itemIds[0]});
   if(!context||!record.itemIds.every(id=>context.bundleItems.some(i=>i.id===id))||await locked(context)||!configured(context).includes('parge'))throw fail('낙찰·결제·배송 상태가 바뀌어 허용할 수 없어요. 내역을 확인해 주세요.',409);
  }
  const stamp=new Date(now()).toISOString(),next={...record,state,reason,reviewedAt:stamp,updatedAt:stamp};
  await repository.upsertRows([{key:channelKey(channel.id,'carrierrequest',id),value:JSON.stringify(next)}]);touch(channel.id);return{record:next,duplicate:false};
 }
 async function list(channelId,items){
  const ids=new Set(items.map(i=>i.id)),notifications=await repository.listRecords(channelId,'notification');
  return (await repository.listRecords(channelId,'carrierrequest')).filter(r=>r.itemIds?.length&&r.itemIds.every(id=>ids.has(id))).map(({phoneHash,operatorCode,...r})=>({...r,notificationStatus:r.notificationSuppressed?'test_no_send':notifications.find(n=>n.id===r.notificationId)?.status||'unavailable'})).sort((a,b)=>(a.state!=='pending')-(b.state!=='pending')||b.createdAt.localeCompare(a.createdAt));
 }
 return{status,allowed,submit,review,list};
}
module.exports={createCarrierRequests};

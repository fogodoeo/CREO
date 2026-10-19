'use strict';
const {normalizeChannel,channelKey}=require('./platform-core');
const {CATALOG_KEY,ACTIVE_CHANNEL_KEY}=require('./platform-repository');
const National=require('./national-broadcast');
const ROOT='national-cre';
const importId=id=>'round-'+require('node:crypto').createHash('sha256').update(id).digest('hex').slice(0,32);
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const dateOf=i=>i.attributes?.broadcastDate||i.attributes?.vendor_entry?.broadcastDate||'';
function assertDate(channel,item,current=null){
 if(current?.attributes?.roundTargetChannelId)item={...item,attributes:{...item.attributes,roundTargetChannelId:current.attributes.roundTargetChannelId,broadcastDate:dateOf(current)}};
 if(item.attributes?.roundTargetChannelId&&item.status!=='waiting')throw fail('별도 회차로 가져온 접수 개체입니다. 해당 회차에서 진행해 주세요.');
 const date=channel.nationalRound?.date||channel.shippingDefaults?.deliverySchedule?.auctionDate;if(!date)return item;
 if(dateOf(item)&&dateOf(item)!==date)throw fail('다른 방송일의 개체입니다. 해당 회차에서 등록해 주세요.');
 return {...item,attributes:{...item.attributes,broadcastDate:date}};
}
function safeUnstarted(i){
 let bids;try{bids=Array.isArray(i.attributes?.bid_log)?i.attributes.bid_log:JSON.parse(i.attributes?.bid_log||'[]');}catch{return false;}
 return i.status==='waiting'&&!i.auctionArchiveId&&!i.buyerSaleId&&!i.winnerName&&!i.winnerAlias&&!i.winnerPhone&&!Number(i.soldPrice)&&Array.isArray(bids)&&!bids.length;
}
function copyItem(source,target,date,lot){
 if(!safeUnstarted(source)||dateOf(source)!==date)throw fail('선택한 방송일의 경매 전 개체만 가져올 수 있어요.');
 const attrs=Object.fromEntries(['checklist','entry_traits','media','parents','parentPhotoOverrides','vendor_entry','registrationSource','auctionKind'].filter(k=>source.attributes?.[k]!==undefined).map(k=>[k,structuredClone(source.attributes[k])]));
 return {id:importId(source.id),channelId:target.id,name:source.name,lotNumber:lot,vendorId:source.vendorId,vendorName:source.vendorName,category:source.category||'',note:source.note||'',photoUrl:source.photoUrl||'',startPrice:source.startPrice||0,status:'waiting',soldPrice:0,winnerName:'',winnerAlias:'',winnerPhone:'',attributes:{...attrs,broadcastDate:date,displayNumber:source.attributes?.displayNumber||source.name,organizerFeePolicy:target.vendorSettlement,roundSource:{channelId:ROOT,itemId:source.id,updatedAt:source.updatedAt||''}}};
}
function createNationalRoundOperations({repository,directory,lock,touch,now=Date.now}){
 async function list(){
  const catalog=await repository.getCatalog(),activeChannelId=await repository.getActiveChannel();
  const rounds=[];
  for(const c of catalog.channels.filter(c=>c.id===ROOT||c.nationalRound?.parentId===ROOT)){
   const [all,archives]=await Promise.all(['item','archive'].map(t=>repository.listRecords(c.id,t)));
   const items=all.filter(i=>!i.auctionArchiveId),sold=items.filter(i=>i.status==='sold');
   const dates=[...new Set(sold.map(dateOf).filter(Boolean))].sort();
   const date=c.nationalRound?.date||(dates.length===1?dates[0]:'');
   const region=National.REGIONS[National.regionAt(date)]||'';
   const scoped=c.id===ROOT&&date?items.filter(i=>dateOf(i)===date):items;
   rounds.push({channelId:c.id,name:c.nationalRound?c.name:`${date||'기존 회차'} ${region} · 결제·배송`,date,status:c.status,active:activeChannelId===c.id,itemCount:scoped.length,soldCount:sold.length});
   for(const archive of archives.filter(a=>a.closedAt)){
    const archived=all.filter(i=>i.auctionArchiveId===archive.id),dates=[...new Set(archived.map(dateOf).filter(Boolean))];
    rounds.push({channelId:c.id,archiveId:archive.id,name:archive.title||archive.name||'이전 회차',date:dates.length===1?dates[0]:'',status:'history',active:false,itemCount:archived.length,soldCount:archived.filter(i=>i.status==='sold').length});
   }
  }
  return {activeChannelId,rounds:rounds.sort((a,b)=>b.date.localeCompare(a.date))};
 }
 async function command(body){
  const date=body.date,region=National.regionAt(date);
  if(region===null)throw fail('월·수 방송일을 선택해 주세요.',422);
  if(!['prepare','activate'].includes(body.action))throw fail('처리 방법을 확인해 주세요.',422);
  const targetId=ROOT+'-'+date.replaceAll('-','');
  return lock('active-channel',()=>lock('channel:'+ROOT,()=>lock('channel:'+targetId,()=>directory.lifecycle(ROOT,'',async(_profile,dir,directoryKey)=>{
   if(!repository.compareAndSwapRows)throw fail('회차 준비를 지원하는 저장소가 필요합니다.',503);
   const raw=(await repository.getRowsByKeys([CATALOG_KEY]))[0]?.value??null;
   const catalog=await repository.getCatalog(),source=catalog.channels.find(c=>c.id===ROOT);
   if(!source||source.dataAdapter!=='platform')throw fail('전국크레자랑 접수 채널을 확인해 주세요.');
   const [sourceItems,targetItems,targetShipments,targetState]=await Promise.all([repository.listRecords(ROOT,'item'),repository.listRecords(targetId,'item'),repository.listRecords(targetId,'shipment'),repository.getRecord(targetId,'broadcast','state')]);
   let target=catalog.channels.find(c=>c.id===targetId);
   if(target&&(target.nationalRound?.date!==date||target.nationalRound?.parentId!==ROOT))throw fail('같은 주소의 다른 채널이 있습니다. 운영자 확인이 필요합니다.');
   const stamp=new Date(now()).toISOString(),rows=[];
   const row=(type,r)=>({key:channelKey(targetId,type,r.id),value:JSON.stringify(r)});
   if(body.action==='activate'){
    if(!target)throw fail('먼저 회차를 준비해 주세요.');
    if(target.status==='archived'||target.status==='paused')throw fail('보관·중지된 회차는 전환할 수 없어요.');
    if(target.features?.broadcast===false)throw fail('방송 기능이 꺼진 회차입니다. 채널 설정을 확인해 주세요.');
    const active=await repository.getActiveChannel();
    if(active===targetId&&target.status==='active')return {channelId:targetId,duplicate:true,imported:0};
    const live=await repository.getRecord(active,'broadcast','state');
    const activeItems=await repository.listRecords(active,'item');
    if(live?.mode==='live'||activeItems.some(i=>i.status==='live'))throw fail('진행 중인 경매를 종료한 뒤 방송 회차를 전환해 주세요.');
    if(!targetItems.length)throw fail('출품 개체와 순서를 준비한 뒤 전환해 주세요.');
    for(const i of targetItems){assertDate(target,i);if(!dateOf(i))throw fail('방송일이 없는 개체를 확인해 주세요.');}
    if(body.expectedActiveChannelId!==active)throw fail('방송 회차가 변경됐습니다. 새로고침 후 다시 선택해 주세요.');
    if(targetState?.mode==='live'||targetItems.some(i=>i.status==='live'))throw fail('대상 회차의 진행 중 경매를 확인해 주세요.');
    target={...target,status:'active',updatedAt:stamp};
    rows.push({key:ACTIVE_CHANNEL_KEY,value:targetId});
   }else{
    if(target&&target.status!=='draft')throw fail('방송 전 준비 회차에만 새 접수를 가져올 수 있어요.');
    if(targetShipments.length||targetItems.some(i=>!safeUnstarted(i))||targetState?.mode==='live')throw fail('입찰·낙찰·배송 이력이 있는 회차에는 가져올 수 없어요.');
    const existingDates=new Set(sourceItems.filter(i=>i.auctionArchiveId||i.status==='sold').map(dateOf));
    if(existingDates.has(date))throw fail('이 날짜는 기존 회차에 낙찰·보관 기록이 있습니다. 해당 회차를 열어 주세요.');
    if(!target){
     target=normalizeChannel({...source,id:targetId,name:`전국크레자랑 · ${date.slice(5).replace('-','/')} ${National.REGIONS[region]}`,shortName:`${date.slice(5)} ${National.REGIONS[region]}`,status:'draft',nationalRound:{parentId:ROOT,date},shippingSupport:{enabled:false,broadcastDate:date,maxAmount:0},settlementDiscount:{enabled:false},pages:{},legacy:{items:false},broadcastDefaults:{...source.broadcastDefaults,page3Title:`${National.REGIONS[region]}편`}});
     target.createdAt=stamp;target.updatedAt=stamp;
     const b=await repository.getRecord(ROOT,'broadcast','state');
     const geometry=Object.fromEntries(['layoutPlacements','layoutPreset','textLayouts','visibleFields','page1Style','page2Style'].filter(k=>b?.[k]!==undefined).map(k=>[k,b[k]]));
     rows.push(row('broadcast',{id:'state',...geometry,mode:'standby',activeItemId:'',page:1,updatedAt:stamp}));
     const config=await repository.getRecord(ROOT,'setting','broadcast-config');
     // Only presentation settings cross the boundary, never active-item/session state.
     if(config)rows.push(row('setting',{id:'broadcast-config',values:Object.fromEntries(Object.entries(config.values||{}).filter(([k])=>/^(?:page[123]_|p[123]_|font_|layout_|overlay_|theme_|live_bidders_)/.test(k))),revision:now()}));
    }
    const sourceVendors=await directory.list(ROOT),known=new Set(targetItems.map(i=>i.attributes?.roundSource?.itemId)),usedVendors=new Set();
    let lot=Math.max(0,...targetItems.map(i=>Number(i.lotNumber)||0));
    for(const item of sourceItems.filter(i=>dateOf(i)===date&&!i.auctionArchiveId).sort((a,b)=>(a.lotNumber||0)-(b.lotNumber||0)||a.id.localeCompare(b.id))){
     if(known.has(item.id))continue;
     if(targetItems.some(i=>i.id===importId(item.id)))throw fail('개체 식별자가 겹칩니다. 확인 후 다시 준비해 주세요.');
     if(item.attributes?.roundTargetChannelId&&item.attributes.roundTargetChannelId!==targetId)throw fail('이미 다른 회차로 가져온 개체입니다.');
     const vendor=sourceVendors.find(v=>v.id===item.vendorId&&v.active!==false&&!v.deletedAt);if(!vendor)throw fail('출품 업체 정보를 확인해 주세요.');
     const copy=copyItem(item,target,date,++lot);copy.createdAt=stamp;copy.updatedAt=stamp;rows.push(row('item',copy));usedVendors.add(vendor.id);
     rows.push({key:channelKey(ROOT,'item',item.id),value:JSON.stringify({...item,attributes:{...item.attributes,roundTargetChannelId:targetId},updatedAt:stamp})});
    }
    for(const id of usedVendors){
     const vendor=sourceVendors.find(v=>v.id===id),profile=dir.profiles.find(p=>p.members.some(m=>m.channelId===ROOT&&m.vendorId===id));
     if(!profile||profile.deletedAt)throw fail('공통 업체 등록을 확인한 뒤 다시 가져와 주세요.');
     if(profile&&!profile.members.some(m=>m.channelId===targetId)){profile.members.push({channelId:targetId,vendorId:id});profile.revision++;}
     else if(profile&&!profile.members.some(m=>m.channelId===targetId&&m.vendorId===id))throw fail('업체 연결 정보가 다릅니다.');
     if(!await repository.getRecord(targetId,'vendor',id))rows.push(row('vendor',{...vendor,id,channelId:targetId}));
    }
    if(!rows.length)return {channelId:targetId,duplicate:true,imported:0};
    rows.push({key:directoryKey,value:JSON.stringify(dir)});
   }
   const channels=catalog.channels.some(c=>c.id===targetId)?catalog.channels.map(c=>c.id===targetId?target:c):[...catalog.channels,target];
   rows.push({key:CATALOG_KEY,value:JSON.stringify({version:catalog.version+1,updatedAt:stamp,channels})});
   const committed=await repository.compareAndSwapRows(CATALOG_KEY,raw,rows);
   if(!committed)throw fail('운영 설정이 변경됐습니다. 새로고침 후 다시 시도해 주세요.');
   touch(targetId);return {channelId:targetId,imported:rows.filter(r=>r.key.startsWith(channelKey(targetId,'item',''))).length,duplicate:false};
  }))));
 }
 return {list,command};
}
module.exports={createNationalRoundOperations,assertDate,copyItem,safeUnstarted};

'use strict';
const fail=message=>Object.assign(Error(message),{status:409,code:'ROUND_SCOPE_REQUIRED'});
const itemDate=i=>i.attributes?.broadcastDate||i.attributes?.vendor_entry?.broadcastDate||'';
const family=c=>c.id==='national-cre'||c.nationalRound?.parentId==='national-cre'?'national-cre':/^(?:creyon|clab)(?:-|$)/.test(c.id)?'clab':c.id;
const scopeKey=i=>i.auctionArchiveId?'archive:'+i.auctionArchiveId:itemDate(i)?'date:'+itemDate(i):'current';
function buyerScope(items,anchorId,phoneItems){
 if(anchorId){const anchor=items.find(i=>i.id===anchorId);if(!anchor)throw fail('선택한 낙찰 기록이 없습니다.');return items.filter(i=>scopeKey(i)===scopeKey(anchor));}
 const keys=new Set(phoneItems.map(scopeKey));
 if(keys.size>1)throw fail('여러 회차의 낙찰 내역이 있습니다. 해당 회차의 개체에서 배송·결제를 열어 주세요.');
 return items.filter(i=>keys.has(scopeKey(i)));
}
function currentDate(channel,items){
 const fixed=channel.nationalRound?.date||channel.shippingDefaults?.deliverySchedule?.auctionDate;
 if(fixed)return fixed;
 const candidates=items.filter(i=>!i.auctionArchiveId&&!i.attributes?.roundTargetChannelId),started=candidates.filter(i=>['live','sold'].includes(i.status));
 const dates=[...new Set((started.length?started:candidates).map(itemDate).filter(Boolean))];
 if(dates.length>1)throw fail('여러 방송일의 개체가 있습니다. 회차 준비에서 방송일을 구분한 뒤 다시 열어 주세요.');
 return dates[0]||'';
}
function scopeWorkspace(channel,data,archiveId=''){
 const all=[...new Map([...(data.items||[]),...(data.archivedItems||[])].map(i=>[i.id,i])).values()];
 const date=archiveId?'':currentDate(channel,all);
 const items=all.filter(i=>archiveId?i.auctionArchiveId===archiveId:!i.auctionArchiveId&&!i.attributes?.roundTargetChannelId&&(!date||!itemDate(i)||itemDate(i)===date));
 const ids=new Set(items.map(i=>i.id));
 return {...data,items,archivedItems:[],archivedItemCount:0,shipments:(data.shipments||[]).filter(s=>ids.has(s.itemId)),round:{channelId:channel.id,archiveId,date,name:archiveId?'이전 회차':channel.id==='national-cre'&&date?`전국크레자랑 · ${date} 회차`:channel.name}};
}
async function scopedWorkspace(repository,channel,data,archiveId=''){
 let archive=null;
 if(archiveId){archive=await repository.getRecord(channel.id,'archive',archiveId);if(!archive?.closedAt)throw Object.assign(Error('선택한 보관 회차를 찾을 수 없습니다.'),{status:404});}
 const scoped=scopeWorkspace(channel,data,archiveId);
 if(archive){const dates=[...new Set(scoped.items.map(itemDate).filter(Boolean))];scoped.round={...scoped.round,name:archive.title||'이전 회차',date:dates.length===1?dates[0]:''};}
 return scoped;
}
function assertShipmentScope(channel,data,record,body){
 if(!Object.prototype.hasOwnProperty.call(body,'expectedArchiveId'))return;
 if(!scopeWorkspace(channel,data,body.expectedArchiveId||'').items.some(i=>i.id===record.itemId))throw fail('회차가 변경되었습니다. 해당 회차를 다시 선택한 뒤 저장해 주세요.');
}
async function list(repository){
 const catalog=await repository.getCatalog(),activeChannelId=await repository.getActiveChannel(),rounds=[];
 for(const c of catalog.channels.filter(c=>!c.id.startsWith('checkout-test-'))){
  const [items,archives]=await Promise.all([repository.listRecords(c.id,'item'),repository.listRecords(c.id,'archive')]);
  let date='',scopeError='';try{date=currentDate(c,items)}catch(e){scopeError=e.message}
  const current=scopeError?[]:scopeWorkspace(c,{items}).items;
  rounds.push({channelId:c.id,familyId:family(c),name:c.id==='national-cre'&&date?`전국크레자랑 · ${date} 회차`:c.name,date,status:c.status,active:activeChannelId===c.id,itemCount:current.length,soldCount:current.filter(i=>i.status==='sold').length,scopeError});
  for(const a of archives.filter(a=>a.closedAt)){
   const rows=items.filter(i=>i.auctionArchiveId===a.id),dates=[...new Set(rows.map(itemDate).filter(Boolean))];
   rounds.push({channelId:c.id,familyId:family(c),archiveId:a.id,name:a.title||'이전 회차',date:dates.length===1?dates[0]:'',status:'history',active:false,itemCount:rows.length,soldCount:rows.filter(i=>i.status==='sold').length});
  }
 }
 return {catalogVersion:catalog.version,channels:catalog.channels.filter(c=>!c.id.startsWith('checkout-test-')),activeChannelId,rounds:rounds.sort((a,b)=>b.date.localeCompare(a.date)||Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'ko'))};
}
module.exports={family,itemDate,currentDate,scopeKey,buyerScope,scopeWorkspace,scopedWorkspace,list,assertShipmentScope};

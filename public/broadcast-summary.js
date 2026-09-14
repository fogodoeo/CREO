(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBroadcastSummary=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const seconds=value=>Math.max(5,Math.min(60,Number(value)||10));
 const sold=item=>['sold','completed','complete','낙찰','완료'].includes(String(item?.status||'').trim().toLowerCase());
 function standard(channel,renderer){return !['tournament','academy','dice-teams'].includes(renderer)&&!(channel?.scoreboards||[]).some(board=>board.metric==='vendorContribution')}
 function rankings(items,kind,channelId=''){
  const records=new Map(),rows=new Map();
  for(const item of items||[]){if(channelId&&item.channelId&&item.channelId!==channelId)continue;const key=String(item.id||'');if(!key)continue;const previous=records.get(key);if(!previous||String(item.updatedAt||'')>=String(previous.updatedAt||''))records.set(key,item)}
  for(const item of records.values()){
   const amount=Number(item.soldPrice);if(!sold(item)||!Number.isFinite(amount)||amount<=0)continue;
   const name=String(kind==='buyer'?item.winnerAlias:item.vendorName||'업체 미지정').trim();if(!name)continue;
   const key=String(kind==='buyer'?item.winnerPublicKey||name:item.vendorId||name);
   const row=rows.get(key)||{key,name,total:0,count:0};row.total+=amount;row.count++;rows.set(key,row);
  }
  return [...rows.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'ko')||a.key.localeCompare(b.key));
 }
 function scenes(state,items,channelId=''){
  if(state.page3On===false)return [];
  const kinds=[...(state.page3VendorRankingOn!==false?['vendor']:[]),...(state.page3BuyerRankingOn===true?['buyer']:[])];
  const boards=kinds.map(kind=>({kind,rows:rankings(items,kind,channelId)})),result=[],pages=Math.max(1,...boards.map(b=>Math.ceil(b.rows.length/5)));
  for(let page=0;page<pages;page++)for(const board of boards){const count=Math.max(1,Math.ceil(board.rows.length/5));if(page<count)result.push({kind:board.kind,rows:board.rows.slice(page*5,page*5+5),offset:page*5,page:page+1,pages:count})}
  return result;
 }
 function scene(state,items,elapsed=0,channelId=''){const rows=scenes(state,items,channelId);return rows.length?rows[Math.floor(Math.max(0,elapsed)/(seconds(state.page3RankingInterval)*1000))%rows.length]:null}
 function photoUrl(value){const url=String(value||'').trim();return !url.startsWith('/__entry_photo__/')&&(/^(https?:\/\/|\/[^/])/.test(url))?url:''}
 function parentPhotos(item){
  const attributes=item?.attributes||{};
  return ['sire','dam'].map(role=>{
   const parent=(Array.isArray(attributes.parents)?attributes.parents:[]).find(row=>row?.role===role),media=parent?.media?.[0];
   const url=parent?photoUrl(media?.url)||photoUrl(media?.thumbnailUrl):photoUrl(attributes['photo_'+role]||item?.[role==='sire'?'photoSire':'photoDam']);
   const name=String(parent?.name||attributes['photo_'+role+'_name']||attributes[role+'_name']||'').trim().slice(0,80);
   return url?{role,label:role==='sire'?'부':'모',name,url}:null;
  }).filter(Boolean);
 }
 function samples(){return [
  ['s1','크레용 대구본점','김민준',450000],['s2','크레용 양산','이서연',320000],['s3','오늘도마뱀','박지훈',280000],
  ['s4','크레용 부천','최유진',210000],['s5','크레용 과천','정도윤',180000],['s6','크레용 대구본점','이서연',150000]
 ].map(([id,vendorName,winnerAlias,soldPrice])=>({id,vendorId:vendorName,vendorName,winnerAlias,winnerPublicKey:winnerAlias,soldPrice,status:'sold'}))}
 return Object.freeze({standard,rankings,scenes,scene,seconds,parentPhotos,samples});
});

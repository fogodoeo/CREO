'use strict';
const {captureIdFor}=require('./capture-api');
const {checkoutItem}=require('./checkout-item-data');

// Call only after resolving buyer ownership. Never match by the visible lot number.
async function withCapturePhotos(repository,channelId,items){
 return Promise.all(items.map(async item=>{
  let capture;
  try{capture=await repository.getRecord(channelId,'capture',captureIdFor(channelId,item.id));}
  catch{return item;} // Optional photos must not prevent checkout during storage trouble.
  if(!capture||capture.channelId!==channelId||capture.itemId!==item.id||capture.status!=='complete'||capture.confirmed!==true||!/^[-\w]{16,80}$/.test(capture.shareToken||'')||!/^[-\w]{16,80}$/.test(capture.confirmationId||''))return item;
  const base=`/api/capture/image/${encodeURIComponent(channelId)}/${encodeURIComponent(capture.shareToken)}`;
  const projected=checkoutItem(item),parentCount=(projected.parents||[]).reduce((n,p)=>n+p.media.length,0);
  const media=(projected.media||[]).filter(photo=>photo.url.split('?')[0]!==base).slice(0,Math.max(0,11-parentCount));
  return {...item,media:[{url:base+'?confirmation='+encodeURIComponent(capture.confirmationId),label:'경매 현장 사진'},...media]};
 }));
}
async function withCollectionCapturePhotos(repository,channelId,records,items){
 const eligible=items.filter((_,index)=>records[index].recordState==='current');
 const hydrated=await withCapturePhotos(repository,channelId,eligible);
 let index=0;
 return items.map((item,i)=>records[i].recordState==='current'?hydrated[index++]:item);
}
module.exports={withCapturePhotos,withCollectionCapturePhotos};

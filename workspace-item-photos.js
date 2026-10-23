'use strict';
const crypto=require('node:crypto'),Facts=require('./public/workspace-item-facts'),Save=require('./workspace-item-save');
const fail=(message,status)=>Object.assign(Error(message),{status}),uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
function owner(channelId){const h=crypto.createHash('sha256').update('creo-admin-item-photo:'+channelId).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
function create({repository,storage,processor}){
 let active=0;
 async function scope(channelId,body){const channel=(await repository.getCatalog()).channels.find(c=>c.id===channelId);if(!channel||!['draft','active'].includes(channel.status))throw fail('편집 가능한 회차에서 사진을 선택해 주세요.',409);Save.assertScope(channel,{items:await repository.listRecords(channelId,'item')},body,{attributes:{}});return channel;}
 async function upload(channelId,body){
  if(!uuid.test(String(body.id||'')))throw fail('사진을 다시 선택해 주세요.',422);
  await scope(channelId,body);if(!storage)throw fail('사진 저장소에 연결하지 못했어요. 잠시 후 다시 저장해 주세요.',503);if(active>=2)throw fail('다른 사진을 처리 중이에요. 잠시 후 다시 저장해 주세요.',429);
  active++;try{await storage.ensureReady();const photo=await processor(body.image),media=storage.describe(owner(channelId),body.id,photo.full,photo.thumb,photo);await scope(channelId,body);await storage.persist(media,photo.full,photo.thumb);return {media};}finally{active--;}
 }
 async function views(channelId,itemId){const item=await repository.getRecord(channelId,'item',itemId);if(!item)throw fail('개체를 찾을 수 없어요. 목록을 다시 불러와 주세요.',404);const references={};for(const role of ['child','sire','dam'])for(const media of Facts.photos(item,role).slice(0,12))for(const key of ['url','thumbnailUrl'])if(media[key]){const value=String(media[key]);references[value]=value.startsWith('/__entry_photo__/')&&storage?await storage.resolve(value):value;}return {itemId:item.id,updatedAt:item.updatedAt,references};}
 return {upload,views};
}
module.exports={create,owner};

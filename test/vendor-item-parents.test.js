'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createVendorEntries}=require('../vendor-entries');
function fixture(){
 const rows=new Map(),repository={rows,async getRowsByKeys(keys){return keys.map(k=>rows.get(k)).filter(Boolean).map(r=>({...r}))},async upsertRows(values){for(const r of values)rows.set(r.key,{...r})},async getRecord(c,t,id){const r=rows.get(`creo_v2::${c}::${t}::${id}`);return r?JSON.parse(r.value):null},async listRecords(c,t){return [...rows].filter(([k])=>k.startsWith(`creo_v2::${c}::${t}::`)).map(([,r])=>JSON.parse(r.value))}};
 const channel={id:'national-cre',name:'가상 방송',status:'active'},vendor={id:'vendor',name:'가상 업체',active:true,phone:'01000000001',bankName:'가상은행',bankAccount:'000',bankHolder:'테스트'},profile={id:randomUUID(),members:[{channelId:channel.id,vendorId:vendor.id}]},context={channel,vendor,profile,catalog:{channels:[channel]}};
 const put=(type,value)=>rows.set(`creo_v2::national-cre::${type}::${value.id}`,{key:`creo_v2::national-cre::${type}::${value.id}`,value:JSON.stringify(value)});
 put('setting',{id:'entry-policy',open:true});
 const item={id:'imported',name:'A01',lotNumber:1,vendorId:vendor.id,status:'waiting',startPrice:10000,soldPrice:0,updatedAt:'2026-10-14T10:00:00.000Z',attributes:{broadcastDate:'2026-10-14',checklist:'gender:M|weight:5',organizerFeePolicy:{enabled:true,entryFee:10000,ratePercent:10}}};put('item',item);
 const service=createVendorEntries(repository),media=async(label='photo')=>{const id=randomUUID();await service.addMedia(context,{id,url:'/assets/'+label+'.webp',thumbnailUrl:'/assets/'+label+'-thumb.webp',size:100,thumbnailSize:20});return id};
 const command=(photoId,extra={})=>({itemId:item.id,side:'sire',photoId,expectedUpdatedAt:item.updatedAt,requestId:randomUUID(),...extra});
 return {rows,repository,context,put,item,service,media,command};
}
test('imported lots accept parent photos without a reservation and preserve auction facts',async()=>{
 const f=fixture(),id=await f.media();await f.service.updateItemParents(f.context,f.command(id));
 const saved=await f.repository.getRecord('national-cre','item',f.item.id);
 assert.deepEqual({...saved,updatedAt:f.item.updatedAt,attributes:f.item.attributes},f.item);assert.deepEqual(saved.attributes.organizerFeePolicy,f.item.attributes.organizerFeePolicy);
 assert.equal(saved.attributes.parents[0].media[0].url,'/assets/photo.webp');
 const visible=await f.service.auctionPhotos(f.context);assert.equal(visible.length,1);assert.equal(visible[0].parentPhotoIds.sire,id);assert.equal(visible[0].canEdit,true);assert.equal(visible[0].traits.weight,'5');assert.equal(visible[0].parents[0].media[0].url,'/assets/photo.webp');
 assert.equal(JSON.stringify(visible).includes('bankAccount'),false);
});
test('parent photo retries are idempotent across concurrency and restart',async()=>{
 const f=fixture(),id=await f.media(),body=f.command(id),results=await Promise.all([f.service.updateItemParents(f.context,body),f.service.updateItemParents(f.context,body)]);
 assert.deepEqual(results.map(r=>r.duplicate).sort(),[false,true]);const saved=await f.repository.getRecord('national-cre','item',f.item.id);
 assert.equal((await createVendorEntries(f.repository).updateItemParents(f.context,body)).duplicate,true);assert.deepEqual(await f.repository.getRecord('national-cre','item',f.item.id),saved);
 await assert.rejects(f.service.updateItemParents(f.context,{...body,side:'dam'}),/요청 내용/);
});
test('stale, foreign, archived and unknown media edits fail without writes; sold photos are frozen',async()=>{
 const f=fixture(),id=await f.media();
 for(const [context,body] of [[f.context,f.command(id,{expectedUpdatedAt:'stale'})],[f.context,f.command(randomUUID())],[{...f.context,vendor:{...f.context.vendor,id:'other'},profile:{...f.context.profile,members:[{channelId:'national-cre',vendorId:'other'}]}},f.command(id)],[{...f.context,channel:{...f.context.channel,status:'archived'}},f.command(id)]]){const before=[...f.rows];await assert.rejects(f.service.updateItemParents(context,body));assert.deepEqual([...f.rows],before);}
 for(const status of ['sold','cancelled']){f.put('item',{...f.item,status});const before=[...f.rows];await assert.rejects(f.service.updateItemParents(f.context,f.command(id)));assert.deepEqual([...f.rows],before);assert.equal((await f.service.auctionPhotos(f.context))[0].canEdit,false);}
});
test('live photos update without changing bids; competing saves reject the stale writer',async()=>{
 const f=fixture(),a=await f.media('a'),b=await f.media('b');f.put('item',{...f.item,status:'live',attributes:{...f.item.attributes,bid_log:[{name:'가상',amount:10}]}});
 const result=await Promise.allSettled([f.service.updateItemParents(f.context,f.command(a)),f.service.updateItemParents(f.context,f.command(b,{side:'dam'}))]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const saved=await f.repository.getRecord('national-cre','item',f.item.id);assert.equal(saved.status,'live');assert.deepEqual(saved.attributes.bid_log,[{name:'가상',amount:10}]);
});
test('failed atomic save leaves item and receipt untouched and can retry',async()=>{
 const f=fixture(),id=await f.media(),body=f.command(id),before=[...f.rows],write=f.repository.upsertRows;
 f.repository.upsertRows=async()=>{throw Error('storage failed')};await assert.rejects(f.service.updateItemParents(f.context,body),/storage failed/);assert.deepEqual([...f.rows],before);f.repository.upsertRows=write;
 assert.equal((await f.service.updateItemParents(f.context,body)).duplicate,false);
});
test('approved library photos can be replaced, removed and restored without reapproval',async()=>{
 const f=fixture(),old=await f.media('old'),next=await f.media('next'),parentId=randomUUID(),entryId=randomUUID();
 await f.service.command(f.context,{type:'parent',requestId:randomUUID(),parent:{id:parentId,name:'가상 부모',sex:'male',photoId:old}});
 await f.service.command(f.context,{type:'submit',requestId:randomUUID(),entry:{id:entryId,sex:'male',weight:'5',sireId:parentId}});
 await f.service.command(f.context,{type:'approve',requestId:randomUUID(),id:entryId,expectedVersion:1,lot:'A02',order:2},{operator:true});
 const item=await f.repository.getRecord('national-cre','item','entry-'+entryId),entryBefore=(await f.service.read(f.context)).entries[0];
 for(const photoId of [next,'',old]){
  const current=await f.repository.getRecord('national-cre','item',item.id);
  await f.service.updateItemParents(f.context,f.command(photoId,{itemId:item.id,expectedUpdatedAt:current.updatedAt}));
  const hydrated=(await f.service.hydrateItems('national-cre',[await f.repository.getRecord('national-cre','item',item.id)]))[0];
  assert.equal(hydrated.attributes.parents[0].media.length,photoId?1:0);if(photoId)assert.equal(hydrated.attributes.parents[0].media[0].url,photoId===next?'/assets/next.webp':'/assets/old.webp');
  assert.equal(hydrated.attributes.parents[0].name,'가상 부모');
 }
 assert.deepEqual((await f.service.read(f.context)).entries[0],entryBefore);
});

test('parent names save without photos, survive restart and do not change auction facts',async()=>{
 const f=fixture(),body=f.command(undefined,{name:'헐크'});delete body.photoId;
 const results=await Promise.all([f.service.updateItemParents(f.context,body),f.service.updateItemParents(f.context,body)]);
 assert.deepEqual(results.map(r=>r.duplicate).sort(),[false,true]);
 const service=createVendorEntries(f.repository),item=await f.repository.getRecord('national-cre','item',f.item.id);
 assert.equal((await service.updateItemParents(f.context,body)).duplicate,true);
 assert.deepEqual(item.attributes.parents,[{role:'sire',name:'헐크',morph:'',media:[]}]);
 assert.equal((await service.auctionPhotos(f.context))[0].parents[0].name,'헐크');
 await assert.rejects(service.updateItemParents(f.context,{...body,name:'다른 이름'}),/요청 내용/);
 await assert.rejects(service.updateItemParents(f.context,{...body,requestId:randomUUID(),name:'오래된 수정'}),/개체가 변경/);
 assert.deepEqual({...item,updatedAt:f.item.updatedAt,attributes:f.item.attributes},f.item);
});
test('name and photo patches preserve each other and the opposite parent',async()=>{
 const f=fixture(),photoId=await f.media(),save=async(side,patch)=>{const current=await f.repository.getRecord('national-cre','item',f.item.id);return f.service.updateItemParents(f.context,{itemId:f.item.id,side,...patch,expectedUpdatedAt:current.updatedAt,requestId:randomUUID()})};
 await save('sire',{name:'헐크',photoId});await save('dam',{name:'리즈'});await save('sire',{name:'헐크 수정'});
 let item=await f.repository.getRecord('national-cre','item',f.item.id);assert.equal(item.attributes.parents.find(p=>p.role==='sire').media[0].url,'/assets/photo.webp');
 await save('sire',{photoId:''});item=await f.repository.getRecord('national-cre','item',f.item.id);
 assert.equal(item.attributes.parents.find(p=>p.role==='sire').name,'헐크 수정');assert.equal(item.attributes.parents.find(p=>p.role==='dam').name,'리즈');
 await save('sire',{photoId});await save('sire',{name:''});item=await f.repository.getRecord('national-cre','item',f.item.id);
 assert.equal(item.attributes.parents.find(p=>p.role==='sire').media.length,1);assert.equal(item.attributes.parents.find(p=>p.role==='sire').name,'');
 const before=[...f.rows],upsert=f.repository.upsertRows;f.repository.upsertRows=async()=>{throw Error('storage failed')};await assert.rejects(save('dam',{name:'저장 실패'}),/storage failed/);assert.deepEqual([...f.rows],before);f.repository.upsertRows=upsert;
});

'use strict';
const crypto=require('node:crypto');
const {checkoutItem}=require('./checkout-item-data');
const {cleanText,channelKey}=require('./platform-core');
const ROOT='creo_v2::buyer-collection::';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
function saleIdentity(channelId,item){
 // Edits to photos/parents/names must not invalidate ownership; a new sale must.
 return crypto.createHash('sha256').update(JSON.stringify([channelId,item.id,item.buyerSaleId||'',String(item.winnerPhone||'').replace(/\D/g,''),Number(item.soldPrice)||0])).digest('base64url');
}
function captureRecord(context,item,identity,stamp){
 const parents=item.parents||item.attributes?.parents||[];
 const vendor=context.vendors.find(v=>v.id===item.vendorId);
 return {schema:1,identity,itemId:item.id,capturedAt:stamp,
  // Store only the checkout projection. Bid logs, phone numbers, bank details
  // and arbitrary attributes must never enter the personal item archive.
  item:{...checkoutItem(item),vendorName:cleanText(vendor?.name||item.vendorName||'업체',100)},
  ...(vendor?.directoryId?{vendorSource:{directoryId:vendor.directoryId}}:{}),
  parentSource:{ownerId:cleanText(item.attributes?.vendor_entry?.ownerId,80),refs:(Array.isArray(parents)?parents:[]).filter(p=>p&&['sire','dam','부','모'].includes(p.role)&&p.id).slice(0,2).map(p=>({id:cleanText(p.id,80),role:({부:'sire',모:'dam'})[p.role]||p.role}))}};
}
function createBuyerCollection({repository,auth,linkAccess,resolveProof,resolveRecords,hydrateRecords,now=Date.now}){
 const key=accountId=>ROOT+'account::'+accountId;
 const recordKey=identity=>ROOT+'record::'+auth.digest(identity);
 const load=async accountId=>{const saved=await auth.read(key(accountId));if(saved&&(!Array.isArray(saved.grants)||!Number.isSafeInteger(saved.revision)))throw fail('보관함을 불러오지 못했어요.',503);return saved||{revision:0,grants:[]};};
 async function preview(account,code){
  if(!account.phoneHash)throw fail('카카오 전화번호 제공에 동의한 뒤 다시 로그인해 주세요.',403);
  const context=await resolveProof(code);
  if(!context||context.token.phoneHash!==account.phoneHash)throw fail('로그인한 번호의 유효한 낙찰 링크를 확인해 주세요.',403);
  // Historical imports require frozen winner evidence, never current membership guesses.
  const items=context.bundleItems.filter(item=>item.winnerPhone&&crypto.createHash('sha256').update(String(item.winnerPhone).replace(/\D/g,'')).digest('base64url')===account.phoneHash);
  if(!items.length)throw fail('낙찰자 기록을 운영자에게 확인해 주세요.',409);
  return {context,items,id:auth.digest(context.channel.id+':'+context.token.phoneHash)};
 }
 function publicPreview(proof){return {id:proof.id,channel:{id:proof.context.channel.id,name:proof.context.channel.name},itemCount:proof.items.length,amount:proof.items.reduce((n,i)=>n+(Number(i.soldPrice)||0),0)};}
 async function connect(account,{code,expectedRevision,requestId}){
  if(typeof requestId!=='string'||!/^[-\w]{8,80}$/.test(requestId))throw fail('연결 요청을 다시 확인해 주세요.',422);
  return auth.lock(ROOT+'connections',async()=>{
   const stored=await load(account.accountId),receiptKey=ROOT+'request::'+auth.digest(account.accountId+':'+requestId),receipt=await auth.read(receiptKey);
   if(receipt){if(receipt.codeHash!==auth.digest(code))throw fail('이미 다른 연결에 사용된 요청이에요.');return {duplicate:true,revision:stored.revision,id:receipt.id};}
   if(expectedRevision!==stored.revision)throw fail('보관함이 바뀌었어요. 새로고침해 주세요.');
   const proof=await preview(account,code),old=stored.grants.find(g=>g.id===proof.id),items=new Map((old?.items||[]).map(i=>[i.identity,i]));
   const rows=[];
   for(const original of proof.items){
    const item=original.buyerSaleId?original:{...original,buyerSaleId:crypto.randomUUID()};
    if(!original.buyerSaleId)rows.push({key:channelKey(proof.context.channel.id,'item',item.id),value:JSON.stringify(item)});
    const identity=saleIdentity(proof.context.channel.id,item),ownerKey=ROOT+'owner::'+auth.digest(identity),owner=await auth.read(ownerKey);
    if(owner&&owner.accountId!==account.accountId)throw fail('다른 보관함에 연결된 내역이에요. 운영자에게 확인해 주세요.');
    const record=await auth.read(recordKey(identity));
    if(!record)rows.push(auth.row(recordKey(identity),captureRecord(proof.context,item,identity,now())));
    rows.push(auth.row(ownerKey,{accountId:account.accountId,grantId:proof.id,linkedAt:owner?.linkedAt||now()}));items.set(identity,{id:item.id,identity});
   }
   const grant={id:proof.id,channelId:proof.context.channel.id,channelName:proof.context.channel.name,phoneHash:account.phoneHash,accessGeneration:proof.context.token.accessGeneration||0,items:[...items.values()],linkedAt:old?.linkedAt||now(),updatedAt:now()};
   const grants=[grant,...stored.grants.filter(g=>g.id!==grant.id)];
   if(grants.length>500||grants.reduce((n,g)=>n+g.items.length,0)>5000)throw fail('보관함 연결 한도를 운영자에게 확인해 주세요.');
   const revision=stored.revision+1;
   rows.push(auth.row(key(account.accountId),{revision,grants}),auth.row(receiptKey,{codeHash:auth.digest(code),id:grant.id,createdAt:now()}));
   await repository.upsertRows(rows);return {duplicate:false,revision,id:grant.id};
  });
 }
 async function accessible(grant){return linkAccess.accepts({channelId:grant.channelId,phoneHash:grant.phoneHash,accessGeneration:grant.accessGeneration});}
 async function list(account,{offset=0}={}){
  const stored=await load(account.accountId),start=Math.max(0,Math.min(stored.grants.length,Math.floor(Number(offset)||0))),page=stored.grants.slice(start,start+20),records=[];
  for(const grant of page)records.push({id:grant.id,channelName:grant.channelName,itemCount:grant.items.length,linkedAt:new Date(grant.linkedAt).toISOString(),available:await accessible(grant)});
  return {revision:stored.revision,records,nextOffset:start+20<stored.grants.length?start+20:null,total:stored.grants.length};
 }
 async function detail(account,id){
  const grant=(await load(account.accountId)).grants.find(g=>g.id===id);if(!grant)throw fail('연결된 내역이 없어요.',404);
  if(!await accessible(grant))throw fail('새 낙찰 링크로 다시 연결해 주세요.',403);
  const [saved,context]=await Promise.all([auth.readMany(grant.items.map(item=>recordKey(item.identity))),resolveRecords(grant)]);
  const records=grant.items.map(entry=>{
   const record=saved.get(recordKey(entry.identity));
   if(!record||record.schema!==1||record.identity!==entry.identity||record.itemId!==entry.id||!record.item)throw fail('낙찰 링크로 다시 연결해 주세요.',409);
   const current=context.items.find(item=>item.id===entry.id);
   return {...record,recordState:!current?'archived':current.status==='sold'&&saleIdentity(grant.channelId,current)===entry.identity?'current':'changed'};
  });
  const items=await hydrateRecords(records);
  // Revocation during photo/parent resolution must not return private content.
  if(!await accessible(grant))throw fail('새 낙찰 링크로 다시 연결해 주세요.',403);
  return {channel:{id:grant.channelId,name:grant.channelName,status:context.channel?.status||'archived'},readOnly:true,
   items:items.map((item,index)=>({...item,id:records[index].identity,recordState:records[index].recordState}))};
 }
 return {preview:async(account,code)=>publicPreview(await preview(account,code)),connect,list,detail};
}
module.exports={createBuyerCollection,saleIdentity};

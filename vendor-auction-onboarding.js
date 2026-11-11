'use strict';
const crypto=require('node:crypto');
const {channelKey}=require('./platform-core');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const normalizeName=value=>String(value||'').normalize('NFKC').replace(/[\s\p{Cf}]/gu,'').toLocaleLowerCase('ko-KR');
const number=value=>String(value||'').replace(/[\s-]/g,'');

// Registration is scoped to an open auction. It never joins shared identities
// by name or changes an established representative's number.
function createVendorAuctionOnboarding({repository,directory,loadCatalog,lock,now=Date.now}){
 async function auctions(){
  const catalog=await loadCatalog(),today=new Date(now()+9*3600000).toISOString().slice(0,10),rows=[];
  for(const c of catalog.channels){
   if(c.status!=='active'||c.dataAdapter!=='platform'||c.features?.auction===false||c.features?.shipping===false||c.nationalRound?.parentId==='national-cre')continue;
   const policy=await repository.getRecord(c.id,'setting','entry-policy');
   const date=c.shippingDefaults?.deliverySchedule?.auctionDate||'';
   if(policy?.open!==true||policy.closesAt&&!(now()<Date.parse(policy.closesAt))||date&&date<today)continue;
   rows.push({id:c.id,name:c.name,date,kind:c.id==='national-cre'?'national':'channel'});
  }
  return rows.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.name.localeCompare(b.name,'ko'));
 }
 async function available(id){
  const found=(await auctions()).find(a=>a.id===id&&a.kind==='channel');
  if(!found)throw fail('참가 접수가 마감됐어요. 경매 목록을 다시 확인해 주세요.');
  return found;
 }
 async function pristine(channelId,vendor,profile){
  if(vendor.active===false||vendor.phone||vendor.bankAccount||vendor.bankHolder||profile?.deletedAt)return false;
  if(profile&&profile.members.some(m=>m.channelId!==channelId||m.vendorId!==vendor.id))return false;
  for(const type of ['item','shipment'])if((await repository.listRecords(channelId,type)).some(r=>r.vendorId===vendor.id))return false;
  if(profile&&(await repository.getRowsByKeys(['vendor_entries_v1::'+profile.id])).length)return false;
  return true;
 }
 async function companies(channelId,phone){
  await available(channelId);const result=[];
  for(const v of await directory.list(channelId)){
   if(v.active===false)continue;
   const connected=number(v.phone)===phone;
   const canConnect=!connected&&await pristine(channelId,v,await directory.profileFor(channelId,v.id));
   result.push({id:v.id,name:v.name,connected,canConnect});
  }
  return result;
 }
 async function join(body,phone){
  if(!/^010\d{8}$/.test(phone))throw fail('전화번호를 먼저 인증해 주세요.',403);
  if(body.consent!==true)throw fail('업체 대표 번호 연결에 동의해 주세요.',422);
  const channelId=String(body.channelId||''),vendorId=String(body.vendorId||''),name=String(body.name||'').trim();
  if(!vendorId&&(!normalizeName(name)||name.length>40))throw fail('업체명을 40자 이내로 입력해 주세요.',422);
  if(!/^[a-f0-9-]{36}$/.test(body.requestId||''))throw fail('등록 화면을 다시 열어 주세요.',422);
  const id=vendorId||'join-'+crypto.createHash('sha256').update(channelId+':'+phone+':'+body.requestId).digest('hex').slice(0,32);
  return lock('channel:'+channelId,()=>directory.lifecycle(channelId,id,async(profile,document,key)=>{
   await available(channelId);
   const vendors=await directory.list(channelId),v=vendors.find(v=>v.id===id);
   if(v&&v.active!==false&&number(v.phone)===phone){
    if(!vendorId&&normalizeName(v.name)!==normalizeName(name))throw fail('등록 내용이 바뀌었어요. 업체 목록을 다시 확인해 주세요.');
    return {channelId,vendorId:id,duplicate:true};
   }
   if(vendorId&&(!v||!await pristine(channelId,v,profile)))throw fail('이미 연결됐거나 확인이 필요한 업체예요. 운영자에게 문의해 주세요.',403);
   if(!vendorId&&vendors.some(v=>normalizeName(v.name)===normalizeName(name)))throw fail('같은 이름의 업체가 있어요. 목록에서 기존 업체를 선택해 주세요.');
   const record=v?await repository.getRecord(channelId,'vendor',id):{id,name,active:true,paymentMethods:['bank_transfer'],createdAt:new Date(now()).toISOString()};
   const changes={phone,...(!v?.inquiryPhone?{inquiryPhone:phone,inquiryPhoneMode:'shared'}:{})};
   const next={...record,...changes};
   const p=profile||directory.enrollInDocument(document,channelId,next,new Date(now()).toISOString());
   if(profile){p.info={...p.info,...changes};p.revision++;p.updatedAt=new Date(now()).toISOString();}
   await repository.upsertRows([{key:channelKey(channelId,'vendor',id),value:JSON.stringify(next)},{key,value:JSON.stringify(document)}]);
   return {channelId,vendorId:id};
  }));
 }
 return {auctions,companies,join};
}
module.exports={createVendorAuctionOnboarding};

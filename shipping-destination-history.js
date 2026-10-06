'use strict';
const {normalizePhone}=require('./band-membership');
const Auction=require('./public/auction-contract');
const cancelled=value=>/^(cancelled|canceled|refunded)$|취소|환불/i.test(String(value||'').trim());
const compact=value=>String(value||'').normalize('NFKC').replace(/[\s()[\]·.,_-]/g,'').toLocaleLowerCase('en');
function fullPhone(value){return String(value||'').replace(/\D/g,'').length===8?'':normalizePhone(value);}
function timestamp(value){const n=Date.parse(value||'');return Number.isFinite(n)?n:0;}
function recordedAt(row){return [row.destinationRegisteredAt,row.buyerSubmittedAt,row.updatedAt,row.createdAt].find(value=>timestamp(value))||'';}
function regionKey(value){return compact(value).replace(/특별자치도$|특별자치시$|특별시$|광역시$|도$/,'');}
function reusableDestination(saved,channelId,fixed,carriers){
 if(!saved||cancelled(saved.status)||cancelled(saved.paymentStatus))return null;
 const type=saved.destinationType||({파르게:'parge',도도시:'dodosi',parge:'parge',dodosi:'dodosi'})[saved.carrier]||(saved.method==='pickup'?'pickup':'');
 if(type==='pickup'){
  const place=saved.sourceChannelId===channelId&&fixed.find(d=>d.id===saved.destinationId&&d.label===saved.address);
  return place?{destinationId:place.id,destinationType:'pickup',label:place.label,pargeRegion:'',pargeShop:''}:null;
 }
 if(saved.method==='pickup'||!carriers[type])return null;
 const matches=[];
 for(const group of carriers[type].regions)for(const shop of group.shops){
  const structured=saved.pargeRegion||saved.pargeShop;
  const address=compact(saved.address),region=compact(group.region),name=compact(shop.name);
  const matchesAddress=address&&[name,region+name,regionKey(group.region)+name].includes(address);
  if(structured?regionKey(saved.pargeRegion)===regionKey(group.region)&&compact(saved.pargeShop)===name:matchesAddress)matches.push({region:group.region,shop:shop.name});
 }
 // A name shared by multiple receiving shops must be selected again by the buyer.
 if(matches.length!==1)return null;
 const match=matches[0];
 return {destinationId:type,destinationType:type,label:`${type==='parge'?'파르게':'도도시'} · ${match.region} · ${match.shop}`,pargeRegion:match.region,pargeShop:match.shop};
}
function latestDestination(rows,channelId,fixed,carriers){
 const ordered=[...rows].sort((a,b)=>timestamp(recordedAt(b))-timestamp(recordedAt(a))||String(a.sourceChannelId||'').localeCompare(String(b.sourceChannelId||''))||String(a.id||'').localeCompare(String(b.id||'')));
 for(const row of ordered){const destination=reusableDestination(row,channelId,fixed,carriers);if(destination)return {destination,recordedAt:recordedAt(row)};}
 return null;
}
function legacyRows(items,sourceChannelId,createdAt=''){
 return (Array.isArray(items)?items:[]).filter(row=>fullPhone(row.winner_phone)&&row.shipping_region&&['파르게','도도시'].includes(row.shipping_company)&&row.shipping_type!=='직접수령'&&!cancelled(row.status)&&(Auction.isSoldStatus(row.status)||['입금완료','연락완료','배송완료'].includes(row.status))).map(row=>({
  id:String(row.id),sourceChannelId,recipientPhone:fullPhone(row.winner_phone),carrier:row.shipping_company,method:'delivery',address:String(row.shipping_region),status:'complete',updatedAt:row.updated_at||createdAt,createdAt
 }));
}
function createLegacyShippingHistory({repository,now=Date.now,cacheMs=30000,pageSize=500,logger=console}){
 let cache=null,expires=0,inflight=null;
 async function load(){
  const rows=[],signal=AbortSignal.timeout(5000);
  for(let offset=0;;offset+=pageSize){
   const page=await repository.request('items?select=id,status,winner_phone,shipping_type,shipping_company,shipping_region,updated_at&shipping_company=in.'+encodeURIComponent('(파르게,도도시)')+'&order=id.asc&limit='+pageSize+'&offset='+offset,{signal});
   if(!Array.isArray(page))throw Error('Invalid legacy shipping response');
   rows.push(...legacyRows(page,'legacy-cdcup:current'));if(page.length<pageSize)break;
  }
  const indexRows=await repository.getRowsByKeys(['auction_archive_index'],{signal});
  const index=JSON.parse(indexRows.find(r=>r.key==='auction_archive_index')?.value||'[]');
  if(!Array.isArray(index))throw Error('Invalid legacy archive index');
  const keys=[...new Set(index.filter(r=>typeof r.id==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(r.id)).map(r=>'auction_archive_'+r.id))];
  for(let start=0;start<keys.length;start+=8){
   const archives=await repository.getRowsByKeys(keys.slice(start,start+8),{signal});
   for(const record of archives){
    try{const archive=JSON.parse(record.value);if(!Array.isArray(archive?.items))throw Error('Invalid archive');rows.push(...legacyRows(archive.items,'legacy-cdcup:'+record.key,archive.createdAt));}
    catch{logger.warn?.('[checkout] invalid legacy shipping archive skipped');}
   }
  }
  cache=rows;expires=now()+cacheMs;return rows;
 }
 return async phones=>{
  const allowed=new Set([...phones].map(fullPhone).filter(Boolean));if(!allowed.size)return [];
  let rows=cache&&expires>now()?cache:null;
  if(!rows){if(!inflight)inflight=load().finally(()=>{inflight=null;});rows=await inflight;}
  return rows.filter(row=>allowed.has(row.recipientPhone)).map(row=>({...row}));
 };
}
module.exports={fullPhone,timestamp,recordedAt,reusableDestination,latestDestination,createLegacyShippingHistory};

'use strict';
const {validQuote}=require('./dodosi-public-reader');
const KEY='creo_v2::dodosi_quote_cache',DAY=86400000;
const key=r=>`${r.from}:${r.to}:${r.quantity}`;
// Korea 08:00 is 23:00 UTC on the preceding date. Catch up after downtime.
const cycle=now=>Math.floor((now+3600000)/DAY)*DAY-3600000;
const nextRefresh=now=>new Date(cycle(now)+DAY).toISOString();
const validRequest=r=>r&&/^[a-f\d-]{36}$/.test(r.from||'')&&/^[a-f\d-]{36}$/.test(r.to||'')&&r.from!==r.to&&Number.isInteger(r.quantity)&&r.quantity>=1&&r.quantity<=99;
function createCache({repository,read,now=()=>Date.now(),signal}){
 let data,loaded,queue=Promise.resolve();const retry=new Map();
 async function load(){if(!loaded)loaded=repository.getRowsByKeys([KEY]).then(rows=>{const raw=JSON.parse(rows[0]?.value||'{}');data=Object.fromEntries(Object.entries(raw.entries||{}).filter(([k,r])=>validRequest(r)&&key(r)===k&&validQuote(r.quote)&&Number.isFinite(Date.parse(r.checkedAt))));}).catch(e=>{loaded=null;throw e;});return loaded;}
 const fresh=r=>r&&Date.parse(r.checkedAt)>=cycle(now())&&Date.parse(r.checkedAt)<=now()+60000;
 function serial(fn){const run=queue.then(fn,fn);queue=run.catch(()=>{});return run;}
 async function obtain(requests){
  await load();const unique=[...new Map(requests.filter(validRequest).map(r=>[key(r),{from:r.from,to:r.to,quantity:r.quantity}])).values()];
  const due=unique.filter(r=>!fresh(data[key(r)])&&(retry.get(key(r))||0)<=now());
  if(due.length&&!signal?.aborted){
   for(const r of due)retry.set(key(r),now()+300000);
   try{
    const results=await read(due,{signal});if(signal?.aborted)return [];
    const next={...data},updated=[];
    for(const request of due){const matches=results.filter(r=>key(r)===key(request));if(matches.length!==1||!validQuote(matches[0].quote))continue;next[key(request)]={...request,quote:matches[0].quote,checkedAt:new Date(now()).toISOString()};updated.push(key(request));}
    if(updated.length){
     // Bound the store without ever evicting any tuple in the current request.
     const keep=new Set(unique.map(key)),entries=Object.fromEntries(Object.entries(next).sort((a,b)=>Number(keep.has(b[0]))-Number(keep.has(a[0]))||Date.parse(b[1].checkedAt)-Date.parse(a[1].checkedAt)).slice(0,2000));
     await repository.upsertRows([{key:KEY,value:JSON.stringify({version:1,entries})}]);data=entries;for(const k of updated)retry.delete(k);
    }
   }catch{/* Last verified values remain visible as stale; never invent zero. */}
  }
  return requests.map(r=>{const saved=data[key(r)];return {...r,status:saved?(fresh(saved)?'ready':'stale'):'unavailable',quote:saved?.quote||null,checkedAt:saved?.checkedAt||''};});
 }
 async function getMany(requests){if(!Array.isArray(requests)||requests.length>2000||requests.some(r=>!validRequest(r)))throw Error('배송 견적 조건을 확인해 주세요.');return serial(()=>obtain(requests));}
 async function refresh(){return serial(async()=>{await load();return obtain(Object.values(data).map(({from,to,quantity})=>({from,to,quantity})));});}
 return {getMany,refresh,nextRefreshAt:()=>nextRefresh(now()),idle:()=>queue};
}
module.exports={KEY,cycle,nextRefresh,createCache};

'use strict';
const crypto=require('node:crypto'),Core=require('./public/parge-dispatch-core');
const fail=message=>{const e=new Error(message);e.status=409;throw e;};
function createPargeDispatch({read,write,workspace,shops,lock,now=()=>new Date().toISOString()}){
 const fingerprint=p=>JSON.stringify({date:p.date,groups:p.groups.map(g=>({name:g.name,phone:g.phone,shop:g.shop,quantity:g.quantity,price:g.price,items:g.items.map(i=>({id:i.id,shipmentId:i.shipmentId,price:i.price}))}))});
 const belongs=(record,ids)=>record.plan.groups.every(g=>g.items.every(i=>ids.has(i.id)));
 async function list(channel){const w=await workspace(channel),ids=new Set(w.items.map(i=>i.id));return ((await read(channel))||[]).filter(r=>belongs(r,ids));}
 async function command(channel,body){return lock(channel,async()=>{
  const records=(await read(channel))||[],w=await workspace(channel),scopeIds=new Set(w.items.map(i=>i.id)),scopedRecords=records.filter(r=>belongs(r,scopeIds));
  if(body.action==='prepare'){
   if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId||''))fail('요청 식별자가 없어요. 새로고침해 주세요.');
   try{Core.validate(body.plan);}catch(e){fail(e.message);}if(body.plan.channelId!==channel)fail('채널이 맞지 않아요.');
   const prior=records.find(r=>r.requestId===body.requestId);
   if(prior){if(!belongs(prior,scopeIds)||prior.fingerprint!==fingerprint(body.plan))fail('기존 접수 요청과 회차 또는 내용이 달라요.');return prior;}
   const blocked=new Set(records.filter(r=>r.status!=='released').flatMap(r=>r.plan.groups.flatMap(g=>g.items.map(i=>i.id))));
   const ids=body.plan.groups.flatMap(g=>g.items.map(i=>i.id));if(ids.some(id=>blocked.has(id)))fail('이미 담았거나 확인 중인 개체가 포함돼 있어요.');
   const catalog=await shops();
   const fresh=Core.build({...w,items:w.items.filter(i=>ids.includes(i.id))},{channelId:channel,shops:catalog}).groups;
   const expected=Core.manifest(fresh,{channelId:channel,date:body.plan.date});
   const canonical=p=>fingerprint({...p,groups:p.groups.slice().sort((a,b)=>a.items[0].id.localeCompare(b.items[0].id))});
   if(canonical(expected)!==canonical(body.plan))fail('낙찰·배송 정보가 변경됐어요. 목록을 새로고침해 주세요.');
   const previous=scopedRecords.filter(r=>r.status!=='released').flatMap(r=>r.plan.groups);
   if(body.plan.groups.some(g=>previous.some(p=>p.phone===g.phone&&p.shop===g.shop)))fail('이미 담은 수령인에게 추가 개체가 있어요. 기존 장바구니의 마릿수를 수정하고 확인해 주세요.');
   const record={id:crypto.randomUUID(),requestId:body.requestId,fingerprint:fingerprint(body.plan),plan:expected,status:'checking',createdAt:now(),updatedAt:now()};
   await write(channel,[...records,record]);return record;
  }
  const index=records.findIndex(r=>r.id===body.id);if(index<0)fail('접수 기록을 찾지 못했어요.');
  const old=records[index];
  if(!belongs(old,scopeIds))fail('선택한 회차의 접수 기록이 아닙니다.');
  if(body.action==='attempted'){
   if(old.status==='released')fail('해제된 접수 기록이에요.');
   if(['cart','booked'].includes(old.status))return old;
   records[index]={...old,status:'checking',attemptedAt:old.attemptedAt||now(),updatedAt:now()};
  }else if(body.action==='confirm-cart'){
   if(body.confirmed!==true)fail('파르게 장바구니에서 내용을 확인해 주세요.');
   if(old.status==='released')fail('해제된 접수 기록이에요.');
   if(old.status==='booked')return old;
   records[index]={...old,status:'cart',confirmedAt:old.confirmedAt||now(),updatedAt:now()};
  }else if(body.action==='confirm-booked'){
   if(body.confirmed!==true||!String(body.reference||'').trim())fail('파르게 예약 내역을 확인하고 예약번호 또는 확인 메모를 입력해 주세요.');
   if(old.status==='released')fail('해제된 접수 기록이에요.');
   records[index]={...old,status:'booked',reference:String(body.reference).trim().slice(0,200),bookedAt:old.bookedAt||now(),updatedAt:now()};
  }else if(body.action==='release'){
   if(old.status==='booked')fail('예약 완료한 건은 파르게에서 취소 여부를 먼저 확인해 주세요.');
   if(body.confirmedAbsent!==true)fail('장바구니와 예약 내역에 없는지 확인해 주세요.');
   records[index]={...old,status:'released',releasedAt:now(),updatedAt:now()};
  }else fail('지원하지 않는 접수 작업이에요.');
  await write(channel,records);return records[index];
 });}
 return {list,command};
}
module.exports={createPargeDispatch};

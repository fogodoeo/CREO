'use strict';
const crypto = require('node:crypto');
const Core = require('./public/parge-dispatch-core');
const Dates = require('./delivery-schedule-core');
const Phone = require('./public/mobile-phone');
const TEMPLATE = 'buyer_parge_booking_confirmed';
const fail = message => { throw Object.assign(new Error(message), {status:409}); };
const norm = v => String(v || '').normalize('NFKC').replace(/\s+/g, '');
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,32);
const identity = g => [norm(g.name),Phone.normalizeMobilePhone(g.phone),norm(g.shop),g.quantity];
function currentGroups(record, workspace, channel) {
 const ids = new Set(record.plan.groups.flatMap(g => g.items.map(i => i.id)));
 const groups = Core.build({...workspace,items:workspace.items.filter(i=>ids.has(i.id))},{channelId:channel}).groups;
 for (const old of record.plan.groups) {
  const matches = groups.filter(g=>JSON.stringify(identity(g))===JSON.stringify(identity(old)));
  const g = matches[0];
  if(matches.length!==1 || g.price!==old.price || g.items.length!==old.items.length || !old.items.every(i=>g.items.some(n=>n.id===i.id && n.shipmentId===i.shipmentId && n.price===i.price && (i.buyerSaleId===undefined || n.buyerSaleId===i.buyerSaleId)))) fail('낙찰·배송 정보가 변경됐어요. 예약 내역을 다시 대조해 주세요.');
 }
 if(groups.length!==record.plan.groups.length) fail('묶음 배송 구성이 변경됐어요.');
 return record.plan.groups.map(old=>groups.find(g=>JSON.stringify(identity(g))===JSON.stringify(identity(old))));
}
function snapshot(group, workspace) {
 return hash({identity:identity(group),items:group.items.map(i=>{
  const item=workspace.items.find(x=>x.id===i.id);
  return {id:i.id,shipmentId:i.shipmentId,price:i.price,sale:item.buyerSaleId||'',buyer:Phone.normalizeMobilePhone(item.winnerPhone),name:Phone.buyerDisplayName(item.winnerName||item.winnerAlias),lot:item.name};
 }).sort((a,b)=>a.id.localeCompare(b.id))});
}
function matchOrders(record, orders, workspace, channel, records) {
 const groups=currentGroups(record,workspace,channel);
 if(!Array.isArray(orders)||orders.length!==groups.length)fail('배송 건마다 주문번호를 연결해 주세요.');
 const seen=new Set();
 return groups.map(g=>{
  const matches=orders.filter(o=>JSON.stringify(identity(o))===JSON.stringify(identity(g)));
  if(matches.length!==1)fail('수령인·연락처·거점·마릿수가 일치하는 주문이 하나여야 해요.');
  const o=matches[0],number=String(o.orderNumber||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,79}$/.test(number)||seen.has(number))fail('주문번호가 없거나 중복됐어요. 확인 메모 대신 파르게 주문번호를 입력해 주세요.');
  if(records.some(r=>r.id!==record.id&&(r.orders||[]).some(x=>x.orderNumber===number)))fail('이미 다른 접수 건에 연결된 주문번호예요.');
  seen.add(number);
  for(const key of ['arrivalDate','dispatchDate'])if(o[key]&&!Dates.date(o[key]))fail('날짜를 확인해 주세요.');
  if(o.arrivalDate&&o.dispatchDate&&o.arrivalDate<o.dispatchDate)fail('수령 예정일은 출발일보다 빠를 수 없어요.');
  return {name:g.name,phone:g.phone,shop:g.shop,quantity:g.quantity,itemIds:g.items.map(i=>i.id),orderNumber:number,arrivalDate:o.arrivalDate||'',dispatchDate:o.dispatchDate||'',snapshot:snapshot(g,workspace)};
 });
}
async function preview(record, workspace, channel, estimate) {
 if(record.status!=='booked'||!record.orders?.length)fail('파르게 예약 완료 여부를 확인해 주세요.');
 const groups=currentGroups(record,workspace,channel),result=[];
 for(const [index,g] of groups.entries()) {
  const order=record.orders[index];
  if(!order || order.snapshot!==snapshot(g,workspace))fail('예약 저장 후 낙찰·배송 정보가 변경됐어요. 다시 확인해 주세요.');
  const buyers=[...new Set(g.items.map(i=>Phone.normalizeMobilePhone(workspace.items.find(x=>x.id===i.id)?.winnerPhone)))];
  if(buyers.length!==1||!buyers[0])fail('낙찰자 연락처를 확인해 주세요.');
  const item=workspace.items.find(i=>i.id===g.items[0].id);
  const schedule=order.arrivalDate?null:await estimate?.(g,item,order);
  const arrival=order.arrivalDate || (schedule?.status==='estimated'?schedule.arrivalDate:'');
  result.push({eventKey:'parge-booking:'+record.id+':'+hash(order.orderNumber||[...order.itemIds].sort()),templateKey:TEMPLATE,recipientRole:'buyer',recipientPhone:buyers[0],itemIds:order.itemIds,allowSmsFallback:false,failureSmsFallback:false,
   variables:{낙찰자명:Phone.buyerDisplayName(item.winnerName||item.winnerAlias),개체내역:g.items.map(i=>i.lot).join(', ')+' · '+g.quantity+'마리',거점명:g.shop,수령예정일:arrival||'일정 확인 중'}});
 }
 return result;
}
function confirmReservation(record, deliveries, workspace, channel) {
 const groups=currentGroups(record,workspace,channel);
 if(!Array.isArray(deliveries)||deliveries.length!==groups.length)fail('예약 완료할 배송 목록을 다시 확인해 주세요.');
 return groups.map(g=>{
  const ids=g.items.map(i=>i.id).sort(),matches=deliveries.filter(d=>Array.isArray(d.itemIds)&&JSON.stringify([...d.itemIds].sort())===JSON.stringify(ids));
  if(matches.length!==1)fail('예약 완료할 개체 구성이 달라요. 새로고침해 주세요.');
  const d=matches[0];
  for(const key of ['arrivalDate','dispatchDate'])if(d[key]&&!Dates.date(d[key]))fail('날짜를 확인해 주세요.');
  if(d.arrivalDate&&d.dispatchDate&&d.arrivalDate<d.dispatchDate)fail('수령 예정일은 출발일보다 빠를 수 없어요.');
  const previous=record.orders?.find(o=>JSON.stringify([...o.itemIds].sort())===JSON.stringify(ids));
  return {name:g.name,phone:g.phone,shop:g.shop,quantity:g.quantity,itemIds:ids,arrivalDate:d.arrivalDate||'',dispatchDate:d.dispatchDate||'',snapshot:snapshot(g,workspace),...(previous?.orderNumber?{orderNumber:previous.orderNumber}:{})};
 });
}
module.exports={TEMPLATE,matchOrders,preview,confirmReservation};

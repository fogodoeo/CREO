/* Read-only, authenticated receipt reconciliation. Never executes page scripts. */
async function creoDodosiReceipts() {
 if(location.origin!=='https://www.dodosi.co.kr')throw Error('로그인한 도도시 탭을 열어 주세요.');
 const get=async path=>{const r=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok||r.redirected)throw Error('도도시 로그인과 배송 내역을 확인해 주세요.');return r.text();};
 const rows=html=>{
  const flight=[...html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)].map(m=>{try{const x=JSON.parse(m[1]);return x[0]===1?x[1]:'';}catch{return '';}}).join('');
  return flight.split('\n').flatMap(line=>{try{return[JSON.parse(line.slice(line.indexOf(':')+1))];}catch{return[];}});
 };
 const nodes=values=>{const out=[];function walk(v){if(v&&typeof v==='object'){out.push(v);Object.values(v).forEach(walk);}}values.forEach(walk);return out;};
 const html=await get('/deliveries');
 // This page receives the entire list, then filters/paginates it in the browser.
 const lists=nodes(rows(html)).filter(v=>Array.isArray(v.deliveries)&&v.initialFilter==='전체'&&v.initialPage===1);
 if(lists.length!==1)throw Error('도도시 전체 예약 목록을 읽지 못했습니다. 완료 처리하지 않았습니다.');
 const list=lists[0].deliveries;
 if(list.length>5000||new Set(list.map(r=>r.id)).size!==list.length)throw Error('예약 목록 대조가 필요합니다.');
 const records=[];
 if(list.length){
  const order=nodes(rows(await get('/order'))).find(v=>Array.isArray(v.shops)&&Number.isInteger(v.accountDiscountBp));
  if(!order)throw Error('정거샵 정보를 확인하지 못했습니다.');
  const norm=v=>String(v||'').replace(/\s/g,'');
  const shopId=label=>{const matches=order.shops.filter(s=>norm(s.label)===norm(label));if(matches.length!==1)throw Error('예약 정거샵을 하나로 대조하지 못했습니다.');return matches[0].id;};
  const statusMap={pending_payment:'pending_payment',scheduled:'pickup_pending',dropped_off:'pickup_pending',picked_up:'in_transit',in_care:'in_transit',outbound:'in_transit',hub_arrived:'in_transit',arrived:'delivered',cancelled:'cancelled'};
  for(const entry of list){
   if(!/^[a-f0-9-]{36}$/.test(entry.id||'')||!entry.shipmentNo||!statusMap[entry.status])throw Error('도도시 예약 형식이 변경됐습니다. 대조가 필요합니다.');
   const detail=nodes(rows(await get('/deliveries/'+entry.id))).filter(v=>!Array.isArray(v)&&v.id===entry.id&&v.shipmentNo===entry.shipmentNo);
   const unique=[...new Map(detail.map(v=>[JSON.stringify(v),v])).values()];
   if(unique.length!==1)throw Error('예약 '+entry.shipmentNo+'의 상세 정보를 읽지 못했습니다.');
   const d=unique[0];
   // Only unambiguous recipient fields are accepted. Unknown schemas fail closed.
   const names=[d.receiverName,d.recipientName,d.receiver?.name,d.recipient?.name].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
   const phones=[d.receiverTel,d.receiverPhone,d.recipientTel,d.recipientPhone,d.receiver?.tel,d.receiver?.phone,d.recipient?.tel,d.recipient?.phone].filter(v=>typeof v==='string').map(v=>v.replace(/\D/g,''));
   if(new Set(names).size!==1||new Set(phones).size!==1||!/^0\d{8,10}$/.test(phones[0]))throw Error('예약 '+entry.shipmentNo+'의 수령인·연락처 확인이 필요합니다.');
   if(d.status!==entry.status||d.petCount!==entry.petCount||d.dropDate!==entry.dropDate||d.pickDate!==entry.pickDate||d.dropShop!==entry.dropShop||d.pickShop!==entry.pickShop)throw Error('조회 도중 예약 정보가 변경됐습니다. 다시 확인해 주세요.');
   records.push({id:entry.shipmentNo,status:statusMap[d.status],originId:shopId(d.dropShop),destinationId:shopId(d.pickShop),name:names[0],phone:phones[0],quantity:d.petCount,dropoffDate:d.dropDate,arrivalDate:d.pickDate});
  }
 }
 return{source:'https://www.dodosi.co.kr/deliveries',complete:true,checkedAt:new Date().toISOString(),records};
}
if(typeof module==='object')module.exports={creoDodosiReceipts};

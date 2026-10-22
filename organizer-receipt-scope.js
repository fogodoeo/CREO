'use strict';
const R=require('./operation-rounds');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const unresolved=r=>!r.itemIds?.length&&['confirmed','pending'].includes(r.status);
const sameIds=(a,b)=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
function reviewRows(ledger,channel,data,archives){
 const scopes=[R.scopeWorkspace(channel,data),...archives.filter(a=>a.closedAt).map(a=>{
  const scoped=R.scopeWorkspace(channel,data,a.id),dates=[...new Set(scoped.items.map(R.itemDate).filter(Boolean))];
  scoped.round={...scoped.round,name:a.title||'이전 회차',date:dates.length===1?dates[0]:''};return scoped;
 })];
 return ledger.filter(unresolved).map(r=>({
  id:r.id,vendorId:r.vendorId,vendorName:data.vendors.find(v=>v.id===r.vendorId)?.name||r.vendorName||'업체 확인 필요',
  amount:r.amount,status:r.status,paidOn:r.paidOn||'',reportedAt:r.reportedAt||'',reviewedAt:r.reviewedAt||'',memo:r.memo||'',
  rounds:scopes.map(s=>({...s.round,itemIds:s.items.filter(i=>i.vendorId===r.vendorId).map(i=>i.id)})).filter(s=>s.itemIds.length)
 }));
}
function assign(ledger,body,scope,now=new Date()){
 const receipt=ledger.find(r=>r.id===body.receiptId&&r.vendorId===body.vendorId);
 if(!receipt)fail('입금 내역을 찾을 수 없습니다.',404);
 if(receipt.amount!==body.expectedAmount||receipt.status!==body.expectedStatus)fail('입금 내역이 변경됐어요. 다시 불러온 뒤 확인해 주세요.');
 if(!['confirmed','pending'].includes(receipt.status))fail('확인 대기 또는 입금 완료 기록만 회차를 연결할 수 있어요.');
 const itemIds=scope.items.filter(i=>i.vendorId===receipt.vendorId).map(i=>i.id);
 if(!itemIds.length||!sameIds(body.expectedItemIds,itemIds))fail('선택한 회차의 개체가 변경됐어요. 다시 불러온 뒤 확인해 주세요.');
 if(receipt.itemIds?.length){if(sameIds(receipt.itemIds,itemIds))return{duplicate:true,ledger};fail('이미 다른 회차에 연결된 입금입니다.');}
 // Linking a legacy record never changes its amount or confirms a pending report.
 const updated={...receipt,itemIds,roundAssignedAt:now.toISOString(),roundAssignment:{...scope.round}};
 return{duplicate:false,ledger:ledger.map(r=>r===receipt?updated:r)};
}
module.exports={unresolved,reviewRows,assign};

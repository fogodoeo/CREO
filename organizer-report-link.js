'use strict';
const crypto=require('node:crypto');
const reference=id=>crypto.createHash('sha256').update(String(id)).digest('base64url').slice(0,12);
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
function link(code,reportId){return `https://creok.onrender.com/o/${code}#${reference(reportId)}`;}
function message(amount,url,includesVendorFees=true){
 // Keep the full action URL within the provider's 90-byte SMS limit.
 const label=includesVendorFees?'정산':'배송비';
 const candidates=[`${label}신고 ${Number(amount).toLocaleString('ko-KR')}원\n${url}`,`${label}신고 ${Number(amount)}원\n${url}`,`${label} 입금신고\n${url}`,`입금신고\n${url}`];
 const text=candidates.find(v=>Buffer.byteLength(v,'utf8')<=90);
 if(!text)fail('입금 확인 링크를 만들지 못했어요. 다시 시도해 주세요.',503);
 return text;
}
function target(ledger,workspace,ref){
 if(!/^[A-Za-z0-9_-]{12}$/.test(ref||''))fail('원래 입금신고 알림의 링크를 다시 열어 주세요.',422);
 const matches=ledger.filter(r=>reference(r.id)===ref);
 if(matches.length!==1)fail('입금신고를 찾을 수 없어요. 정산 목록에서 확인해 주세요.',404);
 const r=matches[0],ids=new Set(r.itemIds||[]),items=workspace.items.filter(i=>ids.has(i.id));
 if(!ids.size||items.length!==ids.size||items.some(i=>i.vendorId!==r.vendorId))fail('입금신고의 회차 연결을 확인해 주세요. 정산 목록에서 확인할 수 있어요.');
 const archives=[...new Set(items.map(i=>i.auctionArchiveId||''))];
 if(archives.length!==1)fail('여러 회차가 연결된 입금입니다. 정산 목록에서 회차를 확인해 주세요.');
 return {reportId:r.id,vendorId:r.vendorId,archiveId:archives[0]};
}
module.exports={reference,link,message,target};

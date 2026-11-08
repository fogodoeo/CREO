'use strict';
// Presentation/entry policy only. These fields never change money or permissions.
const fail=message=>Object.assign(Error(message),{status:422});
function normalize(input={},previous={}){
 const next={...previous,...input};
 const fulfillment=next.fulfillment||'vendor',settlementContact=String(next.settlementContact||'').trim();
 if(!['vendor','organizer'].includes(fulfillment))throw fail('배송 담당을 선택해 주세요.');
 if(settlementContact.length>40)throw fail('정산 담당은 40자 이내로 입력해 주세요.');
 let closesAt=next.closesAt||'';
 if(closesAt){if(typeof closesAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(closesAt)||!Number.isFinite(Date.parse(closesAt)))throw fail('마감 일시를 확인해 주세요.');closesAt=new Date(closesAt).toISOString();}
 return {fulfillment,settlementContact,closesAt};
}
function fromPolicy(policy,channel){
 const defaults=/^(?:clab|creyon)(?:-|$)/.test(channel?.id||'')?{fulfillment:'organizer',settlementContact:'크레용'}:{fulfillment:'vendor',settlementContact:''};
 return normalize(policy,defaults);
}
module.exports={normalize,fromPolicy};

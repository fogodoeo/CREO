'use strict';
// A read-only directory across programs. Identity comes from recorded membership,
// never from a matching company name or phone number.
async function listOperatorVendors(channels,vendorDirectory){
 const rows=new Map(),eligible=channels.filter(c=>c.dataAdapter==='platform'&&!c.id.startsWith('checkout-test-')),records=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,eligible.length)},async()=>{while(cursor<eligible.length){const index=cursor++;records[index]=await vendorDirectory.list(eligible[index].id);}}));
 for(const [index,channel] of eligible.entries()){
  for(const vendor of records[index]){
   const key=vendor.directoryId||channel.id+':'+vendor.id;
   if(!rows.has(key))rows.set(key,{id:key,name:vendor.name,manager:vendor.manager||'',phone:vendor.phone||'',bankName:vendor.bankName||'',bankAccount:vendor.bankAccount||'',bankHolder:vendor.bankHolder||'',members:[]});
   rows.get(key).members.push({channelId:channel.id,channelName:channel.name,vendorId:vendor.id,active:vendor.active!==false,status:channel.status,familyId:channel.id==='national-cre'||channel.nationalRound?.parentId==='national-cre'?'national-cre':/^(creyon|clab)(-|$)/.test(channel.id)?'clab':channel.id});
  }
 }
 return{vendors:[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'))};
}
module.exports={listOperatorVendors};

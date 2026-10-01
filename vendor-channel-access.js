'use strict';
const {phone}=require('./vendor-access');
// Match the verified login number to the business contact, never the inquiry number.
// Resolve on every selection/use so contact changes and inactive vendors revoke access.
function createVendorChannelAccess({loadCatalog,vendorDirectory}){
 return async verifiedPhone=>{
  const number=phone(verifiedPhone);if(!number)return [];
  const catalog=await loadCatalog(),result=[];
  const channels=catalog.channels.filter(c=>c.id!=='national-cre'&&c.status==='active'&&c.dataAdapter==='platform'&&c.features?.shipping!==false);
  for(const channel of channels){
   for(const vendor of await vendorDirectory.list(channel.id)){
    if(vendor.active===false||phone(vendor.phone)!==number)continue;
    result.push({channelId:channel.id,channelName:channel.name,vendorId:vendor.id,vendorName:vendor.name,createdAt:channel.createdAt||''});
   }
  }
  return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.channelName.localeCompare(b.channelName,'ko')||a.vendorName.localeCompare(b.vendorName,'ko'));
 };
}
module.exports={createVendorChannelAccess};

'use strict';
const National=require('./national-broadcast'),Rounds=require('./operation-rounds');
// A read-only directory across programs. Identity comes from recorded membership,
// never from a matching company name or phone number.
async function listOperatorVendors(channels,vendorDirectory,repository){
 const rows=new Map(),eligible=channels.filter(c=>c.dataAdapter==='platform'&&!c.id.startsWith('checkout-test-')),records=[];let cursor=0;
 const items=new Map();
 await Promise.all(Array.from({length:Math.min(4,eligible.length)},async()=>{while(cursor<eligible.length){const index=cursor++,id=eligible[index].id;const [vendors,entries]=await Promise.all([vendorDirectory.list(id),repository?repository.listRecords(id,'item'):[]]);records[index]=vendors;items.set(id,entries);}}));
 const rounds=repository?(await Rounds.list(repository)).rounds:[];
 const root=eligible.find(c=>c.id==='national-cre');
 const cycle=repository&&root?await repository.getRecord(root.id,'setting','national-cycle-config'):null;
 const booking=cycle?.mode===National.MODE?(await National.createNationalBroadcast(repository).read(root)).state:null;
 for(const [index,channel] of eligible.entries()){
  for(const vendor of records[index]){
   const key=vendor.directoryId||channel.id+':'+vendor.id;
   if(!rows.has(key))rows.set(key,{id:key,name:vendor.name,manager:vendor.manager||'',phone:vendor.phone||'',bankName:vendor.bankName||'',bankAccount:vendor.bankAccount||'',bankHolder:vendor.bankHolder||'',members:[],broadcasts:[]});
   const row=rows.get(key),familyId=Rounds.family(channel),region=National.regionForVendor(vendor);
   row.members.push({channelId:channel.id,channelName:channel.name,vendorId:vendor.id,active:vendor.active!==false,status:channel.status,familyId,region:familyId==='national-cre'?National.REGIONS[region]||'':''});
   function broadcast(date){let entry=row.broadcasts.find(b=>b.familyId===familyId&&b.date===date);if(!entry){entry={familyId,date,region:familyId==='national-cre'?National.REGIONS[National.regionAt(date)]||'':'',scheduled:false,requested:false,itemCount:0,rounds:[]};row.broadcasts.push(entry);}return entry;}
   // A directory membership is not proof of attending every past root-channel show.
   if(channel.id==='national-cre'&&vendor.active!==false&&!vendor.deletedAt){
    if(Number.isInteger(region))for(const date of National.APPLICATION_DATES.filter(d=>National.regionAt(d)===region))broadcast(date).scheduled=true;
    for(const r of booking?.reservations||[])if(r.vendorId===vendor.id&&r.status==='confirmed')broadcast(r.date).requested=true;
   }
   for(const round of rounds.filter(r=>r.channelId===channel.id&&!r.scopeError)){
    const own=(items.get(channel.id)||[]).filter(i=>i.vendorId===vendor.id&&(round.archiveId?i.auctionArchiveId===round.archiveId:!i.auctionArchiveId&&!i.attributes?.roundTargetChannelId&&(!round.date||!Rounds.itemDate(i)||Rounds.itemDate(i)===round.date)));
    if(!own.length&&(channel.id==='national-cre'||round.archiveId))continue;
    const entry=broadcast(round.date);entry.itemCount+=own.length;entry.rounds.push({channelId:channel.id,archiveId:round.archiveId||'',name:round.name,status:round.status,vendorId:vendor.id,itemCount:own.length});
   }
  }
 }
 const vendors=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 for(const v of vendors)v.broadcasts.sort((a,b)=>a.date.localeCompare(b.date));
 return{vendors,rounds};
}
module.exports={listOperatorVendors};

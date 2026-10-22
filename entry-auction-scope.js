'use strict';
const Rounds=require('./auction-rounds'),{validDate}=require('./public/entry-intake');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
async function resolve(repository,catalog,channel,date){
 if(channel.id!=='national-cre'||!date)return{channel,date:'',writable:['active','draft'].includes(channel.status),prepared:true};
 if(!validDate(date))throw fail('방송일을 다시 선택해 주세요.',422);
 const target=catalog.channels.find(c=>c.nationalRound?.parentId===channel.id&&c.nationalRound.date===date);
 if(target)return{channel:target,date,writable:['active','draft'].includes(target.status),prepared:true};
 const source=await repository.listRecords(channel.id,'item');
 const historical=source.some(i=>i.attributes?.broadcastDate===date&&(i.status==='sold'||Rounds.isArchived(i)));
 return{channel:historical?channel:null,date,writable:false,prepared:historical};
}
function publicScope(scope){return{channelId:scope.channel?.id||'',name:scope.channel?.name||'',date:scope.date,writable:scope.writable,prepared:scope.prepared};}
function assignmentChannel(scope){
 if(!scope.channel)throw fail('방송 회차를 먼저 준비해 주세요.');
 if(scope.date&&scope.channel.nationalRound?.date!==scope.date)throw fail('이 회차는 출품 편성을 변경할 수 없어요.');
 // The entry service checks lifecycle after its durable request journal, so a
 // successful retry can still report success if the round closed meanwhile.
 return scope.channel;
}
module.exports={resolve,publicScope,assignmentChannel};

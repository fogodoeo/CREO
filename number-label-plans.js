'use strict';
const Model=require('./public/number-label-model');
const prefix='number-label-plan-';
const fail=(message,status)=>Object.assign(Error(message),{status});
// Append-only snapshots: changing a setup never renumbers an earlier print run.
function create({repository,lock,now=()=>new Date().toISOString()}){
 async function list(channelId,date){Model.date(date);return (await repository.listRecords(channelId,'setting')).filter(r=>r.id.startsWith(prefix)&&r.date===date).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));}
 async function save(channelId,input){
  const date=Model.date(input.date),requestId=String(input.requestId||'');
  if(!/^[a-zA-Z0-9-]{16,64}$/.test(requestId))throw fail('저장 요청을 다시 만들어 주세요.',422);
  const built=Model.build(input),{parts,labels}=built,title=Model.clean(input.title)||'번호표';
  if(title.length>80)throw fail('저장본 이름은 80자 이내로 입력해 주세요.',422);
  const signature=JSON.stringify({date,title,mode:built.mode,setup:built.setup,parts}),id=prefix+requestId;
  return lock('number-labels:'+channelId,async()=>{
   const previous=await repository.getRecord(channelId,'setting',id);
   if(previous){if(previous.signature!==signature)throw fail('같은 저장 요청의 내용이 달라요. 새로고침한 뒤 다시 저장해 주세요.',409);return previous;}
   return repository.upsertRecord(channelId,'setting',{id,date,title,...built,signature,createdAt:now(),schemaVersion:1});
  });
 }
 return {list,save};
}
module.exports={create};

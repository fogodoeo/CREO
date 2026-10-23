'use strict';
const crypto=require('node:crypto');
const {channelKey}=require('./platform-core');
const conflict=message=>Object.assign(new Error(message),{status:409});
async function prepare(repository,channelId,method,body,itemId){
    if(!Object.hasOwn(body,'editorRequestId'))return null;
    if(!/^[A-Za-z0-9_-]{8,80}$/.test(String(body.editorRequestId||''))||!String(itemId||'').trim())throw Object.assign(new Error('저장 요청을 확인할 수 없어요. 창을 다시 열어 주세요.'),{status:422});
    if(method==='PUT'&&!body.expectedUpdatedAt)throw conflict('개체의 최신 정보를 확인한 뒤 다시 저장해 주세요.');
    const key=`creo_workspace_item_write::${channelId}::${body.editorRequestId}`;
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([method,itemId,body.expectedUpdatedAt||'',body.expectedRoundDate,body.record])).digest('hex');
    const rows=await repository.getRowsByKeys([key]),receipt=rows[0]?JSON.parse(rows[0].value):null;
    if(receipt&&receipt.fingerprint!==fingerprint)throw conflict('이전 저장 요청과 내용이 달라요. 창을 다시 열어 주세요.');
    return {key,fingerprint,record:receipt?.record||null};
}
async function commit(repository,channelId,record,attempt,current){
    const timestamp=new Date(Math.max(Date.now(),(Date.parse(current?.updatedAt)||0)+1)).toISOString();
    const saved={...record,id:String(record.id),channelId,updatedAt:timestamp,createdAt:record.createdAt||timestamp};
    await repository.upsertRows([
        {key:channelKey(channelId,'item',saved.id),value:JSON.stringify(saved)},
        {key:attempt.key,value:JSON.stringify({fingerprint:attempt.fingerprint,record:saved})}
    ]);
    return saved;
}
function assertScope(channel,data,body,record){
    const date=require('./operation-rounds').currentDate(channel,data.items||[]);
    if(typeof body.expectedRoundDate!=='string'||body.expectedRoundDate!==date)throw conflict('방송일이 바뀌었습니다. 선택한 회차에서 개체를 다시 열어 주세요.');
    const itemDate=record.attributes?.broadcastDate||record.attributes?.vendor_entry?.broadcastDate||'';
    if(date&&itemDate&&itemDate!==date)throw conflict('선택한 회차와 개체의 방송일이 다릅니다. 해당 회차에서 등록해 주세요.');
}
module.exports={prepare,commit,assertScope};

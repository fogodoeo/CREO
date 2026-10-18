'use strict';
// Ephemeral display-only lease. Never accepts bids or closes an auction.
function createCountdown({now=Date.now}={}) {
 const channels=new Map();
 function update(channelId,input,state,item) {
  const {sessionId,sequence,itemId,running}=input;
  const fail=message=>Object.assign(new Error(message),{status:409});
  if(!/^[a-zA-Z0-9-]{16,64}$/.test(sessionId||'')||!Number.isSafeInteger(sequence)||sequence<1||typeof running!=='boolean'||!itemId)throw fail('카운트 표시 신호를 확인해 주세요.');
  let channel=channels.get(channelId);
  if(!channel){channel={sequences:new Map(),lease:null};channels.set(channelId,channel);}
  const previous=channel.sequences.get(sessionId)||0;
  if(sequence<=previous)return {duplicate:true};
  if(channel.lease&&channel.lease.sessionId!==sessionId&&channel.lease.expiresAt>now())throw fail('다른 경매 프로그램에서 카운트 표시를 사용 중입니다.');
  if(running&&(state?.mode!=='live'||state.activeItemId!==itemId||item?.status!=='live'))throw fail('현재 진행 중인 개체에서만 카운트를 표시할 수 있습니다.');
  channel.sequences.set(sessionId,sequence);
  if(channel.sequences.size>64)channel.sequences.delete(channel.sequences.keys().next().value);
  channel.lease=running?{sessionId,itemId,expiresAt:now()+15000}:null;
  return {duplicate:false};
 }
 function view(channelId,state,item) {
  const channel=channels.get(channelId),lease=channel?.lease;
  if(!lease)return null;
  if(lease.expiresAt<=now()||state?.mode!=='live'||state.activeItemId!==lease.itemId||item?.id!==lease.itemId||item.status!=='live'){
   channel.lease=null;return null;
  }
  return {itemId:lease.itemId,running:true,remainingMs:Math.max(0,lease.expiresAt-now())};
 }
 return {update,view};
}
module.exports={createCountdown};

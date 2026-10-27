'use strict';
const R=require('./operation-rounds');
const fail=()=>Object.assign(Error('선택한 정산 회차를 찾을 수 없습니다. 회차 목록을 다시 열어 주세요.'),{status:409});
const open=channel=>['active','archived'].includes(channel?.status);
// Outstanding work first; within the same state use the latest broadcast.
const priority=r=>r.settlementNeedsReview||r.settlementRemaining>0&&!r.settlementPending||(r.paymentDueCount??r.openCount)>0?2:r.settlementPending||r.openCount>0?1:0;
const compare=(a,b)=>priority(b)-priority(a)||(b.date||'').localeCompare(a.date||'')||(a.channelId||'').localeCompare(b.channelId||'')||a.key.localeCompare(b.key);
function groups(channel,items,shipments,archives,owns=()=>true){
 const fixed=channel.nationalRound?.date||channel.shippingDefaults?.deliverySchedule?.auctionDate||'';
 const dates=[...new Set(items.filter(i=>!i.auctionArchiveId&&!i.attributes?.roundTargetChannelId).map(R.itemDate).filter(Boolean))];
 const fallback=fixed||(dates.length===1?dates[0]:'');
 const map=new Map();
 for(const item of items.filter(i=>!i.attributes?.roundTargetChannelId)){
  const date=R.itemDate(item)||fallback,key=item.auctionArchiveId?'archive:'+item.auctionArchiveId:date?'date:'+date:'current';
  if(!map.has(key)){
   const archive=archives.find(a=>a.id===item.auctionArchiveId);
   map.set(key,{key,name:archive?.title||(date?channel.name+' · '+date:channel.name+' · 현재 회차'),date:date||archive?.closedAt||'',archiveId:item.auctionArchiveId||'',items:[]});
  }
  map.get(key).items.push(item);
 }
 return [...map.values()].filter(r=>r.items.some(owns)).map(r=>{
  const owned=r.items.filter(owns),sold=owned.filter(i=>i.status==='sold');
  const unpaid=sold.filter(i=>!shipments.some(s=>s.itemId===i.id&&s.paymentStatus==='paid'));
  const paymentDueCount=unpaid.filter(i=>!shipments.some(s=>s.itemId===i.id&&['payment_reported','bank_transfer_reported','card_payment_reported'].includes(s.paymentStatus))).length;
  return {...r,itemCount:sold.length,openCount:unpaid.length,paymentDueCount};
 }).sort(compare);
}
function select(rounds,requested='',anchorId=''){
 if(!rounds.length&&!anchorId&&(!requested||requested==='current'))return {key:'current',name:'현재 회차',items:[],itemCount:0,openCount:0};
 const anchor=anchorId?rounds.find(r=>r.items.some(i=>i.id===anchorId)):null;
 if(anchorId&&!anchor)throw fail();
 const moved=requested.startsWith('date:')?rounds.filter(r=>r.date===requested.slice(5)):[];
 const current=rounds.filter(r=>!r.archiveId);
 const selected=requested?(rounds.find(r=>r.key===requested)||(moved.length===1?moved[0]:requested==='current'&&current.length===1?current[0]:null)):anchor||rounds[0];
 if(requested&&!selected||anchor&&selected!==anchor)throw fail();
 return selected||{key:'current',name:'현재 회차',items:[],itemCount:0,openCount:0};
}
const publicRound=({key,name,itemCount,openCount,archiveId=''})=>({key,name,itemCount,openCount,archiveId});
module.exports={open,groups,select,publicRound,priority,compare};

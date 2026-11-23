'use strict';
importScripts('provider.js','form.js');
let busy=false;
const uuid=s=>/^[a-f\d-]{36}$/.test(s||'');
function validPlan(p){return p?.schema==='creo.dodosi.dispatch.v1'&&uuid(p.originId)&&uuid(p.destinationId)&&Number.isInteger(p.quantity)&&p.quantity>=1&&p.quantity<=99&&/^010\d{8}$/.test(p.phone||'')&&p.name&&p.sender?.name&&/^0\d{8,10}$/.test(p.sender.phone||'')&&/^\d{4}-\d{2}-\d{2}$/.test(p.schedule?.dropoffDate||'')&&typeof p.groupId==='string';}
function readTab(tabs){return [...tabs].filter(t=>{const u=new URL(t.url);return u.origin==='https://www.dodosi.co.kr'&&u.pathname==='/order';}).sort((a,b)=>Number(b.active)-Number(a.active)||b.id-a.id)[0];}
async function ready(id){await new Promise((resolve,reject)=>{const finish=error=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);error?reject(error):resolve();},timer=setTimeout(()=>finish(Error('예약 화면을 열지 못했습니다.')),25000);function listener(tabId,info){if(tabId===id&&info.status==='complete')finish();}chrome.tabs.onUpdated.addListener(listener);chrome.tabs.get(id).then(t=>{if(t.status==='complete')finish();},finish);});}
async function run(action,plan,progress=()=>{}){
 if(action==='ping')return{version:'1.1.0'};
 if(action==='fill'||action==='fill-many'){
  const plans=action==='fill'?[plan]:plan?.plans;
  if(!Array.isArray(plans)||!plans.length||plans.length>100||plans.some(p=>!validPlan(p))||new Set(plans.map(p=>p.groupId)).size!==plans.length)throw Error('CREO 배송정보를 다시 불러와 주세요.');
  const first=plans[0];
  if(plans.some(p=>p.channelId!==first.channelId||p.originId!==first.originId||p.sender.name!==first.sender.name||p.sender.phone!==first.sender.phone))throw Error('같은 회차·출발지·보내는 분만 함께 입력할 수 있어요.');
  const quotes=[];
  for(const [i,p] of plans.entries()){
   progress(`일정·요금 확인 ${i+1}/${plans.length}`);
   const q=await run('quote',p),slot=q.slots?.find(s=>s.dropoff===p.schedule.dropoffDate&&s.pickup===p.schedule.dispatchDate&&s.arrival===p.schedule.arrivalDate);
   if(!q.available||!slot)throw Error('일정이 변경되었습니다. 정거샵·일정을 갱신한 뒤 다시 확인해 주세요.');
   quotes.push(q);
  }
  const dates=[...new Set(plans.map(p=>p.schedule.dropoffDate))],completed=[];
  for(const [i,date] of dates.entries()){
   const batch=plans.filter(p=>p.schedule.dropoffDate===date),p=batch[0];
   // Stable, non-personal fingerprint survives worker restart and avoids duplicate tabs.
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(batch.map(p=>[p.channelId,p.groupId,p.sender,p.schedule]))));
   const key=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
   const old=(await chrome.tabs.query({url:'https://www.dodosi.co.kr/order*'})).find(t=>new URL(t.url).searchParams.get('creoBatch')===key);
   if(old){await chrome.tabs.update(old.id,{active:true});throw Error('같은 배송의 예약서가 이미 열려 있어요. 열린 예약서를 먼저 확인해 주세요.');}
   progress(`예약서 입력 ${i+1}/${dates.length} · ${batch.length}명`);
   const opened=await chrome.tabs.create({url:'https://www.dodosi.co.kr/order?'+new URLSearchParams({myShop:p.originId,shop:p.destinationId,qty:String(p.quantity),creoBatch:key}),active:true});
   await ready(opened.id);
   const results=await chrome.scripting.executeScript({target:{tabId:opened.id},world:'MAIN',func:creoDodosiFill,args:[p,batch]});
   const result=results[0]?.result;
   if(!result?.filled)throw Error(result?.error||'입력이 중단되었습니다. 열린 예약서를 확인해 주세요. 다시 누르면 중복될 수 있어요.');
   completed.push({...result,tabId:opened.id});
  }
  return{filled:true,stage:'review',count:plans.length,quantity:plans.reduce((n,p)=>n+p.quantity,0),forms:completed,quotes};
 }
 if(!uuid(plan?.originId)&&!(action==='sync'&&typeof plan?.originName==='string'&&plan.originName.length<100))throw Error('출발 정거샵을 확인해 주세요.');
 const tab=readTab(await chrome.tabs.query({url:'https://www.dodosi.co.kr/order*'}));
 if(!tab)throw Error('로그인한 도도시 배송 예약 탭을 열어 주세요.');
 if(action==='sync'||action==='quote'){
  if(action==='quote'&&(!uuid(plan.destinationId)||!Number.isInteger(plan.quantity)||plan.quantity<1||plan.quantity>99))throw Error('도착지·마릿수를 확인해 주세요.');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creoDodosiRead,args:[{originId:plan.originId,originName:plan.originName,full:action==='sync',destinationId:plan.destinationId,quantity:plan.quantity}]});
  if(!results[0]?.result)throw Error('도도시 로그인 또는 일정 조회에 실패했습니다.');return results[0].result;
 }
 throw Error('지원하지 않는 작업입니다.');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 let url;try{url=new URL(sender.tab?.url);}catch{return;}
 if(url.origin!=='https://creok.onrender.com'||url.pathname!=='/dodosi-dispatch.html')return;
 if(!['ping','sync','quote','fill','fill-many'].includes(message.action))return;
 if(busy&&message.action!=='ping'){reply({error:'앞선 도도시 작업이 진행 중입니다.'});return;}
 if(message.action!=='ping')busy=true;
 const progress=text=>chrome.tabs.sendMessage(sender.tab.id,{type:'creo-dodosi-progress',requestId:message.requestId,text}).catch(()=>{});
 run(message.action,message.plan,progress).then(reply,e=>reply({error:e.message})).finally(()=>{if(message.action!=='ping')busy=false;});return true;
});

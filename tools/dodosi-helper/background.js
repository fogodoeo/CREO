'use strict';
importScripts('provider.js','form.js');
let busy=false;
const uuid=s=>/^[a-f\d-]{36}$/.test(s||'');
async function run(action,plan){
 if(action==='ping')return{version:'1.0.0'};
 if(!uuid(plan?.originId)&&!(action==='sync'&&typeof plan?.originName==='string'&&plan.originName.length<100))throw Error('출발 정거샵을 확인해 주세요.');
 const tabs=await chrome.tabs.query({url:'https://www.dodosi.co.kr/order*'});
 const base=tabs.filter(t=>new URL(t.url).pathname==='/order'&&!new URL(t.url).search);
 const tab=base.length===1?base[0]:tabs.length===1?tabs[0]:null;
 if(!tab)throw Error('도도시 기본 배송 예약 탭을 하나 열어 주세요.');
 if(action==='sync'||action==='quote'){
   if(action==='quote'&&(!uuid(plan.destinationId)||!Number.isInteger(plan.quantity)||plan.quantity<1||plan.quantity>99))throw Error('도착지·마릿수를 확인해 주세요.');
   const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:creoDodosiRead,args:[{originId:plan.originId,originName:plan.originName,full:action==='sync',destinationId:plan.destinationId,quantity:plan.quantity}]});
   if(!results[0]?.result)throw Error('도도시 로그인 또는 일정 조회에 실패했습니다.');return results[0].result;
 }
 if(action!=='fill'||plan.schema!=='creo.dodosi.dispatch.v1'||!uuid(plan.destinationId)||!Number.isInteger(plan.quantity)||plan.quantity<1||plan.quantity>99||!/^010\d{8}$/.test(plan.phone||'')||!plan.name||!plan.sender?.name||!/^0\d{8,10}$/.test(plan.sender?.phone||'')||!/^\d{4}-\d{2}-\d{2}$/.test(plan.schedule?.dropoffDate||''))throw Error('CREO 배송정보를 다시 불러와 주세요.');
 const quote=await run('quote',plan);
 const slot=quote.slots?.find(s=>s.dropoff===plan.schedule.dropoffDate&&s.pickup===plan.schedule.dispatchDate&&s.arrival===plan.schedule.arrivalDate);
 if(!quote.available||!slot)throw Error('일정이 변경되었습니다. 다시 갱신해 주세요.');
 // Do not overwrite an existing form: create one review tab and never submit it.
 const opened=await chrome.tabs.create({url:'https://www.dodosi.co.kr/order?'+new URLSearchParams({myShop:plan.originId,shop:plan.destinationId,qty:String(plan.quantity)}),active:true});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(Error('예약 화면을 열지 못했습니다.'));},25000);function listener(id,info){if(id===opened.id&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve();}}chrome.tabs.onUpdated.addListener(listener);chrome.tabs.get(opened.id).then(t=>{if(t.status==='complete')listener(opened.id,{status:'complete'});});});
 const results=await chrome.scripting.executeScript({target:{tabId:opened.id},world:'MAIN',func:creoDodosiFill,args:[plan]});
 if(!results[0]?.result)throw Error('자동 입력을 완료하지 못했습니다. 열린 예약서를 확인해 주세요.');return{...results[0].result,quote:quote.quote,discountBp:quote.discountBp};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(!sender.tab?.url?.startsWith('https://creok.onrender.com/dodosi-dispatch.html'))return;
 if(!['ping','sync','quote','fill'].includes(message.action))return;
 if(busy&&message.action!=='ping'){reply({error:'앞선 도도시 작업이 진행 중입니다.'});return;}
 if(message.action!=='ping')busy=true;
 run(message.action,message.plan).then(reply,e=>reply({error:e.message})).finally(()=>{if(message.action!=='ping')busy=false;});return true;
});

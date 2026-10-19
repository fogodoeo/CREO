'use strict';
// Serialize reservation checks across tabs. Store hashes only, never recipient data.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
 if(message?.type !== 'creo-parge-reserve') return;
 if(!sender.tab?.url?.startsWith('https://parge.co.kr/booking') || !Array.isArray(message.keys) || !message.keys.length || message.keys.length > 9900 || message.keys.some(k=>!/^creo-parge:[a-f0-9]{64}$/.test(k))) { reply({error:'접수 기록 요청을 확인할 수 없어요.'}); return; }
 queue = queue.catch(()=>{}).then(async()=>{
  const history=await chrome.storage.local.get(message.keys);
  if(message.keys.some(k=>history[k]))return {error:'이미 장바구니 담기를 시도한 개체가 있어요. 장바구니·예약 내역을 확인해 주세요.'};
  await chrome.storage.local.set(Object.fromEntries(message.keys.map(k=>[k,{attemptedAt:new Date().toISOString(),state:'attempted'}])));
  return {reserved:true};
 });
 queue.then(reply,()=>reply({error:'중복 접수 방지 기록을 저장하지 못했어요. 접수를 중단했어요.'}));
 return true;
});
let dispatching=false;
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.type!=='creo-parge-web')return;
 try{const url=new URL(sender.tab?.url||'');if(url.origin!=='https://creok.onrender.com'||url.pathname!=='/parge-dispatch.html')return;}catch{return;}
 if(message.action==='ping'){reply({ready:true});return;}
 if(message.action==='release'){
  if(dispatching){reply({error:'입력 중에는 기록을 해제할 수 없어요.'});return;}
  (async()=>{const p=message.plan;if(!p?.channelId||!Array.isArray(p.groups))throw Error('기록을 확인할 수 없어요.');
   const keys=await Promise.all(p.groups.flatMap(g=>g.items).map(async i=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.channelId+':'+i.id));return 'creo-parge:'+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}));
   await queue.catch(()=>{});await chrome.storage.local.remove(keys);return {released:true};
  })().then(reply,e=>reply({error:e.message}));return true;
 }
 if(message.action!=='dispatch')return;
 if(dispatching){reply({error:'다른 파르게 입력을 진행 중이에요.'});return;}
 dispatching=true;
 (async()=>{
  const tabs=await chrome.tabs.query({url:'https://parge.co.kr/booking'});
  if(tabs.length!==1)throw Error('Chrome에서 로그인한 파르게 배송신청 탭을 하나만 열어 주세요.');
  const tab=tabs[0];await chrome.tabs.update(tab.id,{active:true});
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['mobile-phone.js','parge-dispatch-core.js','form.js']});
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async plan=>window.CreoPargeForm.run(plan),args:[message.plan]});
  return results[0]?.result||{error:'장바구니 반영 여부를 확인하지 못했어요. 파르게 화면을 확인해 주세요.'};
 })().then(reply,e=>reply({error:e.message})).finally(()=>dispatching=false);
 return true;
});

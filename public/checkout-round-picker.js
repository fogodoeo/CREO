(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function badgeMeta(r,isVendor){
  if(r.openCount)return{text:'미완료 '+r.openCount+'개체',tone:'urgent'};
  if(r.settlementNeedsReview)return{text:'입금 확인 필요',tone:'urgent'};
  if(r.settlementRemaining)return{text:'정산 남음',tone:'pending'};
  if(r.settlementPending)return{text:'정산 확인 중',tone:'pending'};
  return isVendor?{text:'완료',tone:'done'}:{text:'선택 가능',tone:'neutral'};
 }
 function recoveryHref(status,locationObject=location){
  if(status!==409)return '';
  const url=new URL(locationObject.href);
  if(!url.searchParams.get('round'))return '';
  url.searchParams.delete('round');
  return url.href;
 }
 function showRecovery(link,status){
  const href=recoveryHref(status);
  link.hidden=!href;
  if(href)link.href=href;else link.removeAttribute('href');
 }
 root.CreoCheckoutRounds={recoveryHref,showRecovery,create({client,container,load,canChange=()=>true}){
  let data=null,busy=false;
  const panel=document.createElement('section');panel.className='checkout-round-switch';panel.hidden=true;
  const label=document.createElement('label'),select=document.createElement('select');
  select.id='checkout-round';label.htmlFor=select.id;label.textContent='결제·정산 회차';
  panel.append(label,select);container.prepend(panel);
  const canSheet=typeof document.body?.append==='function'&&typeof document.createElement('dialog')?.showModal==='function';
  let trigger=null,sheet=null,pressedOutside=false;
  if(canSheet){
   panel.classList?.add('has-round-sheet');
   trigger=document.createElement('button');trigger.type='button';trigger.className='round-sheet-trigger';trigger.setAttribute('aria-haspopup','dialog');
   sheet=document.createElement('dialog');sheet.className='round-sheet-dialog';sheet.setAttribute('aria-label','회차 선택');
   panel.append(trigger);document.body.append(sheet);
   trigger.onclick=()=>{if(!trigger.disabled&&!sheet.open)sheet.showModal();};
   const isOutside=e=>{const r=sheet.getBoundingClientRect();return e.target===sheet&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
   sheet.addEventListener('pointerdown',e=>{pressedOutside=isOutside(e);});
   sheet.addEventListener('click',e=>{if(pressedOutside&&isOutside(e))sheet.close();pressedOutside=false;});
  }
  function update(value){
   data=value;const rounds=data.rounds||[],round=data.round;
   if(!round){panel.hidden=true;return;}
   client.setRound(round.key);select.replaceChildren();
   const vendor=Array.isArray(data.buyers);label.textContent=vendor?'결제·정산 회차':'낙찰 회차';
   for(const r of rounds){const option=document.createElement('option');option.value=r.key;option.textContent=r.name+(r.openCount?' · 결제 미완료 '+r.openCount+'개체':'')+(r.settlementNeedsReview?' · 기존 입금 확인 필요':r.settlementPending?' · 정산 확인 중':r.settlementRemaining?' · 정산 남음':'');select.append(option);}
   select.value=round.key;panel.hidden=rounds.length<2;
   if(trigger&&sheet){
    trigger.hidden=panel.hidden;trigger.disabled=busy;
    const active=rounds.find(r=>r.key===round.key)||round,b=badgeMeta(active,vendor);
    trigger.innerHTML=`<span class="round-trigger-name">${esc(active.name)}</span><span class="round-trigger-right">${b.tone!=='neutral'?`<i class="round-pill ${b.tone}">${esc(b.text)}</i>`:''}<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span>`;
    sheet.innerHTML=`<header><h2>${vendor?'결제·정산 회차':'낙찰 회차'} 선택</h2><button type="button" class="round-sheet-close" aria-label="회차 선택 닫기">×</button></header><div class="round-sheet-list">${rounds.map(r=>{const m=badgeMeta(r,vendor),isCur=r.key===round.key;return `<button type="button" class="round-sheet-option" data-round-val="${esc(r.key)}" ${isCur?'aria-current="true"':''}><span class="round-option-title"><b>${esc(r.name)}</b></span>${m.tone!=='neutral'?`<i class="round-pill ${m.tone}">${esc(m.text)}</i>`:`<span class="round-option-check">${isCur?'선택됨':'›'}</span>`}</button>`;}).join('')}</div>`;
    sheet.querySelector('.round-sheet-close').onclick=()=>sheet.close();
    sheet.querySelectorAll('[data-round-val]').forEach(btn=>{btn.onclick=async()=>{const val=btn.dataset.roundVal;sheet.close();if(val===select.value)return;select.value=val;await select.onchange();};});
   }
   const url=new URL(location.href);url.searchParams.set('round',round.key);if(Array.isArray(data.events))url.searchParams.set('event',data.channel.id);history.replaceState(null,'',url);
  }
  select.onchange=async()=>{
   if(busy||!canChange()){select.value=data.round.key;return;}
   const previous=data.round.key;client.setRound(select.value);busy=true;select.disabled=true;if(trigger)trigger.disabled=true;
   try{if(!await load()){client.setRound(previous);select.value=previous;await load();}}
   finally{busy=false;select.disabled=false;if(trigger)trigger.disabled=false;}
  };
  return {update};
 }};
})(window);

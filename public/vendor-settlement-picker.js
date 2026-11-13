(function(root){
 'use strict';
 const key=r=>JSON.stringify([r.channelId,r.key]);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=r=>r.name+(r.openCount?' · 결제 미완료 '+r.openCount+'개체':'')+(r.settlementNeedsReview?' · 기존 입금 확인 필요':r.settlementPending?' · 정산 확인 중':r.settlementRemaining?' · 정산 남음':'');
 function badgeMeta(r){
  if(r.openCount)return{text:'미완료 '+r.openCount+'개체',tone:'urgent'};
  if(r.settlementNeedsReview)return{text:'입금 확인 필요',tone:'urgent'};
  if(r.settlementRemaining)return{text:'정산 남음',tone:'pending'};
  if(r.settlementPending)return{text:'정산 확인 중',tone:'pending'};
  return{text:'완료',tone:'done'};
 }
 root.CreoVendorSettlementPicker={create({client,container,change,canChange=()=>true,canAutoChange=canChange}){
  let data=null,choices=[],loaded=false,pending=null,busy=false,error='',landingResolved=false;
  const explicitRound=new URL(location.href).searchParams.has('round');
  const panel=document.createElement('section');panel.className='checkout-round-switch';
  const title=document.createElement('label'),select=document.createElement('select'),current=document.createElement('p'),feedback=document.createElement('p'),retry=document.createElement('button');
  title.htmlFor=select.id='vendor-settlement-round';title.textContent='방송일 · 낙찰·정산';current.className='settlement-current-round';feedback.setAttribute('role','status');retry.type='button';retry.textContent='회차 다시 불러오기';retry.className='settlement-round-retry';
  panel.append(title,select,current,feedback,retry);container.prepend(panel);
  const canSheet=typeof document.body?.append==='function'&&typeof document.createElement('dialog')?.showModal==='function';
  let trigger=null,sheet=null,pressedOutside=false;
  if(canSheet){
   panel.classList?.add('has-round-sheet');
   trigger=document.createElement('button');trigger.type='button';trigger.className='round-sheet-trigger';trigger.setAttribute('aria-haspopup','dialog');
   sheet=document.createElement('dialog');sheet.className='round-sheet-dialog';sheet.setAttribute('aria-label','방송 회차 선택');
   panel.append(trigger);document.body.append(sheet);
   trigger.onclick=()=>{if(!trigger.disabled&&!sheet.open)sheet.showModal();};
   const isOutside=e=>{const r=sheet.getBoundingClientRect();return e.target===sheet&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
   sheet.addEventListener('pointerdown',e=>{pressedOutside=isOutside(e);});
   sheet.addEventListener('click',e=>{if(pressedOutside&&isOutside(e))sheet.close();pressedOutside=false;});
  }
  const selected=()=>({channelId:data.channel.id,key:data.round?.key||'current'});
  function render(){
   if(!data)return;
   const active=selected(),options=choices.slice();
   if(!options.some(r=>key(r)===key(active)))options.unshift({...active,name:data.round?.name==='현재 회차'?data.channel.name:data.round?.name||data.channel.name});
   select.replaceChildren();for(const r of options){const option=document.createElement('option');option.value=key(r);option.textContent=label(r);select.append(option);}
   select.value=key(active);select.disabled=busy||!!pending;select.hidden=loaded&&options.length<2;title.hidden=select.hidden;
   const activeOption=options.find(r=>key(r)===key(active));
   current.textContent=activeOption.name;current.hidden=!select.hidden;
   feedback.textContent=error||(!loaded?'방송 회차를 불러오는 중…':'');feedback.hidden=!feedback.textContent;retry.hidden=!error;retry.disabled=busy||!!pending;
   if(trigger&&sheet){
    trigger.hidden=select.hidden;trigger.disabled=select.disabled;
    const b=badgeMeta(activeOption);
    trigger.innerHTML=`<span class="round-trigger-name">${esc(activeOption.name)}</span><span class="round-trigger-right"><i class="round-pill ${b.tone}">${esc(b.text)}</i><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span>`;
    sheet.innerHTML=`<header><h2>방송 회차 선택</h2><button type="button" class="round-sheet-close" aria-label="회차 선택 닫기">×</button></header><div class="round-sheet-list">${options.map(r=>{const m=badgeMeta(r),isCur=key(r)===key(active);return `<button type="button" class="round-sheet-option" data-round-val="${esc(key(r))}" ${isCur?'aria-current="true"':''}><span class="round-option-title"><b>${esc(r.name)}</b></span><i class="round-pill ${m.tone}">${esc(m.text)}</i></button>`;}).join('')}</div>`;
    sheet.querySelector('.round-sheet-close').onclick=()=>sheet.close();
    sheet.querySelectorAll('[data-round-val]').forEach(btn=>{btn.onclick=async()=>{const val=btn.dataset.roundVal;sheet.close();if(val===select.value)return;select.value=val;await select.onchange();};});
   }
  }
  async function refresh(){
   if(pending)return pending;
   error='';
   pending=(async()=>{try{
    const result=await client.request('/rounds?event='+encodeURIComponent(data.channel.id));choices=result.rounds;loaded=true;
    const emptyLanding=selected().key==='current'&&data.summary?.itemCount===0&&data.buyers?.length===0&&!choices.some(r=>key(r)===key(selected()));
    const target=choices[0],automatic=!landingResolved&&(!explicitRound||emptyLanding);
    if(automatic&&target&&key(target)!==key(selected())&&canAutoChange()){
     busy=true;render();
     try{if(!await change(target))error='낙찰 내역이 있는 방송일을 열지 못했어요. 회차 다시 불러오기를 눌러 주세요.';else landingResolved=true;}
     catch{error='낙찰 내역이 있는 방송일을 열지 못했어요. 회차 다시 불러오기를 눌러 주세요.';}
     finally{busy=false;}
    }else if(automatic&&(!target||key(target)===key(selected())))landingResolved=true;
   }catch{error='다른 회차를 불러오지 못했어요. 다시 불러오기를 눌러 주세요.';}finally{pending=null;render();}})();
   render();return pending;
  }
  function update(value){
   data=value;client.setRound(data.round?.key||'');
   const url=new URL(location.href);url.searchParams.set('event',data.channel.id);url.searchParams.set('round',data.round?.key||'current');history.replaceState(null,'',url);
   choices=choices.map(r=>r.channelId===data.channel.id?{...r,...(data.rounds||[]).find(own=>own.key===r.key),name:r.name}:r);
   render();if(!loaded&&!pending&&!error)refresh();
  }
  select.onchange=async()=>{
   const previous=key(selected()),target=choices.find(r=>key(r)===select.value);
   if(busy||pending||!target||select.value===previous||!canChange()){select.value=previous;return;}
   landingResolved=true;busy=true;error='';render();
   try{if(!await change(target)){error='선택한 회차를 열지 못했어요. 다시 선택해 주세요.';}}
   catch{error='선택한 회차를 열지 못했어요. 다시 선택해 주세요.';}
   finally{busy=false;render();(trigger&&!trigger.hidden?trigger:select).focus({preventScroll:true});}
  };
  retry.onclick=refresh;
  return {update,refresh};
 }};
})(window);

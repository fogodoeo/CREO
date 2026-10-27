(function(root){
 'use strict';
 const key=r=>JSON.stringify([r.channelId,r.key]);
 const label=r=>r.name+(r.openCount?' · 결제 미완료 '+r.openCount+'개체':'')+(r.settlementNeedsReview?' · 기존 입금 확인 필요':r.settlementPending?' · 정산 확인 중':r.settlementRemaining?' · 정산 남음':'');
 root.CreoVendorSettlementPicker={create({client,container,change,canChange=()=>true,canAutoChange=canChange}){
  let data=null,choices=[],loaded=false,pending=null,busy=false,error='',landingResolved=false;
  const explicitRound=new URL(location.href).searchParams.has('round');
  const panel=document.createElement('section');panel.className='checkout-round-switch';
  const title=document.createElement('label'),select=document.createElement('select'),current=document.createElement('p'),feedback=document.createElement('p'),retry=document.createElement('button');
  title.htmlFor=select.id='vendor-settlement-round';title.textContent='방송일 · 낙찰·정산';current.className='settlement-current-round';feedback.setAttribute('role','status');retry.type='button';retry.textContent='회차 다시 불러오기';retry.className='settlement-round-retry';
  panel.append(title,select,current,feedback,retry);container.prepend(panel);
  const selected=()=>({channelId:data.channel.id,key:data.round?.key||'current'});
  function render(){
   if(!data)return;
   const active=selected(),options=choices.slice();
   if(!options.some(r=>key(r)===key(active)))options.unshift({...active,name:data.round?.name==='현재 회차'?data.channel.name:data.round?.name||data.channel.name});
   select.replaceChildren();for(const r of options){const option=document.createElement('option');option.value=key(r);option.textContent=label(r);select.append(option);}
   select.value=key(active);select.disabled=busy||!!pending;select.hidden=loaded&&options.length<2;title.hidden=select.hidden;
   current.textContent=options.find(r=>key(r)===key(active)).name;current.hidden=!select.hidden;
   feedback.textContent=error||(!loaded?'방송 회차를 불러오는 중…':'');feedback.hidden=!feedback.textContent;retry.hidden=!error;retry.disabled=busy||!!pending;
  }
  async function refresh(){
   if(pending)return pending;
   error='';
   pending=(async()=>{try{
    const result=await client.request('/rounds?event='+encodeURIComponent(data.channel.id));choices=result.rounds;loaded=true;
    // Generic links open the first outstanding round once. Explicit history,
    // edits and subsequent refreshes must never silently change financial scope.
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
   finally{busy=false;render();select.focus({preventScroll:true});}
  };
  retry.onclick=refresh;
  return {update,refresh};
 }};
})(window);

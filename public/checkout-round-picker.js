(function(root){
 'use strict';
 root.CreoCheckoutRounds={create({client,container,load,canChange=()=>true}){
  let data=null,busy=false;
  const panel=document.createElement('section');panel.className='checkout-round-switch';panel.hidden=true;
  const label=document.createElement('label'),select=document.createElement('select');
  select.id='checkout-round';label.htmlFor=select.id;label.textContent='결제·정산 회차';
  panel.append(label,select);container.prepend(panel);
  function update(value){
   data=value;const rounds=data.rounds||[],round=data.round;
   if(!round){panel.hidden=true;return;}
   client.setRound(round.key);select.replaceChildren();
   const vendor=Array.isArray(data.buyers);label.textContent=vendor?'결제·정산 회차':'낙찰 회차';
   for(const r of rounds){const option=document.createElement('option');option.value=r.key;option.textContent=r.name+(r.openCount?' · 결제 미완료 '+r.openCount+'개체':'')+(r.settlementNeedsReview?' · 기존 입금 확인 필요':r.settlementPending?' · 정산 확인 중':r.settlementRemaining?' · 정산 남음':'');select.append(option);}
   select.value=round.key;panel.hidden=rounds.length<2;
   const url=new URL(location.href);url.searchParams.set('round',round.key);if(Array.isArray(data.events))url.searchParams.set('event',data.channel.id);history.replaceState(null,'',url);
  }
  select.onchange=async()=>{
   if(busy||!canChange()){select.value=data.round.key;return;}
   const previous=data.round.key;client.setRound(select.value);busy=true;select.disabled=true;
   try{if(!await load()){client.setRound(previous);select.value=previous;await load();}}
   finally{busy=false;select.disabled=false;}
  };
  return {update};
 }};
})(window);

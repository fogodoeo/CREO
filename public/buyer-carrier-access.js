(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBuyerCarrierAccess=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function create({document,getState,request,onUpdate,onChoose}){
  const box=document.getElementById('buyer-carrier-request');let busy=false,inFlight=false,error='',search=null,lastScope='',lastRender='';
  const scope=()=>{const s=getState();return s.data?.channel?.id+'|'+s.data?.round?.key};
  function render(options=search){
   search=options;const state=getState(),access=state.data?.carrierRequest,currentScope=scope();
   if(lastScope!==currentScope){lastScope=currentScope;error='';}
   const emptySearch=options?.visible&&options.matches===0&&String(options.query||'').trim().length>=2;
   const signature=JSON.stringify([currentScope,state.destinationId,access,emptySearch,busy,state.saving,error]);
   if(signature===lastRender)return;lastRender=signature;
   box.hidden=!access||state.destinationId!=='parge'||(!emptySearch&&!['pending','approved','rejected'].includes(access.state));
   if(box.hidden)return;
   const hadFocus=box.contains(document.activeElement);
   box.replaceChildren();const note=document.createElement('p');note.className='carrier-access-status';note.setAttribute('role','status');
   function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=busy||state.saving;b.onclick=action;box.append(b);return b;}
   if(access.state==='pending'){
    note.textContent='이용 신청을 보냈어요. 운영자가 확인 중이에요.';box.append(note);button('승인 상태 확인',()=>refresh(false));
   }else if(access.state==='approved'){
    note.textContent='도도시를 이용할 수 있어요.';box.append(note);button('도도시 지점 찾기',onChoose);
   }else if(access.state==='rejected'){
    note.textContent=access.reason||'운영자가 이용 신청을 거절했어요.';box.append(note);
   }else if(access.canRequest&&emptySearch){
    button(busy?'신청 중…':'우리 지역에 파르게 거점이 없어요',submit);
    note.textContent='누르면 운영자에게 이용 신청을 보냅니다.';box.append(note);
   }else{box.hidden=true;return;}
   if(error){const message=document.createElement('p');message.className='carrier-access-error';message.setAttribute('role','alert');message.textContent=error;box.append(message);}
   if(hadFocus){const target=box.querySelector('button')||note;if(target===note)note.tabIndex=-1;target.focus();}
  }
  async function submit(){
   if(busy||getState().saving||!getState().data.carrierRequest?.canRequest||!search||search.matches!==0)return;
   const before=scope(),body={query:search.query,region:search.region};busy=true;error='';render();
   try{const data=await request('/carrier-request',body);if(scope()===before)onUpdate(data);}
   catch(e){if(scope()===before)error=(e.message||'신청을 저장하지 못했어요.')+' 잠시 후 다시 신청해 주세요.';}
   finally{busy=false;render();if(scope()===before)box.querySelector('button')?.focus();}
  }
  async function refresh(quiet=true){
   if(inFlight||busy||getState().saving||getState().data?.carrierRequest?.state!=='pending')return;
   const before=scope();inFlight=true;if(!quiet){busy=true;error='';render();}
   try{const data=await request('/carrier-request');if(scope()===before){onUpdate(data);error='';}}
   catch(e){if(!quiet&&scope()===before)error='승인 상태를 불러오지 못했어요. 다시 확인해 주세요.';}
   finally{inFlight=false;busy=false;render();if(!quiet&&scope()===before)box.querySelector('button')?.focus();}
  }
  return{render,refresh,isBusy:()=>busy};
 }
 return{create};
});

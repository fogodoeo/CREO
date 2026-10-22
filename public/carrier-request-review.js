(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCarrierRequestReview=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render({document,container,records,review,focusId='',onBusy=()=>{}}){
  const pending=records.filter(r=>r.state==='pending'),done=records.filter(r=>r.state!=='pending');
  const drafts=new Map([...container.querySelectorAll('[data-carrier-id]')].map(row=>[row.dataset.carrierId,row.querySelector('textarea')?.value||'']));
  container.hidden=!records.length;
  function card(r){return `<article data-carrier-id="${esc(r.id)}"><span class="badge">${{pending:'확인 필요',approved:'도도시 허용',rejected:'거절'}[r.state]}</span><h3>${esc(r.buyerName)}</h3><p class="caption">${esc(r.round?.name||'')}</p><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a><p>검색한 지역 · <b>${esc(r.query)}</b></p>${r.state==='pending'?`<button class="primary" type="button" data-carrier-action="approve">도도시 허용</button><details class="carrier-reject"><summary>이용이 어려운 경우</summary><label>낙찰자에게 안내할 사유<textarea maxlength="300" rows="2" placeholder="다른 수령 방법을 안내해 주세요"></textarea></label><button type="button" data-carrier-action="reject">신청 거절</button></details>${['failed','configuration_pending','delivery_unknown','unavailable'].includes(r.notificationStatus)?'<small>문자 발송이 완료되지 않았어요. 이 화면에서 처리할 수 있어요.</small>':''}`:`<p>${r.state==='approved'?'낙찰자 페이지에서 도도시 지점을 선택할 수 있어요.':esc(r.reason)}</p>`}<p class="error carrier-feedback" role="status" tabindex="-1"></p></article>`;}
  container.innerHTML='<h2>도도시 이용 신청</h2>'+pending.map(card).join('')+(done.length?`<details class="carrier-completed"${done.some(r=>r.id===focusId)?' open':''}><summary>처리 완료 ${done.length}건</summary>${done.map(card).join('')}</details>`:'');
  container.querySelectorAll('[data-carrier-id]').forEach(row=>{const input=row.querySelector('textarea'),draft=drafts.get(row.dataset.carrierId);if(input&&draft){input.value=draft;row.querySelector('.carrier-reject').open=true;}});
  container.querySelectorAll('[data-carrier-action]').forEach(button=>button.onclick=async()=>{
   const row=button.closest('article');if(container.dataset.busy==='true')return;
   const action=button.dataset.carrierAction,reason=row.querySelector('textarea')?.value.trim()||'',feedback=row.querySelector('.carrier-feedback');
   if(action==='reject'&&!reason){feedback.textContent='낙찰자에게 안내할 사유를 적어 주세요.';row.querySelector('textarea').focus();return;}
   container.dataset.busy='true';onBusy(true);container.querySelectorAll('button,textarea').forEach(n=>n.disabled=true);feedback.textContent='처리 중…';
   try{const result=await review(row.dataset.carrierId,{action,reason});const next=records.map(r=>r.id===result.record.id?{...r,...result.record}:r);render({document,container,records:next,review,focusId:result.record.id,onBusy});const updated=[...container.querySelectorAll('[data-carrier-id]')].find(n=>n.dataset.carrierId===result.record.id);const done=updated?.querySelector('.carrier-feedback');if(done){done.classList.remove('error');done.textContent=result.record.state==='approved'?'도도시 이용을 허용했어요.':'거절 사유를 낙찰자 페이지에 표시했어요.';done.focus();}}
   catch(e){feedback.textContent=(e.message||'처리하지 못했어요.')+' 내역을 확인하고 다시 시도해 주세요.';feedback.focus();}
   finally{container.dataset.busy='false';onBusy(false);container.querySelectorAll('button,textarea').forEach(n=>n.disabled=false);}
  });
 }
 return{render};
});

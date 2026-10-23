(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCheckoutChangeReview=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
 const date=value=>value?new Date(value).toLocaleString('ko-KR'):'';
 const fingerprint=r=>JSON.stringify([r.before,r.after,r.cardLinks]);
 function view(value={}){return `<div>${esc(value.address||'미선택')}</div><div class="amount">${money(value.totals?.totalAmount)}</div>${(value.vendors||[]).map(v=>`<div class="vendor"><strong>${esc(v.name)}</strong><div>${v.method==='card'?'카드결제':'계좌이체'}</div><div>${money(v.amount)}</div><small>배송비 ${money(v.shippingAmount)}</small></div>`).join('')}`;}
 function render({document,container,records,review,focusId='',onBusy=()=>{}}){
  const drafts=new Map([...container.querySelectorAll('[data-change-id]')].map(row=>[row.dataset.changeId,{fingerprint:row.dataset.fingerprint,reason:row.querySelector('textarea')?.value||'',unpaid:row.querySelector('[data-unpaid]')?.checked,cancelled:row.querySelector('[data-cancelled]')?.checked}]));
  let busy=false,rowIndex=0;
  const pending=records.filter(r=>r.state==='pending').sort((a,b)=>(b.id===focusId)-(a.id===focusId)),done=records.filter(r=>r.state!=='pending');
  function card(r){const waiting=r.state==='pending',state=waiting?'확인 필요':r.state==='approved'?(r.reviewedBy==='buyer'?'배송지 수정 완료':'변경 완료'):'변경 거절';
   return `<article data-change-id="${esc(r.id)}" data-fingerprint="${esc(fingerprint(r))}"><div class="request-heading"><h3>${esc(r.buyerName)}</h3><span class="badge">${state}</span></div><div class="request-meta">${/^0\d{8,10}$/.test(r.phone||'')?`<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>`:''}<span>${esc(date(r.createdAt))}</span></div>${waiting?'':`<p class="request-outcome">${esc(r.state==='rejected'?r.reason||'기존 배송·결제 정보를 유지했어요.':'요청한 배송·결제 정보를 적용했어요.')}</p>`}<details class="request-details"${waiting?' open':''}><summary>변경 내용 보기</summary><div class="compare"><section><h4>변경 전</h4>${view(r.before)}</section><section><h4>요청한 변경</h4>${view(r.after)}</section></div></details>${waiting?`<fieldset><legend>승인 전 확인</legend><p class="request-help">이미 입금·결제했다면 업체와 먼저 확인해 주세요. 이 승인은 환불이나 카드 취소를 처리하지 않아요.</p><label><input type="checkbox" data-unpaid>관련 업체 모두 실제 입금·카드 승인 내역이 없음을 확인했어요.</label>${r.cardLinks?.length?'<label><input type="checkbox" data-cancelled>기존 카드결제 링크를 외부 결제서비스에서 취소·차단했어요.</label>':''}</fieldset><button class="primary" type="button" data-change-action="approve">변경 승인</button><details class="request-reject"><summary>변경이 어려운 경우</summary><label>낙찰자에게 안내할 사유<textarea maxlength="300" rows="3" placeholder="예: 입금 내역 확인 후 다시 요청해 주세요"></textarea></label><button type="button" data-change-action="reject">사유 전달·변경 거절</button></details>`:`<small>처리 ${esc(date(r.reviewedAt))}</small>`}<p class="request-feedback" role="status" tabindex="-1"></p></article>`;
  }
  container.innerHTML=`<p class="request-count">확인 필요 ${pending.length}건</p>`+(pending.length?pending.map(card).join(''):'<p class="request-empty">지금 확인할 변경 요청이 없어요.</p>')+(done.length?`<details class="request-completed"${done.some(r=>r.id===focusId)?' open':''}><summary>처리한 요청 ${done.length}건</summary>${done.map(card).join('')}</details>`:'');
  container.querySelectorAll('[data-change-id]').forEach(row=>{
   const feedback=row.querySelector('.request-feedback');feedback.id='checkout-change-feedback-'+(++rowIndex);row.querySelectorAll('input,textarea').forEach(field=>field.setAttribute('aria-describedby',feedback.id));
   const approve=row.querySelector('[data-change-action="approve"]');if(approve)row.insertBefore(feedback,approve);
   const draft=drafts.get(row.dataset.changeId),input=row.querySelector('textarea');
   if(input&&draft?.fingerprint===row.dataset.fingerprint){input.value=draft.reason;row.querySelector('[data-unpaid]').checked=!!draft.unpaid;if(row.querySelector('[data-cancelled]'))row.querySelector('[data-cancelled]').checked=!!draft.cancelled;if(draft.reason)row.querySelector('.request-reject').open=true;}
  });
  container.querySelectorAll('[data-change-action]').forEach(button=>button.onclick=async()=>{
   if(busy||container.dataset.busy==='true')return;
   const row=button.closest('article'),action=button.dataset.changeAction,feedback=row.querySelector('.request-feedback'),input=row.querySelector('textarea');
   if(!row.isConnected||row._completed||row._blocked)return;
   const body={action,reason:input.value.trim(),confirmedUnpaid:!!row.querySelector('[data-unpaid]')?.checked,confirmedCardLinksCancelled:!!row.querySelector('[data-cancelled]')?.checked};
   function fail(message,target=feedback){feedback.classList.add('error');feedback.textContent=message;if(target!==feedback)target.setAttribute('aria-invalid','true');target.focus();target.scrollIntoView?.({block:'center'});}
   row.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
   if(action==='reject'&&!body.reason){input.setAttribute('aria-invalid','true');fail('낙찰자에게 안내할 사유를 적어 주세요.',input);return;}
   input.removeAttribute('aria-invalid');
   if(action==='approve'&&!body.confirmedUnpaid){fail('업체의 실제 입금·카드 승인 내역을 확인한 뒤 체크해 주세요.',row.querySelector('[data-unpaid]'));return;}
   if(action==='approve'&&row.querySelector('[data-cancelled]')&&!body.confirmedCardLinksCancelled){fail('외부 결제서비스에서 기존 카드 링크를 취소·차단한 뒤 체크해 주세요.',row.querySelector('[data-cancelled]'));return;}
   const frozen=row._pendingDecision||body;
   if(frozen.action!==action)return;
   row._pendingDecision=frozen;busy=true;container.dataset.busy='true';onBusy(true);container.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);feedback.classList.remove('error');feedback.textContent='처리 중…';
   let completed=false;
   try{
    const result=await review(row.dataset.changeId,frozen);completed=true;
    const next=records.map(r=>r.id===row.dataset.changeId?{...r,...result.record}:r);
    render({document,container,records:next,review,focusId:row.dataset.changeId,onBusy});
    const updated=[...container.querySelectorAll('[data-change-id]')].find(n=>n.dataset.changeId===row.dataset.changeId)?.querySelector('.request-feedback');
    if(updated){updated.textContent=result.record.state==='approved'?'변경을 승인했어요.':'변경을 거절하고 사유를 전달했어요.';updated.focus();updated.scrollIntoView?.({block:'center'});}
   }catch(e){
    if(completed){fail('처리는 완료됐어요. 새로고침으로 최신 내역을 확인해 주세요.');row._completed=true;}
    else if(e.status>=400&&e.status<500){delete row._pendingDecision;if(e.status===409||e.status===401||e.status===403)row._blocked=true;fail((e.message||'처리하지 못했어요.')+(row._blocked?' 새로고침으로 최신 내역을 확인해 주세요.':' 내용을 확인하고 다시 시도해 주세요.'));}
    else fail('처리 결과를 확인하지 못했어요. 같은 버튼으로 다시 확인하거나 새로고침해 주세요.');
   }finally{
    busy=false;container.dataset.busy='false';onBusy(false);container.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=false);
    container.querySelectorAll('[data-change-id]').forEach(r=>{if(r._completed||r._blocked)r.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);else if(r._pendingDecision){r.querySelectorAll('input,textarea').forEach(n=>n.disabled=true);r.querySelectorAll('button').forEach(n=>n.disabled=n.dataset.changeAction!==r._pendingDecision.action);}});
   }
  });
 }
 return{render};
});

(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml;
 let data,editing=null,busy=false;
 const api=(body)=>CreoPlatform.api('national-vendor-directory',{cache:'no-store',signal:AbortSignal.timeout(20000),...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 function error(message){const el=$($('review').open?'review-error':$('editor').open?'editor-error':'error');el.textContent=message||'';el.hidden=!message;}
 async function run(work){if(busy)return;busy=true;error('');try{await work();}catch(e){error(e.message);if(e.status===401){$('content').hidden=true;$('login').hidden=false;}}finally{busy=false;$('save').disabled=false;$('save').textContent='저장';}}
 async function load(){data=await api();$('login').hidden=true;$('content').hidden=false;$('companies').innerHTML=data.companies.length?data.companies.map(c=>`<button class="result" type="button" data-id="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.region)} · ${c.claimed?'대표 연결됨':c.registered?'대표 접속 전':'로그인 번호 미등록'}</small></span><span class="chevron" aria-hidden="true">›</span></button>`).join(''):'<p class="empty">등록된 업체가 없어요.</p>';for(const el of document.querySelectorAll('[data-id]'))el.onclick=()=>open(data.companies.find(c=>c.id===el.dataset.id));renderDeletions();}
 function renderDeletions(){
  $('deletions').hidden=!data.deletions?.length;
  $('deletions').querySelector('h2').textContent='삭제 승인 대기 '+(data.deletions?.length||0)+'건';
  $('deletion-list').innerHTML=(data.deletions||[]).map(r=>`<div class="review-request"><strong>${esc(r.name)}<i class="attention-dot" aria-hidden="true"></i></strong><small>삭제 승인 요청</small><button class="secondary" type="button" data-review="${esc(r.id)}">검토하기</button></div>`).join('');
  for(const button of document.querySelectorAll('[data-review]'))button.onclick=()=>run(()=>review({action:'inspect-deletion',id:button.dataset.review}));
 }
 async function review(query){
  const r=await api(query),direct=query.action==='inspect-company-deletion',name=r.name||data.deletions.find(d=>d.id===r.id)?.name||'업체',requestId=crypto.randomUUID();
  $('editor').close();$('review-title').textContent=name+' 삭제';$('review-error').hidden=true;
  $('review-body').innerHTML=`<p class="privacy-note">연결 채널: ${r.channels.map(esc).join(', ')}</p>${r.blockers.length?'<p class="privacy-note"><strong>아래 항목을 처리해야 삭제할 수 있어요.</strong></p><ul class="blocker-list">'+r.blockers.map(b=>'<li>'+esc(b)+'</li>').join('')+'</ul>':r.status!=='pending'?'<p class="privacy-note">이미 처리된 요청이에요.</p>':''}${r.blockers.some(b=>b.includes('방송'))?'<a class="help-link" href="/organizer-bookings.html?channel=national-cre" target="_blank" rel="noopener">방송 예약 관리 열기 (새 창)</a>':''}${r.blockers.length?'<button id="recheck-deletion" class="secondary" type="button">처리 상태 다시 확인</button>':''}${!direct?'<label class="field" for="reject-note">반려 사유<textarea id="reject-note" maxlength="300"></textarea></label>':''}${!r.blockers.length&&r.status==='pending'?'<label class="check"><input id="confirm-delete" type="checkbox"><span>업체 접속을 종료하고 삭제합니다. 거래 기록은 보관됩니다.</span></label>':''}<div class="request-actions">${!direct?'<button id="reject-delete" class="secondary" '+(r.status!=='pending'?'disabled':'')+'>반려</button>':''}<button id="approve-delete" class="primary danger" disabled>${direct?'업체 삭제':'삭제 승인'}</button></div>`;
  $('review-body').insertAdjacentHTML('afterbegin',`<p class="privacy-note"><strong>함께 정리할 항목</strong><br>예약 ${(r.effects?.reservations||[]).length}건 · 제출 자료 ${r.effects?.entries||0}마리 · 경매 대기 개체 ${r.effects?.items||0}마리</p><p class="privacy-note">예약은 취소되고 제출·대기 개체는 목록에서 삭제돼요. 이미 낙찰된 거래 기록은 보관돼요.</p>`);
  if(!$('review').open)$('review').showModal();
  if($('recheck-deletion'))$('recheck-deletion').onclick=()=>run(()=>review(query));
  if($('confirm-delete'))$('confirm-delete').onchange=()=>{$('approve-delete').disabled=!$('confirm-delete').checked;};
  if($('reject-delete'))$('reject-delete').onclick=()=>run(async()=>{await api({action:'reject-deletion',id:r.id,note:$('reject-note').value});$('review').close();await load();});
  $('approve-delete').onclick=()=>run(async()=>{if(!$('confirm-delete')?.checked)return;await api(direct?{action:'admin-delete-company',companyId:r.companyId,confirmName:name,requestId}:{action:'approve-deletion',id:r.id});$('review').close();await load();});
 }
 function populate(c){
  editing={id:c?.id||'nv-'+crypto.randomUUID().replaceAll('-',''),revision:c?.revision||0,registered:!!c?.registered,claimed:!!c?.claimed};
  $('name').value=c?.name||'';$('name').readOnly=!!c;
  $('region').value=c?.region||'';$('region').disabled=!!c?.registered;
  $('phone').value=c?.loginPhone||'';$('phone').readOnly=!!c?.claimed;
  $('save').hidden=!!c?.claimed;$('editor-title').textContent=c?.claimed?'등록 정보':'업체 등록';
  $('delete-company').hidden=!c;$('delete-company').onclick=()=>run(()=>review({action:'inspect-company-deletion',companyId:c.id}));
 }
 function open(c){
  if(busy)return;
  $('vendor-form').reset();$('editor-error').hidden=true;
  $('region').innerHTML='<option value="">지역 선택</option>'+data.regions.map(r=>`<option>${esc(r)}</option>`).join('');
  $('existing').innerHTML='<option value="">새 업체</option>'+data.companies.filter(v=>!v.registered).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  $('existing').closest('label').hidden=!!c;$('existing').value=c?.id||'';
  populate(c);$('editor').showModal();
 }
 $('existing').onchange=()=>populate(data.companies.find(c=>c.id===$('existing').value));
 $('close-review').onclick=()=>{if(!busy)$('review').close();};$('review').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('add').onclick=()=>open();$('close').onclick=()=>{if(!busy)$('editor').close();};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('vendor-form').onsubmit=e=>{e.preventDefault();const body={id:editing.id,revision:editing.revision,name:$('name').value.trim(),region:$('region').value,loginPhone:$('phone').value};run(async()=>{$('save').disabled=true;$('save').textContent='저장 중…';await api(body);$('editor').close();await load();});};
 $('login').onsubmit=e=>{e.preventDefault();run(async()=>{await CreoPlatform.api('auth/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';await load();});};
 run(load);
})();

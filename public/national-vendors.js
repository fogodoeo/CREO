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
  $('deletion-list').innerHTML=(data.deletions||[]).map(r=>`<div class="review-request"><strong>${esc(r.name)}<i class="attention-dot" aria-hidden="true"></i></strong><small>삭제 승인 요청</small><button class="secondary" type="button" data-review="${esc(r.id)}">검토하기</button></div>`).join('');
  for(const button of document.querySelectorAll('[data-review]'))button.onclick=()=>run(async()=>{
   const r=await api({action:'inspect-deletion',id:button.dataset.review}),name=data.deletions.find(d=>d.id===r.id)?.name||'업체';
   $('review-title').textContent=name+' 삭제 요청';$('review-error').hidden=true;
   $('review-body').innerHTML=`<p class="privacy-note">연결 채널: ${r.channels.map(esc).join(', ')}</p>${r.blockers.length?'<ul class="blocker-list">'+r.blockers.map(b=>'<li>'+esc(b)+'</li>').join('')+'</ul>':'<p class="privacy-note">승인하면 업체 접속이 종료돼요. 거래 기록은 보관돼요.</p>'}<label class="field" for="reject-note">반려 사유<textarea id="reject-note" maxlength="300"></textarea></label><div class="request-actions"><button id="reject-delete" class="secondary">반려</button><button id="approve-delete" class="primary danger" ${r.blockers.length||r.status!=='pending'?'disabled':''}>삭제 승인</button></div>`;
   $('review').showModal();
   $('reject-delete').onclick=()=>run(async()=>{await api({action:'reject-deletion',id:r.id,note:$('reject-note').value});$('review').close();await load();});
   $('approve-delete').onclick=()=>run(async()=>{if(!confirm(name+' 업체 삭제를 승인할까요?'))return;await api({action:'approve-deletion',id:r.id});$('review').close();await load();});
  });
 }
 function populate(c){
  editing={id:c?.id||'nv-'+crypto.randomUUID().replaceAll('-',''),revision:c?.revision||0,registered:!!c?.registered,claimed:!!c?.claimed};
  $('name').value=c?.name||'';$('name').readOnly=!!c;
  $('region').value=c?.region||'';$('region').disabled=!!c?.registered;
  $('phone').value=c?.loginPhone||'';$('phone').readOnly=!!c?.claimed;
  $('save').hidden=!!c?.claimed;$('editor-title').textContent=c?.claimed?'등록 정보':'업체 등록';
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

(() => {
 'use strict';
 const esc=CreoPlatform.escapeHtml;
 let context=null,sequence=0,dialog=null,busy=false;
 const api=body=>CreoPlatform.api('national-vendor-directory',{cache:'no-store',signal:AbortSignal.timeout(20000),...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 function current(ctx){return !!ctx&&context===ctx&&ctx.channelId==='national-cre'&&ctx.tab==='vendors';}
 function sync(ctx){
  context=ctx;const seq=++sequence,host=document.getElementById('vendor-access-requests');
  if(dialog?.open&&!busy)dialog.close();
  host.hidden=true;host.replaceChildren();
  if(!current(ctx))return;
  host.hidden=false;host.textContent='업체 접속·삭제 요청 확인 중…';
  api().then(result=>{
   if(seq!==sequence||!current(ctx))return;
   const requests=result.deletions||[];
   host.hidden=!requests.length;
   host.innerHTML=requests.length?'<h2>삭제 승인 대기 '+requests.length+'건</h2>'+requests.map(r=>`<div class="vendor-request"><strong>${esc(r.name)}</strong><button class="btn" data-request="${esc(r.id)}">삭제 요청 검토</button></div>`).join(''):'';
   host.querySelectorAll('[data-request]').forEach(button=>button.onclick=()=>openReview(ctx,{action:'inspect-deletion',id:button.dataset.request},requests.find(r=>r.id===button.dataset.request)?.name));
  }).catch(error=>{
   if(seq!==sequence||!current(ctx))return;
   host.textContent='업체 접속·삭제 요청을 불러오지 못했어요. '+error.message+' ';
   const retry=document.createElement('button');retry.className='btn';retry.textContent='다시 확인';retry.onclick=()=>sync(ctx);host.append(retry);
  });
 }
 function mount(title){
  if(!dialog){dialog=document.createElement('dialog');dialog.className='vendor-access-dialog';dialog.setAttribute('aria-labelledby','workspace-vendor-title');document.body.append(dialog);dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});}
  dialog.innerHTML=`<div class="dialog-head"><h2 id="workspace-vendor-title">${esc(title)}</h2><button type="button" class="close" aria-label="닫기">×</button></div><div class="vendor-access-body"></div><p class="vendor-access-error" role="alert" hidden></p>`;
  dialog.querySelector('.close').onclick=()=>{if(!busy)dialog.close();};
  if(!dialog.open)dialog.showModal();
  return dialog.querySelector('.vendor-access-body');
 }
 async function work(ctx,fn){
  if(busy||!current(ctx))return;
  busy=true;const error=dialog.querySelector('.vendor-access-error');error.hidden=true;
  try{await fn();}catch(e){error.textContent=e.message;error.hidden=false;}finally{busy=false;}
 }
 async function openReview(ctx,query,name){
  if(busy||!current(ctx))return;
  const body=mount((name||'업체')+' 삭제');body.textContent='확인 중…';
  await work(ctx,async()=>{
   const r=await api(query);if(!current(ctx)){dialog.close();return;}
   const direct=query.action==='inspect-company-deletion',vendorName=r.name||name,requestId=crypto.randomUUID();
   dialog.querySelector('h2').textContent=vendorName+' 삭제';
   body.innerHTML=`<p>연결 채널: ${r.channels.map(esc).join(', ')}</p>${r.blockers.length?'<p><strong>아래 항목을 먼저 처리해 주세요.</strong></p><ul class="vendor-blockers">'+r.blockers.map(b=>'<li>'+esc(b)+'</li>').join('')+'</ul><button class="btn" data-recheck>처리 상태 다시 확인</button>':''}${r.blockers.some(b=>b.includes('방송'))?'<p><a href="/organizer-bookings.html?channel=national-cre" target="_blank" rel="noopener">방송 예약 관리 열기 (새 창)</a></p>':''}${r.status!=='pending'?'<p>이미 처리된 요청이에요.</p>':''}${!direct?'<label class="vendor-access-field">반려 사유<textarea maxlength="300" data-note></textarea></label>':''}${!r.blockers.length&&r.status==='pending'?'<label class="vendor-delete-check"><input type="checkbox" data-confirm>업체 접속을 종료하고 삭제합니다. 거래 기록은 보관됩니다.</label>':''}<div class="dialog-actions">${!direct?'<button class="btn" data-reject '+(r.status!=='pending'?'disabled':'')+'>반려</button>':''}<button class="btn danger" data-approve disabled>${direct?'업체 삭제':'삭제 승인'}</button></div>`;
   const confirm=body.querySelector('[data-confirm]'),approve=body.querySelector('[data-approve]');
   if(confirm)confirm.onchange=()=>approve.disabled=!confirm.checked;
   const finish=async command=>{await api(command);dialog.close();if(current(ctx))await ctx.onChanged();};
   approve.onclick=()=>work(ctx,async()=>{if(!confirm?.checked)return;await finish(direct?{action:'admin-delete-company',companyId:r.companyId,confirmName:vendorName,requestId}:{action:'approve-deletion',id:r.id});});
   const reject=body.querySelector('[data-reject]');if(reject)reject.onclick=()=>work(ctx,()=>finish({action:'reject-deletion',id:r.id,note:body.querySelector('[data-note]').value}));
   const recheck=body.querySelector('[data-recheck]');if(recheck)recheck.onclick=()=>openReview(ctx,query,name);
  });
 }
 async function open(vendorId,mode='access'){
  const ctx=context;if(!current(ctx)||busy)return;
  const vendor=ctx.vendors.find(v=>v.id===vendorId);if(!vendor)return;
  if(mode==='delete')return openReview(ctx,{action:'inspect-company-deletion',companyId:vendorId},vendor.name);
  const body=mount(vendor.name+' · 대표 로그인');body.textContent='불러오는 중…';
  await work(ctx,async()=>{
   const result=await api();if(!current(ctx)){dialog.close();return;}
   const c=result.companies.find(c=>c.id===vendorId);if(!c)throw Error('업체 정보를 다시 불러와 주세요.');
   body.innerHTML=`<p>${c.claimed?'대표 연결됨':c.registered?'대표 접속 전':'대표 로그인 번호 미등록'}</p><form><label class="vendor-access-field">지역<select name="region" required ${c.registered?'disabled':''}>${result.regions.map(r=>`<option ${r===c.region?'selected':''}>${esc(r)}</option>`).join('')}</select></label><label class="vendor-access-field">대표 로그인 번호<input name="phone" type="tel" inputmode="tel" autocomplete="off" maxlength="13" required value="${esc(c.loginPhone)}" ${c.claimed?'readonly':''}></label><p class="vendor-access-note">업체 연락처와 별도로, 대표가 로그인할 때 사용하는 번호예요.${c.claimed?' 이미 대표가 연결되어 변경할 수 없어요.':''}</p>${!c.claimed?'<div class="dialog-actions"><button class="btn primary">저장</button></div>':''}</form>`;
   body.querySelector('form').onsubmit=event=>{event.preventDefault();work(ctx,async()=>{await api({id:c.id,name:c.name,region:body.querySelector('select').value,loginPhone:body.querySelector('input').value,revision:c.revision});dialog.close();if(current(ctx))await ctx.onChanged();});};
  });
 }
 window.CreoWorkspaceVendorAccess={sync,open};
})();

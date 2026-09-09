'use strict';
const $=id=>document.getElementById(id), channelId=new URLSearchParams(location.search).get('channel')||'', esc=CreoPlatform.escapeHtml;
const route='channels/'+encodeURIComponent(channelId)+'/organizer-shipping';
let state, saving=false, dirty=false, bankRevision='';
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const date=s=>new Date(s).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const fields=['bankName','bankAccount','bankHolder','notificationPhone'];
function render(){
 $('login').hidden=true;$('content').hidden=false;$('channel').textContent=state.channel.name;
 const sum=k=>state.vendors.reduce((n,v)=>n+(v[k]||0),0);
 $('total').textContent=money(sum('remainingAmount'));$('all-total').textContent=money(sum('totalAmount'));$('received').textContent=money(sum('receivedAmount'));
 $('bank-state').textContent=state.bank.bankAccount&&state.bank.notificationPhone?'등록됨':'등록 필요';
 if(!dirty){for(const k of fields)$(k).value=state.bank[k]||'';bankRevision=state.bank.updatedAt||'';}
 const pending=state.vendors.filter(v=>v.pendingReport);$('pending-count').textContent=pending.length;
 $('pending').innerHTML=pending.map(v=>{const r=v.pendingReport;return `<article class="settlement-card"><div class="settlement-pair"><b>${esc(v.vendorName)}</b><span class="settlement-status waiting">확인 대기</span></div><div class="settlement-amount">${money(r.amount)}</div><div class="settlement-muted">${date(r.reportedAt)} 입금 접수</div><div class="settlement-muted">${esc(r.bank.bankName)} ${esc(r.bank.bankAccount)}</div><div class="settlement-actions"><button class="settlement-secondary" data-review="rejected" data-vendor="${esc(v.vendorId)}">미입금</button><button class="settlement-primary" data-review="confirmed" data-vendor="${esc(v.vendorId)}">입금 확인</button></div></article>`}).join('')||'<div class="settlement-empty">확인할 입금이 없어요</div>';
 $('vendors').innerHTML=state.vendors.filter(v=>v.itemCount||v.history.length).map(v=>`<details class="settlement-card"><summary><b>${esc(v.vendorName)}</b><b>${money(v.remainingAmount)}</b></summary><div class="settlement-pair"><span>전체 배송비</span><b>${money(v.totalAmount)}</b></div><div class="settlement-pair"><span>입금 확인</span><b>${money(v.receivedAmount)}</b></div><div class="settlement-pair"><span>남은 금액</span><b>${money(v.remainingAmount)}</b></div>${v.overpaidAmount?`<div class="settlement-pair"><span>초과 입금</span><b>${money(v.overpaidAmount)}</b></div>`:''}<hr class="settlement-divider"><div class="settlement-pair"><span>구매자 결제 완료분</span><span>${money(v.collectedAmount)}</span></div><div class="settlement-pair"><span>구매자 결제 대기분</span><span>${money(v.pendingAmount)}</span></div>${v.history.slice().reverse().map(r=>`<div class="settlement-history"><div class="settlement-pair"><span>${{pending:'확인 대기',confirmed:'입금 확인',rejected:'미입금'}[r.status]}</span><b>${money(r.amount)}</b></div><small class="settlement-muted">${date(r.reviewedAt||r.reportedAt)}</small></div>`).join('')}</details>`).join('');
 $('back').href='/channel-workspace.html?channel='+encodeURIComponent(channelId);
 const cards=$('pending').querySelectorAll('article');
 pending.forEach((v,index)=>{const note=document.createElement('small');note.className='settlement-muted';note.textContent=({queued:'문자 발송 대기',sending:'문자 발송 중',sent:'문자 접수 완료',failed:'문자 실패 · 재시도 대기',configuration_pending:'문자 발송 설정 확인 필요',expired:'문자 발송 만료'})[v.pendingReport.notificationStatus]||'';cards[index].querySelector('.settlement-actions').before(note)});
 document.querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{
  if(saving)return;const v=state.vendors.find(v=>v.vendorId===button.dataset.vendor),r=v.pendingReport,action=button.dataset.review;
  saving=true;try{if(!await confirmShippingSettlement(v.vendorName,money(r.amount),action==='confirmed'?'실제 입금 확인':'미입금 처리'))return;button.disabled=true;await CreoPlatform.api(route+'/review',{method:'POST',body:JSON.stringify({vendorId:v.vendorId,reportId:r.id,expectedAmount:r.amount,action})});await load();$('message').textContent=action==='confirmed'?'입금 확인 완료':'미입금 처리 완료'}catch(e){$('message').textContent=e.message}finally{saving=false;button.disabled=false}
 });
}
async function load(){try{if(!channelId)throw Error('채널 주소가 필요합니다.');state=await CreoPlatform.api(route);render();return true}catch(e){if(e.status===401){$('login').hidden=false;$('content').hidden=true}else $('message').textContent=e.message;return false}}
$('login-form').onsubmit=async e=>{e.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';$('message').textContent='';await load()}catch(err){$('message').textContent=err.message}};
$('bank-form').oninput=()=>{dirty=true};
$('bank-form').onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;$('save').disabled=true;try{const body={expectedUpdatedAt:bankRevision};for(const k of fields)body[k]=$(k).value.trim();await CreoPlatform.api(route,{method:'PUT',body:JSON.stringify(body)});dirty=false;await load();$('bank-settings').open=false;$('message').textContent='저장 완료'}catch(err){$('message').textContent=err.message}finally{saving=false;$('save').disabled=false}};
$('refresh').onclick=()=>load();
load();
setInterval(()=>{if(!document.hidden&&!saving&&!dirty&&!document.querySelector('details[open]'))load()},15000);

'use strict';
const $=id=>document.getElementById(id), esc=CreoPlatform.escapeHtml;
const organizerCode=/^\/o\/([A-Za-z0-9_-]{24})$/.exec(location.pathname||'')?.[1]||new URLSearchParams(location.search).get('code')||'';
let channelId=organizerCode?'':new URLSearchParams(location.search).get('channel')||'';
let route='channels/'+encodeURIComponent(channelId)+'/organizer-shipping';
function organizerApi(path,options={}){return CreoPlatform.api(path,{cache:'no-store',...options,headers:{...options.headers,...(organizerCode?{'X-Creo-Organizer':organizerCode}:{})}})}
let state, saving=false, dirty=false, bankRevision='', editingBank=false, receiptVendor=null, receiptAttempt=null, loadRevision=0, fresh=false, accessDenied=false;
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const date=s=>s?new Date(s).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const fields=['bankName','bankAccount','bankHolder','notificationPhone'];
function showMessage(text,retry=false){$('message').textContent=text;$('retry').hidden=!retry;}
function clearAccess(){
 ++loadRevision;fresh=false;accessDenied=true;state=null;receiptVendor=null;receiptAttempt=null;dirty=false;editingBank=false;bankRevision='';
 if($('receipt-dialog').open)$('receipt-dialog').close();
 $('content').hidden=true;$('login').hidden=!!organizerCode;
 for(const id of ['vendors','carriers','receipt-detail-content'])$(id).replaceChildren();
 for(const id of ['channel','total','all-total','received','overpaid-total','missing-total','bank-saved-owner','bank-saved-account','bank-saved-phone','receipt-balance','receipt-error'])$(id).textContent='';
 for(const id of [...fields,'password','receipt-amount','receipt-date','receipt-memo'])$(id).value='';
 $('receipt-title').textContent='입금 확인';$('receipt-reload').hidden=true;$('receipt-error').hidden=true;
 $('edit-bank').textContent='수정';$('refresh').disabled=false;$('retry').disabled=false;
 showMessage(organizerCode?'링크를 사용할 수 없어요. 운영자에게 새 링크를 요청해 주세요.':'다시 로그인해 주세요.');
}
function readFailure(error){
 if(error.status===401){clearAccess();return;}
 fresh=false;showMessage(state?'최신 내역을 확인하지 못했어요.':'정산 내역을 불러오지 못했어요.',true);
 if(receiptVendor&&$('receipt-dialog').open){$('receipt-error').hidden=false;$('receipt-error').textContent='최신 내역을 불러온 뒤 확인해 주세요.';$('receipt-reload').hidden=false;updateReceiptBalance();}
}
function savedMessage(text,loaded){if(state)showMessage(loaded?text:text+' · 최신 내역 확인이 필요해요.',!loaded);}
function renderBank(){
 const bank=state.bank,ready=fields.every(k=>String(bank[k]||'').trim()),showForm=editingBank||!ready;
 $('bank-settings').setAttribute('data-ready',String(ready));
 $('bank-title').textContent=ready?'정산 계좌':'배송비 받을 계좌 등록';
 $('bank-intro').hidden=!showForm;$('bank-form').hidden=!showForm;$('bank-saved').hidden=showForm;
 $('edit-bank').hidden=showForm;$('cancel-bank').hidden=!ready||!showForm;
 $('edit-bank').textContent=[bank.bankName,String(bank.bankAccount||'').slice(-4),'›'].filter(Boolean).join(' ');
 $('save').textContent=ready?'변경 내용 저장':'계좌 등록하기';
 $('bank-saved-owner').textContent=[bank.bankName,bank.bankHolder].filter(Boolean).join(' · ');
 $('bank-saved-account').textContent=bank.bankAccount||'';$('bank-saved-phone').textContent=bank.notificationPhone||'';
 if(!dirty){for(const k of fields)$(k).value=bank[k]||'';bankRevision=bank.updatedAt||'';}
}
function missingDestinationNotice(v){
 const items=v.missingDestinationItems||[];
 return items.length?`<details class="settlement-history"><summary>배송지 미입력 ${items.length}개체</summary>${items.map(i=>`<div class="settlement-pair"><b>${esc(i.name||(i.lotNumber?'#'+i.lotNumber:i.id))}</b><span class="settlement-muted">미입력</span></div>`).join('')}</details>`:'';
}
function feeRows(items){return items.map(i=>`<div class="settlement-fee-item"><div class="settlement-pair"><b>${esc(i.name||(i.lotNumber?'#'+i.lotNumber:i.id))}</b><b>${money(i.amount)}</b></div><div class="settlement-muted">${esc(i.carrier)} · ${esc(i.destination)}</div></div>`).join('');}
function feeDetailNotice(v){
 const items=v.shippingFeeItems||[];
 return items.length?`<details class="settlement-history settlement-fee-details"><summary class="settlement-muted">배송비 상세 · ${items.length}개체</summary>${feeRows(items)}<div class="settlement-pair settlement-fee-total"><span>합계</span><b>${money(items.reduce((n,i)=>n+i.amount,0))}</b></div></details>`:'';
}
function vendorStatus(v){return v.pendingReport?'확인 요청':v.overpaidAmount?'초과 입금':v.remainingAmount?(v.receivedAmount?'일부 입금':'입금 대기'):v.missingDestinationItems?.length?(v.receivedAmount?'등록분 입금 완료':'배송비 미확정'):v.receivedAmount?'입금 완료':'정산 없음';}
function vendorBalance(v){return v.overpaidAmount?money(v.overpaidAmount)+' 초과':money(v.remainingAmount);}
function vendorLabel(v){const holder=String(v.vendorBankHolder||'').trim();return v.vendorName+(holder?'('+holder+')':'');}
function vendorLabelHtml(v){const holder=String(v.vendorBankHolder||'').trim();return esc(v.vendorName)+(holder?'<wbr><span class="vendor-holder">('+esc(holder)+')</span>':'');}
function render(){
 $('login').hidden=true;$('content').hidden=false;$('channel').textContent=state.channel.name;
 const sum=k=>state.vendors.reduce((n,v)=>n+(v[k]||0),0);
 $('total').textContent=money(sum('remainingAmount'));$('all-total').textContent=money(sum('totalAmount'));$('received').textContent=money(sum('receivedAmount'));
 const overpaid=sum('overpaidAmount');$('overpaid-total').hidden=!overpaid;$('overpaid-total').textContent=overpaid?'초과 입금 '+money(overpaid):'';
 const missingCount=state.vendors.reduce((n,v)=>n+(v.missingDestinationItems||[]).length,0);
 $('missing-total').hidden=!missingCount;$('missing-total').textContent=`배송지 미입력 ${missingCount}개체 · 배송비 미확정`;
 renderBank();
 const vendors=state.vendors.filter(v=>v.itemCount||v.history.length||v.missingDestinationItems?.length).sort((a,b)=>Number(!!b.pendingReport)-Number(!!a.pendingReport)||Number(b.remainingAmount>0)-Number(a.remainingAmount>0)||a.vendorName.localeCompare(b.vendorName,'ko'));
 $('vendors').innerHTML=vendors.map(v=>`<button type="button" class="organizer-vendor-row" data-vendor="${esc(v.vendorId)}" aria-label="${esc(vendorLabel(v))} ${vendorStatus(v)} ${v.overpaidAmount?'':'잔액 '}${vendorBalance(v)}"><span><span class="organizer-vendor-name">${vendorLabelHtml(v)}</span><small class="${v.pendingReport||v.overpaidAmount?'request':v.receivedAmount&&!v.remainingAmount?'done':''}">${vendorStatus(v)}</small>${v.missingDestinationItems?.length?`<small>배송지 미입력 ${v.missingDestinationItems.length}개체</small>`:''}</span><span class="vendor-balance ${!v.remainingAmount?'complete':''}">${vendorBalance(v)}</span><span class="arrow" aria-hidden="true">›</span></button>`).join('')||'<div class="settlement-empty">정산할 배송비가 없어요</div>';
 $('vendors').querySelectorAll('[data-vendor]').forEach(button=>button.onclick=()=>{if(!saving)openReceipt(state.vendors.find(v=>v.vendorId===button.dataset.vendor))});
 $('carriers').innerHTML=(state.carriers||[]).map(c=>`<details class="settlement-card"><summary><b>${esc(c.carrier)}</b><b>${money(c.totalAmount)}</b></summary>${vendors.filter(v=>Object.hasOwn(c.vendorAmounts,v.vendorId)).map(v=>`<details class="settlement-history"><summary><span>${esc(v.vendorName)}</span><b>${money(c.vendorAmounts[v.vendorId])}</b></summary>${feeRows((v.shippingFeeItems||[]).filter(i=>i.carrier===c.carrier))}</details>`).join('')}</details>`).join('')||'<div class="settlement-empty">등록된 배송비가 없어요</div>';
}
function updateReceiptBalance(){
 const amount=Number($('receipt-amount').value.replaceAll(',',''));
 $('receipt-balance').textContent=amount>receiptVendor.remainingAmount?`초과 입금 ${money(amount-receiptVendor.remainingAmount)}`:`확인 후 잔액 ${money(Math.max(0,receiptVendor.remainingAmount-(amount||0)))}`;
 $('confirm-receipt').disabled=saving||!fresh||!Number.isSafeInteger(amount)||amount<=0||amount>1000000000;
}
function openReceipt(v){
 if(!v)return;receiptVendor=structuredClone(v);receiptAttempt=null;
 $('receipt-title').textContent=vendorLabel(v)+' 입금 확인';$('receipt-amount').value=Number(v.pendingReport?.amount||v.remainingAmount||0).toLocaleString('ko-KR');
 $('receipt-date').value=today();$('receipt-date').max=today();$('receipt-memo').value='';$('receipt-memo').hidden=true;$('add-receipt-memo').hidden=false;
 $('receipt-error').hidden=true;$('receipt-reload').hidden=true;$('receipt-details').open=false;
 $('receipt-detail-content').innerHTML=`<div class="settlement-pair"><span>총 배송비</span><b>${money(v.totalAmount)}</b></div><div class="settlement-pair"><span>누적 입금액</span><b>${money(v.receivedAmount)}</b></div>${v.overpaidAmount?`<div class="settlement-pair"><span>초과 입금</span><b>${money(v.overpaidAmount)}</b></div>`:''}${missingDestinationNotice(v)}${feeDetailNotice(v)}<details id="receipt-history"><summary>입금 내역 ${v.history.length}건</summary>${v.history.slice().reverse().map(r=>`<div class="receipt-history-row"><div class="settlement-pair"><b>${money(r.amount)}</b><span>${{pending:'확인 요청',confirmed:'입금 확인',rejected:'미입금',cancelled:'취소됨'}[r.status]||esc(r.status)}</span></div><small>${esc(r.paidOn||date(r.reviewedAt||r.reportedAt))} · ${r.source==='manual'?'직접 기록':'업체 요청'}</small>${r.memo?`<p>${esc(r.memo)}</p>`:''}${r.cancelledAt?`<small>취소 ${date(r.cancelledAt)}</small>`:''}${r.status==='confirmed'?`<button type="button" class="settlement-text" data-ask-cancel="${esc(r.id)}">기록 취소</button><div class="receipt-undo" data-cancel-box="${esc(r.id)}" hidden><p>이 입금 기록을 취소할까요?</p><button type="button" class="settlement-text" data-cancel="${esc(r.id)}">기록 취소하기</button></div>`:''}</div>`).join('')||'<p class="settlement-muted">입금 내역이 없어요</p>'}</details>${v.pendingReport?'<button class="settlement-text" type="button" id="reject-receipt">입금되지 않았어요</button>':''}`;
 $('receipt-detail-content').querySelectorAll('[data-ask-cancel]').forEach(b=>b.onclick=()=>{if(saving)return;[...$('receipt-detail-content').querySelectorAll('[data-cancel-box]')].find(el=>el.dataset.cancelBox===b.dataset.askCancel).hidden=false;});
 $('receipt-detail-content').querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelReceipt(b.dataset.cancel));
 if($('reject-receipt'))$('reject-receipt').onclick=rejectReceipt;
 updateReceiptBalance();if(!fresh){$('receipt-error').hidden=false;$('receipt-error').textContent='최신 내역을 불러온 뒤 확인해 주세요.';$('receipt-reload').hidden=false;}if(!$('receipt-dialog').open)$('receipt-dialog').showModal();$('close-receipt').focus();
}
function receiptError(error){if(error.status===401){clearAccess();return;}if(error.status===409)fresh=false;$('receipt-error').hidden=false;$('receipt-error').textContent=error.message;$('receipt-reload').hidden=error.status!==409;}
function setReceiptBusy(value){saving=value;if(value)++loadRevision;$('refresh').disabled=value;$('retry').disabled=value;for(const el of $('receipt-dialog').querySelectorAll('button,input'))el.disabled=value;if(!value&&receiptVendor)updateReceiptBalance();}
async function saveReceipt(e){
 e.preventDefault();if(saving||!receiptVendor||!fresh)return;
 const v=receiptVendor,body={vendorId:v.vendorId,amount:Number($('receipt-amount').value.replaceAll(',','')),paidOn:$('receipt-date').value,memo:$('receipt-memo').value.trim(),expectedReceivedAmount:v.receivedAmount,expectedTotalAmount:v.totalAmount,reportId:v.pendingReport?.id||'',expectedReportAmount:v.pendingReport?.amount||0};
 const fingerprint=JSON.stringify(body);if(!receiptAttempt||receiptAttempt.fingerprint!==fingerprint)receiptAttempt={fingerprint,requestId:crypto.randomUUID()};
 setReceiptBusy(true);$('receipt-error').hidden=true;
 try{await organizerApi(route+'/deposit',{method:'POST',body:JSON.stringify({...body,requestId:receiptAttempt.requestId})});$('receipt-dialog').close();savedMessage('입금 확인 완료',await load());}catch(error){receiptError(error)}finally{setReceiptBusy(false)}
}
async function cancelReceipt(id){
 if(saving)return;const v=receiptVendor,r=v.history.find(r=>r.id===id);if(!r)return;
 setReceiptBusy(true);try{await organizerApi(route+'/cancel',{method:'POST',body:JSON.stringify({vendorId:v.vendorId,receiptId:r.id,expectedAmount:r.amount})});const loaded=await load();if(loaded){openReceipt(state.vendors.find(row=>row.vendorId===v.vendorId));$('receipt-details').open=true;$('receipt-history').open=true;}else{$('receipt-dialog').close();}savedMessage('입금 기록 취소 완료',loaded);}catch(error){receiptError(error)}finally{setReceiptBusy(false)}
}
async function rejectReceipt(){
 if(saving||!receiptVendor.pendingReport||!confirm('입금 확인 요청을 미입금으로 처리할까요?'))return;
 const v=receiptVendor,r=v.pendingReport;setReceiptBusy(true);try{await organizerApi(route+'/review',{method:'POST',body:JSON.stringify({vendorId:v.vendorId,reportId:r.id,expectedAmount:r.amount,action:'rejected'})});$('receipt-dialog').close();savedMessage('미입금 처리 완료',await load());}catch(error){receiptError(error)}finally{setReceiptBusy(false)}
}
async function load(){
 const revision=++loadRevision;$('retry').disabled=true;if(!state)showMessage('불러오는 중…');
 try{
  if(!channelId&&organizerCode){const access=await organizerApi('organizer-access',{method:'POST',body:JSON.stringify({code:organizerCode})});if(revision!==loadRevision)return false;channelId=access.channel.id;route='channels/'+encodeURIComponent(channelId)+'/organizer-shipping'}
  if(!channelId){showMessage('주관사 전용 링크로 접속해 주세요.');return false;}
  const next=await organizerApi(route);if(revision!==loadRevision)return false;
  state=next;fresh=true;accessDenied=false;render();showMessage('');return true;
 }catch(e){if(revision===loadRevision)readFailure(e);return false}
 finally{if(revision===loadRevision)$('retry').disabled=saving;}
}
$('login-form').onsubmit=async e=>{e.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';$('message').textContent='';await load()}catch(err){$('message').textContent=err.message}};
$('bank-form').oninput=()=>{dirty=true};
$('edit-bank').onclick=()=>{if(saving)return;editingBank=true;renderBank();$('bankName').focus()};
$('cancel-bank').onclick=()=>{if(saving)return;editingBank=false;dirty=false;renderBank();$('edit-bank').focus()};
$('bank-form').onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;++loadRevision;$('save').disabled=true;try{const body={expectedUpdatedAt:bankRevision};for(const k of fields)body[k]=$(k).value.trim();await organizerApi(route,{method:'PUT',body:JSON.stringify(body)});dirty=false;editingBank=false;savedMessage('계좌 저장 완료',await load())}catch(err){if(err.status===401)clearAccess();else showMessage(err.message)}finally{saving=false;$('save').disabled=false;$('retry').disabled=false}};
$('receipt-form').onsubmit=saveReceipt;
$('receipt-amount').oninput=()=>{const input=$('receipt-amount');input.value=input.value.replace(/[^0-9]/g,'').slice(0,10);if(input.value)input.value=Number(input.value).toLocaleString('ko-KR');updateReceiptBalance()};
$('receipt-amount').onfocus=()=>{$('receipt-amount').select()};
$('add-receipt-memo').onclick=()=>{$('receipt-memo').hidden=false;$('add-receipt-memo').hidden=true;$('receipt-memo').focus()};
$('close-receipt').onclick=()=>{if(!saving)$('receipt-dialog').close()};
$('receipt-dialog').oncancel=e=>{if(saving)e.preventDefault()};
let receiptBackdropPressed=false;
function isReceiptBackdrop(e){const dialog=$('receipt-dialog'),r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);}
$('receipt-dialog').onpointerdown=e=>{receiptBackdropPressed=isReceiptBackdrop(e)};
$('receipt-dialog').onclick=e=>{const dismiss=receiptBackdropPressed&&isReceiptBackdrop(e);receiptBackdropPressed=false;if(dismiss&&!saving)$('receipt-dialog').close()};
$('receipt-reload').onclick=async()=>{if(saving)return;const id=receiptVendor.vendorId;if(await load())openReceipt(state.vendors.find(v=>v.vendorId===id))};
$('refresh').onclick=()=>{if(!saving)load()};
$('retry').onclick=()=>{if(!saving)load()};
load();
setInterval(()=>{if(!accessDenied&&!document.hidden&&!saving&&!dirty&&!editingBank&&!$('receipt-dialog').open&&!document.querySelector('details[open]'))load()},15000);

(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('ko-KR')+'원';
 const labels={queued:'발송 대기',configuration_pending:'설정 확인 필요',sending:'발송 중',delivery_unknown:'발송 결과 확인 필요',sent:'알리고 접수 완료',failed:'실패 · 자동 재시도 대기',expired:'발송 중지',paid:'결제완료',skipped:'처리 제외'};
 let root,dialog,data,context,mode='vendor',selected=new Set(),plan=null,busy=false,epoch=0,timer,opener;
 const $=id=>document.getElementById('closing-'+id);
 const api=(method,body)=>CreoPlatform.api('channels/'+encodeURIComponent(context.channelId)+'/closing-tools'+(method==='GET'?'?'+new URLSearchParams({archive:context.archiveId}):''),{method,...(body?{body:JSON.stringify(body)}:{})});
 function access(){if(!root)return;root.hidden=document.body.dataset.shippingAdmin!=='true';if(root.hidden){epoch++;data=null;selected.clear();dialog.close();clearTimeout(timer);}}
 function status(text){$('status').textContent=text;}
 function date(value){return value?new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(value)):'';}
 function rows(){return (mode==='vendor'?data?.vendors:data?.buyers)||[];}
 function visible(){const query=$('query').value.trim().toLocaleLowerCase('ko');return rows().filter(r=>(r.name+' '+r.phoneLabel+' '+(r.companies||[]).join(' ')).toLocaleLowerCase('ko').includes(query));}
 function selection(){ $('selected').textContent=selected.size+'곳 선택'.replace('곳',mode==='vendor'?'곳':'명');$('all').checked=visible().length>0&&visible().every(r=>selected.has(r.id));$('all').indeterminate=visible().some(r=>selected.has(r.id))&&!$('all').checked;}
 function renderRows(){
  const list=visible();$('rows').innerHTML=list.length?list.map(r=>`<label class="closing-row"><input type="checkbox" data-row="${esc(r.id)}" ${selected.has(r.id)?'checked':''}><span class="closing-person"><strong>${esc(r.name)}</strong><small>${esc(r.phoneLabel)} · ${r.itemCount}개체${mode==='buyer'?' · '+esc(r.companies.join(', ')):''}</small></span><span class="closing-amount">${mode==='vendor'?`<b>${money(r.remainingAmount)}</b><small>${r.unpaidCount?'구매자 결제 대기 '+r.unpaidCount+'건':'구매자 결제완료'}</small>`:`<b>${r.missing?'수령지 미입력':'수령지 입력완료'}</b>`}</span><span class="closing-note">${esc(mode==='vendor'?r.settlementBlocked||'정산 안내 가능':r.missing?'수령지 등록 안내 필요':'선택하여 재확인 안내 가능')}${r.lastNotice?'<small>최근 안내 '+esc(date(r.lastNotice.at))+' · '+esc(labels[r.lastNotice.status]||r.lastNotice.status)+'</small>':''}</span></label>`).join(''):'<p class="closing-empty">'+(rows().length?'검색 결과가 없어요. 검색어를 지워 주세요.':'이 회차에 낙찰 내역이 없어요.')+'</p>';
  selection();
 }
 function render(){
  $('round').textContent=data.round.name;$('vendor-tab').setAttribute('aria-pressed',String(mode==='vendor'));$('buyer-tab').setAttribute('aria-pressed',String(mode==='buyer'));
  $('payment').hidden=mode!=='vendor';$('quick').textContent=mode==='vendor'?'미정산 업체 선택':'수령지 미입력자 선택';$('send').textContent=mode==='vendor'?'정산 문자 미리보기':'낙찰자 문자 미리보기';
  $('hint').textContent=mode==='vendor'?'결제완료는 구매자가 업체에 낸 낙찰대금입니다. 정산금은 업체가 주관사에 낼 금액입니다.':'같은 회차의 동일 전화번호는 한 명으로 묶어 안내합니다. 수령지 입력 여부와 관계없이 직접 선택할 수 있습니다.';
  $('delivery').textContent=!data.delivery.smsConfigured?'문자 API 설정 확인 필요':data.delivery.testMode?'테스트 모드 · 실제 발송 불가':'문자 API 연결됨 · 웹 인증 없이 발송';
  $('history').innerHTML=data.history.length?data.history.map(n=>`<li><strong>${esc(n.name)}</strong><span>${esc(labels[n.status]||n.status)}</span><small>${esc(date(n.at))}${n.error?' · '+esc(n.error):''}</small></li>`).join(''):'<li>이 기능에서 보낸 안내가 아직 없어요. 알리고 웹에서 직접 보낸 문자는 여기에 표시되지 않습니다.</li>';
  renderRows();
 }
 async function refresh(keep=false){
  if(busy||root.hidden)return;const ticket=++epoch;$('refresh').disabled=true;status('회차 내역을 확인하고 있어요.');
  try{const result=await api('GET');if(ticket!==epoch||root.hidden)return;data=result;if(!keep)selected.clear();else selected=new Set([...selected].filter(id=>rows().some(r=>r.id===id)));render();status('');schedule();}
  catch(e){if(ticket===epoch){data=null;$('rows').textContent='내역을 불러오지 못했어요. 새로고침해 주세요.';status(e.message);}}
  finally{$('refresh').disabled=false;}
 }
 function schedule(){clearTimeout(timer);if(data?.history.some(n=>['queued','sending'].includes(n.status)))timer=setTimeout(()=>{if(!dialog.open&&!document.hidden&&!root.hidden&&$('panel').open)void refresh(true);else schedule();},8000);}
 function setBusy(value){busy=value;for(const id of ['preview-confirm','preview-close','send','payment','quick','refresh'])$(id).disabled=value;}
 async function preview(action){
  if(busy)return;if(!selected.size){status('먼저 처리할 업체 또는 낙찰자를 선택해 주세요.');return;}
  opener=document.activeElement;setBusy(true);status('선택한 대상의 최신 내역을 확인하고 있어요.');
  try{
   plan=await api('POST',{mode:'preview',action,ids:[...selected],archiveId:context.archiveId,resend:$('resend').checked});
   $('preview-title').textContent=action==='payment'?'구매자 결제완료 처리':'문자 발송 전 확인';
   $('preview-note').textContent=action==='payment'?'아래 낙찰대금을 실제로 받은 건만 완료 처리하세요. 배송지·결제수단 미등록, 카드 취소 확인 필요 건은 제외합니다. 결제완료 알림이 발송될 수 있습니다.':'아래 내용으로 업체 또는 낙찰자에게 장문 문자(LMS)를 보냅니다. 발송 요금이 차감됩니다.';
   $('preview-entries').innerHTML=plan.entries.map(e=>`<article><strong>${esc(e.name)}</strong><span>${esc(e.phoneLabel)}${e.amount!==undefined?' · '+money(e.amount):''}</span>${e.message?'<pre>'+esc(e.message)+'</pre>':''}</article>`).join('')||'<p>처리 가능한 대상이 없어요.</p>';
   $('preview-excluded').innerHTML=plan.excluded.length?'<h3>이번 처리에서 제외</h3><ul>'+plan.excluded.map(e=>'<li>'+esc(e.name)+' · '+esc(e.reason)+'</li>').join('')+'</ul>':'';
   $('preview-confirm').textContent=action==='payment'?`${plan.entries.length}건 결제완료 처리`:`${plan.entries.length}명에게 문자 발송`;
   $('preview-result').textContent='';$('preview-confirm').hidden=!plan.entries.length;$('preview-close').textContent='닫기';dialog.showModal();$('preview-close').focus();status('');
  }catch(e){status(e.message);}finally{setBusy(false);}
 }
 async function execute(){
  if(busy||!plan)return;setBusy(true);$('preview-result').textContent='처리 중입니다. 창을 닫지 마세요.';
  try{const r=await api('POST',{mode:'execute',planId:plan.id,confirmed:true});$('preview-result').textContent=r.results.map(e=>e.name+' · '+(labels[e.status]||e.status)+(e.reason?' · '+e.reason:'')).join('\n');$('preview-confirm').hidden=true;selected.clear();if(plan.action==='payment')await context.refresh();}
  catch(e){$('preview-result').textContent=e.message+' 같은 버튼으로 다시 확인할 수 있어요. 이미 처리된 요청은 중복 실행하지 않습니다.';}
  finally{setBusy(false);}
 }
 function init(){
  root=document.getElementById('closing-tools');if(!root)return;context=window.getShippingClosingContext();
  root.innerHTML=`<details id="closing-panel"><summary><strong>회차 마감·안내</strong><span>업체 결제완료 · 정산 문자 · 낙찰자 안내</span></summary><div class="closing-body"><div class="closing-heading"><h2 id="closing-round">현재 회차</h2><button id="closing-refresh" type="button">새로고침</button></div><div class="closing-tabs" role="group" aria-label="안내 대상"><button id="closing-vendor-tab" type="button" aria-pressed="true">업체</button><button id="closing-buyer-tab" type="button" aria-pressed="false">낙찰자</button></div><p id="closing-hint"></p><div class="closing-search"><label>대상 검색<input id="closing-query" type="search" placeholder="이름, 연락처 끝 4자리"></label><button id="closing-quick" type="button">미정산 업체 선택</button></div><div class="closing-selection"><label><input id="closing-all" type="checkbox">검색된 대상 전체 선택</label><span id="closing-selected">0곳 선택</span><button id="closing-clear" type="button">선택 해제</button></div><div id="closing-rows"></div><div class="closing-actions"><label><input id="closing-resend" type="checkbox">24시간 안에 발송한 대상도 재안내</label><div><button id="closing-payment" type="button">구매자 결제완료 처리</button><button id="closing-send" type="button" class="closing-primary">정산 문자 미리보기</button></div><p id="closing-delivery"></p></div><p id="closing-status" role="status"></p><details class="closing-history"><summary>최근 안내 내역</summary><ul id="closing-history"></ul><p>접수 완료는 알리고가 발송을 접수한 상태입니다. 최종 수신 여부는 알리고 전송 결과에서 확인하세요.</p></details></div></details>`;
  dialog=document.createElement('dialog');dialog.className='closing-dialog';dialog.setAttribute('aria-labelledby','closing-preview-title');dialog.innerHTML=`<div class="closing-dialog-body"><h2 id="closing-preview-title"></h2><p id="closing-preview-note"></p><div id="closing-preview-entries"></div><div id="closing-preview-excluded"></div><p id="closing-preview-result" role="status"></p></div><div class="closing-dialog-actions"><button id="closing-preview-close" type="button">닫기</button><button id="closing-preview-confirm" class="closing-primary" type="button">처리하기</button></div>`;document.body.append(dialog);
  $('panel').addEventListener('toggle',()=>{if($('panel').open&&!data)void refresh();});
  for(const m of ['vendor','buyer'])$(m+'-tab').onclick=()=>{mode=m;selected.clear();$('query').value='';if(data)render();};
  $('query').oninput=()=>{if(data)renderRows();};$('refresh').onclick=()=>refresh();
  $('rows').onchange=e=>{const id=e.target.dataset.row;if(id){e.target.checked?selected.add(id):selected.delete(id);selection();}};
  $('all').onchange=()=>{for(const r of visible())$('all').checked?selected.add(r.id):selected.delete(r.id);renderRows();};
  $('quick').onclick=()=>{selected=new Set(rows().filter(r=>mode==='vendor'?r.remainingAmount>0&&!r.settlementBlocked:r.missing).map(r=>r.id));renderRows();};
  $('clear').onclick=()=>{selected.clear();renderRows();};$('payment').onclick=()=>preview('payment');$('send').onclick=()=>preview(mode==='vendor'?'vendor_sms':'buyer_sms');
  $('preview-confirm').onclick=execute;$('preview-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{opener?.focus();void refresh();});
  window.addEventListener('shipping-admin-state',access);access();
 }
 document.addEventListener('DOMContentLoaded',init);
})();

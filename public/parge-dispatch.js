(()=>{'use strict';
 const $=id=>document.getElementById(id),Core=CreoPargeDispatch,channelId=new URLSearchParams(location.search).get('channel')||'national-cre';
 let workspace,shops=[],ratesPayload={},groups=[],records=[];const selected=new Set();
 const route=`channels/${encodeURIComponent(channelId)}/parge-dispatch`,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fail=e=>{$('error').textContent=e.message||String(e);};
 const money=n=>Number(n).toLocaleString('ko-KR')+'원';
 const quoteLabel=q=>q.unknownCount?`요금 확인 필요 ${q.unknownCount}건${q.knownAmount?' · 확인된 금액 '+money(q.knownAmount):''}`:money(q.amount);
 function costDetail(g){const q=Core.partnerQuote([g],ratesPayload).rows[0];return q.known?`<div class="partner-cost"><span>파르게 결제 예상</span><strong>${money(q.amount)}</strong><small>기본 ${money(q.baseCost)} × 50%${q.additionalCount?` + 추가 ${q.additionalCount}마리 × 7,000원`:''}</small></div>`:'<p class="attention">파르게 기본 요금 확인 필요</p>';}
 $('back').href='/shipping.html?channel='+encodeURIComponent(channelId);
 function helper(action,plan){return new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error(action==='ping'?'자동 입력 도구를 설치하고 이 페이지를 새로고침해 주세요.':'응답을 확인하지 못했어요. 파르게 장바구니를 먼저 확인해 주세요.'));},action==='ping'?1500:180000);
  function receive(e){if(e.source!==window||e.origin!==location.origin||e.data?.type!=='creo-parge-result'||e.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);e.data.result?.error?reject(Error(e.data.result.error)):resolve(e.data.result);}
  window.addEventListener('message',receive);window.postMessage({type:'creo-parge-command',requestId,action,plan},location.origin);
 });}
 const post=body=>CreoPlatform.api(route,{method:'POST',body:JSON.stringify(body.action==='confirm-reservation'?{...body,expectedUpdatedAt:records.find(r=>r.id===body.id)?.updatedAt}:body)});
 function render(){
  $('broadcast-date').closest('label').hidden=$('broadcast-date').querySelectorAll('option').length<=2;
  const active=records.filter(r=>r.status!=='released'),done=new Set(active.flatMap(r=>r.plan.groups.flatMap(g=>g.items.map(i=>i.id))));
  const result=Core.build({...workspace,items:workspace.items.filter(i=>!done.has(i.id))},{channelId,shops,date:$('broadcast-date').value});groups=result.groups;selected.clear();
  groups.forEach(g=>{g.additional=active.some(r=>r.plan.groups.some(p=>p.phone===g.phone&&p.shop===g.shop));if(g.paid&&!g.additional)selected.add(g.key)});
  $('rows').innerHTML=groups.map((g,i)=>`<article><div><label class="check"><input type="checkbox" data-select="${i}" ${g.additional?'disabled':g.paid?'checked':''}><strong>${esc(g.name)} · ${g.quantity}마리</strong></label><p>${esc(g.shop)}</p><p class="muted">${esc(g.phone)} · ${esc(g.items.map(x=>x.lot).join(' · '))}</p><p class="${g.additional?'attention':'muted'}">${g.additional?'기존 접수에 추가된 개체 · 마릿수 수정 확인 필요':g.paid?'미접수 · 결제 완료':'미접수 · 결제 확인 필요'}</p></div><div class="amount"><span>분양가 · 낙찰금 합계</span><p><strong>${g.price.toLocaleString('ko-KR')}원</strong></p></div></article>`).join('')||'<p>새로 접수할 파르게 배송 건이 없어요.</p>';
  $('excluded').querySelector('summary').textContent=`제외된 개체 ${result.excluded.length}마리`;$('excluded').querySelector('ul').innerHTML=result.excluded.map(r=>`<li>${esc(r.lot)} · ${esc(r.reason)}</li>`).join('');
  $('rows').querySelectorAll('article .amount').forEach((el,i)=>el.insertAdjacentHTML('beforeend',costDetail(groups[i])));
  document.querySelectorAll('[data-select]').forEach(el=>el.onchange=()=>{const g=groups[+el.dataset.select];el.checked?selected.add(g.key):selected.delete(g.key);count()});
  $('history').innerHTML=active.map(r=>`<article><div><strong>${({checking:'확인 필요',cart:'장바구니 확인됨',booked:'예약 완료'})[r.status]||'확인 필요'}</strong><p>${esc(r.plan.date)} 맡김 · ${r.plan.groups.length}건 · ${r.plan.groups.reduce((n,g)=>n+g.quantity,0)}마리</p><p class="muted">${esc(r.plan.groups.map(g=>g.name+' ['+g.items.map(i=>i.lot).join(', ')+']').join(' / '))}</p><p class="muted">${esc(r.reference||'')}</p></div><div class="record-actions">${r.status==='checking'?`<button data-action="confirm-cart" data-id="${r.id}">장바구니 확인</button>`:''}${r.status!=='booked'?`<button data-action="confirm-booked" data-id="${r.id}">예약 완료 확인</button><button data-action="release" data-id="${r.id}">장바구니 비워짐</button>`:''}</div></article>`).join('')||'<p class="muted">아직 담은 내역이 없어요.</p>';
  $('history').querySelectorAll('article').forEach((el,i)=>{const q=Core.partnerQuote(active[i].plan.groups,ratesPayload);el.insertAdjacentHTML('beforeend',`<p class="history-cost">현재 요금 기준 예상 · <strong>${esc(quoteLabel(q))}</strong></p>`);});
  $('history').querySelectorAll('.record-actions').forEach((el,i)=>{
   const r=active[i];el.querySelector('[data-action="confirm-booked"]')?.remove();
   if(!r.noticeRequestedAt)el.insertAdjacentHTML('beforeend',`<button data-action="confirm-reservation" data-id="${r.id}">${r.orders?.length?'예약 일정 확인':'예약 완료 확인'}</button>`);
   if(r.orders?.length)el.insertAdjacentHTML('beforeend',`<button data-action="preview-notices" data-id="${r.id}">예약확인 톡 미리보기</button>`);
   if(r.orders?.length)el.insertAdjacentHTML('beforeend',`<p class="muted">${r.orders.map(o=>esc(o.name+' · '+o.shop+' · 수령 '+(o.arrivalDate||'일정 자동 확인'))).join('<br>')}</p>`);
   if(r.notices?.length)el.insertAdjacentHTML('beforeend',`<p class="muted" role="status">${r.notices.map(n=>esc((n.buyerName||'낙찰자')+' · '+(n.shop||'')+' · '+({queued:'발송 대기',sending:'발송 중',sent:'알리고 접수 완료',failed:'실패 · 자동 재시도 대기',configuration_pending:'템플릿 설정 대기',delivery_unknown:'결과 확인 필요 · 재발송 중지',expired:'변경·만료 · 재발송 중지'}[n.status]||n.status))).join('<br>')}</p>`);
  });
  document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>update(el.dataset.action,el.dataset.id));count();
 }
 function count(){const rows=groups.filter(g=>selected.has(g.key)),eligible=groups.filter(g=>!g.additional);$('count').textContent=`${rows.length}건 · ${rows.reduce((s,g)=>s+g.quantity,0)}마리 선택`;$('all').checked=!!eligible.length&&rows.length===eligible.length;$('all').indeterminate=rows.length>0&&rows.length<eligible.length;
  const cart=records.filter(r=>['checking','cart'].includes(r.status)).flatMap(r=>r.plan.groups),chosen=Core.partnerQuote(rows,ratesPayload),pending=Core.partnerQuote(cart,ratesPayload),total=Core.partnerQuote([...rows,...cart],ratesPayload);
  $('partner-totals').innerHTML=[['새로 선택한 건',chosen],['확인 중·장바구니',pending],['합계 예상',total]].map(([label,q])=>`<div><span>${label}</span><strong>${esc(quoteLabel(q))}</strong></div>`).join('');
 }
 async function load(){const previous=$('broadcast-date').value;$('refresh').disabled=true;$('error').textContent='';try{[workspace,{records}]=await Promise.all([CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/workspace?scope=round`),CreoPlatform.api(route)]);const dates=[...new Set(workspace.items.map(i=>i.attributes?.broadcastDate||i.broadcastDate).filter(Boolean))].sort().reverse();$('broadcast-date').innerHTML='<option value="">선택 회차 전체</option>'+dates.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');$('broadcast-date').value=dates.includes(previous)?previous:'';render();}catch(e){groups=[];records=[];selected.clear();$('rows').replaceChildren();$('history').replaceChildren();count();$('partner-totals').textContent='배송 자료를 다시 불러온 뒤 예상금액을 확인해 주세요.';fail(e)}finally{$('refresh').disabled=false;}}
 async function update(action,id){try{const record=records.find(r=>r.id===id);if(!record)return;let body={action,id};
  if(action==='confirm-reservation')return editBooking(record);
  if(action==='preview-notices')return await previewNotices(record);
  if(action==='confirm-cart'){if(!confirm('파르게 장바구니에서 수령인·도착 매장·마릿수·분양가를 대조했나요? 새로고침하면 장바구니가 사라질 수 있어요.'))return;body.confirmed=true;}
  if(action==='release'){if(!confirm('파르게 장바구니와 예약 내역에 이 개체가 없는지 확인했나요? 확인 후 다시 입력 가능한 상태로 돌립니다.'))return;await helper('release',record.plan);body.confirmedAbsent=true;}
  await post(body);await load();
 }catch(e){fail(e)}}
 function closeEditor(){const panel=$('booking-editor');panel.hidden=true;panel.replaceChildren();$('history').querySelector('button')?.focus();}
 function openEditor(html){const panel=$('booking-editor');panel.innerHTML=html;panel.hidden=false;panel.focus();panel.querySelector('[data-close]').onclick=closeEditor;return panel;}
 function editBooking(record){
  const panel=openEditor(`<h2 id="booking-title">파르게 예약 완료 확인</h2><p>아래 ${record.plan.groups.length}건이 파르게에서 모두 예약 완료됐는지 확인해 주세요.</p><form id="booking-form">${record.plan.groups.map((g,i)=>{const o=record.orders?.[i]||{};return `<fieldset data-group="${i}"><legend>${esc(g.name)} · ${g.quantity}마리</legend><p>${esc(g.shop)} · ${esc(g.items.map(x=>x.lot).join(', '))}</p><details><summary>확인된 배송일이 있을 때만 입력</summary><div class="booking-fields"><label>확인된 출발일 (선택)<input name="dispatch-${i}" type="date" value="${esc(o.dispatchDate||'')}"></label><label>확인된 수령 예정일 (선택)<input name="arrival-${i}" type="date" value="${esc(o.arrivalDate||'')}"></label></div></details></fieldset>`}).join('')}<p class="muted">배송일을 입력하지 않으면 정기 일정으로 예상하거나 ‘일정 확인 중’으로 안내해요.</p><label class="check"><input type="checkbox" required>위 배송 건 모두 파르게에서 예약 완료했어요.</label><p class="attention" id="booking-error" role="alert"></p><div class="actions"><button class="primary" type="submit">예약 완료 · 톡 미리보기</button><button type="button" data-close>닫기</button></div></form>`);
  $('booking-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;try{const deliveries=record.plan.groups.map((g,i)=>({itemIds:g.items.map(x=>x.id),dispatchDate:panel.querySelector(`[name="dispatch-${i}"]`).value,arrivalDate:panel.querySelector(`[name="arrival-${i}"]`).value}));const {record:saved}=await post({action:'confirm-reservation',id:record.id,confirmed:true,deliveries});await load();await previewNotices(saved);}catch(error){$('booking-error').textContent=error.message;button.disabled=false;}};
 }
 async function previewNotices(record){
  const {record:result}=await post({action:'preview-notices',id:record.id});
  const panel=openEditor(`<h2 id="booking-title">예약확인 톡 미리보기</h2><p>배송 건별로 낙찰자에게 한 번씩 보내요. 성공한 건은 다시 발송하지 않고, 실패한 건만 자동 재시도해요.</p>${result.preview.map(e=>{const v=e.variables;return `<article><div><strong>${esc(v.낙찰자명)} · ${esc(e.recipientPhone)}</strong><p>[전국크레자랑 운송 예약 완료]</p><p>${esc(v.낙찰자명)}님, 낙찰 개체의 파르게 운송 예약이 완료되었습니다.</p><p>개체: ${esc(v.개체내역)}<br>도착 거점: ${esc(v.거점명)}<br>수령 예정일: ${esc(v.수령예정일)}</p><p>수령 예정일은 운송 상황에 따라 변경될 수 있습니다. 거점 도착 및 수령 안내를 받은 뒤 방문해 주세요.</p></div></article>`}).join('')}<p class="attention" id="booking-error" role="alert">${result.noticeReady?'':'알림톡 검수 승인 후 템플릿을 연결하면 발송할 수 있어요.'}</p><div class="actions"><button id="send-booking-notices" class="primary" ${result.noticeReady?'':'disabled'}>확인한 ${result.preview.length}건 예약확인 톡 보내기</button><button type="button" data-close>닫기</button></div>`);
  $('send-booking-notices').onclick=async()=>{const button=$('send-booking-notices');button.disabled=true;try{await post({action:'send-notices',id:record.id,confirmed:true,preview:result.preview});closeEditor();await load();}catch(e){panel.querySelector('#booking-error').textContent=e.message;button.disabled=false;}};
 }
 $('all').onchange=()=>{document.querySelectorAll('[data-select]').forEach(el=>{if(el.disabled)return;el.checked=$('all').checked;const g=groups[+el.dataset.select];el.checked?selected.add(g.key):selected.delete(g.key)});count()};$('broadcast-date').onchange=render;$('refresh').onclick=load;
 $('export').onclick=async()=>{if($('export').disabled)return;$('export').disabled=true;try{
  $('error').textContent='';const chosen=groups.filter(g=>selected.has(g.key));
  if(!chosen.length)throw Error('접수할 배송 건을 선택해 주세요.');
  if(chosen.some(g=>!g.paid)&&!confirm('결제 미확인 건이 포함돼 있어요. 계속할까요?'))return;
  const ready=await helper('ping');if(!ready.automaticDate)throw Error('가까운 맡김일 자동 선택을 위해 입력 도구를 최신 버전으로 교체해 주세요.');
  $('handover-date').textContent='파르게에서 가능한 날짜 확인 중…';
  const resolved=await helper('resolve-date');
  const plan=Core.manifest(chosen,{channelId,date:resolved.date});
  $('handover-date').textContent=resolved.date+' · 가장 가까운 가능일';
  const {record}=await post({action:'prepare',requestId:crypto.randomUUID(),plan});await load();
  const result=await helper('dispatch',record.plan);
  await post({action:result.cartVerified?'confirm-cart':'attempted',id:record.id,confirmed:result.cartVerified===true});await load();
  $('count').textContent=result.cartVerified?'장바구니 내역을 확인했어요. 파르게에서 최종 확인 후 결제해 주세요.':'입력을 시도했어요. 파르게 장바구니를 확인해 주세요.';
 }catch(e){fail(e)}finally{$('export').disabled=false}};
 async function boot(){try{if(!await CreoPlatform.verifyAdmin()){$('login').hidden=false;return;}if(new URLSearchParams(location.search).get('archive'))throw Error('보관 회차는 낙찰·배송 메뉴에서 확인해 주세요. 신규 운송 접수는 현재 회차에서 진행합니다.');$('login').hidden=true;$('app').hidden=false;const rates=await CreoPlatform.api('shipping-rates?company='+encodeURIComponent('파르게'));ratesPayload=rates.payload||rates;shops=Core.shopNames(ratesPayload);await load();document.dispatchEvent(new CustomEvent('creo:native-operator-ready'));}catch(e){if(e.status===401||e.status===403)$('login').hidden=false;fail(e)}}
 $('login').onsubmit=async e=>{e.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await boot()}catch(error){fail(error)}};boot();
})();

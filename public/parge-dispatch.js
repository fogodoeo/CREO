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
 const post=body=>CreoPlatform.api(route,{method:'POST',body:JSON.stringify(body)});
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
  document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>update(el.dataset.action,el.dataset.id));count();
 }
 function count(){const rows=groups.filter(g=>selected.has(g.key)),eligible=groups.filter(g=>!g.additional);$('count').textContent=`${rows.length}건 · ${rows.reduce((s,g)=>s+g.quantity,0)}마리 선택`;$('all').checked=!!eligible.length&&rows.length===eligible.length;$('all').indeterminate=rows.length>0&&rows.length<eligible.length;
  const cart=records.filter(r=>['checking','cart'].includes(r.status)).flatMap(r=>r.plan.groups),chosen=Core.partnerQuote(rows,ratesPayload),pending=Core.partnerQuote(cart,ratesPayload),total=Core.partnerQuote([...rows,...cart],ratesPayload);
  $('partner-totals').innerHTML=[['새로 선택한 건',chosen],['확인 중·장바구니',pending],['합계 예상',total]].map(([label,q])=>`<div><span>${label}</span><strong>${esc(quoteLabel(q))}</strong></div>`).join('');
 }
 async function load(){const previous=$('broadcast-date').value;$('refresh').disabled=true;$('error').textContent='';try{[workspace,{records}]=await Promise.all([CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/workspace?scope=round`),CreoPlatform.api(route)]);const dates=[...new Set(workspace.items.map(i=>i.attributes?.broadcastDate||i.broadcastDate).filter(Boolean))].sort().reverse();$('broadcast-date').innerHTML='<option value="">선택 회차 전체</option>'+dates.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');$('broadcast-date').value=dates.includes(previous)?previous:'';render();}catch(e){groups=[];records=[];selected.clear();$('rows').replaceChildren();$('history').replaceChildren();count();$('partner-totals').textContent='배송 자료를 다시 불러온 뒤 예상금액을 확인해 주세요.';fail(e)}finally{$('refresh').disabled=false;}}
 async function update(action,id){try{const record=records.find(r=>r.id===id);if(!record)return;let body={action,id};
  if(action==='confirm-cart'){if(!confirm('파르게 장바구니에서 수령인·도착 매장·마릿수·분양가를 대조했나요? 새로고침하면 장바구니가 사라질 수 있어요.'))return;body.confirmed=true;}
  if(action==='confirm-booked'){const reference=prompt('파르게 예약 완료를 확인한 예약번호 또는 확인 메모');if(!reference?.trim())return;body={...body,confirmed:true,reference};}
  if(action==='release'){if(!confirm('파르게 장바구니와 예약 내역에 이 개체가 없는지 확인했나요? 확인 후 다시 입력 가능한 상태로 돌립니다.'))return;await helper('release',record.plan);body.confirmedAbsent=true;}
  await post(body);await load();
 }catch(e){fail(e)}}
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

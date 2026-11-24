(()=>{'use strict';
 const $=id=>document.getElementById(id),channelId=new URLSearchParams(location.search).get('channel')||'national-cre',route=`channels/${encodeURIComponent(channelId)}/dodosi-dispatch`;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state,busy=false,selected=new Set(),quotes=new Map();
 const labels={missing:'입력 대기',payment_pending:'도도시 결제 대기',confirmed:'배송예약 완료',conflict:'예약 정보 대조 필요',unchecked:'접수 확인 필요'};
 const check=g=>state.checks?.find(c=>c.bookingKey===g.bookingKey)?.status||'unchecked';
 const active=g=>state.batches?.find(b=>!['confirmed','superseded'].includes(b.status)&&b.plans.some(p=>p.bookingKey===g.bookingKey));
 const eligible=g=>state.fresh&&g.schedule.status==='estimated'&&check(g)==='missing'&&!active(g);
 const money=n=>Number(n).toLocaleString('ko-KR')+'원';
 const price=g=>{const q=quotes.get(g.id);return q?`정상요금 ${money(q.quote.total)} · 할인 후 예상 ${money(q.quote.total-Math.floor(q.quote.total*q.discountBp/10000))}`:g.quantity===1&&g.basePrice!=null?`정상요금 ${money(g.basePrice)} · 할인 후 예상 ${money(g.basePrice-Math.floor(g.basePrice*state.discountBp/10000))}`:'합배송 요금은 실시간 견적으로 확인';};
 const date=d=>d?`${+d.slice(5,7)}/${+d.slice(8)}`:'확인 필요';
 $('back').href='/shipping.html?channel='+encodeURIComponent(channelId);
 function helper(action,plan){return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>done(Error('입력 도구 응답이 없습니다. 열린 예약서를 확인해 주세요.')),action==='ping'?3000:600000);function done(error,result){clearTimeout(timer);window.removeEventListener('message',receive);error?reject(error):resolve(result);}function receive(e){if(e.source!==window||e.origin!==location.origin||e.data?.requestId!==requestId)return;if(e.data.type==='creo-dodosi-progress'){$('progress').textContent=e.data.text;return;}if(e.data.type==='creo-dodosi-result')done(e.data.result?.error?Error(e.data.result.error):null,e.data.result);}window.addEventListener('message',receive);window.postMessage({type:'creo-dodosi-command',requestId,action,plan},location.origin);});}
 async function version(){const r=await helper('ping');if(!/^1\.(?:[2-9]|\d{2,})\./.test(r.version||''))throw Error('도도시 입력 도구 1.2로 업데이트한 뒤 새로고침해 주세요.');}
 async function post(body){const r=await CreoPlatform.api(route,{method:'POST',body:JSON.stringify({...body,expectedRevision:state.revision})});state.revision=r.revision;return r;}
 async function load(){state=await CreoPlatform.api(route);selected.clear();$('sender-name').value=state.sender.name;$('sender-phone').value=state.sender.phone;render();}
 async function task(fn){if(busy)return;busy=true;$('error').textContent='';render();try{await fn();}catch(e){$('error').textContent=e.message;}finally{busy=false;render();}}
 function render(){if(!state)return;
  $('origin').textContent='출발 정거샵 · '+state.originName;
  $('status').textContent=state.fresh?'도도시 최신 일정 연결됨':'최신 도도시 일정이 필요해요.';
  const done=state.groups.filter(g=>check(g)==='confirmed').length;
  $('count').textContent=`전체 ${state.groups.length}명 · 배송예약 완료 ${done}명`;
  $('check-status').textContent=state.checks?.length?`접수 대조 ${new Date(state.checks[0].checkedAt).toLocaleString('ko-KR')}`:'먼저 도도시 접수 내역을 확인해 주세요.';
  const chosen=state.groups.filter(g=>selected.has(g.id)),unpaid=chosen.filter(g=>!g.paid).length;
  $('selection-count').textContent=`${chosen.length}/10명 · ${chosen.reduce((n,g)=>n+g.quantity,0)}마리${unpaid?` · 결제 미확인 ${unpaid}명 포함`:''}`;
  const card=g=>{const status=check(g),batch=active(g),text=status!=='missing'?labels[status]:batch?(batch.status==='review'?'입력 완료 · 접수 확인 대기':'묶음 입력 진행 중'):labels[status];return `<article><div><label class="check"><input type="checkbox" data-select="${esc(g.id)}" aria-label="${esc(g.name)} 배송 선택" ${selected.has(g.id)?'checked':''} ${busy||!eligible(g)?'disabled':''}><strong>${esc(g.name)} · ${g.quantity}마리</strong></label><p>${esc(g.shop)}</p><p class="muted">${esc(g.phone)} · ${esc(g.items.map(i=>i.lot).join(' · '))}</p><p class="${g.paid?'muted':'attention'}">${g.paid?'결제 완료':'결제 확인 필요'}</p><p class="muted">맡김 ${date(g.schedule.dropoffDate)} → 도착 ${date(g.schedule.arrivalDate)}</p></div><div><strong class="booking-state">${text}</strong><p class="muted">${price(g)}</p><button data-quote="${esc(g.id)}" ${busy||!state.fresh?'disabled':''}>실시간 견적</button></div></article>`;};
  $('rows').innerHTML=state.groups.filter(g=>check(g)!=='confirmed').map(card).join('')+(done?`<details><summary>배송예약 완료 ${done}명 보기</summary>${state.groups.filter(g=>check(g)==='confirmed').map(card).join('')}</details>`:'');
  $('batches').innerHTML=(state.batches||[]).filter(b=>b.status!=='superseded').map((b,i)=>{const remaining=b.plans.filter(p=>state.checks?.some(c=>c.bookingKey===p.bookingKey&&c.status==='missing')).length;return `<article><div><h3>${i+1}번 묶음 · ${b.plans.length}/10명</h3><p>${esc(b.plans.map(p=>`${p.name} ${p.quantity}마리`).join(' · '))}</p><p class="muted">${date(b.plans[0].schedule.dropoffDate)} 맡김 · ${b.status==='confirmed'?'배송예약 완료':b.status==='review'?'입력 완료 · 도도시 결제 후 접수 확인':'입력 대기'}</p></div><div class="record-actions">${b.status!=='confirmed'&&remaining?`<button data-resume="${b.id}" ${busy?'disabled':''}>${remaining===b.plans.length?'예약서 이어서 입력':`미접수 ${remaining}명 이어서 입력`}</button>`:''}</div></article>`;}).join('');
  $('excluded').innerHTML=state.excluded.map(r=>`<li>${esc(r.lot)} · ${esc(r.reason)}</li>`).join('');
  document.querySelectorAll('#app button:not([data-resume]):not([data-quote]),#sender-form input,#import').forEach(e=>e.disabled=busy);
  $('fill-many').disabled=busy||!chosen.length;$('next-ten').disabled=busy||!state.groups.some(g=>eligible(g)&&g.paid);
 }
 async function verify(){await version();$('progress').textContent='도도시 예약 내역 대조 중…';const snapshot=await helper('receipts');await post({action:'reconcile',snapshot});await load();$('progress').textContent='접수 내역 대조 완료';}
 function senderCheck(){if($('sender-name').value!==state.sender.name||$('sender-phone').value!==state.sender.phone)throw Error('변경한 보내는 분 정보를 먼저 저장해 주세요.');}
 async function fill(ids){senderCheck();await version();await verify();const available=ids.map(id=>state.groups.find(g=>g.id===id));if(available.some(g=>!g||check(g)!=='missing'))throw Error('이미 접수됐거나 배송 정보가 달라졌습니다. 목록을 확인해 주세요.');
  const result=await post({action:'prepare-batch',groupIds:ids,includeUnpaidGroupIds:available.filter(g=>!g.paid).map(g=>g.id)}),batch=result.batch;
  try{const result=await helper('fill-many',{plans:batch.plans,resume:true});await post({action:'record-fill',batchId:batch.id,result:{filled:result.filled,stage:result.stage,groupIds:result.forms?.flatMap(f=>f.groupIds)||[],count:result.count}});$('progress').textContent=`${batch.plans.length}명 입력 완료. 도도시에서 결제한 뒤 ‘접수 결과 확인’을 눌러 주세요.`;}finally{await load();}
 }
 $('next-ten').onclick=()=>{const candidates=state.groups.filter(g=>eligible(g)&&g.paid),day=candidates[0]?.schedule.dropoffDate;selected=new Set(candidates.filter(g=>g.schedule.dropoffDate===day).slice(0,10).map(g=>g.id));render();};
 $('clear-selection').onclick=()=>{selected.clear();render();};
 $('rows').onchange=e=>{const id=e.target.dataset.select;if(!id||busy)return;if(e.target.checked){const g=state.groups.find(g=>g.id===id),first=state.groups.find(g=>selected.has(g.id));if(selected.size>=10||first&&first.schedule.dropoffDate!==g.schedule.dropoffDate){e.target.checked=false;$('error').textContent='같은 맡김일의 받는 분을 최대 10명 선택해 주세요.';return;}selected.add(id);}else selected.delete(id);render();};
 $('rows').onclick=e=>{const id=e.target.closest('[data-quote]')?.dataset.quote;if(!id)return;task(async()=>{await version();const g=state.groups.find(g=>g.id===id),quote=await helper('quote',{originId:state.originId,destinationId:g.destinationId,quantity:g.quantity});if(!quote.available)throw Error('예약할 수 없는 노선입니다.');quotes.set(id,quote);});};
 $('fill-many').onclick=()=>task(()=>fill([...selected]));
 $('verify').onclick=()=>task(verify);$('refresh').onclick=()=>task(load);
 $('batches').onclick=e=>{const id=e.target.closest('[data-resume]')?.dataset.resume;if(!id)return;const b=state.batches.find(b=>b.id===id),ids=b.plans.map(p=>state.groups.find(g=>g.bookingKey===p.bookingKey)).filter(g=>g&&check(g)==='missing').map(g=>g.id);task(()=>fill(ids));};
 $('sync').onclick=()=>task(async()=>{await version();const payload=await helper('sync',{originId:state.originId,originName:state.originName});await CreoPlatform.api('shipping-rates/dodosi-routes',{method:'PUT',body:JSON.stringify(payload)});await load();});
 $('sender-form').onsubmit=e=>{e.preventDefault();task(async()=>{await post({action:'save-sender',name:$('sender-name').value,phone:$('sender-phone').value});await load();$('sender-status').textContent='보내는 분 저장됨';});};
 $('import').onchange=()=>task(async()=>{const f=$('import').files[0];if(!f)return;if(f.size>2000000)throw Error('일정 파일이 너무 큽니다.');await CreoPlatform.api('shipping-rates/dodosi-routes',{method:'PUT',body:await f.text()});await load();});
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
 async function boot(){try{if(!await CreoPlatform.verifyAdmin()){$('login').hidden=false;return;}$('login').hidden=true;$('app').hidden=false;await load();}catch(e){$('error').textContent=e.message;}}
 $('login').onsubmit=async e=>{e.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await boot();}catch(e){$('error').textContent=e.message;}};boot();
})();

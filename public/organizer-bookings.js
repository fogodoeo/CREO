(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml,query=new URLSearchParams(location.search),code=query.get('code')||'';
  let channel=query.get('channel')||'national-cre',state=null,busy=false,revision=0,dirty=false,dialogTrigger=null,triggerData={};
  const date=d=>new Date(d+'T20:00:00+09:00').toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'});
  const time=d=>new Date(d).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
  const local=d=>new Date(Date.parse(d)+9*3600000).toISOString().slice(0,16);
  const iso=d=>new Date(d+':00+09:00').toISOString();
  const headers=code?{'X-Creo-Organizer':code}:{};
  const api=(path,options={})=>CreoPlatform.api(path,{cache:'no-store',signal:AbortSignal.timeout(20000),...options,headers:{...options.headers,...headers}});
  const route=()=>`channels/${encodeURIComponent(channel)}/broadcast-bookings`;
  const notificationLabels={configuration_pending:'알림톡 설정 대기',queued:'알림 발송 대기',sent:'알림 API 접수',failed:'알림 발송 실패',delivery_unknown:'알림 결과 확인 필요',expired:'이전 알림 종료',sending:'알림 전송 중',none:'알림 없음'};
  function error(id,text){$(id).textContent=text||'';$(id).hidden=!text;}
  function setBusy(value){busy=value;for(const b of document.querySelectorAll('button'))b.disabled=value;$('admin-dialog').setAttribute('aria-busy',String(value));}
  function render(){
    $('admin-content').hidden=false;$('admin-login').hidden=true;$('admin-retry').hidden=true;
    if(state.mode==='regional-cycle-v1'){renderCycle();return;}
    const filter=$('session-filter').value,upcoming=state.sessions.filter(s=>s.startsAt>state.now),sessions=filter==='past'?state.sessions.filter(s=>s.startsAt<=state.now).reverse():upcoming.filter(s=>filter==='short'?s.shortfall>0:filter==='pending'?s.incoming.length||s.reservations.some(r=>r.proposal):true);
    $('admin-summary').textContent=`${sessions.length}회차 · ${filter==='past'?'지난 방송 기록':`앞으로 최소 물량 미달 ${upcoming.filter(s=>s.shortfall).length}회차`} · 한국 시간 기준`;
    $('session-list').innerHTML=sessions.length?sessions.map(s=>`<article class="booking-session"><header><div><h2>${esc(date(s.date))}</h2><p class="booking-muted">오후 8시${s.paused?' · 예약 접수 중지':''}</p></div><button class="booking-text" type="button" data-settings="${s.date}" aria-label="${esc(date(s.date))} 방송 설정">설정</button></header>
      <p class="${s.shortfall?'booking-deficit':'booking-ready'}">${s.startsAt<=state.now?'종료된 방송 · ':''}${s.shortfall?`최소 32마리까지 ${s.shortfall}마리 부족`:'최소 물량 충족'}</p><div class="booking-counts"><span>확정<b>${s.confirmedQuantity}<small>마리</small></b></span><span>임시 확보<b>${s.heldQuantity}<small>마리</small></b></span><span>방송 정원<b>${s.maxQuantity}<small>마리</small></b></span></div>
      <p class="booking-muted">예약 마감 ${esc(time(s.closesAt))}</p>
      <details><summary>${state.mode==='regional-cycle-v1'?'방송 지역·추가 모집':'지역별 수량·추가 모집'}</summary><p class="booking-muted">${state.mode==='regional-cycle-v1'?esc(s.regionName)+' · 업체당 4마리':'확정 + 임시 확보 / 지역 한도 16마리'}</p><div class="booking-region-list">${s.regions.map(r=>`<span>${esc(r.name)} ${r.confirmed}+${r.held}</span>`).join('')}</div><h3>현재 추가 모집 가능</h3><p class="booking-muted">${s.regions.filter(r=>r.available).map(r=>`${esc(r.name)} ${r.available}마리`).join(' · ')||'현재 신청 가능한 지역이 없습니다.'}</p></details>
      <details ${s.reservations.some(r=>r.proposal)?'open':''}><summary>참여 업체 ${s.reservations.filter(r=>r.status==='confirmed').length}곳${s.reservations.some(r=>r.proposal)?' · 변경 응답 대기':''}</summary>${s.reservations.length?s.reservations.map(r=>`<button type="button" class="booking-card" data-reservation="${r.id}"><header><strong>${esc(r.vendorName)}</strong><span class="booking-state ${r.proposal?'pending':r.status}">${r.proposal?'변경 응답 대기':r.status==='cancelled'?'예약 취소':'예약 확정'}</span></header><p class="booking-muted">${esc(r.regionName)} · ${r.quantity}마리 · 제출 ${r.completed??r.entryIds.length}/${r.quantity}</p><p class="booking-muted">${notificationLabels[r.notificationStatus]||'알림 상태 확인 필요'}</p></button>`).join(''):'<p class="booking-session-empty">아직 예약한 업체가 없습니다.</p>'}${s.incoming.map(p=>`<p class="booking-muted">${esc(p.vendorName)} · 변경 제안 ${p.quantity}마리 임시 확보<br>${esc(time(p.expiresAt))}까지</p>`).join('')}</details></article>`).join(''):'<div class="booking-empty"><p>이 조건에 해당하는 방송이 없습니다.</p><button type="button" class="booking-text" id="clear-filter">전체 방송 보기</button></div>';
    if($('clear-filter'))$('clear-filter').onclick=()=>{$('session-filter').value='all';render();};
    for(const button of document.querySelectorAll('[data-settings]'))if(state.sessions.find(s=>s.date===button.dataset.settings)?.startsAt<=state.now)button.hidden=true;
    for(const button of document.querySelectorAll('[data-reservation]')){
      const r=state.sessions.flatMap(s=>s.reservations).find(r=>r.id===button.dataset.reservation);
      button.setAttribute('aria-label',`${r.vendorName} · ${date(r.date)} · ${r.quantity}마리 · ${r.proposal?'변경 응답 대기':r.status==='cancelled'?'예약 취소':'예약 확정'} 상세`);
    }
  }
  function renderCycle(){
    document.querySelector('.booking-heading .booking-muted').textContent='방송별 출품 등록과 수거 현황';
    document.querySelector('.booking-footer').hidden=true;
    const filter=$('session-filter');
    for(const option of filter.options)option.textContent={all:'예정된 방송',short:'출품 등록 필요',pending:'수거 미완료',past:'지난 방송'}[option.value];
    let month=$('broadcast-month');
    if(!month){const label=document.createElement('label');label.htmlFor='broadcast-month';label.textContent='방송월';month=document.createElement('select');month.id='broadcast-month';label.append(month);filter.closest('label').after(label);const months=[...new Set(state.sessions.map(s=>s.date.slice(0,7)))];month.innerHTML=months.map(m=>`<option value="${m}">${m.replace('-','년 ')}월</option>`).join('');month.value=(state.sessions.find(s=>s.startsAt>state.now)||state.sessions[0]).date.slice(0,7);month.onchange=render;}
    const sessions=state.sessions.filter(s=>s.date.startsWith(month.value)).filter(s=>filter.value==='past'?s.startsAt<=state.now:s.startsAt>state.now).filter(s=>filter.value==='short'?s.reservations.some(r=>r.status==='confirmed'&&!r.registrationComplete):filter.value==='pending'?s.reservations.some(r=>r.status==='confirmed'&&!r.pickup):true);
    $('admin-summary').textContent=`${sessions.length}회차`;
    $('session-list').innerHTML=sessions.length?sessions.map(s=>{
      const confirmed=s.reservations.filter(r=>r.status==='confirmed'),completed=confirmed.reduce((n,r)=>n+r.completed,0);
      return `<article class="booking-session"><header><div><h2>${esc(date(s.date))}</h2><p class="booking-muted">${esc(s.regionName)} · ${s.regionVendorCount}개 업체 · 업체당 4마리${s.paused?' · 접수 중지':''}</p></div>${s.startsAt>state.now?`<button class="booking-text" type="button" data-settings="${s.date}" aria-label="${esc(date(s.date))} 방송 설정">설정</button>`:''}</header><div class="booking-counts"><span>출품 신청<b>${confirmed.length}<small>업체</small></b></span><span>제출<b>${completed}<small>마리</small></b></span><span>수거 완료<b>${confirmed.filter(r=>r.pickup).length}<small>업체</small></b></span></div><p class="booking-muted">예약 마감 ${esc(time(s.closesAt))} · 정원 ${s.maxQuantity===null?'제한 없음':s.maxQuantity+'마리'}</p><details><summary>참여 업체 ${confirmed.length}곳</summary>${s.reservations.map(r=>`<button type="button" class="booking-card" data-reservation="${r.id}"><header><strong>${esc(r.vendorName)}</strong><span>${r.status==='cancelled'?'신청 취소':r.registrationComplete?'제출 완료':'등록 필요'}</span></header><p class="booking-muted">제출 ${r.completed}마리 · ${r.pickup?'수거 완료':'수거 전'}</p></button>`).join('')||'<p class="booking-session-empty">출품 신청이 없습니다.</p>'}</details></article>`;
    }).join(''):'<p class="booking-session-empty">해당하는 방송이 없습니다.</p>';
  }
  async function load(){if(busy)return;const seq=++revision;error('admin-error','');
    try{if(code){const access=await api('organizer-access',{method:'POST',body:JSON.stringify({code})});if(seq!==revision)return;channel=access.channel.id;}
      const data=await api(route());if(seq!==revision)return;state=data;render();$('admin-status').textContent='';
      $('organizer-home').href=code?'/o/'+encodeURIComponent(code):'/channel-workspace.html?channel='+encodeURIComponent(channel);
    }catch(e){if(seq!==revision)return;error('admin-error',e.message||'예약을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');$('admin-status').textContent='';$('admin-retry').hidden=false;if(e.status===401){state=null;$('admin-content').hidden=true;$('admin-login').hidden=!!code;if($('admin-dialog').open)$('admin-dialog').close();}}
  }
  async function save(body){if(busy)return false;error('admin-dialog-error','');setBusy(true);++revision;
    const key='creo-booking-admin:'+channel,signature=JSON.stringify(body);let pending;
    try{pending=JSON.parse(sessionStorage.getItem(key));}catch{}
    if(pending?.signature!==signature)pending={signature,requestId:crypto.randomUUID()};
    try{sessionStorage.setItem(key,JSON.stringify(pending));}catch{}
    try{state=await api(route(),{method:'POST',body:JSON.stringify({...body,requestId:pending.requestId})});try{sessionStorage.removeItem(key);}catch{}dirty=false;render();$('admin-status').textContent='저장했습니다.';return true;}
    catch(e){error('admin-dialog-error',e.message||'저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');return false;}finally{setBusy(false);}
  }
  function open(title,html,actions){if(!$('admin-dialog').open){dialogTrigger=document.activeElement;triggerData={...dialogTrigger?.dataset};}$('admin-dialog-heading').textContent=title;$('admin-dialog-body').innerHTML=html;$('admin-dialog-actions').innerHTML=actions;error('admin-dialog-error','');dirty=false;if(!$('admin-dialog').open)$('admin-dialog').showModal();$('admin-dialog-heading').tabIndex=-1;$('admin-dialog-heading').focus();}
  const buttons=(form,label='설정 저장하기')=>`<button type="submit" form="${form}" class="booking-primary">${label}</button><button id="dialog-back" type="button" class="booking-secondary">닫기</button>`;
  function close(){if(busy)return;if(dirty&&!confirm('저장하지 않은 내용을 닫을까요?'))return;dirty=false;$('admin-dialog').close();}
  function sessionForm(dateValue){const s=state.sessions.find(s=>s.date===dateValue);
    open(`${date(s.date)} 방송 설정`,`<p class="booking-muted">이 날짜에만 적용됩니다. ${state.mode==='regional-cycle-v1'?`기존 업체에 확보한 최대 ${s.confirmedQuantity}마리를 유지합니다.`:`확정 ${s.confirmedQuantity}마리와 임시 확보 ${s.heldQuantity}마리를 유지합니다.`}</p><form id="session-form"><label for="session-max">방송 최대 수량</label><input id="session-max" type="number" inputmode="numeric" min="32" max="128" required value="${s.maxQuantity}"><div class="booking-field-grid">${[['closesAt','예약 마감'],['entriesDueAt','개체 등록 마감'],['selfUntil','업체 직접 변경·취소 마감']].map(([k,label])=>`<label for="session-${k}">${label}<input id="session-${k}" type="datetime-local" required value="${local(s[k])}"></label>`).join('')}</div><label for="session-response">변경 요청 기본 응답 시간</label><input id="session-response" type="number" min="1" max="336" inputmode="numeric" required value="${s.responseHours}"><label class="booking-entry-option"><input id="session-paused" type="checkbox" ${s.paused?'checked':''}><span>신규 예약 접수 중지<small>기존 예약과 방송 일정은 유지됩니다.</small></span></label></form>`,buttons('session-form'));
    if(state.mode==='regional-cycle-v1'){
      Object.assign($('session-max'),{min:'4',step:'1',required:false,placeholder:'제한 없음',value:s.maxQuantity??''});$('session-max').removeAttribute('max');
      $('session-selfUntil').closest('label').hidden=true;$('session-response').hidden=true;document.querySelector('[for="session-response"]').hidden=true;
    }
    $('session-form').onsubmit=async e=>{e.preventDefault();const settings={maxQuantity:state.mode==='regional-cycle-v1'&&$('session-max').value===''?null:Number($('session-max').value),responseHours:Number($('session-response').value),paused:$('session-paused').checked};for(const k of ['closesAt','entriesDueAt','selfUntil'])settings[k]=iso($('session-'+k).value);if(await save({type:'session',date:s.date,expectedVersion:state.version,settings}))$('admin-dialog').close();};
  }
  function defaultsForm(){const d=state.defaults;
    open('기본 운영 설정',`<p class="booking-muted">이미 만들어진 회차의 설정은 유지합니다. 이후 새로 공개되는 회차의 기본값으로 사용합니다.</p><form id="defaults-form">${[['maxQuantity','방송 최대 수량 · 마리',32,128],['closeHours','예약 마감 · 방송 몇 시간 전',0,336],['entryHours','개체 등록 마감 · 방송 몇 시간 전',0,336],['selfHours','직접 변경·취소 마감 · 방송 몇 시간 전',0,336],['responseHours','변경 요청 응답 시간',1,336]].map(([k,label,min,max])=>`<label for="default-${k}">${label}</label><input id="default-${k}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${d[k]}" required>`).join('')}</form>`,buttons('defaults-form'));
    if(state.mode==='regional-cycle-v1'){
      Object.assign($('default-maxQuantity'),{min:'4',step:'1',required:false,placeholder:'제한 없음',value:d.maxQuantity??''});$('default-maxQuantity').removeAttribute('max');
      for(const key of ['selfHours','responseHours']){$('default-'+key).hidden=true;document.querySelector('[for="default-'+key+'"]').hidden=true;}
    }
    $('defaults-form').onsubmit=async e=>{e.preventDefault();const defaults=Object.fromEntries(Object.keys(d).map(k=>[k,state.mode==='regional-cycle-v1'&&k==='maxQuantity'&&$('default-'+k).value===''?null:Number($('default-'+k).value)]));if(await save({type:'defaults',expectedVersion:state.version,defaults}))$('admin-dialog').close();};
  }
  function regionsForm(){
    open('업체 지역 관리',`<p class="booking-muted">업체가 예약할 때 이 지역을 자동으로 적용합니다. 업체의 실제 소재지를 확인해 등록해 주세요.</p><form id="region-form" class="booking-region-form"><label for="region-vendor">업체<select id="region-vendor" required><option value="">업체 선택</option>${state.vendors.map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${v.region===null?'지역 미등록':esc(state.regions[v.region])}</option>`).join('')}</select></label><label for="region-choice">지역<select id="region-choice" required><option value="">지역 선택</option>${state.regions.map((name,i)=>`<option value="${i}">${esc(name)}</option>`).join('')}</select></label><button class="booking-primary" type="submit">지역 저장</button></form>`,'<button class="booking-secondary" id="dialog-back" type="button">닫기</button>');
    $('region-vendor').onchange=()=>{const v=state.vendors.find(v=>v.id===$('region-vendor').value);$('region-choice').value=v?.region??'';};
    $('region-form').onsubmit=async e=>{e.preventDefault();if(await save({type:'region',expectedVersion:state.version,vendorId:$('region-vendor').value,region:Number($('region-choice').value)}))regionsForm();};
  }
  function reservationForm(id){const r=state.sessions.flatMap(s=>s.reservations).find(r=>r.id===id);if(!r)return;
    const isFuture=r.session.startsAt>state.now;
    open('예약 상세',`<h3>${esc(r.vendorName)}</h3><dl class="booking-facts"><dt>기존 예약</dt><dd>${esc(date(r.date))} · ${r.entryLimit??r.quantity}마리</dd><dt>지역</dt><dd>${esc(r.regionName)}</dd><dt>개체 제출</dt><dd>${r.completed??r.entryIds.length}${state.mode==='regional-cycle-v1'?'':' / '+r.quantity}마리</dd></dl>${r.excessSubmitted?'<p class="booking-deficit">현재 한도를 넘는 기존 제출 '+r.excessSubmitted+'마리가 있어요. 출품 검토에서 확인해 주세요.</p>':''}${r.proposal?`<div class="booking-request"><strong>변경 응답 대기</strong><p>${esc(date(r.proposal.date))} · ${r.proposal.quantity}마리</p><p class="booking-muted">${esc(time(r.proposal.expiresAt))}까지<br>수락 전까지 기존 예약을 유지합니다.</p></div>`:r.status==='confirmed'&&isFuture&&state.mode!=='regional-cycle-v1'?`<h3>변경 제안 보내기</h3><p class="booking-muted">업체가 수락하기 전까지 기존 예약은 유지하며, 제안한 자리는 응답 기한까지 확보합니다.</p><form id="proposal-form"><label for="proposal-date">제안할 방송 날짜</label><select id="proposal-date">${state.sessions.map(s=>`<option value="${s.date}" ${s.date===r.date?'selected':''}>${esc(date(s.date))} · 오후 8시</option>`).join('')}</select><label for="proposal-quantity">제안 수량</label><input type="number" inputmode="numeric" id="proposal-quantity" min="1" max="16" required value="${r.quantity}"><label for="proposal-expiry">응답 기한</label><input type="datetime-local" id="proposal-expiry" required value="${local(new Date(Math.min(Date.parse(state.now)+r.session.responseHours*3600000,Date.parse(r.session.startsAt)-3600000)).toISOString())}"></form>`:`<p class="booking-muted">${r.status==='confirmed'&&isFuture?'수거 '+(r.pickup?'완료':'전'):'취소되거나 종료된 예약입니다.'}</p>`}<details><summary>변경·취소 이력</summary><ol class="booking-audit">${r.history.map(h=>`<li>${esc(h.action)} · ${esc(time(h.at))}<br>${esc(date(h.date))} · ${h.quantity}마리${h.proposal?` → ${esc(date(h.proposal.date))} · ${h.proposal.quantity}마리`:''}</li>`).join('')}</ol></details>`,`${!r.proposal&&r.status==='confirmed'&&isFuture&&state.mode!=='regional-cycle-v1'?'<button class="booking-primary" type="submit" form="proposal-form">변경 제안 보내기</button>':''}<button class="booking-secondary" type="button" id="dialog-back">닫기</button>${r.status==='confirmed'&&isFuture?'<button type="button" class="booking-text" id="admin-cancel">예약 취소</button>':''}`);
    if($('proposal-form'))$('proposal-form').onsubmit=async e=>{e.preventDefault();if(await save({type:'propose',id:r.id,expectedVersion:r.version,date:$('proposal-date').value,quantity:Number($('proposal-quantity').value),expiresAt:iso($('proposal-expiry').value)}))reservationForm(r.id);};
    if($('proposal-date'))for(const option of [...$('proposal-date').options])if(state.sessions.find(s=>s.date===option.value)?.startsAt<=state.now)option.remove();
    if($('proposal-quantity'))$('proposal-quantity').max='8';
    if($('admin-cancel'))$('admin-cancel').onclick=async()=>{if(!confirm(`${r.vendorName}의 ${date(r.date)} ${r.quantity}마리 예약을 취소할까요? 업체에 취소 알림이 발송됩니다.`))return;if(await save({type:'cancel',id:r.id,expectedVersion:r.version}))reservationForm(r.id);};
  }
  $('session-list').onclick=e=>{const settings=e.target.closest('[data-settings]'),reservation=e.target.closest('[data-reservation]');if(settings)sessionForm(settings.dataset.settings);if(reservation)reservationForm(reservation.dataset.reservation);};
  $('admin-dialog').onclick=e=>{if(e.target.id==='dialog-back')close();};$('admin-dialog').oninput=()=>dirty=true;$('admin-close').onclick=close;$('admin-dialog').addEventListener('cancel',e=>{e.preventDefault();close();});
  $('admin-dialog').addEventListener('close',()=>{const replacement=[...document.querySelectorAll('[data-settings],[data-reservation]')].find(el=>(triggerData.settings&&el.dataset.settings===triggerData.settings)||(triggerData.reservation&&el.dataset.reservation===triggerData.reservation));(dialogTrigger?.isConnected?dialogTrigger:replacement||$('admin-refresh')).focus();});
  $('open-defaults').onclick=defaultsForm;$('open-regions').onclick=regionsForm;$('session-filter').onchange=render;$('admin-refresh').onclick=load;$('admin-retry').onclick=load;
  $('login-form').onsubmit=async e=>{e.preventDefault();try{await CreoPlatform.verifyAdmin($('admin-password').value);$('admin-password').value='';await load();}catch(e){error('admin-error',e.message);}};
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  load();
})();

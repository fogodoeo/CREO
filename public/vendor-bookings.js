(() => {
  'use strict';
  const $=id=>document.getElementById(id), q=new URLSearchParams(location.search);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>new Date(v+'T20:00:00+09:00').toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'});
  const time=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
  let credential=q.get('code')?{code:q.get('code')}:{token:q.get('token')||''};
  const short=/^\/r\/([A-Za-z0-9_-]{24})$/.exec(location.pathname);
  if(short)credential={bookingCode:short[1]};
  let event=q.get('event')||'', state=null, busy=false, selected='', currentId='', openedLink=false, sequence=0,detailTrigger=null, calendarMonth='';
  const storageKey='creo-booking-request:'+JSON.stringify(credential)+':'+event;
  function error(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
  async function request(body) {
    const params={...credential,...(event?{event}:{})};let response;
    try {response=await fetch('/api/platform/vendor-bookings'+(body?'':'?'+new URLSearchParams(params)),{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify({...body,...params})}:{}),signal:AbortSignal.timeout(20000)});}catch{throw Error('연결하지 못했습니다. 입력한 내용은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.');}
    const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'처리하지 못했습니다. 다시 시도해 주세요.'),{status:response.status});return data;
  }
  function accept(data) {
    state=data;event=data.channel.id;
    if(data.navigationToken)credential={token:data.navigationToken};
    $('vendor-name').textContent=data.vendor.name;$('region-label').textContent=data.vendor.region||'지역 미등록';
    const params=new URLSearchParams({...credential,event,...(q.get('portal')?{portal:q.get('portal')}:{})});
    const url=section=>section==='profile'&&q.get('portal')?'/vendor-access.html?section=profile&company='+encodeURIComponent(q.get('portal')):section==='booking'?'/vendor-bookings.html?'+params:section==='settlement'?'/vendor-checkout.html?'+params:'/vendor-entries.html?'+params+'&section='+section;
    const nav=document.querySelector('.vendor-bottom-nav');
    window.CreoVendorNavigation.configureBooking(data,url('booking'));nav.hidden=false;
    for(const a of nav.querySelectorAll('a')){a.href=url(a.dataset.vendorSection);if(a.dataset.vendorSection==='booking')a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    $('vendor-home').href=url('entries');
  }
  function card(r) {const missing=r.status==='confirmed'&&r.session.startsAt>state.now&&r.entryIds.length<r.quantity;return `<button class="booking-card" type="button" data-detail="${esc(r.id)}" aria-label="${esc(date(r.date))} · ${r.quantity}마리 상세"><header><strong>${esc(date(r.date))}</strong><b>${r.quantity}마리 <span aria-hidden="true">›</span></b></header>${missing?`<div class="booking-card-meta action-needed">출품 개체 ${r.quantity-r.entryIds.length}마리 선택하기</div>`:r.status==='cancelled'?'<div class="booking-card-meta">취소한 예약</div>':''}</button>`;}
  function renderCalendar(){
    const months=[...new Set(state.dates.map(d=>d.date.slice(0,7)))];if(!months.includes(calendarMonth))calendarMonth=months[0];
    if(!calendarMonth){$('date-options').innerHTML='';return;}
    const [year,month]=calendarMonth.split('-').map(Number),first=new Date(Date.UTC(year,month-1,1)).getUTCDay(),days=new Date(Date.UTC(year,month,0)).getUTCDate(),index=months.indexOf(calendarMonth);
    let cells=['일','월','화','수','목','금','토'].map(d=>`<span class="calendar-weekday">${d}</span>`).join('')+'<span aria-hidden="true"></span>'.repeat(first);
    for(let i=1;i<=days;i++){const value=calendarMonth+'-'+String(i).padStart(2,'0'),d=state.dates.find(d=>d.date===value);cells+=!d?`<span class="calendar-plain">${i}</span>`:d.maxQuantityAvailable?`<label class="calendar-day"><input type="radio" name="date" value="${value}" aria-label="${esc(date(value))} 예약 가능" ${value===selected?'checked':''}><span>${i}</span></label>`:`<button class="calendar-blocked" type="button" data-reason="${esc(d.reason)}" aria-label="${esc(date(value))} · ${esc(d.reason)}">${i}</button>`;}
    $('date-options').innerHTML=`<div class="calendar-heading"><strong>${year}년 ${month}월</strong><div><button type="button" id="month-prev" aria-label="이전 달" ${index===0?'disabled':''}>‹</button><button type="button" id="month-next" aria-label="다음 달" ${index===months.length-1?'disabled':''}>›</button></div></div><div class="calendar-grid">${cells}</div><p class="calendar-key"><span><i></i>예약 가능</span><span>취소선 날짜 · 사유 확인</span></p>`;
    for(const [id,step]of [['month-prev',-1],['month-next',1]])$(id).onclick=()=>{calendarMonth=months[index+step];selected='';renderCalendar();updateQuantity();};
    for(const b of document.querySelectorAll('[data-reason]'))b.onclick=()=>{$('date-reason').textContent=b.dataset.reason;};
  }
  function render() {
    document.querySelectorAll('.region-help').forEach(el=>el.remove());
    $('booking-content').hidden=false;$('booking-retry').hidden=true;
    const upcoming=state.reservations.filter(r=>r.status==='confirmed'&&r.session.startsAt>state.now).sort((a,b)=>a.date.localeCompare(b.date));
    const history=state.reservations.filter(r=>!upcoming.includes(r)).sort((a,b)=>b.date.localeCompare(a.date));
    $('reservation-list').innerHTML=upcoming.length?upcoming.map(card).join(''):'<div class="booking-empty"><p><strong>아직 예약한 방송이 없습니다</strong></p><p class="booking-muted">아래에서 방송 날짜를 선택해 주세요.</p></div>';
    $('reservation-history').innerHTML=history.length?history.map(card).join(''):'<p class="booking-muted">지난 예약·취소 내역이 없습니다.</p>';
    const pending=upcoming.filter(r=>r.proposal);$('booking-requests').hidden=!pending.length;
    $('request-list').innerHTML=pending.map(r=>`<article class="booking-request"><span class="booking-state pending">응답 필요</span><p><strong>${esc(date(r.date))} 예약 변경 제안</strong></p><p class="booking-muted">${esc(date(r.proposal.date))} · ${r.proposal.quantity}마리로 변경<br>${esc(time(r.proposal.expiresAt))}까지 응답해 주세요.</p><p class="booking-muted">수락 전까지 기존 예약을 유지합니다.</p><button class="booking-secondary" type="button" data-detail="${esc(r.id)}">변경 내용 확인하기</button></article>`).join('');
    if(!state.dates.some(d=>d.date===selected&&d.maxQuantityAvailable))selected='';
    $('open-reserve').textContent=upcoming.length?'다음 방송 예약하기':'방송 예약하기';
    renderCalendar();
    if(!state.vendor.region)$('date-options').insertAdjacentHTML('beforebegin','<p class="booking-error region-help">운영자에게 업체 지역 등록을 요청해 주세요. 등록 후 예약할 수 있습니다.</p>');
    updateQuantity();
    const hasDate=state.dates.some(d=>d.maxQuantityAvailable>0);$('no-booking-date').hidden=hasDate;$('reserve-submit').hidden=!hasDate;
  }
  function updateQuantity(){
    const d=state.dates.find(d=>d.date===selected);$('quantity-area').hidden=!d;
    $('reserve-submit').disabled=!d;
    if(d){$('booking-quantity').max=d.maxQuantityAvailable;if(!$('booking-quantity').value||Number($('booking-quantity').value)>d.maxQuantityAvailable)$('booking-quantity').value='1';$('quantity-help').textContent=`최대 ${d.maxQuantityAvailable}마리`;$('booking-deadline').textContent=`예약 마감 ${time(d.closesAt)}`;}
  }
  function setBusy(value){busy=value;for(const control of document.querySelectorAll('button,input,select')){if(value){control.dataset.busyDisabled=String(control.disabled);control.disabled=true;}else if(control.dataset.busyDisabled!==undefined){control.disabled=control.dataset.busyDisabled==='true';delete control.dataset.busyDisabled;}}for(const dialog of document.querySelectorAll('dialog'))dialog.setAttribute('aria-busy',String(value));}
  async function mutate(body,target='detail-error') {
    if(busy)return false;
    let pending;const signature=JSON.stringify(body);
    try{pending=JSON.parse(sessionStorage.getItem(storageKey));}catch{}
    if(pending?.signature!==signature)pending={signature,requestId:crypto.randomUUID()};
    try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}
    error(target,'');setBusy(true);++sequence;
    try{
      const data=await request({...body,requestId:pending.requestId});
      try{sessionStorage.removeItem(storageKey);}catch{}
      accept(data);render();
      $('booking-status').textContent=({reserve:'예약이 확정되었습니다.',change:'예약이 변경되었습니다.',respond:body.response==='accept'?'변경을 수락했습니다.':'기존 예약을 유지합니다.',cancel:'예약이 취소되었습니다.',entries:'출품 개체를 저장했습니다.'})[body.type];
      return true;
    }catch(e){error(target,e.message);return false;}finally{setBusy(false);if(state)updateQuantity();}
  }
  async function load(){
    if(busy)return;const id=++sequence;error('booking-error','');$('booking-refresh').disabled=true;
    try{const data=await request();if(id!==sequence)return;accept(data);document.querySelectorAll('.region-help').forEach(el=>el.remove());render();$('booking-status').textContent='';
      if(!openedLink&&data.linkedReservationId){openedLink=true;openDetail(data.linkedReservationId);}
    }catch(e){error('booking-error',e.message);$('booking-retry').hidden=false;$('booking-status').textContent='';if(e.status===401||e.status===404){$('booking-content').hidden=true;document.querySelector('.vendor-bottom-nav').hidden=true;}}
    finally{if(id===sequence)$('booking-refresh').disabled=false;}
  }
  function openDetail(id){
    if(!$('booking-detail').open)detailTrigger=document.activeElement;
    const r=state.reservations.find(r=>r.id===id);if(!r)return;currentId=id;error('detail-error','');
    $('detail-heading').textContent=r.proposal?'예약 변경 요청':'예약 상세';
    let html=`<span class="booking-state ${r.status}">${r.status==='cancelled'?'예약 취소':'예약 확정'}</span><dl class="booking-facts"><dt>방송 날짜</dt><dd>${esc(date(r.date))} 오후 8시</dd><dt>출품 수량</dt><dd>${r.quantity}마리</dd><dt>개체 선택</dt><dd>${r.entryIds.length} / ${r.quantity}마리</dd></dl>`;
    if(r.proposal){const p=r.proposal;html+=`<h3>변경 제안</h3><div class="booking-compare"><div><small>현재 예약 · 수락 전까지 유지</small><strong>${esc(date(r.date))} · ${r.quantity}마리</strong></div><div><small>수락 후 예약</small><strong>${esc(date(p.date))} · ${p.quantity}마리</strong></div></div><p class="booking-muted">응답 기한 ${esc(time(p.expiresAt))}<br>거절하거나 기한이 지나면 기존 예약을 유지합니다.</p>`;}
    else if(r.status==='confirmed'&&r.session.startsAt>state.now)html+=`<p class="booking-muted">직접 변경·취소 ${esc(time(r.session.selfUntil))}까지<br>개체 선택 ${esc(time(r.session.entriesDueAt))}까지</p>`;
    html+=`<details><summary>예약 변경 이력</summary><ol class="booking-audit">${r.history.map(h=>`<li>${esc(h.action)} · ${esc(time(h.at))}<br>${esc(date(h.date))} · ${h.quantity}마리${h.proposal?` → ${esc(date(h.proposal.date))} · ${h.proposal.quantity}마리`:''}</li>`).join('')}</ol></details>`;
    $('detail-body').innerHTML=html;
    $('detail-actions').innerHTML=r.proposal?'<button type="button" class="booking-primary" id="accept-proposal">변경 수락하기</button><button type="button" class="booking-secondary" id="reject-proposal">기존 예약 유지하기</button>':'';
    if(r.status==='confirmed'&&r.session.startsAt>state.now){
      if(r.session.entriesDueAt>state.now)$('detail-actions').insertAdjacentHTML('beforeend','<button type="button" class="booking-secondary" id="select-entries">출품 개체 선택</button>');
      if(r.canChange)$('detail-actions').insertAdjacentHTML('beforeend','<button type="button" class="booking-secondary" id="change-reservation">일정·수량 변경</button>');
      if(r.canCancel)$('detail-actions').insertAdjacentHTML('beforeend','<button type="button" class="booking-text" id="cancel-reservation">예약 취소</button>');
    }
    if(!$('booking-detail').open)$('booking-detail').showModal();
    $('detail-heading').tabIndex=-1;$('detail-heading').focus();
    const respond=async response=>{if(await mutate({type:'respond',id:r.id,expectedVersion:r.version,proposalId:r.proposal.id,response}))openDetail(r.id);};
    if($('accept-proposal'))$('accept-proposal').onclick=()=>respond('accept');
    if($('reject-proposal'))$('reject-proposal').onclick=()=>respond('reject');
    if($('select-entries'))$('select-entries').onclick=()=>entryForm(r);
    if($('change-reservation'))$('change-reservation').onclick=()=>changeForm(r);
    if($('cancel-reservation'))$('cancel-reservation').onclick=()=>{$('confirm-description').textContent=`${date(r.date)} · ${r.quantity}마리`;error('cancel-error','');$('booking-confirm').showModal();};
  }
  function entryForm(r){
    $('detail-heading').textContent='출품 개체 선택';error('detail-error','');
    const list=state.entries.filter(e=>e.status!=='deleted');
    const params=new URLSearchParams({...credential,event,section:'entries',...(q.get('portal')?{portal:q.get('portal')}:{})});
    $('detail-body').innerHTML=`<p class="booking-muted">${esc(date(r.date))} · 최대 ${r.quantity}마리<br>업체 페이지에 등록한 개체를 선택해 주세요.</p><form id="entry-selection">${list.length?list.map(e=>`<label class="booking-entry-option"><input type="checkbox" name="entry" value="${esc(e.id)}" ${r.entryIds.includes(e.id)?'checked':''}><span>${esc(e.code)}<small>${esc(e.morph||'모프 미입력')}</small></span></label>`).join(''):'<p class="booking-empty">등록한 개체가 없습니다.</p>'}</form><a class="booking-secondary" href="/vendor-entries.html?${esc(params)}">출품 개체 등록하러 가기</a>`;
    $('detail-actions').innerHTML='<button class="booking-primary" type="submit" form="entry-selection">선택한 개체 저장</button><button class="booking-secondary" type="button" id="back-detail">예약 상세로</button>';
    $('back-detail').onclick=()=>openDetail(r.id);$('entry-selection').onsubmit=async e=>{e.preventDefault();const ids=[...document.querySelectorAll('[name=entry]:checked')].map(el=>el.value);if(await mutate({type:'entries',id:r.id,expectedVersion:r.version,entryIds:ids}))openDetail(r.id);};
    $('detail-heading').focus();
  }
  function changeForm(r){
    $('detail-heading').textContent='일정·수량 변경';error('detail-error','');
    $('detail-body').innerHTML=`<p class="booking-muted">변경이 완료될 때까지 기존 예약을 유지합니다.</p><form id="change-form"><label for="change-date">방송 날짜</label><select id="change-date">${r.changeDates.filter(d=>d.maxQuantityAvailable).map(d=>`<option value="${d.date}" ${r.date===d.date?'selected':''}>${esc(date(d.date))} · 최대 ${d.maxQuantityAvailable}마리</option>`).join('')}</select><label for="change-quantity">출품 수량</label><input id="change-quantity" type="number" inputmode="numeric" min="1" max="8" required value="${r.quantity}"></form>`;
    $('detail-actions').innerHTML='<button class="booking-primary" type="submit" form="change-form">변경 확정하기</button><button class="booking-secondary" type="button" id="back-detail">예약 유지하기</button>';
    $('back-detail').onclick=()=>openDetail(r.id);$('change-form').onsubmit=async e=>{e.preventDefault();if(await mutate({type:'change',id:r.id,expectedVersion:r.version,date:$('change-date').value,quantity:Number($('change-quantity').value)}))openDetail(r.id);};
    $('detail-heading').focus();
  }
  $('reserve-form').onsubmit=async e=>{e.preventDefault();if(busy)return;error('reserve-error','');$('booking-quantity').removeAttribute('aria-invalid');
    if(!selected){error('reserve-error','예약 가능한 방송 날짜를 먼저 선택해 주세요.');document.querySelector('[name=date]:not(:disabled)')?.focus();return;}
    const amount=Number($('booking-quantity').value),limit=state.dates.find(d=>d.date===selected)?.maxQuantityAvailable||0;
    if(!Number.isInteger(amount)||amount<1||amount>limit){error('reserve-error',`출품 수량은 1~${limit}마리로 입력해 주세요.`);$('booking-quantity').setAttribute('aria-invalid','true');$('booking-quantity').setAttribute('aria-describedby','quantity-help reserve-error');$('booking-quantity').focus();return;}
    if(await mutate({type:'reserve',date:selected,quantity:amount},'reserve-error')){$('booking-quantity').value='';$('booking-reserve').close();$('my-heading').tabIndex=-1;$('my-heading').focus();}
  };
  $('date-options').onchange=()=>{selected=document.querySelector('[name=date]:checked')?.value||'';$('date-reason').textContent='';updateQuantity();error('reserve-error','');};
  $('open-reserve').onclick=()=>{$('booking-reserve').showModal();};$('reserve-close').onclick=()=>{if(!busy)$('booking-reserve').close();};
  for(const [id,step]of [['quantity-minus',-1],['quantity-plus',1]])$(id).onclick=()=>{const input=$('booking-quantity');input.value=String(Math.max(1,Math.min(Number(input.max),Number(input.value)+step)));};
  $('booking-content').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)openDetail(b.dataset.detail);});
  $('detail-close').onclick=()=>{if(!busy)$('booking-detail').close();};$('cancel-back').onclick=()=>$('booking-confirm').close();
  $('cancel-confirm').onclick=async()=>{const r=state.reservations.find(r=>r.id===currentId);if(await mutate({type:'cancel',id:r.id,expectedVersion:r.version},'cancel-error')){$('booking-confirm').close();openDetail(r.id);}};
  for(const id of ['booking-detail','booking-confirm','booking-reserve'])$(id).addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('booking-detail').addEventListener('close',()=>{const trigger=detailTrigger?.isConnected?detailTrigger:[...document.querySelectorAll('[data-detail]')].find(el=>el.dataset.detail===currentId);(trigger||$('booking-refresh')).focus();});
  $('booking-refresh').onclick=load;$('booking-retry').onclick=load;
  load();
})();

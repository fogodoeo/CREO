(function(global){
 'use strict';
 const sections=[
  ['booking','출품 관리','<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/>'],
  ['settlement','낙찰·정산','<path d="m4 4 2-1 3 2 3-2 3 2 3-2 2 1v17l-2-1-3 1-3-1-3 1-3-1-2 1Z"/><path d="M8 8h8M8 12h5M8 16h8"/>'],
  ['profile','업체 정보','<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>']
 ];
 const query=new URLSearchParams(location.search),portal=query.get('portal'),profileEntry=location.pathname.endsWith('/vendor-access.html')&&query.get('section')==='profile'&&query.get('company');
 if(portal||profileEntry)document.documentElement.classList.add('vendor-shell-pending');
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function currentSection(){return location.pathname.endsWith('/promo-center.html')?'promo':profileEntry?'profile':location.pathname.endsWith('/vendor-checkout.html')?'settlement':'booking';}
 let switchDialog,switchSequence=0,switching=false;
 async function access(route,session,body){
  const response=await fetch('/api/platform/vendor-access/'+route,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','x-vendor-csrf':session?.csrfToken||''},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'다시 시도해 주세요.');return data;
 }
 async function switchCompany(trigger,current){
  if(!switchDialog){
   switchDialog=document.createElement('dialog');switchDialog.className='vendor-company-dialog';switchDialog.setAttribute('aria-labelledby','vendor-company-title');
   switchDialog.innerHTML='<header><h2 id="vendor-company-title">업체 선택</h2><button type="button" class="vendor-switch-close" aria-label="업체 선택 닫기">×</button></header><div class="vendor-company-options"></div><p class="vendor-switch-error" role="alert" hidden></p>';
   document.body.append(switchDialog);
   switchDialog.querySelector('.vendor-switch-close').onclick=()=>{if(!switching)switchDialog.close();};
   switchDialog.addEventListener('cancel',event=>{if(switching)event.preventDefault();});
   switchDialog.addEventListener('close',()=>{switchSequence++;document.getElementById('vendor-company-switch')?.focus({preventScroll:true});});
  }
  if(switching)return;
  const sequence=++switchSequence,options=switchDialog.querySelector('.vendor-company-options'),error=switchDialog.querySelector('.vendor-switch-error');
  error.hidden=true;options.innerHTML='<p class="vendor-switch-loading" role="status">업체를 불러오는 중…</p>';
  if(!switchDialog.open)switchDialog.showModal();
  const failed=message=>{error.textContent=message;error.hidden=false;};
  try{
   const session=await access('session');if(!switchDialog.open||sequence!==switchSequence)return;
   if(!session.authenticated||session.phoneVerificationRequired){options.innerHTML='<a class="vendor-switch-retry" href="/vendor-access.html">다시 로그인</a>';failed('로그인을 확인한 뒤 업체를 선택해 주세요.');return;}
   const companies=session.companies||[];
   options.innerHTML=companies.length?companies.map(c=>`<button type="button" class="vendor-company-option" data-switch-company="${esc(c.id)}" ${c.id===current?'aria-current="true"':''}><span><strong>${esc(c.name)}</strong><small>${esc(c.region)}</small></span><span class="vendor-switch-state">${c.id===current?'선택됨':'›'}</span></button>`).join(''):'<p class="vendor-switch-loading">연결된 업체가 없어요.</p><a class="vendor-switch-retry" href="/vendor-access.html?section=companies">업체 찾기</a>';
   for(const button of options.querySelectorAll('[data-switch-company]'))button.onclick=async()=>{
    if(switching)return;
    const selected=companies.find(c=>c.id===button.dataset.switchCompany);if(selected.id===current){switchDialog.close();return;}
    if(!global.dispatchEvent(new Event('vendor-before-navigation',{cancelable:true})))return;
    switching=true;error.hidden=true;switchDialog.setAttribute('aria-busy','true');switchDialog.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
     if(selected.canClaim)await access('claim',session,{id:selected.id});
     const active=currentSection();
     // A fresh server selection checks membership even when this chooser was left open.
     const data=await access('select',session,{id:selected.id});
     if(active==='promo'){location.href='/promo-center.html?company='+encodeURIComponent(selected.id);return;}
     if(active==='profile'||selected.setupRequired){location.href='/vendor-access.html?section=profile&company='+encodeURIComponent(selected.id);return;}
     const params=new URLSearchParams({event:'national-cre',token:data.token,portal:selected.id});
     location.href=(active==='settlement'?'/vendor-checkout.html':'/vendor-broadcast.html')+'?'+params;
    }catch(e){failed(e.name==='TimeoutError'||e instanceof TypeError?'연결을 확인하고 다시 선택해 주세요.':e.message);}
    finally{switching=false;switchDialog.removeAttribute('aria-busy');switchDialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
   };
  }catch(e){if(!switchDialog.open||sequence!==switchSequence)return;options.innerHTML='<button type="button" class="vendor-switch-retry">다시 불러오기</button>';options.querySelector('button').onclick=()=>switchCompany(trigger,current);failed('업체를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.');}
 }
 function header(companyName){
  const q=new URLSearchParams(location.search),company=q.get('company')||q.get('portal')||document.querySelector('.vendor-portal-nav')?.dataset.company;
  if(!company)return;
  let host=document.getElementById('vendor-shared-header');
  if(!host){host=document.createElement('header');host.id='vendor-shared-header';host.className='vendor-shared-header';document.body.prepend(host);host.addEventListener('click',event=>{if(event.target.closest('a')&&!event.ctrlKey&&!event.metaKey&&!global.dispatchEvent(new Event('vendor-before-navigation',{cancelable:true})))event.preventDefault();});}
  const name=String(companyName||host.dataset.name||document.getElementById('company-name')?.textContent||document.getElementById('vendor')?.textContent||'업체 선택');
  if(host.dataset.company===company&&host.dataset.name===name)return;
  host.dataset.company=company;host.dataset.name=name;host.replaceChildren();
   for(const [label,href,cls,aria]of [['옹동2','/vendor-access.html','vendor-home','업체 홈'],['전국크레자랑','/vendor-access.html?company='+encodeURIComponent(company),'vendor-channel','전국크레자랑 출품 관리']]){const a=document.createElement('a');a.textContent=label;a.href=href;a.className=cls;a.setAttribute('aria-label',aria);host.append(a);}
  const button=document.createElement('button');button.type='button';button.id='vendor-company-switch';button.className='vendor-company';button.setAttribute('aria-label',name+' · 업체 선택');button.setAttribute('aria-haspopup','dialog');button.innerHTML='<span>'+esc(name)+'</span><span aria-hidden="true">⌄</span>';button.onclick=()=>switchCompany(button,company);host.append(button);
  document.body.classList.add('has-vendor-header');
 }
 function mount(nav,{active,companyName}={}){
  if(!nav)return;
  document.body.classList.add('national-vendor-shell');nav.classList.add('vendor-portal-nav');nav.setAttribute('aria-label','업체 메뉴');
  const promoCompany=query.get('company')||query.get('portal')||nav.dataset.company;
  if(promoCompany){
   let promo=nav.querySelector('[data-promo-nav]');
   if(!promo){promo=document.createElement('a');promo.dataset.promoNav='';promo.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg><span>홍보 관리</span>';nav.append(promo);}
   promo.href='/promo-center.html?company='+encodeURIComponent(promoCompany);
   if(currentSection()==='promo')promo.setAttribute('aria-current','page');else promo.removeAttribute('aria-current');
  }
  for(const [key,label,icon]of sections){
   const link=nav.querySelector('[data-vendor-section="'+key+'"]');
   if(!link)continue;
   if(!link.querySelector('[data-portal-icon]')){
    const badge=link.querySelector('.vendor-nav-count');
    link.innerHTML='<svg data-portal-icon viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg><span>'+label+'</span>';
    if(badge)link.append(badge);
   }
   link.dataset.label=label;
   if(active){if(active===key)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  }
  header(companyName);refreshAttention(nav);
 }
 function applyAttention(nav,status){
  const error=document.getElementById('vendor-task-error');if(error)error.hidden=true;
  for(const [key,label]of sections){
   const link=nav.querySelector('[data-vendor-section="'+key+'"]');if(!link)continue;
   const needed=!!status[key+'Attention'],count=Math.max(0,Number(status[key+'Count'])||Number(needed));
   link.classList.toggle('portal-attention',needed);if(key==='profile')link.classList.remove('registration-required');
   let badge=link.querySelector('.vendor-nav-count');if(!badge){badge=document.createElement('b');badge.className='vendor-nav-count';badge.setAttribute('aria-hidden','true');link.append(badge);}
   badge.hidden=!needed;badge.textContent=String(count);
   link.setAttribute('aria-label',label+(needed?' · 확인할 일 '+count+'건':''));
   if(key==='settlement'&&!status.settlementTarget){delete link.dataset.settlementEvent;delete link.dataset.settlementRound;}
   if(key==='settlement'&&status.settlementTarget&&link.tagName==='A'){
    link.dataset.settlementEvent=status.settlementTarget.channelId;link.dataset.settlementRound=status.settlementTarget.round;
    const url=new URL(link.href,location.origin);url.searchParams.set('event',status.settlementTarget.channelId);url.searchParams.set('round',status.settlementTarget.round);link.href=url.pathname+url.search;
   }
  }
  const promo=nav.querySelector('[data-promo-nav]');if(promo){promo.classList.toggle('portal-attention',!!status.promoAttention);promo.setAttribute('aria-label','홍보 관리'+(status.promoAttention?' · 게시 일정 있음':''));}
  showPromoNotice(nav,status);
  showSeason(nav.dataset.company||query.get('company')||query.get('portal'),status);
 }
 let seasonHost,seasonDialog,seasonCompany='',seasonState,seasonBusy=false,seasonClaiming=false,seasonGeneration=0;
 function clearSeason(){seasonGeneration++;seasonCompany='';seasonState=null;seasonHost?.remove();seasonHost=null;seasonDialog?.close();seasonDialog?.remove();seasonDialog=null;}
 function seasonBanner(){
  if(!seasonHost||!seasonState)return;
  const s=seasonState,label={accepted:'참가 희망으로 제출했어요',declined:'이번 시즌 불참으로 제출했어요',pending:s.open?'참가 여부를 알려주세요':'참가 여부 미응답 · 응답 기한 종료'}[s.status];
  seasonHost.innerHTML='<h2>'+esc(s.title)+'</h2><p>'+label+'</p><p>'+(s.status==='pending'?(s.open?'11월 2일(월) 밤 11시 59분까지 업체 대표가 응답해 주세요.':'미응답을 불참으로 처리하지 않았어요. 운영자에게 참가 여부를 알려주세요.'):'기존 정산·배송 내역은 계속 확인할 수 있어요. 응답 변경은 운영자에게 문의해 주세요.')+'</p>'+(s.status==='pending'&&s.open&&s.canRespond?'<button type="button">참가 여부 확인</button>':'');
  seasonHost.querySelector('button')?.addEventListener('click',()=>openSeason());
 }
 async function seasonWrite(action,confirmDecline=false){
  const companyId=seasonCompany,campaign=seasonState.id,session=await access('session');
  if(!session.authenticated)throw Error('다시 로그인한 뒤 참가 여부를 제출해 주세요.');
  return access('season-response',session,{companyId,campaign,action,confirmDecline});
 }
 function openSeason(){
  if(!seasonState||seasonBusy||document.querySelector('dialog[open]'))return;
  const s=seasonState;
  seasonDialog?.remove();seasonDialog=document.createElement('dialog');const dialog=seasonDialog,generation=seasonGeneration;
  dialog.className='vendor-season-dialog';dialog.setAttribute('aria-labelledby','vendor-season-title');dialog.setAttribute('aria-describedby','vendor-season-description');
  dialog.innerHTML='<header><h2 id="vendor-season-title">'+esc(s.title)+'</h2><button type="button" data-season-close aria-label="참가 안내 닫기">×</button></header><p class="season-deadline">응답 기한 · 11월 2일(월) 밤 11시 59분</p><div id="vendor-season-description"><p>11월 전국크레자랑 참가를 희망하시나요?</p><p>불참으로 생긴 자리는 다른 업체로 충원합니다. 이후 시즌 재참여는 잔여 자리와 운영 일정에 따라 제한될 수 있습니다.</p><p>참가 희망 제출 후 방송 일정과 출품 내용은 출품 관리에서 확인해 주세요.</p></div><div class="season-decline-confirm" hidden><label><input type="checkbox"> 이번 시즌 불참 및 자리 충원 안내를 확인했습니다.</label><p>불참해도 기존 정산·배송 내역은 유지됩니다. 제출 후 변경은 운영자에게 문의해 주세요.</p></div><p class="season-error" role="alert"></p><div class="season-actions"><button type="button" data-season-decline>이번 시즌 불참</button><button type="button" data-season-accept class="season-primary">참가 희망</button></div><button type="button" data-season-later class="season-later">나중에 응답</button>';
  document.body.append(dialog);dialog.showModal();
  const close=()=>{if(!seasonBusy)dialog.close();};dialog.querySelector('[data-season-close]').onclick=close;dialog.querySelector('[data-season-later]').onclick=close;
  dialog.addEventListener('cancel',e=>{if(seasonBusy)e.preventDefault();});
  dialog.addEventListener('close',()=>seasonHost?.querySelector('button')?.focus({preventScroll:true}));
  const title=dialog.querySelector('h2'),description=dialog.querySelector('#vendor-season-description'),actions=dialog.querySelector('.season-actions'),confirmation=dialog.querySelector('.season-decline-confirm'),originalDescription=description.innerHTML;
  let selectedAction=null;
  const choose=action=>{
   if(seasonBusy)return;selectedAction=action;dialog.querySelector('.season-error').textContent='';confirmation.querySelector('input').checked=false;
   const declined=action==='declined';confirmation.hidden=!declined;
   title.textContent=action?(declined?'이번 시즌 불참으로 제출할까요?':'참가 희망으로 제출할까요?'):s.title;
   description.innerHTML=action?'<p>'+(declined?'불참으로 제출하면 빈자리는 다른 업체로 충원됩니다. 이후 시즌 재참여는 잔여 자리와 운영 일정에 따라 제한될 수 있습니다.':'11월 전국크레자랑 참가 희망으로 제출합니다. 방송 일정과 출품 내용은 출품 관리에서 확인해 주세요.')+'</p><p>제출 후 응답 변경은 운영자에게 문의해 주세요.</p>':originalDescription;
   actions.innerHTML=action?'<button type="button" data-season-back>돌아가기</button><button type="button" data-season-submit class="season-primary">'+(declined?'불참 제출':'참가 희망 제출')+'</button>':'<button type="button" data-season-decline>이번 시즌 불참</button><button type="button" data-season-accept class="season-primary">참가 희망</button>';
   if(action){actions.querySelector('[data-season-back]').onclick=()=>choose(null);actions.querySelector('[data-season-submit]').onclick=()=>submit(selectedAction);actions.querySelector('[data-season-back]').focus();}
   else{actions.querySelector('[data-season-accept]').onclick=()=>choose('accepted');actions.querySelector('[data-season-decline]').onclick=()=>choose('declined');actions.querySelector('[data-season-accept]').focus();}
  };
  const submit=async action=>{
   if(seasonBusy||!action||action!==selectedAction)return;const error=dialog.querySelector('.season-error');error.textContent='';
   if(action==='declined'){
    if(!confirmation.querySelector('input').checked){error.textContent='자리 충원 안내를 확인한 뒤 체크해 주세요.';confirmation.querySelector('input').focus();return;}
   }
   seasonBusy=true;dialog.setAttribute('aria-busy','true');dialog.querySelectorAll('button,input').forEach(b=>b.disabled=true);
   try{const result=await seasonWrite(action,action==='declined');if(generation!==seasonGeneration)return;seasonState=result;seasonBanner();dialog.close();seasonHost?.focus({preventScroll:true});}
   catch(e){if(generation===seasonGeneration)error.textContent=e.name==='TimeoutError'||e instanceof TypeError?'저장 결과를 확인하지 못했어요. 연결을 확인한 뒤 같은 선택으로 다시 제출해 주세요.':e.message;}
   finally{seasonBusy=false;dialog.removeAttribute('aria-busy');dialog.querySelectorAll('button,input').forEach(b=>b.disabled=false);}
  };
  dialog.querySelector('[data-season-accept]').onclick=()=>choose('accepted');dialog.querySelector('[data-season-decline]').onclick=()=>choose('declined');
 }
 async function showSeason(company,status){
  const s=status.seasonResponse;if(!company||!s?.visible){clearSeason();return;}
  if(seasonCompany!==company)clearSeason();
  seasonCompany=company;if(!seasonBusy&&(!seasonState||seasonState.status==='pending'))seasonState=s;
  const main=document.getElementById('main')||document.querySelector('main');if(!main)return;
  if(!seasonHost?.isConnected){seasonHost=document.createElement('section');seasonHost.className='vendor-season-notice';seasonHost.tabIndex=-1;seasonHost.setAttribute('aria-label','시즌 참가 여부');main.prepend(seasonHost);}
  seasonBanner();
  if(!s.open||!s.canRespond||s.status!=='pending'||s.seenAt||seasonClaiming||document.querySelector('dialog[open]'))return;
  seasonClaiming=true;const generation=seasonGeneration;
  try{const result=await seasonWrite('seen');if(generation!==seasonGeneration)return;seasonState=result;seasonBanner();if(result.show)openSeason();}
  catch{ /* The persistent banner remains usable when the one-time claim fails. */ }
  finally{seasonClaiming=false;}
 }
 function showPromoNotice(nav,status){
  if(currentSection()==='promo')return;
  const main=document.getElementById('main')||document.querySelector('#app > main');if(!main)return;
  let host=document.getElementById('vendor-promo-notice');
   if(!host){host=document.createElement('section');host.id='vendor-promo-notice';host.setAttribute('aria-label','홍보 게시 일정');main.append(host);}
  const company=new URLSearchParams(location.search).get('company')||new URLSearchParams(location.search).get('portal')||nav.dataset.company;
  renderPromo(host,company,status);
 }
 function promoMarkup(company,status){
  if(!company)return '';
  const base='/promo-center.html?company='+encodeURIComponent(company);
  if(status.promoUnavailable)return '<h2>홍보 일정을 불러오지 못했어요</h2><p>다시 확인하거나 홍보 관리에서 일정을 확인해 주세요.</p><div class="vendor-promo-actions"><a class="vendor-promo-action" href="'+base+'">홍보 관리 열기</a><button type="button" data-promo-retry>다시 확인</button></div>';
  const next=status.promoSummary?.next;
   if(!next)return '';
  const title=next.status==='overdue'?'홍보글 게시 확인이 필요해요':next.isToday?'오늘 홍보글 게시 대상입니다':'홍보글 게시 일정이 배정됐어요';
  const date=next.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$2월 $3일');
  const hint=next.status==='overdue'?'배정 시간이 지났어요. 이미 게시했다면 글 링크를 등록해 주세요.':'이 시간 안에 카페에 게시하고, 글 링크로 완료를 등록해 주세요.';
  return '<p class="vendor-promo-eyebrow">전국크레자랑 · 홍보 게시 일정</p><h2>'+title+'</h2><p class="vendor-promo-date">'+esc(date)+' · '+esc(next.slotLabel)+' '+esc(next.start)+'–'+esc(next.end)+'</p><p class="vendor-promo-manuscript">'+esc(next.title)+'</p><p>'+hint+'</p><div class="vendor-promo-actions"><a class="vendor-promo-action" href="'+base+'&assignment='+encodeURIComponent(next.id)+'">배정 원고 열기</a><a class="vendor-promo-action" href="'+base+'&view=templates">전체 원고 보기·복사</a>'+(status.promoSummary.pendingCount>1?'<span>미완료 일정 '+status.promoSummary.pendingCount+'건</span>':'')+'</div>';
 }
 function renderPromo(host,company,status){
  host.dataset.company=company;host.className='vendor-promo-notice';host.innerHTML=promoMarkup(company,status);host.hidden=!host.innerHTML;
  host.querySelector('[data-promo-retry]')?.addEventListener('click',()=>mountPromo(host,company));
 }
 const promoVersions=new WeakMap();
 async function mountPromo(host,company){
  if(!host||!company)return;
  const previousCompany=host.dataset.company;
  host.dataset.company=company;const version=(promoVersions.get(host)||0)+1;promoVersions.set(host,version);
  const current=()=>host.isConnected&&host.dataset.company===company&&promoVersions.get(host)===version;
  if(host.hidden||previousCompany!==company)renderPromo(host,company,{});
  host.setAttribute('aria-busy','true');
  try{
   const response=await fetch('/api/platform/vendor-access/tasks?company='+encodeURIComponent(company),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('unavailable');const data=await response.json();if(current()){renderPromo(host,company,data);globalThis.CreoVendorShell?.showSeason(company,data);}
  }catch{if(current())renderPromo(host,company,{promoUnavailable:true});}
  finally{if(current())host.removeAttribute('aria-busy');}
 }
 const refreshVersions=new WeakMap();
 async function refreshAttention(nav){
  const q=new URLSearchParams(location.search),company=q.get('company')||q.get('portal')||nav.dataset.company;
  if(!company)return;
  const version=(refreshVersions.get(nav)||0)+1;refreshVersions.set(nav,version);
  const current=()=>nav.isConnected&&refreshVersions.get(nav)===version;
  try{const response=await fetch('/api/platform/vendor-access/tasks?company='+encodeURIComponent(company),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('unavailable');const data=await response.json();if(current())applyAttention(nav,data);}catch{if(current())showTaskFailure(nav);}
 }
 function showTaskFailure(nav){
  let message=document.getElementById('vendor-task-error');
  if(!message){message=document.createElement('p');message.id='vendor-task-error';message.setAttribute('role','status');message.className='vendor-task-error';nav.before(message);}
  message.innerHTML='할 일을 불러오지 못했어요. <button type="button">다시 확인</button>';message.hidden=false;
  message.querySelector('button').onclick=()=>refreshAttention(nav);
 }
 function clear(nav){clearSeason();nav?.classList.remove('vendor-portal-nav');document.documentElement.classList.remove('vendor-shell-pending');document.body.classList.remove('national-vendor-shell','has-vendor-header');document.getElementById('vendor-shared-header')?.remove();}
 function refreshTasks(){const nav=document.querySelector('.vendor-portal-nav');if(nav)refreshAttention(nav);else{const host=document.getElementById('vendor-promo-notice');if(host?.dataset.company)mountPromo(host,host.dataset.company);}}
 global.addEventListener('vendor-tasks-changed',refreshTasks);
 global.addEventListener('focus',refreshTasks);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTasks();});
 global.CreoVendorShell={mount,clear,header,applyAttention,refreshAttention,mountPromo,showSeason};
 // Keep the same header and page width before and after the first API response.
 function boot(){if(document.documentElement.classList.contains('vendor-shell-pending')){document.body.classList.add('national-vendor-shell');header();}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);

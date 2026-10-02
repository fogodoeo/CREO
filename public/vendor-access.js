(() => {
 'use strict';
 const $=id=>document.getElementById(id),q=new URLSearchParams(location.search),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=p=>String(p||'').replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3');
 let state,screen='login',busy=false,company=q.get('company')||'',profile,otp,registration={},joinCompany,searchSequence=0,directoryRegion='';
 const field=(label,id,attrs='')=>`<label class="field" for="${id}">${label}<input id="${id}" ${attrs}></label>`;
 const heading=(title,sub='')=>`<div class="intro"><h1>${title}</h1>${sub?`<p class="muted">${sub}</p>`:''}</div>`;
 const action=(id,text,cls='primary')=>`<button type="button" id="${id}" class="${cls}">${text}</button>`;
 function error(message){const el=$($('editor').open?'editor-error':$('register-error')?'register-error':'page-error');el.textContent=message||'';el.hidden=!message;if(!message&&$('page-error'))$('page-error').hidden=true;}
 async function request(route,body){const res=await fetch('/api/platform/vendor-access/'+route,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','x-vendor-csrf':state?.csrfToken||''},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||'다시 시도해 주세요.'),{status:res.status,existingCompany:data.existingCompany});return data;}
 async function run(work){if(busy)return;busy=true;error('');document.body.setAttribute('aria-busy','true');document.querySelectorAll('button,input,select').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});let invalid;try{await work();}catch(e){if(!state){state={};go('unavailable');}error(e.name==='TimeoutError'||e instanceof TypeError?'연결을 확인하고 다시 시도해 주세요.':e.message);if(e.status===422&&['phone','verify'].includes(screen)){invalid=$(screen==='phone'?'phone':'otp-code');invalid?.setAttribute('aria-invalid','true');invalid?.setAttribute('aria-describedby','page-error');}}finally{busy=false;document.body.removeAttribute('aria-busy');document.querySelectorAll('[data-was-disabled]').forEach(el=>{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;});invalid?.focus();}}
 function go(next){screen=next;error('');render();$(next==='verify'?'otp-code':next==='phone'?'phone':'main')?.focus({preventScroll:true});window.scrollTo(0,0);}
 async function refresh(){state=await request('session');return state;}
 async function navigate(section='booking',id=company){const data=await request('select',{id});const params=new URLSearchParams({event:'national-cre',token:data.token,portal:id});if(section==='profile'){location.href='/vendor-access.html?section=profile&company='+encodeURIComponent(id);return;}if(section==='entries')params.set('section','entries');location.href=(section==='booking'?'/vendor-broadcast.html':section==='settlement'?'/vendor-checkout.html':'/vendor-entries.html')+'?'+params;}
 async function enter(){await refresh();if(!state.available){go('unavailable');return;}if(!state.authenticated){go('login');return;}if(state.phoneVerificationRequired){go('verify-required');return;}if(q.get('section')==='profile'&&state.companies.some(c=>c.id===company)){await loadProfile();return;}if(state.companies.length===1){company=state.companies[0].id;await navigate();return;}if(state.companies.length){go('companies');return;}if(state.requests.length){go('pending');return;}await openDirectory();}
 async function loadProfile(){profile=await request('profile',{companyId:company});go('profile');}
 function bind(id,fn){if($(id))$(id).onclick=()=>run(fn);}
 function form(id,fn){if($(id))$(id).onsubmit=e=>{e.preventDefault();run(fn);};}
 function render(){
  $('back').hidden=['login','profile','companies','directory','verify-required','unavailable'].includes(screen)&&!(screen==='directory'&&state.companies.length);$('account').hidden=!state?.authenticated;$('main').classList.toggle('has-nav',screen==='profile');$('main').classList.toggle('login-screen',screen==='login');document.querySelector('.portal-nav')?.remove();
  if(screen!=='profile')window.CreoVendorShell?.clear();
  const html={
   directory:()=>heading('업체를 선택해 주세요')+`<label class="field" for="directory-region">지역<select id="directory-region"><option value="">지역 선택</option>${state.regions.map(r=>`<option ${r===directoryRegion?'selected':''}>${esc(r)}</option>`).join('')}</select></label><div id="directory-results" class="result-list" aria-live="polite"></div>`+(state.preregisteredOnly?'':`<div class="register-option"><span>업체가 없나요?</span>${action('new-company','새 업체 등록','text-button')}</div>`),
   unavailable:()=>heading('접속을 준비하고 있어요','잠시 후 다시 열어 주세요.')+action('retry','다시 확인'),
   login:()=>heading('업체 로그인')+`<div class="login-actions">${state.kakaoAvailable?`<form id="kakao-form" method="post" action="/api/platform/buyer-account/start"><input type="hidden" name="returnTo" value="vendor"><button class="kakao"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.3 4.8 6.7l-1.1 4 4.6-2.8 1.7.1c5.5 0 10-3.6 10-8S17.5 3 12 3Z"/></svg>카카오로 시작하기</button></form>`:''}${state.smsAvailable?action('phone-login','전화번호로 로그인',state.kakaoAvailable?'secondary':'primary'):'<p class="muted">문자 로그인을 준비 중이에요. 잠시 후 다시 시도해 주세요.</p>'}<label class="check"><input id="remember" type="checkbox" checked>로그인 유지</label></div>`,
   phone:()=>heading('전화번호로 로그인')+`<form id="phone-form">${field('휴대전화 번호','phone','type="tel" inputmode="tel" autocomplete="tel-national" placeholder="010-0000-0000" maxlength="13" required')}<div class="actions"><button class="primary">인증번호 받기</button></div></form>`,
   verify:()=>heading('인증번호를 입력해 주세요',esc(fmt(otp.phone))+'로 문자를 보냈어요')+`<form id="verify-form">${field('인증번호','otp-code','type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required')}<p class="field-note" id="otp-time"></p><div class="actions"><button class="primary">확인</button>${action('resend','인증번호 다시 받기','text-button')}</div></form>`,
   choice:()=>heading('어떻게 시작할까요?')+`<button id="new-company" class="choice"><span><strong>업체 등록하기</strong><small>처음 참여하는 업체예요</small></span><span class="chevron">›</span></button><button id="find-company" class="choice"><span><strong>직원으로 참여하기</strong><small>등록된 업체와 함께 관리해요</small></span><span class="chevron">›</span></button>`,
   register:()=>heading('새 업체 등록')+`<form id="register-form">${field('업체명','company-name',`value="${esc(registration.name||'')}" maxlength="40" autocomplete="organization" required`)}<label class="field" for="region">지역<select id="region" required><option value="">지역 선택</option>${state.regions.map(r=>`<option ${registration.region===r?'selected':''}>${esc(r)}</option>`).join('')}</select></label>${field('업체 연락처','contact',`type="tel" inputmode="tel" value="${esc(registration.phone||state.phone||'')}" maxlength="13" autocomplete="tel-national" required`)}<p class="field-note">낙찰·예약 연락을 받을 번호</p><p id="register-error" class="error" role="alert" hidden></p><div id="register-recovery"></div><div class="actions"><button id="register-submit" class="primary">등록하기</button></div></form>`,
   search:()=>heading('함께할 업체를 찾아주세요')+`<form id="search-form">${field('업체명','search','type="search" placeholder="업체명 검색" maxlength="40" required')}<div class="actions"><button class="secondary">검색</button></div></form><div id="search-results" class="result-list" aria-live="polite"></div>`,
   join:()=>heading(esc(joinCompany.name)+'에<br>참여할까요?',esc(joinCompany.region))+`<form id="join-form">${field('이름','staff-name','autocomplete="name" placeholder="대표가 알아볼 수 있는 이름" maxlength="40" required')}<div class="actions"><button class="primary">참여 요청하기</button></div></form>`,
   pending:()=>`<div class="pending-mark" aria-hidden="true">✓</div>`+heading('대표의 승인을 기다려요',esc(state.requests[0]?.name||'업체')+'에 참여를 요청했어요')+`<div class="actions">${action('check-approval','승인 확인')}${action('cancel-join','요청 취소','text-button')}</div>`,
   'verify-required':()=>heading('전화번호를 확인해 주세요')+action('verify-phone','전화번호 인증'),
   companies:()=>heading('업체를 선택해 주세요')+state.companies.map(c=>`<button class="result" data-company="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.region)}</small></span><span class="chevron">›</span></button>`).join('')+action('other-company','다른 업체 찾기','text-button'),
   profile:()=>profileHtml()
  };
  $('main').innerHTML=(html[screen]||html.login)();
  if(['login','phone','register','join','profile','choice','directory'].includes(screen)){
   const footer=document.createElement('div');footer.className='privacy-links';
   footer.innerHTML='<a href="/vendor-privacy.html" target="_blank" rel="noopener">개인정보처리방침<span class="sr-only"> (새 창)</span></a><a href="tel:01049278600">문의</a>';
   $('main').append(footer);
  }
  if(screen==='join'){
   const consent=document.createElement('div');consent.className='privacy-consent';
   consent.innerHTML=`<p>${esc(joinCompany.name)} 대표에게 이름과 로그인 번호를 제공해요. 참여 승인·소속 관리에 사용하며 소속 관리가 끝나거나 동의를 철회할 때까지 이용해요. 거부하면 참여 요청을 보낼 수 없어요.</p><label class="check"><input id="sharing-consent" type="checkbox" required>개인정보 제공에 동의해요 (필수)</label>`;
   $('join-form').querySelector('.actions').before(consent);
  }
  bind('retry',enter);bind('phone-login',()=>{sessionStorage.setItem('vendor-remember',String($('remember').checked));go('phone');});
  bind('verify-phone',()=>go('phone'));
  bind('other-company',openDirectory);
  if($('directory-region'))$('directory-region').onchange=()=>run(loadDirectory);
  if($('kakao-form'))$('kakao-form').onsubmit=()=>{sessionStorage.setItem('vendor-remember',String($('remember').checked));};
  form('phone-form',async()=>{await sendOtp($('phone').value,'login');});
  form('verify-form',async()=>{const data=await request('verify',{challenge:otp.challenge,code:$('otp-code').value,remember:sessionStorage.getItem('vendor-remember')!=='false'});if(otp.purpose==='login'){await enter();}else{registration.proof=data.proof;registration.verifiedPhone=otp.phone;go('register');}});
  bind('resend',()=>sendOtp(otp.phone,otp.purpose));bind('new-company',()=>{registration={region:directoryRegion,requestId:crypto.randomUUID()};go('register');});bind('find-company',()=>go('search'));
  if($('contact')){$('contact').oninput=()=>{$('register-submit').textContent=needsContactVerification($('contact').value.replace(/[\s-]/g,''))?'연락처 인증':'등록하기';};$('contact').oninput();}
  form('register-form',async()=>{
   const phone=$('contact').value.replace(/[\s-]/g,'');registration={...registration,name:$('company-name').value.trim(),region:$('region').value,phone};directoryRegion=registration.region;
   try{
    if(needsContactVerification(phone)){await sendOtp(phone,'register');return;}
    const result=await request('register',registration);company=result.id;await navigate();
   }catch(e){
    if(screen==='register'&&e.existingCompany){$('register-recovery').innerHTML=action('existing-company','기존 업체 선택','secondary');bind('existing-company',()=>openDirectory(e.existingCompany.region));}
    if(screen==='register'&&e.status===422){delete registration.proof;delete registration.verifiedPhone;$('contact').oninput();}
    throw e;
   }
  });
  form('search-form',async()=>{const seq=++searchSequence,data=await request('search?q='+encodeURIComponent($('search').value.trim()));if(seq!==searchSequence||screen!=='search')return;$('search-results').innerHTML=data.companies.length?data.companies.map(c=>`<button class="result" data-join="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.region)}</small></span><span class="chevron">›</span></button>`).join(''):'<p class="empty">등록된 업체를 찾지 못했어요</p>';for(const b of document.querySelectorAll('[data-join]'))b.onclick=()=>{joinCompany=data.companies.find(c=>c.id===b.dataset.join);go('join');};});
  form('join-form',async()=>{await request('join',{companyId:joinCompany.id,name:$('staff-name').value.trim(),sharingConsent:$('sharing-consent').checked});await refresh();go('pending');});
  bind('check-approval',enter);bind('cancel-join',async()=>{await request('join-response',{id:state.requests[0].id,action:'cancel'});await refresh();await openDirectory();});
  for(const b of document.querySelectorAll('[data-company]'))b.onclick=()=>run(()=>navigate('booking',b.dataset.company));
  if(screen==='profile')bindProfile();if(screen==='verify'){tick();$('otp-code').focus();}
 }
 function needsContactVerification(phone){return phone!==state.phone&&registration.verifiedPhone!==phone;}
 async function openDirectory(region=directoryRegion){directoryRegion=region;go('directory');if(directoryRegion)await loadDirectory();}
 async function loadDirectory(){
  const region=$('directory-region').value,host=$('directory-results');
  directoryRegion=region;
  if(!region){host.replaceChildren();return;}
  host.textContent='업체를 불러오는 중…';
  try{
   const data=await request('search?region='+encodeURIComponent(region));
   host.innerHTML=data.companies.length?data.companies.map(c=>`<button class="result" data-directory="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${c.connected?'연결된 업체':c.canClaim?'대표로 시작':c.canJoin?'직원 참여 요청':'대표 연결 전'}</small></span><span class="chevron" aria-hidden="true">›</span></button>`).join(''):'<p class="empty">등록된 업체가 없어요.</p>';
   for(const button of host.querySelectorAll('[data-directory]'))button.onclick=()=>run(async()=>{
    const selected=data.companies.find(c=>c.id===button.dataset.directory);
    if(selected.connected){await navigate('booking',selected.id);return;}
    if(selected.canClaim){await request('claim',{id:selected.id});company=selected.id;await navigate();return;}
    if(!selected.canJoin)throw Error('등록된 대표 번호로 먼저 로그인해 주세요. 번호가 다르면 운영자에게 문의해 주세요.');
    joinCompany=selected;go('join');
   });
  }catch(e){host.innerHTML=action('directory-retry','다시 불러오기','secondary');bind('directory-retry',loadDirectory);throw e;}
 }
 async function sendOtp(phone,purpose){const data=await request('otp',{phone,purpose});otp={...data,phone:phone.replace(/[\s-]/g,''),purpose,sentAt:Date.now()};go('verify');}
 function tick(){if(screen!=='verify'||!$('otp-time'))return;const seconds=Math.max(0,180-Math.floor((Date.now()-otp.sentAt)/1000));$('otp-time').textContent=seconds?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} 안에 입력해 주세요`:'인증번호가 만료됐어요. 다시 받아 주세요.';$('resend').disabled=Date.now()-otp.sentAt<60000||busy;}
 setInterval(tick,1000);
 function profileHtml(){const owner=profile.role==='owner';return `<div class="profile-title">${heading('업체 정보')}</div><dl class="profile-rows"><div class="profile-row"><div><dt>업체명</dt><dd>${esc(profile.name)}</dd></div></div><div class="profile-row"><div><dt>지역</dt><dd>${esc(profile.region)}</dd></div></div><div class="profile-row"><div><dt>업체 연락처</dt><dd>${esc(fmt(profile.phone))}</dd></div>${owner?action('edit-contact','변경','text-button'):''}</div>${owner?`<div class="profile-row"><div><dt>정산 계좌</dt><dd>${profile.bankAccount?`${esc(profile.bankName)} ${esc(profile.bankAccount)}<small>${esc(profile.bankHolder)}</small>`:'등록해 주세요'}</dd></div>${action('edit-bank',profile.bankAccount?'변경':'등록','text-button')}</div>`:''}</dl>${owner?`<section class="group"><h2>직원 관리</h2>${profile.requests.map(r=>`<div class="request"><p>${esc(r.name)}</p><small>${esc(fmt(r.phone))} · 참여 요청</small><div class="request-actions"><button class="secondary" data-respond="reject" data-id="${esc(r.id)}">거절</button><button class="primary" data-respond="approve" data-id="${esc(r.id)}">승인</button></div></div>`).join('')}${profile.members.map(m=>`<div class="member"><span>${esc(m.name)}</span><span>${m.owner?'대표':'직원'}</span></div>`).join('')}</section>`:''}<div class="account-actions">${action('choose-company','업체 선택','text-button')}${action('refresh-profile','새로고침','text-button')}</div>`;}
 function bindProfile(){
  bind('edit-contact',()=>openEditor('contact'));bind('edit-bank',()=>openEditor('bank'));bind('refresh-profile',loadProfile);bind('choose-company',async()=>{await refresh();go('companies');});
  for(const b of document.querySelectorAll('[data-respond]'))b.onclick=()=>run(async()=>{await request('join-response',{id:b.dataset.id,action:b.dataset.respond});await loadProfile();});
  const icons=['<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18m-13 5 3 3 5-5"/>','<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/>','<path d="m4 4 2-1 3 2 3-2 3 2 3-2 2 1v17l-2-1-3 1-3-1-3 1-3-1-2 1Z"/><path d="M8 8h8M8 12h5M8 16h8"/>','<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'];
  const nav=document.createElement('nav');nav.className='portal-nav';nav.innerHTML=['booking','settlement','profile'].map(s=>`<button type="button" data-nav="${s}" data-vendor-section="${s}"></button>`).join('');document.body.append(nav);window.CreoVendorShell.mount(nav,{active:'profile'});nav.onclick=e=>{const b=e.target.closest('[data-nav]');if(b&&b.dataset.nav!=='profile')run(()=>navigate(b.dataset.nav));};
 }
 function openEditor(type){error('');$('editor-error').hidden=true;$('editor-title').textContent=type==='contact'?'업체 연락처 변경':'정산 계좌';
  $('editor-content').innerHTML=`<form id="edit-form">${type==='contact'?field('업체 연락처','edit-phone',`type="tel" inputmode="tel" value="${esc(profile.phone)}" maxlength="13" required`):field('은행','bank-name',`value="${esc(profile.bankName)}" maxlength="60" required`)+field('계좌번호','bank-account',`value="${esc(profile.bankAccount)}" inputmode="numeric" maxlength="40" required`)+field('예금주','bank-holder',`value="${esc(profile.bankHolder)}" maxlength="40" required`)}<div class="actions"><button class="primary">${type==='contact'?'인증번호 받기':'저장'}</button></div></form>`;
  $('editor').showModal();form('edit-form',async()=>{if(type==='bank'){await request('profile',{companyId:company,action:'bank',revision:profile.revision,bankName:$('bank-name').value,bankAccount:$('bank-account').value,bankHolder:$('bank-holder').value});$('editor').close();await loadProfile();return;}
   const phone=$('edit-phone').value.replace(/[\s-]/g,''),sent=await request('otp',{phone,purpose:'contact'});$('editor-content').innerHTML=`<p class="muted">${esc(fmt(phone))}로 문자를 보냈어요</p><form id="contact-verify">${field('인증번호','contact-code','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required')}<div class="actions"><button class="primary">확인하고 변경</button></div></form>`;$('contact-code').focus();form('contact-verify',async()=>{const proof=await request('verify',{challenge:sent.challenge,code:$('contact-code').value});await request('profile',{companyId:company,action:'contact',phone,proof:proof.proof,revision:profile.revision});$('editor').close();await loadProfile();});
  });
 }
 $('close-editor').onclick=()=>{if(!busy)$('editor').close();};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 function previousScreen(){
  if(screen==='phone')return 'login';
  if(screen==='verify')return otp?.purpose==='register'?'register':'phone';
  if(screen==='directory')return state?.companies?.length?'companies':'login';
  return 'companies';
 }
 $('back').onclick=()=>{if(busy)return;if(['register','join','pending','search'].includes(screen)){run(()=>openDirectory());return;}go(previousScreen());};
 $('account').onclick=()=>run(async()=>{await request('logout',{});company='';await refresh();go('login');});
 run(async()=>{await refresh();if(q.get('from')==='kakao'){await request('kakao',{remember:sessionStorage.getItem('vendor-remember')!=='false'});history.replaceState(null,'','/vendor-access.html');}await enter();if(q.has('error'))error('카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요.');});
})();

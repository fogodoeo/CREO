(function(global){
 'use strict';
 const sections=[
  ['booking','방송','<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/>'],
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
  for(const [label,href,cls,aria]of [['옹동2','/vendor-access.html','vendor-home','업체 홈'],['전국크레자랑 ⌄','/vendor-access.html?section=channels&company='+encodeURIComponent(company),'vendor-channel','채널 선택']]){const a=document.createElement('a');a.textContent=label;a.href=href;a.className=cls;a.setAttribute('aria-label',aria);host.append(a);}
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
  for(const [key,label]of sections){const link=nav.querySelector('[data-vendor-section="'+key+'"]');if(!link)continue;const needed=!!status[key+'Attention'];link.classList.toggle('portal-attention',needed);if(key==='profile')link.classList.remove('registration-required');link.setAttribute('aria-label',label+(needed?' · 확인할 일 있음':''));}
 }
 const refreshVersions=new WeakMap();
 async function refreshAttention(nav){
  const q=new URLSearchParams(location.search),company=q.get('company')||q.get('portal')||nav.dataset.company;
  if(!company)return;
  const version=(refreshVersions.get(nav)||0)+1;refreshVersions.set(nav,version);
  try{const response=await fetch('/api/platform/vendor-access/tasks?company='+encodeURIComponent(company),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const data=await response.json();if(nav.isConnected&&refreshVersions.get(nav)===version)applyAttention(nav,data);}catch{/* Keep the last known attention state; the page offers refresh. */}
 }
 function clear(nav){nav?.classList.remove('vendor-portal-nav');document.documentElement.classList.remove('vendor-shell-pending');document.body.classList.remove('national-vendor-shell','has-vendor-header');document.getElementById('vendor-shared-header')?.remove();}
 global.addEventListener('focus',()=>{const nav=document.querySelector('.vendor-portal-nav');if(nav)refreshAttention(nav);});
 document.addEventListener('visibilitychange',()=>{const nav=document.querySelector('.vendor-portal-nav');if(!document.hidden&&nav)refreshAttention(nav);});
 global.CreoVendorShell={mount,clear,header,applyAttention,refreshAttention};
 // Keep the same header and page width before and after the first API response.
 function boot(){if(document.documentElement.classList.contains('vendor-shell-pending')){document.body.classList.add('national-vendor-shell');header();}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);

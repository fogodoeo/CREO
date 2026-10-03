(function(global){
 'use strict';
 const sections=[
  ['booking','방송','<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/>'],
  ['settlement','낙찰·정산','<path d="m4 4 2-1 3 2 3-2 3 2 3-2 2 1v17l-2-1-3 1-3-1-3 1-3-1-2 1Z"/><path d="M8 8h8M8 12h5M8 16h8"/>'],
  ['profile','업체 정보','<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>']
 ];
 function header(companyName){
  const q=new URLSearchParams(location.search),company=q.get('company')||q.get('portal')||document.querySelector('.vendor-portal-nav')?.dataset.company;
  if(!company)return;
  let host=document.getElementById('vendor-shared-header');
  if(!host){host=document.createElement('header');host.id='vendor-shared-header';host.className='vendor-shared-header';document.body.prepend(host);host.addEventListener('click',event=>{if(event.target.closest('a')&&!event.ctrlKey&&!event.metaKey&&!global.dispatchEvent(new Event('vendor-before-navigation',{cancelable:true})))event.preventDefault();});}
  const name=String(companyName||document.getElementById('company-name')?.textContent||document.getElementById('vendor')?.textContent||'업체 정보');
  if(host.dataset.company===company&&host.dataset.name===name)return;
  host.dataset.company=company;host.dataset.name=name;host.replaceChildren();
  for(const [label,href,cls,aria]of [['옹동2','/vendor-access.html','vendor-home','업체 홈'],['전국크레자랑 ⌄','/vendor-access.html?section=channels&company='+encodeURIComponent(company),'vendor-channel','채널 선택'],[name,'/vendor-access.html?section=profile&company='+encodeURIComponent(company),'vendor-company','업체 정보 · '+name]]){const a=document.createElement('a');a.textContent=label;a.href=href;a.className=cls;a.setAttribute('aria-label',aria);host.append(a);}
  document.body.classList.add('has-vendor-header');
 }
 function mount(nav,{active,companyName}={}){
  if(!nav)return;
  document.body.classList.add('national-vendor-shell');nav.classList.add('vendor-portal-nav');nav.setAttribute('aria-label','업체 메뉴');
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
 function clear(nav){nav?.classList.remove('vendor-portal-nav');document.body.classList.remove('national-vendor-shell','has-vendor-header');document.getElementById('vendor-shared-header')?.remove();}
 global.addEventListener('focus',()=>{const nav=document.querySelector('.vendor-portal-nav');if(nav)refreshAttention(nav);});
 document.addEventListener('visibilitychange',()=>{const nav=document.querySelector('.vendor-portal-nav');if(!document.hidden&&nav)refreshAttention(nav);});
 global.CreoVendorShell={mount,clear,header,applyAttention,refreshAttention};
})(window);

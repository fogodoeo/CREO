(function(global){
 'use strict';
 const sections=[
  ['booking','방송','<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/>'],
  ['settlement','낙찰·정산','<path d="m4 4 2-1 3 2 3-2 3 2 3-2 2 1v17l-2-1-3 1-3-1-3 1-3-1-2 1Z"/><path d="M8 8h8M8 12h5M8 16h8"/>'],
  ['profile','업체 정보','<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>']
 ];
 function mount(nav,{active}={}){
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
 }
 function clear(nav){nav?.classList.remove('vendor-portal-nav');document.body.classList.remove('national-vendor-shell');}
 global.CreoVendorShell={mount,clear};
})(window);

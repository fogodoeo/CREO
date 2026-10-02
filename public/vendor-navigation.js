(() => {
  'use strict';
  const accessQuery=new URLSearchParams(location.search);
  if((accessQuery.get('token')||'').startsWith('va1.')&&!accessQuery.get('portal')){
    const header=document.querySelector('.entry-header')||document.querySelector('.top .brand');
    if(header){const link=document.createElement('a');link.href='/vendor-access.html';link.className='vendor-channel-return';link.textContent='업체 홈';link.addEventListener('click',event=>{if(!event.ctrlKey&&!event.metaKey&&!window.dispatchEvent(new Event('vendor-before-navigation',{cancelable:true})))event.preventDefault();});header.append(link);}
  }
  let nav = document.querySelector('.vendor-bottom-nav');
  const settlement = document.getElementById('vendor-event');
  if (!nav && settlement) {
    nav = document.createElement('nav'); nav.className = 'vendor-bottom-nav vendor-settlement-nav'; nav.setAttribute('aria-label', '업체 메뉴');
    nav.innerHTML = '<a data-vendor-section="entries">출품 개체</a><a data-vendor-section="settlement" aria-current="page">낙찰·정산</a><a data-vendor-section="profile">업체 정보</a>';
    document.body.append(nav);
  }
  if (!nav) return;
  const icons = {
    entries: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    settlement: '<path d="m4 4 2-1 3 2 3-2 3 2 3-2 2 1v17l-2-1-3 1-3-1-3 1-3-1-2 1Z"/><path d="M8 8h8M8 12h5M8 16h8"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
    ,booking: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18m-13 5 3 3 5-5"/>'
  };
  nav.querySelectorAll('[data-vendor-section]').forEach(link => {
    const label = link.textContent;
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[link.dataset.vendorSection] + '</svg><span></span>';
    link.lastElementChild.textContent = label;
    link.dataset.label = label;
  });
  const profileRequired = profile => ['phone','bankName','bankAccount','bankHolder'].some(key => !String(profile?.[key] || '').trim());
  const updateStatus = status => {
    if (status.bookingSummary) configureBooking(status.bookingSummary);
    for (const section of ['entries','profile']) {
      const key = section + 'Required';
      if (typeof status[key] !== 'boolean') continue;
      const link = nav.querySelector(`[data-vendor-section="${section}"]`);
      if (!link) continue;
      link.classList.toggle('registration-required', status[key]);
      if (status[key]) link.setAttribute('aria-label', link.dataset.label + ' · 등록 필요');
      else link.removeAttribute('aria-label');
    }
  };
  function configureBooking(summary, href) {
    nav.classList.remove('national-cycle-nav');nav.querySelector('[data-vendor-section="entries"]')?.removeAttribute('hidden');
    let link = nav.querySelector('[data-vendor-section="booking"]');
    if (!summary?.enabled) { link?.remove(); nav.classList.remove('has-booking'); return; }
    document.querySelectorAll('[data-ongdong-brand]').forEach(el=>{el.removeAttribute('data-ongdong-brand');el.classList.remove('ongdong-brand');el.textContent='전국크레자랑';});
    document.title=document.title.replace('옹동2','전국크레자랑');
    const footer=document.querySelector('.entry-footer');if(footer)footer.textContent='전국크레자랑';
    if(new URLSearchParams(location.search).get('portal')){const switcher=document.querySelector('.event-switcher');if(switcher)switcher.hidden=true;}
    if (!link) {
      link=document.createElement('a');link.dataset.vendorSection='booking';link.dataset.label='방송 예약';
      link.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons.booking+'</svg><span>방송 예약</span><b class="vendor-nav-count" hidden></b>';
      nav.prepend(link);
    }
    if(href)link.href=href;
    else {
      const query=new URLSearchParams(location.search),short=/^\/(?:w|v)\/([A-Za-z0-9_-]{8,24})$/.exec(location.pathname);
      const code=query.get('code')||short?.[1]||'',token=query.get('token')||'';
      link.href='/vendor-bookings.html?'+new URLSearchParams({event:settlement?.value||query.get('event')||'',...(code?{code}:{token}),...(query.get('portal')?{portal:query.get('portal')}:{})});
    }
    const count=Math.max(0,Number(summary.pendingCount)||0), badge=link.querySelector('.vendor-nav-count');
    badge.hidden=!count;badge.textContent=String(count);badge.setAttribute('aria-hidden','true');
    link.setAttribute('aria-label',count?`방송 예약 · 응답할 변경 요청 ${count}건`:'방송 예약');
    nav.classList.add('has-booking');
    if(summary.mode==='regional-cycle-v1'){
      nav.classList.add('national-cycle-nav');nav.querySelector('[data-vendor-section="entries"]')?.setAttribute('hidden','');
      link.dataset.label='방송';link.querySelector('span').textContent='방송';link.setAttribute('aria-label',count?'방송 · 개체 등록 필요':'방송');
      link.href=link.href.replace('/vendor-bookings.html','/vendor-broadcast.html');
    }
  }
  window.CreoVendorNavigation = { updateStatus, profileRequired, configureBooking };
  if (!settlement) return;
  const preview = nav.classList.contains('vendor-preview-nav');
  let info = document.getElementById('vendor-info-prompt');
  if (!info) {
    info = document.createElement('a'); info.id = 'vendor-info-prompt'; info.className = 'vendor-info-prompt'; info.textContent = '연락처·계좌 등록하기 ›'; info.hidden = true;
    document.getElementById('vendor')?.after(info);
  }
  const update = () => {
    const query = new URLSearchParams(location.search);
    const event = settlement.value || query.get('event') || (preview ? 'preview-previous' : '');
    const short = /^\/(?:w|v)\/([A-Za-z0-9_-]{8,24})$/.exec(location.pathname);
    const code = query.get('code') || short?.[1] || (preview ? 'preview-bank' : '');
    const token = query.get('token') || '';
    nav.hidden = document.getElementById('app')?.hidden !== false;
    const destination = section => {
      const params = new URLSearchParams({ event, ...(code ? { code } : { token }) });
      if(query.get('portal')){params.set('portal',query.get('portal'));if(section==='profile')return '/vendor-access.html?section=profile&company='+encodeURIComponent(query.get('portal'));}
      if (section === 'booking') return (nav.classList.contains('national-cycle-nav')?'/vendor-broadcast.html?':'/vendor-bookings.html?') + params;
      if (section === 'settlement') return '/vendor-checkout.html?' + params;
      params.set('section', section); return (preview ? '/entry-preview/' : '/vendor-entries.html') + '?' + params;
    };
    nav.querySelectorAll('a[data-vendor-section]').forEach(link => {
      link.href = destination(link.dataset.vendorSection);
    });
    info.href = destination('profile');
    info.hidden = !!query.get('portal') || nav.hidden || !nav.querySelector('[data-vendor-section="profile"]').classList.contains('registration-required');
  };
  for (const event of ['pointerdown', 'focusin', 'click']) nav.addEventListener(event, update);
  const guard = event => { if (!event.target.closest('a') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; if (!window.dispatchEvent(new Event('vendor-before-navigation', { cancelable: true }))) event.preventDefault(); };
  nav.addEventListener('click', guard); info.addEventListener('click', guard);
  new MutationObserver(update).observe(settlement, { childList: true });
  new MutationObserver(update).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['hidden'] });
  update();
})();

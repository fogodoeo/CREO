(() => {
  'use strict';
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
  };
  nav.querySelectorAll('[data-vendor-section]').forEach(link => {
    const label = link.textContent;
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[link.dataset.vendorSection] + '</svg><span></span>';
    link.lastElementChild.textContent = label;
  });
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
      if (section === 'settlement') return '/vendor-checkout.html?' + params;
      params.set('section', section); return (preview ? '/entry-preview/' : '/vendor-entries.html') + '?' + params;
    };
    nav.querySelectorAll('a[data-vendor-section]').forEach(link => {
      link.href = destination(link.dataset.vendorSection);
    });
    info.href = destination('profile');
    info.hidden = nav.hidden || ['vendor-phone','vendor-bank','vendor-account','vendor-holder'].every(id => document.getElementById(id)?.value.trim());
  };
  for (const event of ['pointerdown', 'focusin', 'click']) nav.addEventListener(event, update);
  const guard = event => { if (!event.target.closest('a') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; if (!window.dispatchEvent(new Event('vendor-before-navigation', { cancelable: true }))) event.preventDefault(); };
  nav.addEventListener('click', guard); info.addEventListener('click', guard);
  new MutationObserver(update).observe(settlement, { childList: true });
  new MutationObserver(update).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['hidden'] });
  update();
})();

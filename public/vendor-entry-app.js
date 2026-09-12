(async function () {
  'use strict';
  const Store = window.EntryPreviewStore, $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uuid = () => crypto.randomUUID();
  const role = Store.live ? 'vendor' : new URLSearchParams(location.search).get('role') || 'vendor';
  let eventId = new URLSearchParams(location.search).get('event') || Store.CHANNEL;
  const previewCode = Store.live ? Store.code : new URLSearchParams(location.search).get('code') || 'preview-bank';
  let section = new URLSearchParams(location.search).get('section') || 'home', profile = null, profileDirty = false;
  let profilePromptShown = false, profilePopupForSubmit = false, profileReturnFocus = null, leaveProfileOnly = false;
  const profilePromptKey = () => 'ongdong-entry-profile-prompt-v1:' + Store.VENDOR + ':' + previewCode;
  const profileReady = p => Boolean(p?.phone && p.bankRegistered);
  function profilePromptSeen() { try { return profilePromptShown || localStorage.getItem(profilePromptKey()) === 'seen'; } catch { return profilePromptShown; } }
  function markProfilePromptSeen() { profilePromptShown = true; try { localStorage.setItem(profilePromptKey(), 'seen'); } catch {} }
  function editorNavigation(editing) { $('navigation').hidden = role !== 'vendor' || editing; document.body.classList.toggle('entry-editing', editing); }
  function pageUrl(target, selectedEvent = eventId) {
    if (Store.live) return Store.pageUrl(target, selectedEvent);
    const params = new URLSearchParams({ event: selectedEvent, code: previewCode });
    if (target === 'settlement') return '/vendor-checkout.html?' + params;
    params.set('section', target); return '/entry-preview/?' + params;
  }
  const sexName = { male: '수컷', female: '암컷', unknown: '미구분' };
  const statusName = { draft: '작성 중', submitted: '검토 중', changes_requested: '수정 요청', approved: '편성 완료' };
  const urls = new Map();
  let state, draft = null, dirty = false, busy = false, uploading = false, parentRole, parentDraft, parentDirty = false, parentManage = false, parentListWasEmpty = false, selectedDetail, photoSet = [], photoIndex = 0, leaveAction, noticeTimer;
  let restoringRecovery = false;
  const updates = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ongdong-entry-design-updates') : null;
  const camera = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h4l2-3h4l2 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12.5" r="4"/></svg>';
  const parents = () => state.parents.filter(p => p.vendorId === Store.VENDOR);
  const entries = () => state.entries.filter(e => e.vendorId === Store.VENDOR && e.channelId === eventId);
  const currentEvent = () => (state.events || []).find(e => e.id === eventId);
  function toast(text) { clearTimeout(noticeTimer); $('notice').textContent = text; noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, 3000); }
  function errorAt(id, text) { const el = $(id); if (!el) { if (text) toast(text); return; } el.textContent = text || ''; el.hidden = !text; }
  function avatar(id, fallback) { return id ? `<img class="avatar" data-media-id="${esc(id)}" alt="" loading="lazy">` : `<span class="avatar initial" aria-hidden="true">${esc(fallback)}</span>`; }
  function photoUrl(id, large = false) {
    const media = state.media.find(m => m.id === id);
    if (media?.url) {
      try {
        const url = new URL(large ? media.url : media.thumbnailUrl || media.url, location.origin);
        if (url.origin === location.origin || (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co'))) return url.href;
      } catch {}
      return '';
    }
    const key = `${id}:${large}`;
    if (!urls.has(key)) { const m = state.media.find(m => m.id === id); if (m) urls.set(key, URL.createObjectURL(large ? m.blob : m.thumb)); }
    return urls.get(key) || '';
  }
  function images(container) {
    container.querySelectorAll('[data-media-id]').forEach(img => { img.src = photoUrl(img.dataset.mediaId); });
    container.querySelectorAll('[data-photo]').forEach(button => {
      button.onclick = () => openPhotos(JSON.parse(button.dataset.photo), button.dataset.photoTitle || '개체 사진');
    });
  }
  function blankEntry() { return { id: uuid(), name: '', code: '', morph: '', sex: 'unknown', weight: '', size: '', hatchDate: '', note: '', sireId: '', damId: '', photoIds: [], version: 0, status: 'draft' }; }
  async function send(command) {
    const result = await Store.send({ channelId: eventId, ...command, requestId: command.requestId || uuid() });
    state = result.state; updates?.postMessage({ version: state.version }); return result.result;
  }
  function displaySource(entry) { return role === 'buyer' ? entry.approved || entry.submission || entry : entry.submission || (entry.status === 'approved' ? entry.approved : null) || entry; }
  function keepDraft() {
    if (restoringRecovery || !Store.recovery || ((!draft || !dirty) && !parentDirty)) return;
    let parent = null;
    if (parentDirty && parentDraft && $('parent-form')) {
      parent = { ...parentDraft };
      for (const key of ['name','code','morph']) parent[key] = $('parent-' + key).value;
      parent.sex = document.querySelector('[name=parentSex]:checked')?.value || parent.sex;
    }
    Store.recovery.save({ entry: draft ? structuredClone(readDraft()) : null, parent, parentRole, parentManage, updatedAt: Date.now() })
      .catch(error => errorAt($('parent-dialog').open ? 'parent-error' : 'entry-error', error.message));
  }
  function ownParents(slot = parentRole) { return parentManage ? parents() : parents().filter(p => p.sex === (slot === 'sire' ? 'male' : 'female')); }
  function setContext() {
    $('context').textContent = Store.live ? state?.vendor?.name || '업체' : role === 'review' ? '운영자 미리보기' : role === 'buyer' ? '구매자 미리보기' : '미리보기 업체';
    if (role !== 'vendor') $('navigation').hidden = true;
    document.title = `${role === 'review' ? '출품 검토' : role === 'buyer' ? '개체 확인' : '출품 개체'} · 옹동2`;
  }
  function eventControls() {
    if (!currentEvent()) eventId = state.channelId || Store.CHANNEL;
    $('entry-event').innerHTML = state.events.map(e => `<option value="${esc(e.id)}" ${e.id === eventId ? 'selected' : ''}>${esc(e.name)}${e.date ? ' · ' + esc(e.date.slice(5).replace('-', '/')) : ''}${e.entriesOpen ? '' : ' · 접수 마감'}</option>`).join('');
    $('entry-event').disabled = busy || uploading;
    const links = $('navigation').querySelectorAll('a');
    links[0].href = pageUrl('entries'); links[1].href = pageUrl('settlement'); links[2].href = pageUrl('profile');
    links.forEach((link, index) => { if (index === (section === 'profile' ? 2 : 0)) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  }
  function renderList() {
    draft = null; dirty = false; profileDirty = false; section = 'entries'; eventControls();
    editorNavigation(false);
    let list = entries();
    if (role === 'review') list = list.filter(e => e.status !== 'draft');
    if (role === 'buyer') list = list.filter(e => e.status === 'approved');
    list.sort((a, b) => ({ changes_requested: 0, draft: 1, submitted: 2, approved: 3 })[a.status] - ({ changes_requested: 0, draft: 1, submitted: 2, approved: 3 })[b.status]);
    const title = role === 'review' ? '출품 검토' : role === 'buyer' ? '개체 확인' : '출품 개체';
    $('content').innerHTML = `<div class="entry-title"><div class="title-row"><h1>${title}</h1>${role === 'vendor' && !['archived','paused'].includes(currentEvent()?.status) ? '<button type="button" class="secondary" id="manage-parents">부모 관리</button>' : ''}</div>${!currentEvent()?.entriesOpen && role === 'vendor' ? '<p class="muted">출품 마감 · 낙찰·정산 내역은 계속 확인할 수 있어요</p>' : ''}</div>
      ${role === 'vendor' && currentEvent()?.entriesOpen ? `<a class="vendor-info-summary" id="vendor-info-summary" href="${pageUrl('profile')}" hidden><span><b>업체 정보 등록</b><small>연락처·결제 설정</small></span><span class="summary-action">등록하기 <span aria-hidden="true">›</span></span></a><div class="entry-create-actions"><button class="secondary" type="button" id="open-import">피들 링크로 가져오기</button><button class="primary" type="button" id="add-entry">＋ 직접 추가</button></div>` : ''}
      ${list.length ? `<p class="entry-count">${list.length}개체</p><div class="entry-list">${list.map(e => {
        const shown = displaySource(e);
        return `<button type="button" class="entry-row" data-entry="${esc(e.id)}">${shown.photoIds?.length ? avatar(shown.photoIds[0]) : ''}<span class="row-info">${role !== 'buyer' ? `<span class="status ${e.status}">${statusName[e.status]}</span>` : ''}<strong>${esc(e.lot || e.code)} · ${esc(shown.morph || '새 개체')}</strong><small>${[sexName[shown.sex], shown.weight ? shown.weight + 'g' : ''].filter(Boolean).map(esc).join(' · ')}</small></span><span class="chevron" aria-hidden="true">›</span></button>`;
      }).join('')}</div>` : `<div class="empty-state"><p>${role === 'review' ? '검토할 개체가 없어요' : role === 'buyer' ? '편성 완료한 개체가 여기에 표시돼요' : '첫 개체를 등록해 보세요'}</p></div>`}
      `;
    $('add-entry')?.addEventListener('click', () => editEntry(blankEntry()));
    $('open-import')?.addEventListener('click', openImport);
    $('manage-parents')?.addEventListener('click', () => {
      parentManage = true; parentRole = 'sire'; parentDirty = false; parentListWasEmpty = parents().length === 0;
      if (parentListWasEmpty) parentForm(); else parentList();
      $('parent-dialog').showModal();
    });
    document.querySelectorAll('[data-entry]').forEach(button => button.onclick = () => {
      const entry = entries().find(e => e.id === button.dataset.entry);
      if (role === 'vendor' && currentEvent()?.entriesOpen && ['draft', 'changes_requested'].includes(entry.status)) editEntry(entry);
      else detailEntry(entry);
    });
    images($('content'));
    if ($('vendor-info-summary')) loadProfileSummary();
  }
  async function profileApi(body) {
    if (Store.live) return Store.profile(body);
    const params = new URLSearchParams({ code: previewCode, event: eventId });
    const response = await fetch('/api/platform/vendor-checkout' + (body ? '/settings' : '') + '?' + params, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, code: previewCode, event: eventId }) } : {});
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '업체 정보를 불러오지 못했어요. 다시 시도해 주세요.');
    return payload.vendor;
  }
  async function loadProfileSummary() {
    const event = eventId;
    try {
      const loaded = await profileApi(); if (event !== eventId || !$('vendor-info-summary')) return;
      profile = loaded;
      updateProfileStatus();
      if (!profileReady(profile) && !profilePromptSeen() && !document.querySelector('dialog[open]') && !busy && !uploading) openProfilePopup();
    } catch { if ($('vendor-info-summary')) { $('vendor-info-summary').hidden = false; $('vendor-info-summary').querySelector('.summary-action').textContent = '다시 확인 ›'; } }
  }
  function updateProfileStatus() {
    const ready = profileReady(profile), link = document.querySelector('#navigation [data-vendor-section=profile]');
    link.classList.toggle('profile-incomplete', !ready); link.title = ready ? '업체 정보' : '연락처·계좌 등록 필요';
    if ($('vendor-info-summary')) $('vendor-info-summary').hidden = ready;
  }
  function profileFormMarkup(p, popup = false) {
    return `<form id="profile-form" novalidate>
        ${window.CreoVendorContactForm.markup(p,{compact:popup})}
        <section class="entry-section">${popup ? '' : '<h2 class="profile-section-title">결제 설정</h2><div class="profile-payment-heading"><h3>계좌이체</h3><span class="muted">기본</span></div>'}
        <label class="field" for="profile-bank"><span>은행</span><input id="profile-bank" maxlength="60" value="${esc(p.bankName)}" placeholder="예: 농협" ${p.bankRegistered ? 'readonly' : ''} aria-describedby="profile-bank-error"><span class="field-error" id="profile-bank-error" hidden></span></label>
        <label class="field" for="profile-account"><span>계좌번호</span><input id="profile-account" inputmode="numeric" maxlength="40" value="${esc(p.bankAccount)}" placeholder="숫자만 입력" ${p.bankRegistered ? 'readonly' : ''} aria-describedby="profile-account-error"><span class="field-error" id="profile-account-error" hidden></span></label>
        <label class="field" for="profile-holder"><span>예금주</span><input id="profile-holder" maxlength="40" value="${esc(p.bankHolder)}" placeholder="예금주명" ${p.bankRegistered ? 'readonly' : ''} aria-describedby="profile-holder-error"><span class="field-error" id="profile-holder-error" hidden></span></label>
        ${p.bankRegistered ? '<p class="profile-account-note muted">계좌 변경은 운영자에게 요청해 주세요.</p>' : ''}
        ${popup ? '' : `<label class="profile-card-choice"><span><b>카드결제</b><small>카드결제도 받을 수 있어요</small></span><input id="profile-card" type="checkbox" ${p.cardEnabled ? 'checked' : ''}></label>`}</section>
        <p id="profile-error" class="inline-error" role="alert" hidden></p>${popup ? '' : '<div class="form-actions"><button class="primary" type="submit" id="profile-save">저장</button></div>'}</form>`;
  }
  function bindProfileForm(popup = false) {
    window.CreoVendorContactForm.bind($('profile-form').querySelector('.vendor-contact-settings'));
    $('profile-form').oninput = event => {
        profileDirty = true;
        if ($(event.target.id + '-error')) { event.target.removeAttribute('aria-invalid'); errorAt(event.target.id + '-error', ''); }
        errorAt('profile-error', '');
    };
    $('profile-form').onsubmit = async event => {
      event.preventDefault();
      const submitAfter = popup && profilePopupForSubmit;
      if (await saveProfile(!popup) && popup) {
        closeProfilePopupNow(); updateProfileStatus();
        if (submitAfter) await saveEntry(true);
      }
    };
  }
  function openProfilePopup(forSubmit = false) {
    if (busy || uploading || $('profile-dialog').open || $('profile-form')) return;
    profilePopupForSubmit = forSubmit; profileDirty = false; profileReturnFocus = document.activeElement;
    $('profile-dialog-content').innerHTML = profileFormMarkup(profile, true);
    $('profile-dialog-title').textContent = forSubmit ? '검토 요청 전 업체 정보 등록' : '업체 정보 등록';
    $('profile-dialog-save').textContent = forSubmit ? '저장하고 검토 요청' : '저장하고 시작';
    $('profile-dialog-save').disabled = false;
    bindProfileForm(true); $('profile-dialog').showModal(); markProfilePromptSeen();
    $('profile-dialog-title').setAttribute('tabindex', '-1'); $('profile-dialog-title').focus();
  }
  function closeProfilePopupNow() { profileDirty = false; profilePopupForSubmit = false; $('profile-dialog').close(); $('profile-dialog-content').replaceChildren(); }
  function closeProfilePopup() { if (busy) return; if (profileDirty) leave(closeProfilePopupNow, true); else closeProfilePopupNow(); }
  async function renderProfile() {
    section = 'profile'; draft = null; dirty = profileDirty = false; eventControls(); editorNavigation(false);
    $('content').innerHTML = '<div class="entry-title"><h1>업체 정보</h1></div><p class="muted" role="status">불러오는 중…</p>';
    const selectedEvent = eventId;
    try {
      const loaded = await profileApi(); if (section !== 'profile' || eventId !== selectedEvent) return;
      profile = loaded;
      updateProfileStatus();
      $('content').innerHTML = `<div class="entry-title"><h1>업체 정보</h1><p class="muted">${esc(profile.name)}</p></div>` + profileFormMarkup(profile);
      bindProfileForm();
    } catch (e) {
      if (section !== 'profile') return;
      $('content').innerHTML = `<div class="entry-title"><h1>업체 정보</h1><p class="inline-error" role="alert">${esc(e.message)}</p><button type="button" class="secondary" id="profile-retry">다시 시도</button></div>`;
      $('profile-retry').onclick = renderProfile;
    }
  }
  async function saveProfile(refresh = true) {
    if (busy) return false;
    const data = { ...window.CreoVendorContactForm.read($('profile-form').querySelector('.vendor-contact-settings')), bankName: $('profile-bank').value.trim(), bankAccount: $('profile-account').value.trim(), bankHolder: $('profile-holder').value.trim(), cardEnabled: $('profile-card')?.checked ?? Boolean(profile.cardEnabled) };
    if (Store.live) data.directoryRevision = profile.directoryRevision;
    const checks = [['phone', /^0\d{8,10}$/.test(data.phone), '휴대폰 번호를 확인해 주세요.'], ['bank', !!data.bankName, '은행을 입력해 주세요.'], ['account', /^[0-9 -]{5,40}$/.test(data.bankAccount), '계좌번호를 확인해 주세요.'], ['holder', !!data.bankHolder, '예금주를 입력해 주세요.']];
    if($('profile-inquiry'))checks.push(['inquiry',!data.inquiryPhone||/^0\d{8,10}$/.test(data.inquiryPhone),'고객 문의 전화번호를 확인해 주세요.']);
    let first;
    for (const [id, valid, message] of checks) { $('profile-' + id).setAttribute('aria-invalid', String(!valid)); errorAt('profile-' + id + '-error', valid ? '' : message); if (!valid && !first) first = $('profile-' + id); }
    if (first) { first.focus(); return false; }
    busy = true; const saveButton = $('profile-save') || $('profile-dialog-save'); saveButton.disabled = true; errorAt('profile-error', '');
    try {
      profile = await profileApi(data); profileDirty = false;
      if (refresh) await renderProfile(); toast('업체 정보를 저장했어요'); return true;
    } catch (e) { errorAt('profile-error', e.message); return false; }
    finally { busy = false; saveButton.disabled = false; }
  }
  function radioGroup(name, label, choices, selected) {
    return `<fieldset><legend>${label}</legend><div class="segments">${choices.map(([value, text]) => `<label class="segment"><input type="radio" name="${name}" value="${value}" ${selected === value ? 'checked' : ''}><span>${text}</span></label>`).join('')}</div></fieldset>`;
  }
  function editEntry(entry) {
    draft = structuredClone(entry); dirty = false;
    editorNavigation(true);
    $('content').innerHTML = `<div class="title-row"><button type="button" id="entry-back" class="icon-button" aria-label="출품 목록으로 돌아가기">←</button><h1>개체 등록</h1></div><p class="entry-caption">${esc(entry.code || '출품 번호는 저장 시 자동 부여')}</p>
      ${entry.sourceUrl ? `<div class="source-link"><span>피들에서 가져온 개체</span><a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">원본 보기 ↗</a></div>` : '<button class="import-shortcut" type="button" id="open-import">피들 링크로 가져오기 <span aria-hidden="true">↗</span></button>'}
      ${entry.reason ? `<div class="request-note"><b>수정 요청</b>${esc(entry.reason)}</div>` : ''}
      <form id="entry-form" novalidate>
        <section class="entry-section"><div class="section-head"><h2>개체 사진 <span class="optional">선택</span></h2><small id="photo-count"></small></div><div id="entry-photos" class="photo-strip"></div><input id="entry-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><div id="photo-error" class="inline-error" role="alert" hidden></div></section>
        <label class="field" for="entry-morph"><span>모프</span><input id="entry-morph" name="morph" maxlength="60" placeholder="예: 릴리화이트, 하리퀸" value="${esc(entry.morph)}" aria-describedby="morph-error" autocomplete="off"><span class="field-error" id="morph-error" hidden></span></label>
        ${radioGroup('sex', '성별', [['unknown', '미구분'], ['male', '수컷'], ['female', '암컷']], entry.sex)}
        <label class="field" for="entry-weight"><span>체중 <span class="optional">g · 선택</span></span><input id="entry-weight" name="weight" inputmode="decimal" maxlength="6" placeholder="예: 28" value="${esc(entry.weight)}"></label>
        <section class="entry-section"><div class="section-head"><h2>부모 정보 <span class="optional">선택</span></h2></div><div id="entry-parents" class="parents"></div></section>
        <details class="extra"><summary>추가 정보 <span class="optional">크기 · 해칭일 · 비고</span></summary><div>
          ${radioGroup('size', '크기', ['베이비', '아성체', '준성체', '성체'].map(x => [x, x]), entry.size)}
          <label class="field" for="entry-hatch"><span>해칭일</span><input id="entry-hatch" name="hatchDate" type="date" value="${esc(entry.hatchDate)}" max="${new Date().toLocaleDateString('en-CA')}"></label>
          <label class="field" for="entry-note"><span>비고</span><textarea id="entry-note" name="note" maxlength="600" placeholder="개체의 특징이나 참고할 내용">${esc(entry.note)}</textarea></label></div></details>
        <p id="entry-error" class="inline-error" role="alert" hidden></p>
        <div class="form-actions"><button class="secondary" type="button" id="save-draft">임시 저장</button><button class="primary" type="submit" id="submit-entry">검토 요청</button></div>
      </form>`;
    $('entry-back').onclick = () => leave(renderList);
    $('open-import')?.addEventListener('click', () => leave(openImport));
    $('entry-form').addEventListener('input', () => { dirty = true; keepDraft(); });
    $('entry-form').onsubmit = event => { event.preventDefault(); saveEntry(true); };
    $('save-draft').onclick = () => saveEntry(false);
    $('entry-photo-input').onchange = event => addEntryPhotos(event.target);
    renderEntryPhotos(); renderParents(); window.scrollTo(0, 0);
  }
  function readDraft() {
    if (!$('entry-form')) return draft;
    const form = new FormData($('entry-form'));
    for (const key of ['morph', 'sex', 'weight', 'size', 'hatchDate', 'note']) draft[key] = String(form.get(key) || '');
    return draft;
  }
  function validateSubmit() {
    let first;
    const issues = [['entry-morph', 'morph-error', !draft.morph.trim(), '모프를 입력해 주세요.']];
    for (const [field, error, invalid, message] of issues) {
      $(field).setAttribute('aria-invalid', String(invalid)); errorAt(error, invalid ? message : ''); if (invalid && !first) first = $(field);
    }
    first?.focus(); return !first;
  }
  async function saveEntry(submit, navigate = true) {
    if (busy || uploading) return false;
    readDraft(); if (submit && !validateSubmit()) return false;
    busy = true; $('save-draft').disabled = $('submit-entry').disabled = true; errorAt('entry-error', '');
    try {
      if (submit) {
        profile = await profileApi();
        if (!profileReady(profile)) { busy = false; openProfilePopup(true); return false; }
      }
      const id = await send({ type: submit ? 'submit' : 'save', entry: draft, expectedVersion: draft.version });
      await Store.recovery?.clear();
      dirty = false; draft = structuredClone(entries().find(e => e.id === id));
      if (navigate) renderList(); toast(submit ? '검토를 요청했어요' : '임시 저장했어요'); return true;
    } catch (e) {
      state = Store.getState?.() || state; keepDraft(); renderEntryPhotos();
      errorAt('entry-error', e.message);
      if (e.status === 409 && Store.live) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = '최신 내용 다시 확인';
        button.onclick = async () => { if (!confirm('작성 중인 내용을 닫고 최신 저장 내용을 확인할까요?')) return; await Store.recovery.clear(); dirty = false; await start(); };
        $('entry-error').append(button);
      }
      return false;
    }
    finally { busy = false; if ($('save-draft')) $('save-draft').disabled = $('submit-entry').disabled = false; }
  }
  function renderEntryPhotos() {
    keepDraft();
    document.querySelectorAll('[data-photo-pending]').forEach(el => el.remove());
    $('photo-count').textContent = `${draft.photoIds.length} / 3`;
    $('entry-photos').innerHTML = draft.photoIds.map((id, index) => `<div class="photo-tile"><button class="photo-open" type="button" data-photo='${esc(JSON.stringify(draft.photoIds))}' data-photo-index="${index}" aria-label="개체 사진 ${index + 1} 크게 보기"><img data-media-id="${esc(id)}" alt="개체 사진 ${index + 1}"></button><button type="button" class="photo-remove" data-remove-photo="${esc(id)}" aria-label="개체 사진 ${index + 1} 제외">×</button></div>`).join('') + (draft.photoIds.length < 3 ? `<button class="photo-add" type="button" id="add-photo" ${uploading ? 'disabled' : ''}>${camera}<span>${uploading ? '사진 준비 중…' : '사진 추가'}</span></button>` : '');
    $('add-photo')?.addEventListener('click', () => $('entry-photo-input').click());
    document.querySelectorAll('[data-remove-photo]').forEach(button => button.onclick = () => { if (uploading) return; draft.photoIds = draft.photoIds.filter(id => id !== button.dataset.removePhoto); dirty = true; renderEntryPhotos(); });
    images($('entry-photos'));
    const pending = draft.photoIds.filter(id => state.media.find(m => m.id === id)?.pending);
    if (pending.length) {
      const message = document.createElement('p'); message.className = 'inline-error'; message.setAttribute('role', 'status'); message.textContent = '사진이 아직 전송되지 않았어요.';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary'; retry.textContent = '사진 다시 전송'; retry.disabled = uploading;
      retry.onclick = async () => {
        if (busy || uploading) return; uploading = true; retry.disabled = true; $('save-draft').disabled = $('submit-entry').disabled = true;
        try { for (const id of pending) await send({ type: 'retry-photo', id }); errorAt('photo-error', ''); }
        catch (error) { state = Store.getState?.() || state; errorAt('photo-error', error.message); }
        finally { uploading = false; $('save-draft').disabled = $('submit-entry').disabled = false; renderEntryPhotos(); }
      };
      message.append(retry); $('entry-photos').after(message);
      message.dataset.photoPending = 'true';
    }
    document.querySelectorAll('[data-photo-index]').forEach(button => button.onclick = () => openPhotos(draft.photoIds, '개체 사진', Number(button.dataset.photoIndex)));
  }
  async function compress(file) {
    if (file.size > 12 * 1024 * 1024) throw new Error('12MB 이하 사진을 선택해 주세요.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG·PNG·WebP 사진을 선택해 주세요.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error('사진을 읽지 못했어요. JPG·PNG·WebP 사진을 다시 선택해 주세요.'); }
    try {
      const make = async (limit, budget) => {
        const canvas = document.createElement('canvas'); let width = Math.min(limit, bitmap.width), blob;
        for (let pass = 0; pass < 6; pass++) {
          canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(bitmap.height * canvas.width / bitmap.width));
          if (canvas.height > limit) { canvas.width = Math.max(1, Math.round(canvas.width * limit / canvas.height)); canvas.height = limit; }
          canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', Math.max(.5, .84 - pass * .06)));
          if (blob && blob.size <= budget) return blob;
          width *= .8;
        }
        throw new Error('사진 용량을 줄이지 못했어요. 다른 사진을 선택해 주세요.');
      };
      return { id: uuid(), blob: await make(1600, 350000), thumb: await make(320, 40000) };
    } finally { bitmap.close(); }
  }
  function openImport() {
    if (busy || uploading || !currentEvent()?.entriesOpen) return;
    errorAt('import-error', ''); $('import-progress').textContent = ''; $('import-dialog').showModal();
  }
  async function importFeedle(event) {
    event.preventDefault(); if (busy || uploading) return;
    busy = true; $('import-submit').disabled = $('import-close').disabled = true; errorAt('import-error', '');
    $('import-progress').textContent = '개체 정보를 불러오고 있어요…';
    try {
      const pending = await Store.pendingImport?.($('feedle-url').value.trim());
      if (pending) {
        const id = await send(pending);
        dirty = false; $('import-dialog').close(); editEntry(entries().find(e => e.id === id)); toast('피들 정보를 가져왔어요'); return;
      }
      let info;
      if (Store.live) info = await Store.metadata($('feedle-url').value.trim());
      else { const response = await fetch('/api/preview/feedle?url=' + encodeURIComponent($('feedle-url').value.trim())); info = await response.json(); if (!response.ok) throw new Error(info.error || '피들 링크를 다시 확인해 주세요.'); }
      state = await Store.read();
      const existing = entries().find(e => e.sourceId === info.sourceId);
      if (existing) {
        $('import-dialog').close();
        if (['draft', 'changes_requested'].includes(existing.status)) editEntry(existing); else detailEntry(existing);
        toast('이 경매에 이미 가져온 개체예요'); return;
      }
      if (info.species !== '크레스티드 게코') throw new Error('크레스티드 게코 링크를 선택해 주세요.');
      const media = [], mappedParents = {}, photoIds = [], warnings = [];
      const loadPhoto = async url => {
        $('import-progress').textContent = `사진 ${media.length + 1}장째를 준비하고 있어요…`;
        try {
          let blob;
          if (Store.live) blob = await Store.image(url);
          else { const response = await fetch('/api/preview/feedle-image?url=' + encodeURIComponent(url)); if (!response.ok) throw new Error('사진을 불러오지 못했어요.'); blob = await response.blob(); }
          const optimized = await compress(new File([blob], 'feedle-photo', { type: blob.type }));
          media.push(optimized); return optimized.id;
        } catch { warnings.push('일부 사진을 가져오지 못했어요. 원본을 확인하고 사진을 추가해 주세요.'); return ''; }
      };
      for (const url of info.photoUrls) { const id = await loadPhoto(url); if (id) photoIds.push(id); }
      for (const slot of ['sire', 'dam']) {
        const p = info[slot]; if (!p) continue;
        const existingParent = parents().find(x => x.sourceId === p.sourceId);
        mappedParents[slot] = existingParent || { ...p, id: uuid(), name: p.name || (slot === 'sire' ? '피들 부 개체' : '피들 모 개체'), photoId: p.imageUrl ? await loadPhoto(p.imageUrl) : '', version: 0 };
      }
      const id = await send({ type: 'import', entry: { ...blankEntry(), ...info, photoIds }, parents: mappedParents, media });
      dirty = false; $('import-dialog').close(); editEntry(entries().find(e => e.id === id));
      if (warnings.length) errorAt('photo-error', warnings[0]);
      toast('피들 정보를 가져왔어요');
    } catch (e) { errorAt('import-error', e.message); }
    finally { busy = false; $('import-submit').disabled = $('import-close').disabled = false; $('import-progress').textContent = ''; }
  }
  async function addEntryPhotos(input) {
    if (busy || uploading) return;
    const files = Array.from(input.files || []), room = 3 - draft.photoIds.length;
    input.value = ''; errorAt('photo-error', '');
    if (files.length > room) return errorAt('photo-error', `사진은 ${room}장 더 추가할 수 있어요. 다시 선택해 주세요.`);
    uploading = true; $('save-draft').disabled = $('submit-entry').disabled = true; renderEntryPhotos();
    try {
      for (const file of files) { const media = await compress(file); const id = await send({ type: 'media', media }); draft.photoIds.push(id); dirty = true; }
    } catch (e) { errorAt('photo-error', e.message); }
    finally { uploading = false; $('save-draft').disabled = $('submit-entry').disabled = false; renderEntryPhotos(); }
  }
  function renderParents() {
    keepDraft();
    $('entry-parents').innerHTML = ['sire', 'dam'].map(slot => {
      const p = parents().find(p => p.id === draft[slot + 'Id']), label = slot === 'sire' ? '부' : '모';
      return p ? `<div class="parent-selected"><button type="button" class="parent-choice" data-pick-parent="${slot}" aria-label="${label} ${esc(p.name || p.code)} 변경">${avatar(p.photoId, label)}<span><b><span class="parent-label">${label}</span>${esc(p.name || p.code)}</b><small>${[p.code, p.morph].filter(Boolean).map(esc).join(' · ')}</small></span></button><div class="parent-tools"><button class="text-button" type="button" data-edit-parent="${slot}">수정</button><button class="icon-button" type="button" data-unlink-parent="${slot}" aria-label="${label} 연결 해제">×</button></div></div>` : `<button type="button" class="parent-add" data-pick-parent="${slot}">＋ ${label} 선택</button>`;
    }).join('');
    document.querySelectorAll('[data-pick-parent]').forEach(button => button.onclick = () => openParent(button.dataset.pickParent));
    document.querySelectorAll('[data-edit-parent]').forEach(button => button.onclick = () => openParent(button.dataset.editParent, true));
    document.querySelectorAll('[data-unlink-parent]').forEach(button => button.onclick = () => { draft[button.dataset.unlinkParent + 'Id'] = ''; dirty = true; renderParents(); });
    images($('entry-parents'));
  }
  function openParent(slot, edit = false) {
    if (busy || uploading) return;
    readDraft(); parentRole = slot; parentDirty = false; parentManage = false;
    parentListWasEmpty = ownParents().length === 0;
    errorAt('parent-error', '');
    if (edit) parentForm(parents().find(p => p.id === draft[slot + 'Id']));
    else if (parentListWasEmpty) parentForm(); else parentList();
    $('parent-dialog').showModal();
  }
  function parentList() {
    parentDraft = null; parentDirty = false;
    $('parent-title').textContent = parentManage ? '부모 관리' : `${parentRole === 'sire' ? '부' : '모'} 선택`;
    $('parent-back').hidden = true; errorAt('parent-error', '');
    $('parent-content').innerHTML = '<label class="field" for="parent-search"><span class="muted">등록한 부모</span><input class="search-input" id="parent-search" type="search" placeholder="이름·관리번호·모프 검색" autocomplete="off"></label><div id="parent-results" class="parent-results"></div>';
    $('parent-actions').innerHTML = '<button type="button" class="secondary full" id="new-parent">＋ 새 부모 등록</button>';
    $('new-parent').onclick = () => parentForm();
    $('parent-search').oninput = filterParents; filterParents();
  }
  function filterParents() {
    const query = $('parent-search').value.trim().toLowerCase();
    const list = ownParents().filter(p => `${p.name} ${p.code} ${p.morph}`.toLowerCase().includes(query));
    $('parent-results').innerHTML = list.map(p => `<button type="button" class="parent-result" data-select-parent="${esc(p.id)}" ${parentManage ? '' : `aria-pressed="${draft[parentRole + 'Id'] === p.id}"`}>${avatar(p.photoId, p.sex === 'male' ? '부' : '모')}<span class="row-info"><strong>${esc(p.name || p.code)}</strong><small>${[parentManage ? sexName[p.sex] : '', p.code, p.morph].filter(Boolean).map(esc).join(' · ')}</small></span><span class="chevron" aria-hidden="true">${!parentManage && draft[parentRole + 'Id'] === p.id ? '✓' : '›'}</span></button>`).join('') || `<p class="empty-search">${query ? '검색한 부모가 없어요' : '등록한 부모가 없어요'}</p>`;
    $('parent-results').querySelectorAll('[data-select-parent]').forEach(button => button.onclick = () => {
      if (parentManage) { const p = parents().find(p => p.id === button.dataset.selectParent); parentRole = p.sex === 'male' ? 'sire' : 'dam'; parentForm(p); }
      else { draft[parentRole + 'Id'] = button.dataset.selectParent; dirty = true; renderParents(); $('parent-dialog').close(); }
    });
    images($('parent-results'));
  }
  function parentForm(existing) {
    const selectedSex = parentRole === 'sire' ? 'male' : 'female';
    parentDraft = existing ? structuredClone(existing) : { id: uuid(), name: '', code: '', morph: '', photoId: '', sex: selectedSex, version: 0 };
    parentDirty = false; errorAt('parent-error', '');
    $('parent-title').textContent = `${existing ? '부모 정보 수정' : '새 부모 등록'}${parentManage && !existing ? '' : ' · ' + sexName[selectedSex]}`;
    $('parent-back').hidden = parentListWasEmpty;
    $('parent-content').innerHTML = `<form id="parent-form" novalidate>
      <div id="parent-photo-editor" class="parent-photo-editor"></div><input id="parent-photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      ${parentManage && !existing ? radioGroup('parentSex', '성별', [['male', '수컷'], ['female', '암컷']], selectedSex) : ''}
      <label class="field" for="parent-name"><span>부모 이름</span><input id="parent-name" maxlength="40" placeholder="예: 코튼" value="${esc(parentDraft.name)}" autocomplete="off" aria-describedby="parent-identity-error"></label>
      <label class="field" for="parent-code"><span>관리번호 <span class="optional">선택</span></span><input id="parent-code" maxlength="30" placeholder="예: M-01" value="${esc(parentDraft.code)}" autocomplete="off" aria-describedby="parent-identity-error"><span class="field-error" id="parent-identity-error" hidden></span></label>
      <label class="field" for="parent-morph"><span>모프 <span class="optional">선택</span></span><input id="parent-morph" maxlength="60" placeholder="예: 화이트월" value="${esc(parentDraft.morph)}" autocomplete="off"></label>
      ${existing ? '<p class="muted">연결된 모든 개체에 함께 반영돼요.</p>' : ''}</form>`;
    $('parent-actions').innerHTML = `<button type="submit" form="parent-form" class="primary full" id="save-parent">${existing ? '저장' : parentManage ? '부모 등록' : '등록하고 선택'}</button>`;
    $('parent-form').oninput = () => { parentDirty = true; keepDraft(); };
    $('parent-form').onsubmit = async event => { event.preventDefault(); await saveParent(); };
    $('parent-photo-input').onchange = async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file || uploading) return;
      uploading = true; $('save-parent').disabled = true; errorAt('parent-error', '');
      try { parentDraft.photoId = await send({ type: 'media', media: await compress(file) }); parentDirty = true; renderParentPhoto(); }
      catch (e) { errorAt('parent-error', e.message); }
      finally { uploading = false; $('save-parent').disabled = false; }
    };
    renderParentPhoto(); $('parent-content').scrollTop = 0;
  }
  function renderParentPhoto() {
    keepDraft();
    $('parent-photo-editor').innerHTML = parentDraft.photoId ? `<div class="photo-tile"><button type="button" class="photo-open" data-photo='${esc(JSON.stringify([parentDraft.photoId]))}' data-photo-title="부모 사진" aria-label="부모 사진 크게 보기"><img data-media-id="${esc(parentDraft.photoId)}" alt="부모 사진"></button></div><div><button type="button" class="text-button" id="change-parent-photo">사진 변경</button><button type="button" class="text-button" id="remove-parent-photo">사진 제외</button></div>` : `<button type="button" class="photo-add" id="change-parent-photo">${camera}<span>사진 추가</span></button><span class="muted">사진은 나중에<br>추가해도 돼요</span>`;
    $('change-parent-photo').onclick = () => { if (!uploading) $('parent-photo-input').click(); };
    $('remove-parent-photo')?.addEventListener('click', () => { if (uploading) return; parentDraft.photoId = ''; parentDirty = true; renderParentPhoto(); });
    images($('parent-photo-editor'));
    if (state.media.find(media => media.id === parentDraft.photoId)?.pending) {
      const status = document.createElement('p'); status.className = 'inline-error'; status.setAttribute('role', 'status'); status.textContent = '사진 전송 대기 · 저장할 때 다시 전송해요'; $('parent-photo-editor').append(status);
    }
  }
  async function saveParent() {
    if (busy || uploading) return;
    for (const key of ['name', 'code', 'morph']) parentDraft[key] = $('parent-' + key).value.trim();
    const parentSex = document.querySelector('[name=parentSex]:checked'); if (parentSex) parentDraft.sex = parentSex.value;
    const invalid = !parentDraft.name && !parentDraft.code;
    $('parent-name').setAttribute('aria-invalid', String(invalid));
    errorAt('parent-identity-error', invalid ? '이름 또는 관리번호를 입력해 주세요.' : '');
    if (invalid) return $('parent-name').focus();
    busy = true; $('save-parent').disabled = true; errorAt('parent-error', '');
    try {
      const id = await send({ type: 'parent', parent: parentDraft, expectedVersion: parentDraft.version });
      parentDirty = false;
      if (parentManage) { await Store.recovery?.clear(); parentListWasEmpty = false; parentList(); toast('부모 정보를 저장했어요'); }
      else { draft[parentRole + 'Id'] = id; dirty = true; renderParents(); $('parent-dialog').close(); toast('부모를 선택했어요'); }
    } catch (e) {
      state = Store.getState?.() || state; keepDraft(); errorAt('parent-error', e.message);
      if (e.status === 409 && Store.live) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = '부모 목록 다시 확인';
        button.onclick = async () => { if (!confirm('작성 중인 부모 정보를 닫고 최신 목록을 확인할까요?')) return; state = await Store.read(); parentDirty = false; parentList(); if (dirty) keepDraft(); else await Store.recovery.clear(); };
        $('parent-error').append(button);
      }
    }
    finally { busy = false; if ($('save-parent')) $('save-parent').disabled = false; }
  }
  function closeParent() {
    if (uploading || busy) return;
    if (parentDirty && !confirm('입력한 부모 정보를 저장하지 않고 닫을까요?')) return;
    parentDirty = false; $('parent-dialog').close();
    if (draft && dirty) keepDraft(); else Store.recovery?.clear();
  }
  function renderInformation(entry) {
    const shown = displaySource(entry);
    const source = Store.information(state, { ...entry, ...shown, approved: null, submission: null });
    const pics = source.photoIds || [];
    return `${pics.length ? `<div class="gallery">${pics.map((id, index) => `<button type="button" data-photo='${esc(JSON.stringify(pics))}' data-start="${index}" aria-label="개체 사진 ${index + 1} 크게 보기"><img data-media-id="${esc(id)}" alt="개체 사진 ${index + 1}" loading="lazy"></button>`).join('')}</div>` : ''}
      <div class="read-details">${[['모프', source.morph], ['성별', sexName[source.sex]], ['체중', source.weight ? `${source.weight}g` : ''], ['크기', source.size], ['해칭일', source.hatchDate]].filter(([, v]) => v).map(([key, value]) => `<div class="detail-pair"><span>${key}</span><b>${esc(value)}</b></div>`).join('')}</div>
      ${source.note ? `<p class="detail-note">${esc(source.note)}</p>` : ''}
      ${source.sire || source.dam ? `<section class="detail-parents"><h3>부모 정보</h3>${[['부', source.sire], ['모', source.dam]].filter(([, p]) => p).map(([label, p]) => {
        const content = `${p.photoId ? avatar(p.photoId) : ''}<span><b><span class="parent-label">${label}</span>${esc(p.name || p.code)}</b><small>${[p.code, p.morph].filter(Boolean).map(esc).join(' · ')}</small></span>${p.photoId ? '<span class="chevron" aria-hidden="true">›</span>' : ''}`;
        return p.photoId ? `<button type="button" class="detail-parent" data-photo='${esc(JSON.stringify([p.photoId]))}' data-photo-title="${label} · ${esc(p.name || p.code)}" aria-label="${label} ${esc(p.name || p.code)} 사진 크게 보기">${content}</button>` : `<div class="detail-parent">${content}</div>`;
      }).join('')}</section>` : ''}`;
  }
  function detailEntry(entry) {
    selectedDetail = entry;
    const source = displaySource(entry);
    $('detail-title').textContent = `${entry.lot || entry.code} · ${source.morph || '개체 정보'}`;
    $('detail-content').innerHTML = `<div id="detail-information">${renderInformation(entry)}</div>`;
    errorAt('detail-error', '');
    $('detail-actions').hidden = role === 'buyer' || entry.status === 'approved';
    $('detail-actions').innerHTML = '';
    if (role === 'review' && entry.status === 'submitted') {
      $('detail-content').insertAdjacentHTML('beforeend', '<div class="entry-section" style="margin-top:28px;margin-bottom:0"><label class="field" for="review-lot"><span>경매 번호</span><input id="review-lot" placeholder="예: A01" maxlength="12" autocapitalize="characters"></label><details class="extra"><summary>수정 요청하기</summary><div><label class="field" for="review-reason"><span>수정할 내용</span><textarea id="review-reason" maxlength="200" placeholder="예: 개체의 성별을 확인해 주세요"></textarea></label><button class="secondary full" type="button" id="request-changes">수정 요청</button></div></details></div>');
      $('detail-actions').innerHTML = '<button type="button" class="primary" id="approve-entry">편성 완료</button>';
      $('approve-entry').onclick = () => review('approve');
      $('request-changes').onclick = () => review('request-changes');
    } else if (role === 'vendor' && entry.status === 'submitted' && currentEvent()?.entriesOpen) {
      $('detail-actions').innerHTML = '<button type="button" class="secondary full" id="withdraw-entry">검토 요청 취소하고 수정</button>';
      $('withdraw-entry').onclick = () => review('withdraw');
    } else if (role === 'vendor' && entry.status === 'approved' && currentEvent()?.entriesOpen) {
      $('detail-actions').hidden = false; $('detail-actions').innerHTML = '<button type="button" class="secondary full" id="revise-entry">수정안 작성</button>';
      $('revise-entry').onclick = () => review('revise');
    } else $('detail-actions').hidden = true;
    images($('detail-content'));
    $('detail-content').querySelectorAll('[data-start]').forEach(button => button.onclick = () => openPhotos(source.photoIds, '개체 사진', Number(button.dataset.start)));
    $('detail-dialog').showModal(); $('detail-content').scrollTop = 0;
  }
  async function review(type) {
    if (busy) return;
    busy = true; errorAt('detail-error', '');
    try {
      const id = await send({ type, id: selectedDetail.id, expectedVersion: selectedDetail.version, lot: $('review-lot')?.value, reason: $('review-reason')?.value });
      $('detail-dialog').close();
      if (type === 'withdraw' || type === 'revise') editEntry(entries().find(e => e.id === id)); else renderList();
      toast(type === 'approve' ? '미리보기 편성을 완료했어요' : type === 'withdraw' ? '검토 요청을 취소했어요' : '수정을 요청했어요');
    } catch (e) { errorAt('detail-error', e.message); }
    finally { busy = false; }
  }
  function openPhotos(ids, title, index = 0) {
    photoSet = ids.filter(id => state.media.some(m => m.id === id)); if (!photoSet.length) return;
    photoIndex = index; $('photo-title').textContent = title; renderLargePhoto(); $('photo-dialog').showModal();
  }
  function renderLargePhoto() {
    $('large-photo').src = photoUrl(photoSet[photoIndex], true); $('large-photo').alt = `${$('photo-title').textContent} ${photoIndex + 1}`;
    $('photo-position').textContent = `${photoIndex + 1} / ${photoSet.length}`;
    $('photo-prev').disabled = photoIndex === 0; $('photo-next').disabled = photoIndex === photoSet.length - 1;
  }
  function leave(action, profileOnly = false) {
    if (busy || uploading) return;
    if (!dirty && !profileDirty) return action();
    leaveProfileOnly = profileOnly;
    $('leave-save').textContent = profileDirty ? '저장 후 나가기' : '임시 저장 후 나가기';
    leaveAction = action; errorAt('leave-error', ''); $('leave-dialog').showModal();
  }
  $('leave-save').onclick = async () => {
    if (await (profileDirty ? saveProfile(false) : saveEntry(false, false))) { $('leave-dialog').close(); leaveAction(); }
    else errorAt('leave-error', $('entry-error')?.textContent || $('profile-error')?.textContent || '입력 내용을 확인하고 다시 저장해 주세요.');
  };
  $('leave-stay').onclick = () => $('leave-dialog').close();
  $('leave-discard').onclick = async () => { if (!leaveProfileOnly) { await Store.recovery?.clear(); dirty = false; } profileDirty = false; $('leave-dialog').close(); leaveAction(); };
  $('profile-close').onclick = closeProfilePopup;
  $('profile-later').onclick = closeProfilePopup;
  $('profile-dialog').addEventListener('cancel', event => { event.preventDefault(); closeProfilePopup(); });
  $('profile-dialog').addEventListener('close', () => {
    if (!$('profile-dialog').open) $('profile-dialog-content').replaceChildren();
    if (profileReturnFocus?.isConnected) profileReturnFocus.focus();
    else ($('submit-entry') || $('add-entry'))?.focus();
  });
  $('parent-close').onclick = closeParent;
  $('parent-dialog').addEventListener('cancel', event => { event.preventDefault(); closeParent(); });
  $('parent-dialog').addEventListener('close', () => { (parentManage ? $('manage-parents') : document.querySelector(`[data-pick-parent="${parentRole}"]`))?.focus(); });
  $('parent-back').onclick = () => { if (uploading || busy) return; if (parentDirty && !confirm('입력한 부모 정보를 저장하지 않고 목록으로 돌아갈까요?')) return; parentList(); };
  $('detail-close').onclick = () => { if (!busy) $('detail-dialog').close(); };
  $('photo-close').onclick = () => $('photo-dialog').close();
  $('large-photo').onerror = () => { if ($('photo-dialog').open) $('large-photo-error').hidden = false; };
  $('large-photo').onload = () => { $('large-photo-error').hidden = true; };
  $('large-photo-retry').onclick = async () => {
    $('large-photo-retry').disabled = true;
    try { state = await Store.read(); renderLargePhoto(); }
    catch (error) { toast(error.message); }
    finally { $('large-photo-retry').disabled = false; }
  };
  $('photo-dialog').addEventListener('close', () => $('large-photo').removeAttribute('src'));
  $('photo-prev').onclick = () => { if (photoIndex > 0) { photoIndex--; renderLargePhoto(); } };
  $('photo-next').onclick = () => { if (photoIndex < photoSet.length - 1) { photoIndex++; renderLargePhoto(); } };
  $('import-form').onsubmit = importFeedle;
  $('import-close').onclick = () => { if (!busy) $('import-dialog').close(); };
  $('import-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('photo-dialog').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') $('photo-prev').click(); if (e.key === 'ArrowRight') $('photo-next').click(); });
  for (const id of ['parent-dialog', 'detail-dialog', 'photo-dialog', 'import-dialog', 'profile-dialog']) {
    let beganOutside = false;
    $(id).addEventListener('pointerdown', event => { const r = $(id).getBoundingClientRect(); beganOutside = event.target === $(id) && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom); });
    $(id).addEventListener('click', event => {
      const r = $(id).getBoundingClientRect(), outside = event.target === $(id) && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
      if (beganOutside && outside) { if (id === 'parent-dialog') closeParent(); else if (id === 'profile-dialog') closeProfilePopup(); else if (!busy) $(id).close(); } beganOutside = false;
    });
  }
  $('navigation').addEventListener('click', event => {
    const link = event.target.closest('a'); if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); leave(() => { location.href = link.href; });
  });
  $('entry-event').onchange = event => {
    const requested = event.target.value; event.target.value = eventId;
    leave(() => {
      if (Store.live) { location.href = pageUrl(section === 'profile' ? 'profile' : 'entries', requested); return; }
      eventId = requested;
      const url = new URL(location.href); url.searchParams.set('event', eventId); url.searchParams.delete('edit'); history.replaceState(null, '', url);
      eventControls(); if (section === 'profile') renderProfile(); else renderList();
    });
  };
  window.addEventListener('beforeunload', event => { if (dirty || profileDirty || parentDirty || uploading) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { for (const url of urls.values()) URL.revokeObjectURL(url); updates?.close(); });
  async function refreshParentInformation() {
    if (!state || busy || uploading) return;
    try {
      state = await Store.read();
      if (Store.live) setContext();
      if (!draft && section === 'entries' && !document.querySelector('dialog[open]')) {
        const focused = document.activeElement, entryId = focused?.dataset.entry, elementId = focused?.id;
        renderList();
        const replacement = entryId ? [...document.querySelectorAll('[data-entry]')].find(el => el.dataset.entry === entryId) : elementId ? $(elementId) : null;
        replacement?.focus({ preventScroll: true });
      }
      if (draft && $('entry-parents')) renderParents();
      if ($('parent-dialog').open && !parentDraft && $('parent-results')) filterParents();
      if ($('detail-dialog').open && selectedDetail && $('detail-information')) {
        $('detail-information').innerHTML = renderInformation(selectedDetail); images($('detail-information'));
        const source = displaySource(selectedDetail);
        $('detail-information').querySelectorAll('[data-start]').forEach(button => button.onclick = () => openPhotos(source.photoIds, '개체 사진', Number(button.dataset.start)));
      }
    } catch (e) { if ($('detail-dialog').open) errorAt('detail-error', e.message); }
  }
  if (updates) updates.onmessage = refreshParentInformation;
  window.addEventListener('focus', refreshParentInformation);
  async function start() {
    setContext();
    try {
      state = await Store.read();
      if (Store.live) setContext();
      eventControls();
      const recovered = Store.recovery?.read();
      if (role === 'vendor' && section !== 'profile' && recovered?.importUrl && currentEvent()?.entriesOpen) {
        renderList(); $('feedle-url').value = recovered.importUrl; openImport(); toast('가져오던 개체를 다시 확인해 주세요'); return;
      }
      if (role === 'vendor' && section !== 'profile' && recovered && currentEvent()?.entriesOpen) {
        const saved = entries().find(e => e.id === recovered.entry?.id);
        if (!saved || ['draft', 'changes_requested'].includes(saved.status)) {
          restoringRecovery = true;
          if (recovered.entry) { editEntry(recovered.entry); dirty = true; } else renderList();
          if (recovered.parent) { parentRole = recovered.parentRole; parentManage = recovered.parentManage; parentListWasEmpty = parents().length === 0; parentForm(recovered.parent); parentDirty = true; $('parent-dialog').showModal(); }
          restoringRecovery = false; keepDraft();
          toast('작성 중인 내용을 복원했어요'); return;
        }
        await Store.recovery.clear();
      }
      if (role === 'vendor' && section === 'home' && (Store.live ? state.homeSection === 'settlement' : !currentEvent()?.entriesOpen)) { location.replace(pageUrl('settlement')); return; }
      if (role === 'vendor' && section === 'profile') await renderProfile();
      else if (role === 'vendor' && new URLSearchParams(location.search).get('edit') === 'example') editEntry(entries().find(e => e.id === 'entry-draft') || blankEntry());
      else renderList();
    } catch (e) { $('content').innerHTML = `<div class="entry-title"><h1>화면을 열 수 없어요</h1><p class="inline-error" role="alert">${esc(e.message)}</p><button type="button" class="primary" id="retry-entry">다시 시도</button></div>`; $('retry-entry').onclick = start; }
  }
  window.addEventListener('message', async event => {
    if (Store.live) return;
    if (event.origin !== location.origin || event.data !== 'reset-entry-preview') return;
    if ((dirty || profileDirty || parentDirty) && !confirm('작성한 내용을 포함해 출품 예시를 초기화할까요?')) return;
    if (busy || uploading) return;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    try {
      state = (await Store.send({ type: 'reset' })).state;
      await fetch('/preview-reset', { method: 'POST' });
      profilePromptShown = false; try { localStorage.removeItem(profilePromptKey()); } catch {}
      dirty = profileDirty = parentDirty = false; renderList(); toast('출품 예시를 초기화했어요');
    }
    catch (e) { toast(e.message); }
  });
  await start();
})();

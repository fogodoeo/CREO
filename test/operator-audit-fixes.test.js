'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const pub = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

test('admin pages keep login gates hidden during initial auth verification and avoid password prompt on post-auth load errors', async () => {
  for (const [file, gateId] of [
    ['index.html', 'login-gate'],
    ['broadcast-studio.html', 'login-gate'],
    ['capture-gallery.html', 'login-gate'],
    ['channel-archives.html', 'login'],
    ['shipping-rates.html', 'auth-gate']
  ]) {
    const { document } = parseHTML(pub(file));
    assert.equal(document.getElementById(gateId).hidden, true, `${file}#${gateId} must start hidden`);
  }

  // broadcast-studio: post-auth load() error shows boot-error-card instead of password login form
  {
    const html = pub('broadcast-studio.html');
    const script = html.match(/<script>\s*(document\.addEventListener[\s\S]*?)<\/script>/)[1];
    const { document, window } = parseHTML(html);
    Object.defineProperty(document.getElementById('channel-select'), 'value', { writable: true, value: '' });
    document.getElementById('control-frame').contentWindow = {};
    vm.runInNewContext(script, {
      document, window, location: { search: '?channel=missing', origin: 'https://test.invalid' },
      history: { replaceState() {} }, URLSearchParams, confirm: () => false, requestAnimationFrame: (fn) => fn(),
      CreoStudioTheme: { setChannel() {} }, CreoOperatorPipeline: { sync() {} },
      CreoBroadcastProfiles: { resolve: () => ({ id: 'standard' }), studioFrame: () => 'editor.html' },
      CreoPlatform: {
        escapeHtml: String, setAdmin() {}, verifyAdmin: async () => true,
        api: async () => ({ channels: [{ id: 'national-cre', name: '전국크레자랑', status: 'active' }], activeChannelId: 'national-cre', rounds: [] })
      }
    });
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(setImmediate);
    assert.equal(document.getElementById('login-form').hidden, true);
    assert.equal(document.getElementById('boot-error-card').hidden, false);
    assert.match(document.getElementById('boot-error-text').textContent, /선택한 회차/);
  }

  // shipping-rates: transient loadCurrent() failure does not wipe admin session via logout()
  {
    const html = pub('shipping-rates.html');
    const script = html.match(/<script>\s*(const COMPANIES[\s\S]*?)<\/script>/)[1];
    const { document, window } = parseHTML(html);
    let loggedOut = 0;
    vm.runInNewContext(script, {
      document, window, URLSearchParams, location: { search: '', href: 'https://test.invalid/shipping-rates.html', replace() {} },
      history: { state: null, replaceState() {}, pushState() {}, back() {} },
      addEventListener() {}, matchMedia: () => ({ matches: false }), requestAnimationFrame: (fn) => fn(),
      CreoShippingAutomation: { refresh() {} },
      CreoPlatform: { verifyAdmin: async () => true, logout: async () => { loggedOut++; }, setAdmin() {} },
      getDodosiData: async () => { throw new Error('일시적 네트워크 지연'); },
      getPargeData: async () => ({ data: {} }),
      getWrapangData: async () => ({ data: {} })
    });
    await new Promise(setImmediate);
    assert.equal(loggedOut, 0);
    assert.equal(document.getElementById('auth-gate').hidden, true);
    assert.equal(document.getElementById('admin-content').hidden, false);
    assert.match(document.getElementById('status').textContent, /불러오지 못했습니다/);
  }
});

test('operator-embed intercepts drive, desktop app and number-labels links and clears dirty flag on form submit', () => {
  const { document, window } = parseHTML(
    '<html><head></head><body>' +
    '<a id="drive" href="/operator-drive.html">파일함</a>' +
    '<a id="desktop" href="/monitor-download.html">모니터 설치</a>' +
    '<a id="labels" href="/number-labels.html?channel=national-cre">번호라벨</a>' +
    '<form id="inline-form"><input id="field" value="a"></form>' +
    '</body></html>'
  );
  const messages = [];
  const frame = {
    frameElement: { id: 'operator-frame' },
    parent: { location: { pathname: '/main' }, postMessage: (data, origin) => messages.push({ data, origin }) }
  };
  vm.runInNewContext(pub('operator-embed.js'), {
    document, window: frame,
    location: { origin: 'https://test', href: 'https://test/operator-drive.html', pathname: '/operator-drive.html' },
    URL, URLSearchParams, MutationObserver: window.MutationObserver
  });

  for (const id of ['drive', 'desktop', 'labels']) {
    const ev = new window.Event('click', { bubbles: true, cancelable: true });
    ev.button = 0;
    document.getElementById(id).dispatchEvent(ev);
  }
  assert.deepEqual(
    messages.filter((m) => m.data.type === 'creo:operator-link').map((m) => m.data.href),
    ['/operator-drive.html', '/monitor-download.html', '/number-labels.html?channel=national-cre']
  );

  document.getElementById('field').dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(messages.at(-1).data.dirty, true);
  document.getElementById('inline-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(messages.at(-1).data.dirty, false);

  const css = pub('operator-embed.css');
  assert.match(css, /data-operator-page="shipping-rates\.html"\] #admin-button/);
  assert.match(css, /data-operator-page="operator-drive\.html"\] \.drive-head/);
  assert.match(css, /data-operator-page="monitor-download\.html"\] \.page-header/);
});

test('cross-family embedded links switch to a valid target round instead of dropping navigation', async () => {
  const Home = require('../public/operator-home-model');
  const Shell = require('../public/operator-shell-model');
  const channels = [
    { id: 'national-cre', name: '전국크레자랑', status: 'archived', dataAdapter: 'platform' },
    { id: 'national-cre-20261116', name: '2026.11.16 전라·충청편', status: 'draft', dataAdapter: 'platform', nationalRound: { parentId: 'national-cre', date: '2026-11-16' } },
    { id: 'clab-1112', name: '크레용 경매', status: 'active', dataAdapter: 'platform' }
  ];
  const rounds = [
    { channelId: 'national-cre-20261116', name: '2026.11.16 전라·충청편', status: 'draft', familyId: 'national-cre', date: '2026-11-16' },
    { channelId: 'clab-1112', name: '크레용 경매', status: 'active', familyId: 'clab', date: '2026-11-12', phase: 'finished' }
  ];

  const { document, window } = parseHTML(pub('index.html'));
  for (const s of document.querySelectorAll('select')) Object.defineProperty(s, 'value', { value: '', writable: true });
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.confirm = () => true;
  const location = { search: '?channel=clab-1112&view=access', origin: 'https://test', href: 'https://test/main?channel=clab-1112&view=access' };
  const history = {
    replaceState(_, __, url) { location.search = new URL(url, location.origin).search; },
    pushState(_, __, url) { this.replaceState(_, __, url); }
  };
  const ctx = {
    document, window, location, history, URL, URLSearchParams, CustomEvent: window.CustomEvent,
    CreoPlatform: { escapeHtml: String, verifyAdmin: async () => true, api: async () => ({ channels, rounds, activeChannelId: 'clab-1112' }) },
    CreoOperatorHome: Home, CreoOperatorShell: Shell
  };
  vm.createContext(ctx);
  for (const file of ['operator-home.js', 'operator-shell.js']) vm.runInContext(pub(file), ctx);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(setImmediate);

  // Home schedule deduplicates leading date and marks finished on-air round
  assert.equal(document.querySelector('#schedule-list strong').textContent, '전라·충청편');
  assert.match(document.getElementById('onair-name').textContent, /\(종료됨\)$/);
  assert.equal(document.querySelector('.onair').hasAttribute('data-finished'), true);

  // Clicking /organizer-bookings.html?channel=national-cre&action=region from clab-1112 switches cleanly to national-cre-20261116
  const frame = document.getElementById('operator-frame');
  Object.defineProperty(frame, 'contentWindow', { value: {}, configurable: true });
  const msg = new window.Event('message');
  Object.assign(msg, {
    origin: 'https://test',
    source: frame.contentWindow,
    data: { type: 'creo:operator-link', href: '/organizer-bookings.html?channel=national-cre&action=region' }
  });
  window.dispatchEvent(msg);
  assert.equal(location.search, '?channel=national-cre-20261116&view=regions');
  assert.match(frame.src, /organizer-bookings\.html\?channel=national-cre&action=region/);
});

test('checkout-changes does not mark shell dirty during initial read-only load', async () => {
  const html = pub('checkout-changes.html');
  const script = html.match(/<script>\s*('use strict'[\s\S]*?)<\/script>/)[1];
  const { document, window } = parseHTML(html);
  const messages = [];
  let finishLoad;
  const loadPromise = new Promise((resolve) => { finishLoad = resolve; });
  vm.runInNewContext(script, {
    document,
    window: { ...window, CreoPlatform: { verifyAdmin: () => loadPromise, api: async () => ({ records: [] }) }, parent: { postMessage: (d) => messages.push(d) }, addEventListener: window.addEventListener.bind(window) },
    URLSearchParams,
    location: { search: '?channel=national-cre', pathname: '/checkout-changes.html', origin: 'https://test' },
    confirm: () => true,
    CreoCarrierRequestReview: { render() {} },
    CreoCheckoutChangeReview: { render({ container }) { container.innerHTML = '<textarea id="memo"></textarea><input id="chk" type="checkbox">'; } }
  });
  assert.ok(messages.length >= 1);
  assert.equal(messages.at(-1).dirty, false, 'initial load must not mark shell dirty');
  assert.equal(messages.at(-1).busy, false, 'initial load must not block shell navigation');

  finishLoad(true);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  document.getElementById('chk').checked = true;
  document.getElementById('chk').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(messages.at(-1).dirty, true);
});

test('operator-login honors safe next path, blocks external redirects and breaks out of nested operator-frame', async () => {
  const code = pub('operator-login.js');
  async function runLogin({ search = '', inFrame = false, topPath = '/main', topSearch = '?channel=alpha&view=numberLabels' } = {}) {
    const { document, window } = parseHTML(pub('operator-login.html'));
    let selfReplaced = '', topReplaced = '';
    const topWindow = inFrame ? { location: { pathname: topPath, search: topSearch, replace: (u) => { topReplaced = u; } } } : null;
    const win = inFrame ? Object.assign(window, { top: topWindow }) : Object.assign(window, { top: window });
    vm.runInNewContext(code, {
      document, window: win, URLSearchParams,
      location: { search, replace: (u) => { selfReplaced = u; } },
      fetch: async () => ({ ok: true, json: async () => ({ authenticated: true }) })
    });
    document.getElementById('operator-password').value = 'secret';
    document.getElementById('operator-login').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await new Promise(setImmediate);
    return { selfReplaced, topReplaced };
  }

  assert.equal((await runLogin({ search: '?channel=alpha' })).selfReplaced, '/main?channel=alpha');
  assert.equal((await runLogin({ search: '?next=%2Fnumber-labels.html%3Fchannel%3Dalpha' })).selfReplaced, '/number-labels.html?channel=alpha');
  assert.equal((await runLogin({ search: '?next=%2F%2Fevil.example%2Fphish' })).selfReplaced, '/main');
  assert.equal((await runLogin({ search: '?next=https%3A%2F%2Fevil.example' })).selfReplaced, '/main');
  const framed = await runLogin({ search: '?next=%2Fnumber-labels.html', inFrame: true });
  assert.equal(framed.selfReplaced, '');
  assert.equal(framed.topReplaced, '/main?channel=alpha&view=numberLabels');
});

test('promo-center skips automatic vendor upload guide popup in admin=1 mode', async () => {
  for (const [search, expectedOffers] of [['?admin=1', 0], ['?library=1', 1]]) {
    const { document, window } = parseHTML(pub('promo-center.html'));
    let offers = 0;
    window.CreoPromoGuide = { offer: async () => { offers++; } };
    window.CreoVendorPortal = null;
    vm.runInNewContext(pub('promo-center.js'), {
      document, window, URL, URLSearchParams, crypto: require('node:crypto'),
      location: { search, origin: 'https://test.invalid', href: 'https://test.invalid/promo-center.html' + search },
      history: { replaceState() {} }, AbortSignal,
      CreoPlatform: { verifyAdmin: async () => true },
      fetch: async () => ({
        ok: true,
        json: async () => ({ now: Date.now(), revision: 1, capacity: 2, slots: { afternoon: { label: '오후', start: '13:30', end: '14:55' } }, vendors: [], templates: [], assignments: [], pending: [] })
      })
    });
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.equal(offers, expectedOffers, search);
  }
});

test('channel-archives enforces contrast-safe accent, ascending lot order and Korean status labels', () => {
  const html = pub('channel-archives.html');
  const script = html.match(/<script>\s*(const \$=id=>[\s\S]*?)<\/script>/)[1];
  const { document } = parseHTML(html);
  const ctx = vm.createContext({
    document, URLSearchParams, CSS: { escape: String },
    location: { search: '?channel=clab-1112' },
    CreoPlatform: { escapeHtml: String, verifyAdmin: () => new Promise(() => {}), api: async () => ({}) },
    CreoAuctionContract: require('../public/auction-contract')
  });
  vm.runInContext(script, ctx);

  // Light lavender #aaa0d8 is darkened so white button text stays readable
  const darkened = ctx.safeAccent('#aaa0d8');
  assert.match(darkened, /^#[0-9a-f]{6}$/);
  const r = parseInt(darkened.slice(1, 3), 16), g = parseInt(darkened.slice(3, 5), 16), b = parseInt(darkened.slice(5, 7), 16);
  assert.ok(0.299 * r + 0.587 * g + 0.114 * b <= 130, `expected darkened accent, got ${darkened}`);
  assert.equal(ctx.safeAccent('#254ac7'), '#254ac7');

  const markup = ctx.itemsMarkup([
    { lotNumber: 12, vendorName: '나업체', name: '개체B', status: 'passed', soldPrice: 0 },
    { lotNumber: 2, vendorName: '가업체', name: '개체A', status: 'sold', soldPrice: 150000 }
  ]);
  assert.ok(markup.indexOf('개체A') < markup.indexOf('개체B'), 'items must be sorted by lotNumber ascending');
  assert.match(markup, /<td>낙찰<\/td>/);
  assert.match(markup, /<td>유찰<\/td>/);
});

test('operator-work updates mobile #operator-task-select option counts and retains them across same-round tab switches', async () => {
  const { document, window } = parseHTML(pub('index.html'));
  document.getElementById('admin-nav').innerHTML = '<a data-work-key="organizer"></a><a data-work-group="finance"></a>';
  document.getElementById('operator-task-select').innerHTML =
    '<option value="shipping" data-base-label="낙찰자 입금·배송 관리">낙찰자 입금·배송 관리</option>' +
    '<option value="organizer" data-base-label="업체 정산·입금 확인">업체 정산·입금 확인</option>';
  const pending = [];
  vm.runInNewContext(pub('operator-work.js'), {
    document, window, location: { origin: 'https://test' }, encodeURIComponent,
    setTimeout: () => 1, clearTimeout() {},
    CreoPlatform: { api: (p) => new Promise((resolve) => pending.push({ p, resolve })) }
  });
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const state = { channel: { id: 'round-1' }, archiveId: '' };
  document.dispatchEvent(new window.CustomEvent('creo:operator-ready', { detail: { state } }));
  pending.shift().resolve({ channelId: 'round-1', counts: { shipping: 2, organizer: 3, changes: 0 } });
  await new Promise(setImmediate);

  const opts = [...document.querySelectorAll('#operator-task-select option')];
  assert.equal(opts[0].textContent, '낙찰자 입금·배송 관리 (2건)');
  assert.equal(opts[1].textContent, '업체 정산·입금 확인 (3건)');

  // Simulate operator-shell rebuilding #operator-task-select on sub-tab change within same round
  document.getElementById('operator-task-select').innerHTML =
    '<option value="shipping" data-base-label="낙찰자 입금·배송 관리">낙찰자 입금·배송 관리</option>' +
    '<option value="organizer" data-base-label="업체 정산·입금 확인" selected>업체 정산·입금 확인</option>';
  document.dispatchEvent(new window.CustomEvent('creo:operator-ready', { detail: { state } }));
  assert.equal(document.querySelector('#operator-task-select option[value="organizer"]').textContent, '업체 정산·입금 확인 (3건)');

  // Switching to a different round clears stale counts immediately
  document.dispatchEvent(new window.CustomEvent('creo:operator-ready', { detail: { state: { channel: { id: 'round-2' }, archiveId: '' } } }));
  assert.equal(document.querySelector('#operator-task-select option[value="organizer"]').textContent, '업체 정산·입금 확인');
});

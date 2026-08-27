'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGES = [
    'index.html',
    'channel-manager.html',
    'channel-workspace.html',
    'platform-layout-editor.html',
    'auction-control.html',
    'broadcast-studio.html',
    'auction-live.html',
    'channel-shipping.html',
    'shipping-companies.html',
    'shipping-rates.html',
    'broadcast-router.html',
    'capture-gallery.html',
    'ranking.html',
    'channel-rankings.html',
    'broadcast.html',
    'crewart-broadcast.html'
];

test('platform pages contain valid inline JavaScript and required viewport metadata', () => {
    for (const file of PAGES) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
        assert.match(source, /<meta[^>]+name=["']viewport["']/i, `${file} needs a viewport`);
        const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
            .filter((match) => !/\bsrc\s*=/.test(match[0].slice(0, match[0].indexOf('>') + 1)))
            .map((match) => match[1])
            .filter((script) => script.trim());
        assert.ok(inlineScripts.length, `${file} should have inline behavior`);
        inlineScripts.forEach((script, index) => {
            assert.doesNotThrow(() => new vm.Script(script, { filename: `${file}#${index + 1}` }));
        });
    }
});

test('platform client script is valid JavaScript', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'platform-client.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: 'platform-client.js' }));
    assert.match(source, /\/api\/platform\/auth\/login/);
    assert.match(source, /credentials:\s*'same-origin'/);
    assert.match(source, /SESSION_MARKER/);
    assert.match(source, /async function logout/);
});

test('the universal broadcast route delegates renderer selection to channel profiles', () => {
    const router = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-router.html'), 'utf8');
    assert.doesNotMatch(router, /supabase-bridge|active_event_module|getRuntimeConfigMap/i);
    assert.match(router, /\/api\/platform\/active-channel/);
    assert.match(router, /broadcast-profiles\.js/);
    assert.match(router, /\/api\/platform\/channels\//);
    assert.match(router, /CreoBroadcastProfiles\.broadcastTarget/);
    assert.match(router, /const preview=params\.get\('preview'\)===['"]1['"]/);
    assert.match(router, /const channelId=preview\?\(normalize\(params\.get\('event'\)\)\|\|activeChannelId\):activeChannelId/);
    assert.doesNotMatch(router, /channelId?\s*===\s*['"](?:cdcup|crewart)['"]/);
});

test('home is an operational channel launcher without duplicate management routes', () => {
    const hub = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.match(hub, /id="login-gate"/);
    assert.match(hub, /id="dashboard" hidden/);
    assert.match(hub, /id="admin-password"/);
    assert.match(hub, /CreoPlatform\.verifyAdmin\(\)/);
    assert.match(hub, /CreoPlatform\.logout\(\)/);
    assert.match(hub, /id="quick-workspace"/);
    assert.doesNotMatch(hub, /id="quick-print"|<strong>인쇄 페이지<\/strong>|print\.href=runtime\.url\('print'\)/);
    assert.match(hub, /id="quick-survey"[^>]*href="crewart-survey\.html"[^>]*hidden/);
    assert.match(hub, /id="quick-shipping"/);
    assert.doesNotMatch(hub, /id="quick-companies"|shipping-companies\.html/);
    assert.match(hub, /id="quick-rounds"/);
    assert.doesNotMatch(hub, /id="quick-rankings"/);
    assert.match(hub, /id="quick-broadcast"/);
    assert.match(hub, /id="quick-captures"/);
    assert.match(hub, /id="quick-settings"/);
    assert.match(hub, /id="quick-design"/);
    assert.match(hub, /function workspaceUrl\(c\)/);
    assert.match(hub, /Promise\.all\(\[CreoPlatform\.api\('channels'\),CreoPlatform\.api\('active-channel'\)\]\)/);
    assert.match(hub, /initialId=channels\.some\(channel=>channel\.id===requested\)\?requested:operatingChannelId/);
    assert.match(hub, /c\.id===operatingChannelId\?' · 현재 운영':''/);
    assert.match(hub, /runtime\.url\('shipping'\)/);
    assert.match(hub, /rounds\.href=runtime\.url\('archives'\)/);
    assert.doesNotMatch(hub, /runtime\.extension\('archives'\)/);
    assert.doesNotMatch(hub, /rankings\.href=runtime\.url\('rankings'\)/);
    assert.doesNotMatch(hub, /shipping\.href=`channel-shipping\.html/);
    assert.match(hub, /runtime\.extension\('survey'\)/);
    assert.match(hub, /runtime\.url\('control'\)/);
    assert.doesNotMatch(hub, /id="quick-archives"|전체 채널|현장 운영|방송 열기/);
    assert.doesNotMatch(hub, /모든 경매 운영을|한곳에서\.|채널은 완전히|공통 도구|관리하기/);
});

test('broadcast studio uses shared profiles instead of channel-specific branches', () => {
    const { channelLinks } = require('../platform-core');
    assert.equal(channelLinks('cdcup').control, '/broadcast-studio.html?channel=cdcup');
    assert.equal(channelLinks('crewart').control, '/broadcast-studio.html?channel=crewart');
    assert.equal(channelLinks('sample').control, '/broadcast-studio.html?channel=sample');
    const studio = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-studio.html'), 'utf8');
    const legacy = fs.readFileSync(path.join(__dirname, '..', 'public', 'settings.html'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    assert.match(studio, /broadcast-profiles\.js/);
    assert.match(studio, /CreoBroadcastProfiles\.studioFrame/);
    assert.match(studio, /CreoBroadcastProfiles\.resolve/);
    assert.doesNotMatch(studio, /channel\?\.id\s*===\s*['"](?:cdcup|crewart)['"]/);
    assert.match(studio, /broadcast-router\.html\?event=/);
    assert.match(studio, /CreoPlatform\.api\('active-channel',[\s\S]{0,180}method:'PUT'/);
    assert.match(studio, /expectedCurrentChannelId:activeChannel\.id/);
    assert.match(studio, /confirmChannelId:next\.id/);
    assert.match(studio, /channel-switch-button/);
    assert.match(studio, /select\.addEventListener\('change',markPending\)/);
    assert.match(studio, /currentChannel=channels\.find\(channel=>channel\.id===current\.channelId\)\|\|channels\[0\]/);
    assert.match(studio, /channel\.status==='active'&&channel\.features\?\.broadcast!==false/);
    assert.match(studio, /capture-gallery\.html\?channel=/);
    assert.match(studio, /진행 · 1P/);
    assert.match(studio, /경매 · 2P/);
    assert.match(studio, /집계 · 3P/);
    assert.match(studio, /data-view="layout-1"/);
    assert.match(studio, /data-view="layout-2"/);
    assert.match(studio, /data-view="layout-3"/);
    assert.match(studio, /data-view="settings"/);
    assert.match(studio, /function frameUrl\(channel,view\)/);
    assert.match(studio, /let activeView=/);
    assert.doesNotMatch(studio, /const\s+activeView\s*=/);
    assert.match(studio, /function liveUrl\(channel,page\)/);
    assert.doesNotMatch(studio, /id="mode-operations"|id="mode-archives"|data-mode="layout"/);
    assert.match(legacy, /broadcast-studio\.html\?channel=/);
    assert.match(control, /broadcast-studio\.html\?channel=/);
    const workspace = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-workspace.html'), 'utf8');
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-shipping.html'), 'utf8');
    assert.match(workspace, /c\?\.links\?\.control/);
    assert.doesNotMatch(shipping, /c\?\.links\?\.control|manage-link|control-link/);
});

test('channel creation starts with a safe generated id and protects unsaved edits', () => {
    const manager = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-manager.html'), 'utf8');
    assert.match(manager, /function nextChannelId\(\)/);
    assert.match(manager, /draft\.id=nextChannelId\(\)/);
    assert.match(manager, /copy\.id=nextChannelId\(\)/);
    assert.match(manager, /channel-form'\)\.reportValidity\(\)/);
    assert.match(manager, /function canDiscard\(\)/);
    assert.match(manager, /beforeunload/);
    assert.match(manager, /scrollbar-width:none/);
    assert.match(manager, /shipping-pickup-locations/);
    assert.match(manager, /shippingDefaults:\{pickupLocations:/);
    assert.match(manager, /id="settlement-discount-enabled"/);
    assert.match(manager, /id="settlement-discount-rule"/);
    assert.match(manager, /id="settlement-discount-rate"/);
    assert.match(manager, /settlementDiscount:\{enabled:/);
    assert.match(manager, /channels\?includeArchived=1/);
    assert.match(manager, /function syncFeatureUi/);
    assert.match(manager, /data-key="topN"/);
    assert.match(manager, /id="broadcast-default-notice"/);
    assert.match(manager, /id="broadcast-default-page1-ticker"/);
    assert.match(manager, /id="broadcast-default-page2-ticker"/);
    assert.match(manager, /id="broadcast-default-page3-title"/);
    assert.match(manager, /broadcastDefaults/);
    assert.doesNotMatch(manager, /<label for="broadcast-template">집계 화면 기본형/);
});

test('shared workspace builds real select fields for channel groups and auction state', () => {
    const workspace = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-workspace.html'), 'utf8');
    assert.match(workspace, /color-scheme:light/);
    assert.match(workspace, /field\('groupId',term\('group','그룹'\),record\?\.groupId,'select'/);
    assert.match(workspace, /field\('status','상태',record\?\.status,'select'/);
    assert.match(workspace, /field\('winnerAlias','방송용 낙찰자명'/);
    assert.match(workspace, /auction-transition/);
    assert.match(workspace, /등록 채널 주소가 올바르지 않습니다/);
    assert.doesNotMatch(workspace, /requested:\(catalog\.channels\[0\]/);
    assert.doesNotMatch(workspace, /setLive[\s\S]{0,500}broadcast-state/);
});

test('operational pages load the shared auction contract before legacy data scripts', () => {
    const files = fs.readdirSync(path.join(__dirname, '..', 'public')).filter((file) => file.endsWith('.html'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
        const dependentIndexes = [
            source.indexOf('supabase-bridge.js'),
            source.indexOf('event-modules.js'),
            source.indexOf('cdcup-tournament-data.js')
        ].filter((index) => index >= 0);
        if (!dependentIndexes.length) continue;
        const contractIndex = source.indexOf('auction-contract.js');
        assert.ok(contractIndex >= 0, `${file} must load auction-contract.js`);
        assert.ok(dependentIndexes.every((index) => contractIndex < index), `${file} must load the contract first`);
    }
});

test('every non-survey operational page has a real document title', () => {
    const pages = fs.readdirSync(path.join(__dirname, '..', 'public'))
        .filter((name) => name.endsWith('.html') && !name.startsWith('crewart-survey'));
    for (const page of pages) {
        const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
        const head = html.slice(0, html.search(/<\/head>/i));
        assert.match(head, /<title>\s*[^<\s][^<]*<\/title>/i, `${page} needs a non-empty <title>`);
    }
});

test('shipping pickup locations follow channel configuration without channel-id branches', () => {
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'shipping.html'), 'utf8');
    assert.match(shipping, /channel\?\.shippingDefaults\?\.pickupLocations/);
    assert.match(shipping, /channelPickupLocations\.map/);
    assert.doesNotMatch(shipping, /SHIPPING_CHANNEL_ID\s*===\s*['"]creyon['"]/);
});

test('capture setup distributes the no-Python F3 agent with diagnostics', () => {
    const setup = fs.readFileSync(path.join(__dirname, '..', 'public', 'capture-setup.html'), 'utf8');
    assert.match(setup, /creo-capture-agent-v1\.2\.3\.zip/);
    assert.match(setup, /출력 스크린샷<\/b>을 <span class="key">F3<\/span>/);
    assert.match(setup, /INSTALL\.cmd/);
    assert.match(setup, /CREO Capture Diagnostics/);
    assert.doesNotMatch(setup, /Ctrl \+ Shift \+ F12|install\.bat/);
});

test('operator UI examples do not embed real tournament participant names', () => {
    const preview = fs.readFileSync(path.join(__dirname, '..', 'public', 'preview.html'), 'utf8');
    for (const participant of ['렙소디', '베누스', '디어렙 청주', '미야게코', '니코게코']) {
        assert.doesNotMatch(preview, new RegExp(participant));
    }
    assert.match(preview, /업체 A&#10;업체 B&#10;업체 C/);
});

test('the new broadcast implements three independent camera overlays', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    const metal = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-skin-metal.css'), 'utf8');
    assert.match(live, /1P · HOST/);
    assert.match(live, /2P · ITEM/);
    assert.match(live, /LIVE AUCTION TOTAL/);
    assert.match(live, /function pageOne/);
    assert.match(live, /function pageTwo/);
    assert.match(live, /function pageThree/);
    assert.match(live, /page1BannerOn/);
    assert.match(live, /page2SoldOn/);
    assert.match(live, /if\(!s\.page3On\)return''/);
    assert.match(live, /background:transparent/);
    assert.match(live, /broadcast-pulse/);
    assert.match(live, /function schedulePulse/);
    assert.match(live, /mode==='live'\?700:2500/);
    assert.match(live, /function teamStats\(items\)/);
    assert.match(live, /function scoreboardRows\(channel,items,board\)/);
    assert.match(live, /function boardValue\(row,board,unit\)/);
    assert.match(live, /function placed\(value\)/);
    assert.match(live, /auction-skin-metal\.css/);
    assert.match(metal, /body\[data-skin="metal"\] \.host-card/);
    assert.match(metal, /body\[data-skin="metal"\] \.item-copy/);
    assert.match(metal, /body\[data-skin="metal"\] \.sold-notice/);
    assert.match(metal, /--brand-spectrum/);
    assert.match(live, /data-pos/);
    assert.match(live, /data-zone/);
    assert.match(live, /팀별 낙찰금액/);
    assert.match(live, /quizStatus==='open'/);
    assert.match(live, /첫 정답자/);
    assert.match(live, /document\.hidden/);
    assert.doesNotMatch(live, /setInterval\(refresh,1000\)/);
});

test('established CDCUP registration, list, print, and round archive remain intact', () => {
    const operations = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-index.html'), 'utf8');
    for (const label of ['개체 등록', '개체 목록', '인쇄', '회차 기록']) assert.match(operations, new RegExp(label));
    assert.match(operations, /shipping\.html\?channel=cdcup/);
    assert.match(operations, /vendor-mode/);
    assert.match(operations, /id="admin-archive-tab"/);
    assert.match(operations, /href="shipping\.html"/);
    assert.match(operations, /html\.vendor-mode #admin-archive-tab/);
    assert.match(operations, /html\.admin-mode \.vendor-only/);
    assert.match(operations, /사진 · 혈통 · 상태 추가/);
    assert.match(operations, /class="register-actions"/);
    assert.match(operations, /VENDOR_REGISTRATION_PREFS/);
    assert.match(operations, /updateRegisterActions\(\)/);
    assert.match(operations, /업체 정보는 유지하고 다음 개체만 비움/);
    assert.match(operations, /id="pp-search-input"/);
    assert.match(operations, /openParentRegistrationFromPicker/);
    assert.match(operations, /등록하고 선택/);

    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    assert.match(bridge, /async function addParentsBatch/);
    assert.match(bridge, /photo: r\.photo_url/);
});

test('CDCUP opens on sortable shipping completion results without auction number columns', () => {
    const operations = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-index.html'), 'utf8');
    const summary = fs.readFileSync(path.join(__dirname, '..', 'public', 'summary.html'), 'utf8');
    assert.match(operations, /href="shipping\.html\?channel=cdcup"/);
    assert.match(summary, /href="shipping\.html\?channel=cdcup"/);
    assert.doesNotMatch(operations + summary, /href="channel-shipping\.html\?channel=cdcup"/);
    assert.match(operations, /<button class="cdcup-tab tab-btn active" onclick="showTab\('print',this\)">인쇄<\/button>/);
    assert.match(operations, /if \(!openInitialTabFromUrl\(\)\) showTab\('print'\)/);
    assert.match(operations, /id="print-sub-presult" class="print-sub active"/);
    assert.match(operations, /배송지 입력이 완료되었습니까\?/);
    assert.match(operations, /업체명: /);
    assert.match(operations, /위 항목의 상태를 \[' \+ nextStatus \+ '\]로 변경하는 것이 맞습니까\?/);
    assert.match(operations, /\.ptable-result col:nth-child\(6\) \{ width: auto; \}/);
    assert.match(operations, /#tab-print \.ptable-result \.pstatus[\s\S]*text-align: left !important;/);
    assert.match(operations, /#tab-print \.ptable-result \.psold,[\s\S]*text-align: right !important;/);
    assert.match(operations, /function fmtSoldPriceNumber\(v\)/);
    assert.match(operations, /<td class="psold">' \+ \(it\.soldPrice \? fmtSoldPriceNumber\(it\.soldPrice\) : ''\)/);
    assert.match(operations, /function sortPrintResults\(key\)/);
    assert.match(operations, /printResultHeader\('상태', 'complete'\)/);
    assert.match(operations, /\['업체', '이름', '낙찰가\(만원\)', '낙찰자', '연락처', '배송', '상태'\]/);
    assert.match(operations, /completions\[shippingCompletionId\(it\)\] \? '완료' : ''/);
    assert.doesNotMatch(operations, /ptable-result[^\n]*<th>번호<\/th><th>구분<\/th>/);
});

test('new CDCUP overlays and shipping retain compatibility with the established item list', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const channelShipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-shipping.html'), 'utf8');
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'shipping.html'), 'utf8');
    for (const source of [live, control]) {
        assert.match(source, /getBroadcastItemsCached/);
        assert.match(source, /CreoBroadcastProfiles\.usesLegacyData/);
        assert.doesNotMatch(source, /channelId\s*===\s*['"]cdcup['"]/);
    }
    assert.match(control, /profile\.defaultState/);
    assert.match(control, /ensureSharedPage2Controls/);
    assert.match(control, /name="page2VendorTagOn"/);
    assert.match(control, /name="page2BiddersOn"/);
    assert.match(control, /name="page2BiddersOpacity"/);
    assert.match(control, /name="page2BiddersFontSize"/);
    assert.match(control, /name="page2ItemFontSize"/);
    assert.match(control, /name="page2BiddersPosition"/);
    assert.match(live, /function pageTwoBidders/);
    assert.match(live, /function bidAmountLabel\(value\)\{const amount=Number\(value\)\|\|0;/);
    assert.match(live, /bidLog:\[\{name:'입찰자',region:'지역',amount:10\}\]/);
    assert.match(live, /class="vendor-tag"/);
    assert.match(live, /class="vendor-tag">\[\$\{esc\(item\.vendorName\)\}\]<\/span>/);
    assert.match(live, /\.item-name strong,\.vendor-tag\{[\s\S]{0,180}color:#fff;font-size:23px;font-weight:800/);
    assert.match(live, /rankOpacity=\[1,\.90,\.86,\.78,\.70,\.64,\.58,\.52\]/);
    assert.match(channelShipping, /location\.replace\(target\.pathname\+target\.search\)/);
    assert.match(channelShipping, /shipping\.html/);
    assert.doesNotMatch(channelShipping, /<a\b|id="channel-select"|id="manage-link"|id="control-link"/);
    assert.match(shipping, /SHIPPING_CHANNEL_ID/);
    assert.match(shipping, /channel-adapters\.js/);
    assert.match(shipping, /CreoChannelAdapters\.resolve/);
    assert.match(shipping, /settlement-discount\.js/);
    assert.match(shipping, /function settlementDiscountFor/);
    assert.match(shipping, /settlement\.payableAuctionAmount \+ shippingShare/);
    assert.match(shipping, /settlement\.payableAuctionAmount \+ totalShipping/);
    assert.match(shipping, /adapter\.loadShippingItems/);
    assert.match(shipping, /adapter\.saveShippingItem/);
    assert.match(shipping, /saveShippingItem/);
    assert.match(shipping, /openShippingAdminLogin\(\{ required: true \}\)/);
    assert.match(shipping, /await initializeShipping\(\)/);
    assert.match(shipping, /SHIPPING_COMPANY_STORAGE_KEY/);
    assert.match(shipping, /const getWrapangCost = cost => Math\.round\(Number\(cost\) \|\| 0\)/);
    assert.doesNotMatch(shipping, /WRAPANG_DISCOUNT_RATE|getDiscountedWrapangCost|랩팡.{0,20}할인|할인.{0,20}랩팡/);
    assert.match(shipping, /\['도도시', '파르게', '랩팡'\]\.includes\(shippingCompany\)/);
    assert.doesNotMatch(shipping, /WRAPANG_PAYMENT_ACCOUNT|isWrapangCentralPayment|랩팡 직접입금|랩팡 합배송비|중복 입금/);
    assert.doesNotMatch(shipping, /id="shipping-channel-home"|>채널홈</);
    assert.match(shipping, /openShippingAdminLogin\(\{ required: true \}\)/);
    assert.match(shipping, /배송업체 로그인/);
    assert.match(shipping, /channel\?\.name \|\| SHIPPING_CHANNEL_ID/);
    assert.match(shipping, /document\.title = `\$\{label\} · 배송관리`/);
    assert.match(shipping, /id="shipping-buyer-title"/);
    assert.doesNotMatch(shipping, /id="shipping-workspace-link"/);
    assert.match(shipping, /if \(!SHIPPING_CHANNEL_ID\) location\.replace\('\/'\)/);
    assert.doesNotMatch(shipping, /get\('channel'\) \|\| 'cdcup'/);
    const shippingStatus = fs.readFileSync(path.join(__dirname, '..', 'public', 'shipping-status.html'), 'utf8');
    assert.match(shippingStatus, /CreoChannelAdapters\.resolve/);
    assert.match(shippingStatus, /adapter\.loadShippingItems/);
    assert.match(shippingStatus, /id="basis-company"/);
    assert.match(shippingStatus, /id="mode-company"/);
    assert.match(shippingStatus, /function renderCompanies/);
    assert.match(shippingStatus, /buildCompanyGroups\(\)/);
    assert.match(shippingStatus, /id="shipping-status-title"/);
    assert.match(shippingStatus, /document\.title = `\$\{label\} · 배송 조회`/);
    assert.match(shippingStatus, /shipping-access\.js/);
    assert.match(shippingStatus, /CreoShippingAccess\.require\(\)/);
    assert.doesNotMatch(shippingStatus, /id="shipping-channel-home"|>채널홈</);
    assert.doesNotMatch(shippingStatus, /shipping-workspace-link/);
    assert.match(shippingStatus, /if \(!SHIPPING_CHANNEL_ID\) location\.replace\('\/'\)/);
    const companies = fs.readFileSync(path.join(__dirname, '..', 'public', 'shipping-companies.html'), 'utf8');
    assert.match(companies, /shipping-status\.html\?channel=\$\{encodeURIComponent\(channel\)\}&view=company/);
    assert.doesNotMatch(companies, /CreoChannelAdapters\.resolve|adapter\.loadShippingItems|<main/);
});

test('new platform channels use the shared three-page arranger and CDCUP registration entry', () => {
    const profiles = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-profiles.js'), 'utf8');
    const editor = fs.readFileSync(path.join(__dirname, '..', 'public', 'platform-layout-editor.html'), 'utf8');
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    const studio = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-studio.html'), 'utf8');
    const runtime = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-runtime.js'), 'utf8');
    const legacyEntry = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-index.html'), 'utf8');
    assert.match(profiles, /platform-layout-editor\.html\?channel=/);
    assert.match(editor, /요소를 끌어 이동/);
    assert.match(editor, /layoutPlacements/);
    assert.match(editor, /broadcast-state/);
    assert.match(editor, /p3-board/);
    assert.match(editor, /p3-effect/);
    assert.match(editor, /id="content"[^>]*>문구·내용/);
    assert.match(editor, /type:'creo-open-studio-view',view:'settings'/);
    assert.match(studio, /event\.data\?\.type==='creo-open-studio-view'/);
    assert.match(live, /dataset\.layoutSlot=slot/);
    assert.match(live, /editorMode\)void refreshFull\(\)/);
    assert.match(runtime, /workspace:[\s\S]{0,120}path: '\/cdcup-index\.html'/);
    assert.match(legacyEntry, /channel-workspace\.html\?channel=/);
});

test('print forms remain available inside the shared registration workspace without a duplicate home shortcut', () => {
    const home = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const workspace = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-workspace.html'), 'utf8');
    const print = fs.readFileSync(path.join(__dirname, '..', 'public', 'print.html'), 'utf8');
    assert.doesNotMatch(home, /id="quick-print"|인쇄 페이지|print\.href=runtime\.url\('print'\)/);
    assert.match(workspace, /id="print-link"/);
    assert.match(workspace, /`print\.html\?\$\{q\}`/);
    assert.match(print, /platform-client\.js/);
    assert.match(print, /channel-adapters\.js/);
    assert.match(print, /function platformPrintItems\(workspace, channel\)/);
    assert.match(print, /CreoChannelAdapters\.platformChecklist\(item, channel\)/);
    assert.match(print, /channels\/['"]? \+ encodeURIComponent\(PRINT_CHANNEL_ID\) \+ ['"]?\/workspace/);
    assert.match(print, />경매 리스트<\/button>/);
    assert.match(print, />낙찰 결과<\/button>/);
    assert.match(print, />구매자별<\/button>/);
    assert.match(print, /function toggleOrientation\(\)/);
    assert.match(print, /shippingText\(it\)/);
    assert.match(print, /id="print-login"/);
    assert.doesNotMatch(print, /channelId\s*===\s*['"]creyon['"]/);
});

test('episode management expands round details and aggregate rankings in one place', () => {
    const studio = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-studio.html'), 'utf8');
    const archives = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-archives.html'), 'utf8');
    assert.doesNotMatch(studio, /id="mode-archives"|function archivesUrl|channel-archives\.html/);
    assert.match(archives, /channels\/\$\{encodeURIComponent\(channelId\)\}\/archives/);
    assert.match(archives, /function roundMarkup/);
    assert.match(archives, /function boardMarkup/);
    assert.match(archives, /function itemsMarkup/);
    assert.match(archives, /CdcupTournamentData\.buildRoundAmounts/);
    assert.match(archives, /listAuctionArchives/);
    assert.match(archives, /getAuctionArchive/);
    const rankings = fs.readFileSync(path.join(__dirname, '..', 'public', 'ranking.html'), 'utf8');
    assert.match(rankings, /location\.replace\(`channel-archives\.html/);
    const rankingAlias = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-rankings.html'), 'utf8');
    assert.match(rankingAlias, /location\.replace\(`channel-archives\.html/);
    assert.match(archives, /현재 회차 저장/);
});

test('broadcast studio handles expired embedded editor sessions without exposing credentials', () => {
    const studio = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-studio.html'), 'utf8');
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-broadcast-bridge.js'), 'utf8');
    assert.match(bridge, /response\.status === 401/);
    assert.match(bridge, /postMessage\(\{ type: 'creo-admin-required' \}/);
    assert.match(studio, /event\.origin!==location\.origin/);
    assert.match(studio, /관리자 인증이 만료되었습니다\. 다시 로그인해 주세요\./);
});

test('legacy broadcast bridge survives Supabase quota exhaustion with cached or standby data', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    const cdcup = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
    assert.match(bridge, /SUPABASE_QUOTA_COOLDOWN_MS/);
    assert.match(bridge, /_readBroadcastStorage\('items', \[\]\)/);
    assert.match(bridge, /_readBroadcastStorage\('config', \{\}\)/);
    assert.match(cdcup, /await _refreshBroadcastFromItems\(\[\]\)/);
    assert.match(cdcup, /document\.getElementById\("info-name"\)\.textContent = cleanInfoName/);
    assert.match(cdcup, /String\(item\.company \|\| item\.vendorName \|\| ''\)\.trim\(\)/);
    assert.match(cdcup, /if \(meta\.auctionType !== AUCTION_TYPES\.TOURNAMENT\) return ''/);
    assert.match(cdcup, /itemAuctionMeta\.auctionType === AUCTION_TYPES\.TOURNAMENT/);
    assert.match(cdcup, /infoCompany\.textContent = `\[\$\{publicCompanyName\}\]`/);
    assert.match(cdcup, /infoCompany\.hidden = isHost \|\| !showCompanyInline/);
    assert.match(cdcup, /document\.getElementById\("info-sub"\)\.textContent = presentation\.label/);
});

test('CDCUP third-round preparation delegates one server transaction that also creates the auction list', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    const start = bridge.indexOf('async function archiveAndPrepareMedalDay');
    const end = bridge.indexOf('async function archiveAndResetAuction', start);
    const source = bridge.slice(start, end);
    assert.match(source, /\/api\/cdcup\/rounds\/prepare-three/);
    assert.match(source, /X-Creo-Admin/);
    assert.doesNotMatch(source, /items\?id=gt\.0/);
});

test('CDCUP three-round format assigns round-two teams and round-three finalists', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    const roundsApi = fs.readFileSync(path.join(__dirname, '..', 'cdcup-rounds-api.js'), 'utf8');
    const registration = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-index.html'), 'utf8');
    const preview = fs.readFileSync(path.join(__dirname, '..', 'public', 'preview.html'), 'utf8');
    const broadcast = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(bridge, { filename: 'supabase-bridge.js' }));
    assert.match(bridge, /function parseTournamentStageGroups/);
    assert.match(bridge, /function resolveTournamentStageGroup/);
    assert.match(bridge, /data\.teamCode = assignment\.code/);
    assert.match(bridge, /data\.tournamentStage = activeStage/);
    assert.match(bridge, /function parseTournamentFinalists/);
    assert.match(bridge, /3라운드 진출 업체/);
    assert.match(bridge, /tournament_finalists_4/);
    assert.match(roundsApi, /key: 'active_tournament', value: '4'/);
    assert.match(roundsApi, /roundThreeAuctionItems\(finalists\)/);
    assert.match(registration, /id="tournament-company-options"/);
    assert.match(registration, /function applyTournamentCompanyOptions/);
    assert.match(registration, /3라운드 목록 준비/);
    assert.match(preview, /자동 편성 사용 중/);
    assert.match(preview, /3라운드 개인전/);
    assert.match(broadcast, /configuredGroups\?\.groups\.find\(group => group\.code === team\)\?\.name/);
    assert.match(broadcast, /2라운드 팀 순위/);
    assert.match(broadcast, /3라운드 개인 순위/);
    assert.match(broadcast, /parseBroadcastFinalists/);
    assert.match(broadcast, /individual-ranking-grid/);
    assert.match(broadcast, /individual-stage-board/);
    assert.match(broadcast, /repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(broadcast, /hideCompanies \? esc\(entry\.anonymousCode\) : esc\(entry\.name\)/);
    assert.match(broadcast, /grid-template-columns: minmax\(0, 1fr\) minmax\(3\.2ch, auto\)/);
    assert.match(broadcast, /displayName\.trim\(\)\.split\(\/\\s\+\/\)/);
    assert.match(broadcast, /class="individual-name-line"/);
    assert.match(broadcast, /grid-template-rows: repeat\(2, auto\)/);
    assert.match(broadcast, /font-size: calc\(var\(--bracket-fs\) \* \.95\)/);
    assert.match(broadcast, /\.individual-ranking-grid \{[\s\S]{0,260}gap: 10px/);
    assert.match(broadcast, /\.individual-name-line \{[\s\S]{0,260}overflow-wrap: anywhere/);
    assert.doesNotMatch(broadcast, /\.individual-name-line \{[\s\S]{0,260}text-overflow: ellipsis/);
    assert.match(broadcast, /\.individual-amount \{[\s\S]{0,200}min-width: 3\.2ch/);
    assert.match(broadcast, /container-name: individual-rankings/);
    assert.match(broadcast, /@container individual-rankings \(max-width: 900px\)/);
    assert.match(broadcast, /@container individual-rankings[\s\S]{0,320}grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(broadcast, /const activeTournamentItem = scoped\.find\(item => isAuctionActiveItem\(item\)\)/);
    assert.match(broadcast, /activeCompanyKey/);
    assert.match(broadcast, /isLiveVendor \? ' is-live-vendor' : ''/);
    assert.doesNotMatch(broadcast, /index === 0 && entry\.total > 0 \? ' is-current'/);
    assert.match(broadcast, /@keyframes individual-live-vendor-glow/);
    assert.match(broadcast, /--individual-card-opacity/);
    assert.match(preview, /id="bracket-full-opacity-input"/);
    assert.match(preview, /bracket_full_card_opacity/);
    assert.match(bridge, /A1~H1, A2~H2, A3~H3/);
    assert.match(bridge, /최대 3개까지 등록/);
    assert.match(registration, /업체당 3개체/);
    assert.match(broadcast, /sports-match-card\.is-qualified/);
    assert.match(broadcast, /hideCompanies: String\(map\?\.bracket_full_blind/);
    assert.match(broadcast, /업체 \$\{memberIndex \+ 1\}/);
    assert.match(broadcast, /sports-match-card\.is-qualified/);
    assert.match(broadcast, /refreshBracketPage\(window\.latestItemsList/);
    assert.match(broadcast, /const isThreeRoundProgress = eventModule\.id === 'cdcup'/);
    assert.match(broadcast, /renderThreeRoundResults\(treeFull, Number\(displayStage\), map, window\.latestItemsList \|\| \[\]\)/);
    assert.match(broadcast, /treeFull\.style\.setProperty\('opacity', '1', 'important'\)/);
    assert.match(broadcast, /hideBlindTeamTotals\(\);/);
    assert.match(broadcast, /tree\.dataset\.threeRoundSignature === resultSignature/);
    assert.match(broadcast, /isFirstRender \? ' animate-in' : ''/);
    assert.match(broadcast, /업체 합산 낙찰금액 \$\{formatBlindTotalAmount\(totals\[name\] \|\| 0\)\}만원/);
    assert.match(broadcast, /bracket_team_details_show \?\? '0'/);
    assert.match(broadcast, /team-summary-only/);
    assert.match(preview, /id="toggle-bracket-team-details"/);
    assert.match(preview, /function toggleBracketTeamDetails/);
    assert.match(broadcast, /team-progress-amount/);
    assert.match(broadcast, /class="team-progress-members"/);
    assert.match(broadcast, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(preview, /결과판 배경:/);
    assert.match(preview, /postPreviewConfigPatch\(\{ blind_totals_opacity: String\(opacity\) \}\)/);
    assert.match(broadcast, /--full-board-opacity/);
    assert.match(broadcast, /boardOpacity \* 0\.05/);
    assert.match(preview, /2P 개체·실시간 입찰, 3P 전체 진행표로 각각 독립 송출/);
    assert.match(preview, /if \(pageNum === '2'\) \{[\s\S]*configMap\.live_bidders_show/);
    assert.match(preview, /configMap\['blind_totals_show'\] = '0'/);
    assert.match(broadcast, /const isEnabled = String\(map\?\.live_bidders_show \?\? '1'\) !== '0'/);
    assert.match(broadcast, /3P는 전체 진행표 전용이다/);
    assert.doesNotMatch(broadcast, /if \(isCdcupBlindTotalsMode\(map\)\) \{\s*updateP3SwitchingLogic/);
    assert.match(broadcast, /treeFull\.style\.setProperty\('display', 'none', 'important'\)/);
    assert.match(broadcast, /containerEl\.style\.setProperty\('visibility', 'hidden', 'important'\)/);
    assert.doesNotMatch(broadcast, /id="current-item-progress"/);
    assert.match(broadcast, /#auction-progress\.auction-progress\s*\{\s*display: inline-flex/);
    assert.match(broadcast, /min-height: 56px;[\s\S]*font-size: clamp\(40px, 2\.6vw, 54px\)/);
    assert.match(broadcast, /Math\.max\(40, Number\(cfg\.scoreboard_label_fontsize\) \+ 10\)/);
    assert.doesNotMatch(broadcast, /<div class="p2-live-bidders-head">/);
    assert.match(broadcast, /function applyPage2LiveBiddersPlacement\(cfg\)/);
    assert.match(broadcast, /height: var\(--p2-bidders-height, 42vh\)/);
    assert.doesNotMatch(broadcast, /max-height: var\(--p2-bidders-height/);
    assert.match(broadcast, /'--p2-bidders-height': normalizeCssLength\(cfg\.p2_live_bidders_height\) \|\| '42vh'/);
    assert.match(preview, /id="draggable-live-bidders"/);
    assert.match(preview, /id="live-bidders-font-input"/);
    assert.match(preview, /id="item-font-input"/);
    assert.match(preview, /p2_item_font_size/);
    assert.match(preview, /function previewLiveBiddersFontSize/);
    assert.match(preview, /function previewItemFontSize/);
    assert.match(preview, /configMap\.p2_live_bidders_font_size/);
    assert.match(broadcast, /cfg\.p2_item_font_size \|\| cfg\.scoreboard_name_fontsize/);
    assert.match(broadcast, /Math\.round\(itemFontSize \* 0\.56\)/);
    assert.match(broadcast, /--sb-detail-size/);
    assert.match(broadcast, /render\(item \|\| getPage2HeldItem\(items\)\)/);
    assert.match(broadcast, /if \(item\) lastRenderedItem = JSON\.parse\(JSON\.stringify\(item\)\)/);
    assert.match(broadcast, /return CreoAuctionContract\.isLiveStatus\(status\)/);
    assert.match(broadcast, /const isLiveItem = Boolean\(activeItem\) && isAuctionActiveItem\(activeItem\)/);
    assert.match(broadcast, /if \(!activeItem \|\| !isLiveItem\) \{[\s\S]{0,220}panel\.replaceChildren\(\)/);
    assert.match(broadcast, /if \(rows\.length === 0\)/);
    assert.match(broadcast, /const _p2LiveBiddersRankState = \{ itemKey: '', initialized: false \}/);
    assert.match(broadcast, /captureLeaderboardPositions\(listEl, '\.p2-live-bidder-row\[data-bidder-key\]'/);
    assert.match(broadcast, /animateLeaderboardRows\(listEl, beforePositions, '\.p2-live-bidder-row\[data-bidder-key\]'/);
    assert.match(broadcast, /@keyframes p2-bidder-row-enter/);
    assert.match(broadcast, /--p2-row-opacity/);
    assert.match(broadcast, /const rankOpacity = \[1, \.90, \.86, \.78/);
    assert.doesNotMatch(broadcast, /<span class="p2-live-bidder-rank">/);
    assert.match(preview, /\.bid-preview-row:nth-child\(3\) \{ opacity: \.86; \}/);
    assert.match(preview, /activeDragKey === 'banner' \? 24 : \(activeDragKey === 'contribution_roulette' \? 20 : 32\)/);
    assert.match(broadcast, /function freeBannerEdgeCss/);
    assert.match(broadcast, /container\.style\.right = freeBannerEdgeCss\(layout\.right, 'x'\)/);
});

test('broadcast control manages reusable banners, sponsors, and vendor logos', () => {
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    for (const marker of ['화면 자산', '회전 배너', '협찬 로고', '업체 로고', 'importLegacyAssets']) {
        assert.match(control, new RegExp(marker));
    }
    assert.match(live, /function pageAssets/);
    assert.match(live, /function vendorLogo/);
    assert.match(live, /ticker-sponsors/);
    assert.match(live, /Math\.floor\(Date\.now\(\)\/6000\)/);
    assert.match(live, /function isVideoAsset\(url\)/);
    assert.match(live, /muted autoplay loop playsinline preload="auto"/);
    assert.match(control, /crewartSampleAssets/);
    assert.doesNotMatch(control, /quiz-section|name="quizQuestion"|돌발 퀴즈/);
    assert.match(control, /value="vendor">업체별 금액/);
    assert.match(control, /value="team">그룹별 금액/);
    assert.match(control, /name="scoreboardId"/);
    for (const positionField of ['page1HostsPosition', 'page1NoticePosition', 'page1BannerPosition', 'page2HeaderPosition', 'page2InfoPosition', 'page2PhotoPosition', 'page2PricePosition', 'page2SoldPosition', 'page2BannerPosition', 'page3BoardPosition']) {
        assert.match(control, new RegExp(`name="${positionField}"`));
    }
    assert.match(control, /function updatePositionWarnings/);
    assert.match(control, /auction-transition/);
    assert.match(live, /function scoreboardRows/);
    assert.match(control, /seedCrewartAssets/);
    assert.match(live, /CREWART_DEFAULT_ASSETS/);
    const crewartLive = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-broadcast.html'), 'utf8');
    assert.match(crewartLive, /cfg\.ticker_show === '0'/);
    assert.match(crewartLive, /Number\(cfg\.ticker_interval\)/);
    assert.match(crewartLive, /crewart_ticker/);
    const legacySettings = fs.readFileSync(path.join(__dirname, '..', 'public', 'settings.html'), 'utf8');
    const preview = fs.readFileSync(path.join(__dirname, '..', 'public', 'preview.html'), 'utf8');
    assert.doesNotMatch(legacySettings, /id="live-quiz-card"|id="cfg-live-quiz-question"|돌발 퀴즈/);
    assert.match(legacySettings, /<details class="advanced-panel" open>/);
    assert.match(legacySettings, /html\.embedded #event-module-card\{display:none\}/);
    assert.doesNotMatch(legacySettings, /embedded-crewart \[data-control-scope="cdcup"\]/);
    assert.match(legacySettings, /m\.crewart_ticker = m\.ticker/);
    assert.match(legacySettings, /delete m\.ticker/);
    assert.match(legacySettings, /accept="image\/\*,video\/mp4,\.mp4"/);
    assert.match(legacySettings, /\? await compressMp4Banner\(file/);
    assert.match(legacySettings, /await updateConfigs\(\{ \['banner' \+ idx\]: publicUrl \}\)/);
    assert.match(preview, /activeDragKey === 'contribution_roulette'/);
    assert.match(preview, /background: rgba\(10,12,14,\.86\)/);
    const cdcupBroadcast = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
    const cdcupBracket = fs.readFileSync(path.join(__dirname, '..', 'public', 'tournament-bracket.html'), 'utf8');
    assert.match(legacySettings, /const TEAM_LOGO_LIMIT = 64/);
    assert.match(control, /for\(let i=1;i<=64;i\+\+\)/);
    assert.match(cdcupBroadcast, /for \(let i = 1; i <= 64; i\+\+\)/);
    assert.match(cdcupBracket, /function applyConfiguredTeamLogos/);
    assert.match(cdcupBracket, /applyConfiguredTeamLogos\(map\|\|\{\}\)/);
    for (const asset of [
        'crewart-live-banner.svg',
        'crewart-house-banner.svg',
        'creo-live-mark.svg',
        'crewarts-crest.png',
        'crewarts-great-hall.png',
        'creo-mascot-parchment.png'
    ]) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'assets', 'crewart-broadcast', asset)));
    }
    const crewartModules = fs.readFileSync(path.join(__dirname, '..', 'public', 'event-modules.js'), 'utf8');
    assert.match(crewartModules, /CREWARTS minimal ranked house cards/);
    assert.match(crewartModules, /class="crewart-house-card"/);
    assert.match(crewartModules, /data-rank="\$\{row\.rank\}"/);
    assert.match(crewartLive, /class="cw-house-key"><b>R<\/b><b>G<\/b><b>B<\/b><b>Y<\/b>/);
});

test('broadcast control automatically optimizes oversized MP4 banners before upload', () => {
    const settings = fs.readFileSync(path.join(__dirname, '..', 'public', 'settings.html'), 'utf8');
    assert.match(settings, /MP4_BANNER_TARGET = Object\.freeze\(\{ width: 480, height: 320, fps: 30, bitrate: 700000 \}\)/);
    assert.match(settings, /MediaRecorder\.isTypeSupported/);
    assert.match(settings, /dataset\.mp4Compression = mp4RecorderType\(\) \? 'supported' : 'original-fallback'/);
    assert.match(settings, /canvas\.captureStream\(MP4_BANNER_TARGET\.fps\)/);
    assert.match(settings, /await compressMp4Banner\(file/);
    assert.match(settings, /if \(alreadyCompact\) return file/);
    assert.match(settings, /blob\.size >= file\.size \* 0\.95/);
    assert.match(settings, /file\.size > 100 \* 1024 \* 1024/);
    assert.match(settings, /uploadFile\.size > 8 \* 1024 \* 1024/);
});

test('BASIC control uploads six dice videos and P3 renders parity totals without changing sold price', () => {
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    assert.match(control, /value="dice"/);
    assert.match(control, /주사위 눈금 \(1~6\)/);
    assert.match(control, /section\.id='dice-video-section'/);
    assert.match(control, /Array\.from\(\{length:6\}/);
    assert.match(control, /function optimizeDiceVideo/);
    assert.match(control, /width:960,height:540,fps:30,bitrate:1200000/);
    assert.match(control, /optimized\.size>8\*1024\*1024/);
    assert.match(control, /방송 채널 주소가 올바르지 않습니다/);
    assert.match(control, /\/api\/broadcast-assets\//);
    assert.match(control, /file\.size>8\*1024\*1024/);
    assert.match(live, /function renderDiceTeamsPageThree/);
    assert.match(live, /audience_group_key/);
    assert.match(live, /audience_contribution_amount/);
    assert.match(live, /kind==='dice'/);
    assert.match(live, /기여도 반영/);
});

test('common pinball resolves winners from the operating channel rather than the dashboard selection', () => {
    const hub = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const pinball = fs.readFileSync(path.join(__dirname, '..', 'roulette-app', 'src', 'app.ts'), 'utf8');
    assert.match(hub, /operatingChannel=catalog\.channels\.find\(channel=>channel\.id===operatingChannelId\)/);
    assert.match(pinball, /async function resolveActivePinballChannel/);
    assert.match(pinball, /fetch\('\/api\/platform\/active-channel'/);
    assert.match(pinball, /await resolveActivePinballChannel\(\)/);
    assert.match(pinball, /channels\/\$\{encodeURIComponent\(remoteChannelId\)\}\/broadcast/);
});

test('broadcast setup keeps live operations separate and removes dead legacy controls', () => {
    const legacySettings = fs.readFileSync(path.join(__dirname, '..', 'public', 'settings.html'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const workspace = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-workspace.html'), 'utf8');
    assert.doesNotMatch(legacySettings, /실시간 방송 미리보기|빠른 제어|방송 안내사항/);
    assert.doesNotMatch(legacySettings, /id="preview-frame"|id="qt-photo"|id="rule-list"/);
    assert.doesNotMatch(control, /id="preview-frame"|id="active-item"/);
    assert.match(control, /진행 화면 <small>1P<\/small>/);
    assert.match(control, /경매 화면 <small>2P<\/small>/);
    assert.match(control, /집계 화면 <small>3P<\/small>/);
    assert.match(control, /변경 저장/);
    assert.match(workspace, /id="live-panel"/);
    assert.match(workspace, /id="live-item"/);
    assert.match(workspace, /function setLive/);
});

test('CREWARTS uses one result journey and unlocks member detail by phone', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey-v4.css'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    assert.doesNotThrow(() => new vm.Script(script, { filename: 'crewart-survey.js' }));
    assert.doesNotMatch(html, /BAND 회원 연동/);
    assert.match(html, /id="member-dialog"/);
    assert.match(html, /data-nav="band"/);
    assert.match(html, /id="member-phone"/);
    assert.match(html, /id="member-check-submit-label">확인<\/strong>/);
    assert.doesNotMatch(html, /입력하신 번호는 가입 확인 외에 저장되지 않아요\./);
    assert.match(html, /<label class="cw-visually-hidden" for="member-phone">휴대전화번호<\/label>/);
    assert.match(html, /id="band-connection-status"/);
    assert.match(html, /id="home-band-title">BAND 가입여부 확인/);
    assert.match(html, /id="dialog-band-title">BAND 가입 여부 확인/);
    assert.doesNotMatch(html, /cw-band-identity|band-page-title|크레와트 커뮤니티/);
    assert.doesNotMatch(html, /CREWARTS COMMUNITY|<h1 id="band-page-title">BAND<\/h1>|>MEMBERSHIP</);
    assert.doesNotMatch(html, /BAND 가입 번호를 확인할게요|가입 승인된 BAND 프로필|설문 답변·결과와 함께 저장되지 않습니다/);
    assert.doesNotMatch(html, /결과 확인 전 한 번만/);
    assert.match(html, /BAND 가입하기/);
    assert.match(html, /id="member-join-link"[\s\S]*data-band-join[\s\S]*BAND 가입하기/);
    assert.doesNotMatch(html, /cw-band-page-join/);
    assert.doesNotMatch(css, /\.cw-band-page-join/);
    assert.doesNotMatch(html, /id="member-join-link"[^>]*hidden/);
    assert.doesNotMatch(html, /supabase-bridge\.js/);
    assert.match(css, /\.cw-choice-button[\s\S]*min-height:\s*78px/);
    assert.match(script, /function verifyMembershipPhone/);
    assert.match(script, /\/api\/crewart-survey\/bootstrap/);
    assert.match(script, /\/api\/crewart-survey\/responses/);
    assert.doesNotMatch(script, /getConfigMap|saveCrewartSurveyEntry/);
    assert.doesNotMatch(script, /openBandJoinWindow|bandPopup|window\.open\('', '_blank'/);
    assert.match(script, /question-label'\)\.hidden = true/);
    assert.match(script, /if \(!payload\.member\)[\s\S]*아직 가입되지 않은 번호예요[\s\S]*joinLink\.hidden = false[\s\S]*is-recommended[\s\S]*submitLabel\.textContent = '다시 확인'/);
    assert.match(script, /handleMemberJoinReturn[\s\S]*가입 승인 후 돌아오면 자동으로 다시 확인해요/);
    assert.match(css, /\.cw-dialog-band-button\.is-recheck/);
    assert.match(css, /\.cw-member-status\.is-action/);
    assert.doesNotMatch(script, /window\.location\.assign\(bandTargetUrl\)/);
    assert.match(script, /function recheckPendingMembership[\s\S]*completeMembershipAccess\(payload, verifiedPhone\)/);
    assert.match(script, /visibilitychange[\s\S]*recheckPendingMembership\(\{ visibleOnly: true \}\)/);
    const openMemberCheckBody = script.match(/function openMemberCheck\(options = \{\}\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.doesNotMatch(openMemberCheckBody, /\.focus\(/);
    assert.match(openMemberCheckBody, /member-dialog/);
    const showResultBody = script.match(/function showResult\(skipMbti\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.match(showResultBody, /completeResultReveal\(\)/);
    assert.doesNotMatch(showResultBody, /openMemberCheck/);
    assert.match(script, /function handleUnlockDetail\(\)[\s\S]*openMemberCheck\(\{ revealResult: true \}\)/);
    assert.match(script, /if \(!hasDetailedAccess\(\)\)\s*\{[\s\S]*void submitSurvey\(\{ silent: true \}\)/);
    assert.match(script, /function submitSurvey\(options = \{\}\)[\s\S]*const memberVerified = Boolean\(bandAuthToken && bandAuthUser\?\.isTargetMember\)/);
    assert.match(script, /const activeVersion = Core\.getSurveyVersion\(\)[\s\S]*loadQuestionnaireFile\(activeVersion\.questionsFile, activeVersion\.resultsFile\)/);
    assert.doesNotMatch(script, /getSurveyVersion\('v2'\)/);
    assert.doesNotMatch(script, /BAND_OAUTH_API|beginBandLogin/);
});

test('CREWARTS closed survey disables retakes in the client and rejects saves on the server', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    const api = fs.readFileSync(path.join(__dirname, '..', 'crewart-survey-api.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(html, /crewart-survey\.js\?v=20260823-survey-closed-v106/);
    assert.match(script, /surveyAcceptingResponses = payload\.acceptingResponses === true/);
    assert.match(script, /start\.disabled = !surveyAcceptingResponses/);
    assert.match(api, /if \(!currentSurvey\.acceptingResponses\)[\s\S]{0,180}신규 테스트 응시가 마감되었습니다/);
    assert.match(server, /defaultAcceptingResponses: false/);
});

test('CREWARTS home shows the saved result and only a masked authenticated phone', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    for (const id of ['auth-phone-number', 'auth-phone-edit', 'auth-phone-clear', 'home-result-card', 'home-retest', 'home-house-swatch', 'home-house-name', 'app-nav']) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
    }
    assert.match(html, /나의 크레 성향/);
    assert.match(html, /다시 테스트하기/);
    assert.match(html, /data-nav="home"[\s\S]*data-nav="result"/);
    assert.match(html, /data-nav="home"[\s\S]*data-nav="result"[\s\S]*data-nav="band"/);
    assert.doesNotMatch(html, /최근 결과|home-result-open|cw-home-panel|cw-home-member/);
    assert.match(script, /crewart_band_member_phone_mask_v1/);
    assert.match(script, /function maskPhone[\s\S]*\*\*\*\*/);
    assert.match(script, /if \(bandAuthToken && !bandAuthPhoneMask\)[\s\S]*removeItem\(MEMBERSHIP_STORAGE_KEY\)/);
    assert.match(script, /function saveLastResult/);
    assert.match(script, /function restoreLastResult/);
    assert.match(script, /function initialize\(\)[\s\S]*else if \(loadLastResult\(\)\)[\s\S]*restoreLastResult\(\{ animate: false \}\)[\s\S]*else \{[\s\S]*renderHome\(\)/);
    assert.match(script, /replaceTabHistory\(navigationTabForStage\(\)\)[\s\S]*syncThemeColor\(`\$\{currentStage\(\)\}-screen`\)/);
    assert.match(script, /function editMembershipAccess\(\)[\s\S]*editingMembership = true[\s\S]*openMemberCheck\(\)/);
    assert.match(script, /function clearMembershipAccess\(\)[\s\S]*removeItem\(MEMBERSHIP_STORAGE_KEY\)[\s\S]*removeItem\(MEMBERSHIP_PHONE_STORAGE_KEY\)/);
    assert.doesNotMatch(script, /확인된 회원으로 결과를 바로 볼 수 있어요/);
    assert.match(script, /document\.querySelectorAll\('\[data-band-join\]'\)/);
    assert.match(script, /function updateBandState\(\)[\s\S]*bandAuthPhoneMask/);
    assert.match(script, /function navigateToTab\(tab, options = \{\}\)[\s\S]*restoreLastResult\(\{ animate: true \}\)/);
    assert.match(script, /function navigateToTab\(tab, options = \{\}\)[\s\S]*replaceTabHistory\(currentTab\)[\s\S]*pushTabHistory\(tab\)/);
    assert.match(script, /addEventListener\('popstate'[\s\S]*navigateToTab\(APP_TABS\.includes\(tab\) \? tab : 'home', \{ fromHistory: true \}\)/);
    assert.match(script, /history\.replaceState[\s\S]*history\.pushState/);
    const savedResultBody = script.match(/function saveLastResult\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.doesNotMatch(savedResultBody, /phone|bandAuth/i);
});

test('CREWARTS keeps member linking out of the questionnaire flow', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    assert.match(script, /function updatePersistentActions\(\)[\s\S]*focused = stage === 'questions' \|\| stage === 'mbti'[\s\S]*nav\.hidden = focused/);
    assert.doesNotMatch(html, /cw-guest-dialog/);
    assert.doesNotMatch(script, /결과를 열기 전에 가입 여부를 확인해요/);
});

test('CREWARTS personality test uses minimal copy, Pretendard, and official share marks', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey-v4.css'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    const characterDirectory = path.join(__dirname, '..', 'public', 'assets', 'crewart-types');
    const characterCodes = [
        'istj', 'isfj', 'infj', 'intj', 'istp', 'isfp', 'infp', 'intp',
        'estp', 'esfp', 'enfp', 'entp', 'estj', 'esfj', 'enfj', 'entj'
    ];

    assert.match(html, /크레와트 성향 테스트/);
    assert.match(html, /id="crewart-wordmark">CREWARTS<\/span><small>PERSONALITY TEST<\/small>/);
    assert.doesNotMatch(html, /PERSNALITY/);
    assert.doesNotMatch(html, />[^<]*MBTI[^<]*</i);
    assert.match(css, /font-family:\s*"Pretendard Variable"/);
    assert.doesNotMatch(css, /Cinzel|Georgia/i);
    assert.match(html, /assets\/band-app-icon-official\.png/);
    assert.match(html, /assets\/kakaolink_btn_medium\.png/);
    assert.match(script, /function createResultShareFile/);
    assert.match(script, /function createKakaoShareFile/);
    assert.match(script, /data-action="save-image"/);
    assert.match(script, /이미지 저장/);
    assert.match(script, /카카오톡 공유/);
    assert.match(script, /function saveResultImage/);
    assert.match(script, /CREWARTS_\$\{result\.code\}_\$\{typeName\}\.png/);
    assert.match(script, /canvas\.width = 1080/);
    assert.match(script, /canvas\.height = 1440/);
    assert.match(script, /function drawShareHouseBadge[\s\S]*YOUR HOUSE/);
    assert.match(script, /function createResultShareFile\(\)[\s\S]*resultShareAxes\(\)\.forEach/);
    assert.match(script, /drawShareScale\(context, contentX, y \+ 35, contentWidth, position, accent\)/);
    assert.doesNotMatch(script, /성향 좌표|모든 축의 최종 선택 방향/);
    assert.doesNotMatch(script, /<small>\$\{escapeHtml\(axis\.title\)\}<\/small>/);
    assert.match(css, /\.cw-story-axis-labels\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(script, /function canNativeShareFile\(file\)/);
    assert.match(script, /isMobileDevice\(\) && canNativeShareFile\(file\)[\s\S]*navigator\.share\(\{ files: \[file\]/);
    assert.match(script, /function openShareImageForLongPress\(file\)/);
    assert.match(script, /function createKakaoShareFile\(\)[\s\S]*createResultShareFile\(\)/);
    assert.match(script, /imageWidth:\s*1080/);
    assert.match(script, /imageHeight:\s*1440/);
    assert.match(script, /나는 크레 앞에서 어떤 유형일까\?\\n\$\{Core\.QUESTIONS\.length\}문항 약 3분/);
    assert.match(script, /title:\s*'나도 알아보기'/);
    assert.match(script, /navigator\.canShare\(\{ files: \[file\] \}\)/);
    assert.match(html, /id="result-save-dialog"/);
    assert.match(html, /id="result-save-preview"/);
    assert.doesNotMatch(html, /id="result-save-name"|cw-save-name|result-save-destination/);
    assert.match(html, /id="result-save-confirm"/);
    assert.match(html, /id="kakao-share-dialog"/);
    assert.match(html, /id="kakao-share-preview"/);
    assert.match(html, /결과 이미지 확인[\s\S]*카카오톡 공유하기[\s\S]*친구·채팅방 선택/);
    assert.match(script, /function savePreparedResultImage/);
    assert.match(script, /function openKakaoShareGuide[\s\S]*dialog\.showModal\(\)[\s\S]*await createKakaoShareFile\(\)[\s\S]*await uploadKakaoShareImage\(nextFile\)/);
    assert.match(script, /function shareResult\(event\)[\s\S]*await openKakaoShareGuide\(event\)/);
    assert.match(script, /window\.showSaveFilePicker/);
    assert.match(script, /suggestedName: file\.name/);
    assert.match(script, /공유 앱에서 카카오톡을 선택해주세요/);
    assert.match(script, /KAKAO_JS_KEY/);
    assert.match(script, /const SURVEY_URL = 'https:\/\/creok\.onrender\.com\/crewart-survey\.html'/);
    assert.doesNotMatch(script, /const SURVEY_URL = new URL\([^\n]*document\.baseURI/);
    assert.match(script, /function createTrackedShareUrl\(\)[\s\S]*createReferralId\(\)[\s\S]*trackReferral\('share'/);
    assert.match(script, /searchParams\.set\('src', 'kakao'\)[\s\S]*searchParams\.set\('sid', id\)/);
    assert.match(script, /trackReferral\('verified', \{ authenticated: true \}\)/);
    assert.match(script, /keepalive:\s*true/);
    assert.doesNotMatch(script, /OWN_SHARE_IDS_STORAGE_KEY|loadOwnShareIds/);
    assert.match(script, /function loadReferralMetrics\(\)[\s\S]*Authorization: `Bearer \$\{bandAuthToken\}`/);
    assert.match(html, /id="band-share-state"[^>]*hidden[\s\S]*id="band-share-verified">0명/);
    assert.match(html, /id="band-share-button"[\s\S]*kakaolink_btn_medium\.png[\s\S]*카카오톡 공유/);
    assert.match(html, /id="band-link-share-button"[\s\S]*링크 공유/);
    assert.doesNotMatch(html, /만든 공유 링크|방문이 확인된 링크|이 기기에서 만든 공유 링크의 성과|band-share-created|band-share-landed|band-share-empty/);
    assert.match(html, /id="auth-phone-edit"[\s\S]*id="auth-phone-clear"/);
    assert.match(html, /id="band-share-title">내 링크로 BAND 인증 완료<\/h2>/);
    assert.match(script, /function restoreShareableResult\(\)[\s\S]*loadLastResult\(\)[\s\S]*result = snapshot\.result[\s\S]*assignedHouseKey = snapshot\.assignedHouseKey/);
    assert.match(script, /function shareBandReferral\(event\)[\s\S]*!bandAuthToken \|\| !bandAuthUser\?\.isTargetMember[\s\S]*openMemberCheck\(\)[\s\S]*restoreShareableResult\(\)[\s\S]*await shareResult\(event\)[\s\S]*createTrackedShareUrl\(\)[\s\S]*Kakao\.Share\.sendDefault/);
    assert.match(script, /function updateBandState\(\)[\s\S]*const shareState = element\('band-share-state'\)[\s\S]*shareState\.hidden = !authenticated/);
    assert.match(script, /element\('band-share-button'\)\?\.addEventListener\('click', shareBandReferral\)/);
    assert.match(script, /element\('band-link-share-button'\)\?\.addEventListener\('click', shareBandLink\)/);
    assert.match(css, /\.cw-band-share-button\s*\{[^}]*background:\s*#fee500/);
    assert.match(css, /\.cw-band-share-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(html, /내 공유 성과|<header><span aria-hidden="true">✓<\/span>/);
    assert.match(css, /\.cw-intro-tagline\s*\{[^}]*white-space:\s*nowrap/);
    assert.match(css, /\.cw-member-dialog \.cw-member-input-group\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 68px/);
    assert.match(html, /crewart-survey-v4\.css\?v=20260817-share-polish-v96/);
    assert.match(html, /crewart-survey\.js\?v=20260823-survey-closed-v106/);
    assert.match(script, /function renderUnifiedResult\(profile, house, options = \{\}\)/);
    assert.doesNotMatch(script, /resultViewVersion|resultViewFromLocation|changeResultView|report=deep|set-result-version/);
    assert.match(script, /function renderResult\(options = \{\}\)[\s\S]*renderUnifiedResult\(profile, house\);/);
    assert.match(script, /function setupResultStory\(\)/);
    assert.match(script, /data-result-story aria-label="\$\{locked \? 'BAND 로그인 후 전체 결과 확인' : '스크롤로 확인하는 결과 리포트'\}"/);
    assert.match(script, /class="cw-story-sticky"/);
    assert.match(script, /class="cw-story-scene is-axis"/);
    assert.match(script, /class="cw-story-scene is-profile"/);
    assert.match(script, /class="cw-story-scene is-time"/);
    assert.match(script, /class="cw-story-scene is-house"/);
    assert.match(script, /class="cw-story-result-hero"/);
    assert.match(script, /class="cw-story-result-character"/);
    assert.match(script, /data-story-character/);
    assert.match(script, /typeCharacterPath\(result\.code\)/);
    assert.match(script, /class="cw-story-result-code"/);
    assert.match(script, /class="cw-story-result-title"/);
    assert.doesNotMatch(script, /선택의 방향을 읽는 중|cw-story-heading/);
    assert.doesNotMatch(script, /<small>당신의 유형<\/small>|당신의 핵심 강점/);
    assert.match(script, /좋은 상성/);
    assert.match(script, /나쁜 상성/);
    assert.match(script, /profile\.worstMatch\?\.mbti/);
    assert.match(script, /평균 문항 시간/);
    assert.match(script, /<span>당신의 기숙사는<\/span><strong data-house-name/);
    assert.match(script, /\['RED', 'GREEN', 'BLUE', 'YELLOW', finalHouse\]/);
    assert.doesNotMatch(script, /결과 미리보기|>SCROLL</);
    assert.match(script, /data-action="share"[\s\S]*카카오톡 공유/);
    assert.match(script, /data-action="share-link"[\s\S]*링크 공유[\s\S]*data-action="save-image"[\s\S]*이미지 저장/);
    assert.match(script, /function copyTrackedShareLink\(event\)[\s\S]*navigator\.clipboard\?\.writeText[\s\S]*공유 링크를 복사했어요/);
    assert.match(css, /\.cw-story-share-row\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(script, /data-action="guest-share"|shareGuestResult|preparedKakaoShareGuest/);
    assert.match(script, /class="cw-story-login-gate"[\s\S]*BAND 로그인하고 전체 결과 보기/);
    assert.doesNotMatch(script, /전체 결과가 잠겨 있어요|상세 성향 · 기숙사 · 결과 공유|cw-story-login-prompt|cw-story-login-copy/);
    assert.doesNotMatch(script, /<p>결과<\/p>/);
    assert.match(css, /\.cw-result-empty span\s*\{[^}]*white-space:\s*nowrap/);
    assert.match(script, /function resultSpeedPresentation\(\)[\s\S]*빠르게 고르는 편[\s\S]*신중하게 고르는 편/);
    assert.match(script, /class="cw-story-speed" style="--speed-position:\$\{speed\.position\}%"/);
    assert.match(script, /빠른 선택[\s\S]*신중한 선택/);
    assert.match(script, /const axisProgress = heroCodeSettled \? 1 : 0/);
    assert.match(script, /function setupResultStory\(\)[\s\S]*randomizeHeroPreview[\s\S]*Math\.round\(18 \+ Math\.random\(\) \* 64\)/);
    assert.match(script, /heroShuffleTicks >= 10[\s\S]*settleHeroCode\(\)/);
    assert.match(script, /heroCharacterNode\.src = typeCharacterPath\(finalCode\)/);
    assert.doesNotMatch(script, /heroCharacterNode\.src = typeCharacterPath\(previewCode\)/);
    assert.match(css, /\.cw-story-track\.is-code-cycling \.cw-story-result-character img\s*\{[^}]*opacity:\s*0[^}]*scale\(\.88\)/);
    assert.match(css, /\.cw-story-track\.is-code-settled \.cw-story-result-character img\s*\{[^}]*opacity:\s*1[^}]*scale\(1\)/);
    assert.match(script, /root\.classList\.add\('is-intro-settled'\)/);
    assert.doesNotMatch(script, /rawProgress >= \.055[^\n]*settleHeroCode/);
    assert.doesNotMatch(script, /mbtiProgress|cw-story-mbti/);
    assert.match(script, /const strengthProgress = segment\(progress, \.36, \.38\)/);
    assert.match(script, /const matchProgress = segment\(progress, \.44, \.47\)/);
    assert.match(script, /const shareProgress = segment\(progress, \.93, \.97\)/);
    assert.match(script, /function setupResultStory\(\)[\s\S]*const startTimeShuffle = \(\) =>/);
    assert.match(script, /Math\.random\(\) \* 10/);
    assert.match(script, /ticks >= 9[\s\S]*settleTimeValue\(\)/);
    assert.match(script, /const TIME_SCENE_LOCK = \.7/);
    assert.match(script, /rawProgress >= TIME_SCENE_START[\s\S]*startTimeShuffle\(\)/);
    assert.match(script, /window\.addEventListener\('wheel', blockTimeSceneScroll, \{ passive: false \}\)/);
    assert.match(script, /window\.addEventListener\('touchmove', blockTimeSceneScroll, \{ passive: false \}\)/);
    assert.match(script, /timeShuffleStarted && !timeShuffleSettled[\s\S]*TIME_SCENE_LOCK/);
    assert.match(script, /window\.scrollTo\(\{ top: lockY, behavior: 'auto' \}\)/);
    assert.doesNotMatch(script, /behavior:\s*'instant'/);
    assert.match(script, /data-time-value data-final-time=/);
    assert.match(script, /timeLabelNode\.textContent = '평균 문항 시간'/);
    assert.match(script, /row\.style\.setProperty\('--axis-current'/);
    assert.match(script, /root\.classList\.toggle\('is-share-ready', shareProgress >= \.98\)/);
    assert.match(script, /window\.addEventListener\('scroll', scheduleSync, \{ passive: true \}\)/);
    assert.match(script, /window\.removeEventListener\('scroll', scheduleSync\)/);
    assert.match(script, /resultExperienceCleanup\?\.\(\)/);
    assert.match(script, /function buildPreviewResult\(code\)/);
    assert.match(css, /\.cw-story-track\s*\{[\s\S]*height:\s*460svh/);
    assert.match(css, /\.cw-story-sticky\s*\{[^}]*position:\s*sticky[^}]*height:\s*100svh[^}]*overflow:\s*hidden/);
    assert.match(css, /\.cw-story-scene\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
    assert.match(css, /\.cw-story-axis-track b\s*\{[^}]*left:\s*var\(--axis-current, 50%\)/);
    assert.match(css, /\.cw-story-card\.is-strength\s*\{[^}]*opacity:\s*var\(--strength-progress\)/);
    assert.match(css, /\.cw-story-card\.is-match\s*\{[\s\S]*opacity:\s*var\(--match-progress\)/);
    assert.match(css, /\.cw-story-card\.is-match\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
    assert.match(css, /\.cw-story-speed > i b\s*\{[^}]*left:\s*var\(--speed-position\)/);
    assert.match(css, /\.cw-story-scene\.is-time > strong\s*\{[^}]*font-size:\s*clamp\(82px, 18vw, 164px\)/);
    assert.match(css, /\.cw-story-house-line\s*\{[^}]*white-space:\s*nowrap[^}]*var\(--house-progress\)/);
    assert.match(css, /\.cw-story-track\.is-share-ready \.cw-story-kakao\s*\{[^}]*animation:\s*cw-story-share-ready/);
    assert.match(css, /\.cw-story-final-actions\s*\{[^}]*pointer-events:\s*none/);
    assert.match(css, /\.cw-story-track\.is-share-ready \.cw-story-final-actions\s*\{[^}]*pointer-events:\s*auto/);
    assert.match(script, /<a class="cw-story-band"[\s\S]*<strong>BAND로 가기<\/strong><i aria-hidden="true">→<\/i>/);
    assert.doesNotMatch(script, /BAND 연결 완료|MEMBER CONNECTED/);
    assert.match(css, /\.cw-story-final-actions \.cw-story-band\s*\{[^}]*border:\s*0/);
    assert.match(css, /\.cw-story-login-gate\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*max\(92px[^}]*width:\s*min\(calc\(100% - 24px\), 390px\)[^}]*min-height:\s*54px/);
    assert.doesNotMatch(css, /\.cw-story-login-prompt|\.cw-story-login-copy/);
    assert.match(css, /\.cw-story-result-character img\s*\{[^}]*height:\s*250px[^}]*max-height:\s*250px/);
    assert.match(css, /@keyframes cw-story-share-ready/);
    assert.doesNotMatch(css, /cw-story-share-ready[^;]*infinite/);
    assert.doesNotMatch(css, /\.cw-story-card\.is-strength\s*\{[^}]*translate|\.cw-story-card\.is-match\s*\{[^}]*translate/);
    assert.doesNotMatch(script, /cw-depth-stage|cw-depth-step|cw-depth-mobile-summary|data-depth-scrolly/);
    assert.match(css, /html\s*\{[^}]*overflow-x:\s*clip/);
    assert.match(css, /body\s*\{[^}]*overflow-x:\s*clip/);
    assert.match(css, /button,\s*a\s*\{[^}]*touch-action:\s*manipulation/);
    assert.match(css, /@media \(max-height:\s*520px\) and \(min-width:\s*560px\)[\s\S]*\.cw-kakao-dialog-sheet/);
    assert.match(script, /classList\.add\('is-depth-view'\)/);
    assert.match(css, /\.cw-result\.is-depth-view\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/);
    assert.match(script, /classList\.toggle\('cw-result-experience', screenId === 'result-screen' && Boolean\(result\)\)/);
    assert.doesNotMatch(css, /body\.cw-result-experience \.cw-bottom-nav\s*\{/);
    assert.match(script, /aria-label="\$\{escapeHtml\(`\$\{axis\.title\}: \$\{axis\.selected\}`\)\}"/);
    for (const scene of ['personality', 'compatibility', 'axes', 'speed']) {
        const scenePath = path.join(__dirname, '..', 'public', 'assets', 'crewart-result-scenes', `${scene}.webp`);
        assert.equal(fs.existsSync(scenePath), true, `${scene} result scene should exist`);
        assert.ok(fs.statSync(scenePath).size < 100_000, `${scene} result scene should stay lightweight`);
    }
    assert.doesNotMatch(script, /visual: '(?:strength|house|locked)'/);
    assert.doesNotMatch(script, /cw-scrolly-scroll-track|cw-scrolly-milestone|cw-step-panel|setupActiveScrollytelling/);
    assert.doesNotMatch(css, /\.cw-scrolly-scroll-track|\.cw-scrolly-milestone|\.cw-step-panel/);
    assert.match(script, /Kakao\.Share\.uploadImage/);
    assert.match(script, /Kakao\.Share\.sendDefault/);
    assert.match(script, /function sharePreparedNativeResult[\s\S]*preparedKakaoImageUrl[\s\S]*Kakao\.Share\.sendDefault\(resultKakaoTemplate/);
    assert.match(html, /assets\/vendor\/kakao-2\.8\.1\.min\.js/);
    assert.match(html, /property="og:image" content="https:\/\/creok\.onrender\.com\/assets\/crewart-link-preview\.jpg\?v=20260817-og-v1"/);
    assert.match(html, /property="og:image:type" content="image\/jpeg"/);
    assert.match(html, /property="og:image:width" content="1280"/);
    assert.match(html, /property="og:image:height" content="1280"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(css, /\.cw-save-dialog::backdrop/);
    assert.match(css, /\.cw-kakao-preview\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/);
    assert.match(css, /\.cw-save-preview img\s*\{[^}]*position:\s*absolute[^}]*object-fit:\s*contain/);
    assert.doesNotMatch(script, /data-action="instagram"|shareToInstagram/);
    assert.doesNotMatch(script, /data-action="band-result"/);
    assert.doesNotMatch(script, /크레\s*MBTI|나의 크레 MBTI|평소 MBTI/i);
    assert.match(script, /function typeCharacterPath\(code\)/);
    assert.match(script, /TYPE_CHARACTER_ROOT = 'assets\/crewart-types\/'/);
    assert.match(html, /crewart-survey-core\.js\?v=20260817-calibrated-v29/);
    assert.match(html, /crewart-survey-v4\.css\?v=20260817-share-polish-v96/);
    assert.match(script, /position: firstSelected \? Math\.min\(rawPosition, 34\) : Math\.max\(rawPosition, 66\)/);
    assert.match(html, /id="start-button"[^>]*>[\s\S]*테스트 하기/);
    assert.match(html, /id="home-auth-button"[^>]*>[\s\S]*BAND 가입여부 확인/);
    assert.match(html, /href="https:\/\/www\.band\.us\/band\/101878670\/post"/);
    assert.match(script, /DEFAULT_BAND_URL = 'https:\/\/www\.band\.us\/band\/101878670\/post'/);
    assert.match(html, /id="home-auth-button"[^>]*>[\s\S]*band-app-icon-official\.png/);
    const startButtonMarkup = html.match(/<button[^>]*id="start-button"[^>]*>[\s\S]*?<\/button>/)?.[0] || '';
    assert.doesNotMatch(startButtonMarkup, /→|<i\b/);
    assert.match(html, /id="band-login-button"[^>]*>[\s\S]*회원 확인 후 전체 분석 보기/);
    assert.doesNotMatch(html, /id="band-login-button"[^>]*>\s*회원 확인\s*<\/button>/);
    assert.match(html, /id="home-retest"[^>]*>다시 테스트하기/);
    assert.match(html, /id="home-start-card"[\s\S]*id="start-button"[\s\S]*id="home-retest"[\s\S]*id="home-auth-button"/);
    assert.match(script, /startCard\.hidden = false/);
    assert.match(script, /retestButton\.hidden = !snapshot/);
    assert.match(script, /homeTitle\.textContent = 'BAND 연결됨'/);
    assert.doesNotMatch(html, /start-button-v2|home-retest-v1|Ver 1 시작|Ver 2 시작/);
    assert.match(script, /function startCurrentSurvey\(\)[\s\S]*Core\.getSurveyVersion\(\)[\s\S]*activeVersion\.questionsFile/);
    assert.doesNotMatch(script, /startSurveyVersion|start-button-v2|home-retest-v1/);
    assert.match(script, /Core\.MIN_RESPONSE_MS/);
    assert.match(script, /초 후 선택할 수 있어요/);
    assert.doesNotMatch(css, /\.cw-choice-button:disabled/);
    assert.doesNotMatch(script, /data-choice="\$\{index\}" disabled/);
    assert.doesNotMatch(script, /data-choice="\$\{index\}"[^>]*aria-disabled/);
    assert.match(script, /button\.dataset\.timeLocked = String\(locked\)/);
    assert.match(script, /choiceLockAttempted[\s\S]*아직 선택할 수 없어요/);
    assert.match(script, /function chooseAnswer\(choice\)[\s\S]*activeElapsedMs\(\) < Core\.MIN_RESPONSE_MS[\s\S]*choiceLockAttempted = true[\s\S]*return/);
    assert.doesNotMatch(html, /cw-v2-button/);
    assert.doesNotMatch(css, /cw-v2-button|linear-gradient\(135deg, #e11d48, #f97316\)/);
    assert.match(css, /\.cw-home-start \.cw-test-action\s*\{[^}]*background:\s*#fff[^}]*color:\s*#111411/);
    assert.match(css, /\.cw-home-analysis-link\s*\{[^}]*border:\s*1px solid var\(--cw-green\)[^}]*background:\s*var\(--cw-green\)/);
    assert.match(script, /네 답 모두 괜찮습니다\. 평소 먼저 손이 가는 쪽을 골라주세요\./);
    assert.match(script, /두 답이 끌리면 실제 그 순간 가장 먼저 할 행동을 선택해주세요\./);
    assert.doesNotMatch(html, /question-illustration|question-image/);
    assert.doesNotMatch(script, /QUESTION_IMAGE_ROOT|question\.image|nextImage/);
    assert.doesNotMatch(html, /cw-home-guide|cw-home-disclaimer/);
    assert.match(script, /재미를 위한 성향 콘텐츠이며, 과학적·의학적 진단이 아닙니다\./);
    assert.match(script, /data-q0-start/);
    assert.match(script, /크레 앞에서는 평소 유형과 다른 결과가 나올 수 있습니다/);
    assert.match(html, /© 2026 CREO\. All rights reserved\./);
    assert.match(html, /class="cw-q0-copyright" id="q0-copyright" hidden>© 2026 CREO\. All rights reserved\./);
    assert.match(script, /© 2026 CREO · ALL RIGHTS RESERVED/);
    assert.match(script, /const cohortAverageMs = cohortSummary\.timingAverageMs > Core\.MIN_RESPONSE_MS/);
    assert.match(script, /참여자 \$\{cohortSampleSize\}명 · 평균 \$\{formatSeconds\(cohortAverageMs\)\}/);
    assert.doesNotMatch(script, /Math\.max\(3100, rawMs\)/);
    assert.doesNotMatch(script, /OWN_SHARE_IDS_STORAGE_KEY|loadOwnShareIds|searchParams\.set\('ids'/);
    assert.match(script, /headers: \{ Authorization: `Bearer \$\{bandAuthToken\}` \}/);
    assert.match(script, /context\.textAlign = 'center';\s*context\.fillText\('© 2026 CREO · ALL RIGHTS RESERVED', canvas\.width \/ 2, 1370\)/);
    assert.doesNotMatch(script, /context\.fillText\('creok\.onrender\.com'/);
    assert.match(script, /class="cw-story-scene is-house"/);
    assert.doesNotMatch(script, /성향을 이해하기 위한 참고 결과입니다/);
    assert.match(script, /class="cw-story-credit">© 2026 CREO\. All rights reserved\.<\/small>/);
    assert.match(css, /\.cw-q0-list li\s*\{[^}]*grid-template-columns:\s*30px 1fr/);
    assert.match(css, /\.cw-choice-list\.is-four-option\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*\.cw-choice-list\.is-four-option\s*\{[^}]*grid-template-columns:\s*1fr/);
    assert.match(css, /\.cw-intro\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
    assert.match(css, /\.cw-intro-content\s*\{[^}]*min-height:\s*0/);
    assert.match(html, /property="og:url" content="https:\/\/creok\.onrender\.com\/crewart-survey\.html"/);
    assert.match(html, /rel="canonical" href="https:\/\/creok\.onrender\.com\/crewart-survey\.html"/);
    assert.deepEqual(
        fs.readdirSync(characterDirectory).filter(file => file.endsWith('.webp')).sort(),
        characterCodes.map(code => `crewart-type-${code}.webp`).sort()
    );
    characterCodes.forEach(code => {
        const webp = fs.readFileSync(path.join(characterDirectory, `crewart-type-${code}.webp`));
        assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
        assert.ok(webp.length < 250_000, `${code} character should stay lightweight`);
    });
    assert.match(script, /root\.style\.setProperty\('--axis-progress', axisProgress\)/);
    assert.doesNotMatch(script, /dot\.addEventListener\('click'/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(script, /renderResult\(\{ animate: true \}\)/);
    assert.match(script, /평균 문항 시간/);
    assert.doesNotMatch(script, /Core\.chooseTendencyHouse\(result\)/);
    assert.doesNotMatch(script, /function renderResultTeaser\(profile\)|cw-result-teaser/);
    assert.match(script, /if \(!hasDetailedAccess\(\)\)\s*\{[\s\S]*guestHouseKey[\s\S]*renderUnifiedResult\(profile, guestHouse, \{ locked: true \}\)/);
    assert.match(script, /class="cw-story-login-gate"[^>]*data-action="unlock-detail"[\s\S]*BAND 로그인하고 전체 결과 보기/);
    assert.match(script, /const guestLocked = root\.classList\.contains\('is-guest-locked'\)/);
    assert.match(script, /if \(guestLocked\)\s*\{[\s\S]*event\.preventDefault\(\)/);
    assert.match(css, /\.cw-story-track\.is-guest-locked\s*\{[^}]*height:\s*100svh[^}]*overflow:\s*hidden/);
    assert.match(css, /\.cw-story-track\.is-guest-locked \.cw-story-scene\.is-axis\s*\{[^}]*translateY\(calc\(-24px/);
    assert.match(script, /const savedHouse = String\(payload\.assignedHouseKey \|\| payload\.houseId/);
    assert.match(css, /\.cw-story-track\.is-intro-settled \.cw-story-login-gate\s*\{[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/);
    assert.doesNotMatch(script, /기숙사 참여하기|현재 커뮤니티 인원을 기준/);
    assert.match(css, /\.cw-scale-line[\s\S]*left:\s*50%/);
    assert.match(script, /if \(!hasDetailedAccess\(\)\)/);
    assert.match(script, /IS_LOCAL_QA && searchParams\.get\('guest'\) === '1'/);
    assert.doesNotMatch(script, /axisFacts/);
    assert.doesNotMatch(script, /class="cw-answer-detail"/);
    assert.doesNotMatch(script, /<span>\$\{escapeHtml\(meta\.title\)\}<\/span>/);
    assert.doesNotMatch(script, /cw-report-head|PERSONALITY REPORT|<dt>ID<\/dt>/);
    assert.doesNotMatch(script, /RESULT TYPE/);
    assert.doesNotMatch(script, /평소 유형과 같아요|글자 달라요/);
    assert.match(script, /const TYPE_READINGS = Object\.freeze\(\{/);
    assert.equal((script.match(/^\s{8}[A-Z]{4}: '/gm) || []).length >= 16, true);
    assert.doesNotMatch(script, /cw-profile-compare|typeComparisonSummary|USUAL TYPE|MATCH \$\{comparison\.sameCount\}/);
    assert.match(script, /EI: \{ title: '생각 정리', left: '함께 정리', right: '혼자 정리' \}/);
    assert.match(script, /SN: \{ title: '관찰 초점', left: '현재 정보', right: '성장 가능성' \}/);
    assert.match(script, /TF: \{ title: '선택 기준', left: '조건·근거', right: '취향·관계' \}/);
    assert.match(script, /JP: \{ title: '사육 방식', left: '계획·준비', right: '유연·조정' \}/);
    assert.doesNotMatch(script, /class="cw-axis-poles"|class="cw-axis-pole/);
    assert.doesNotMatch(script, /<i aria-hidden="true">＋<\/i>/);
    assert.doesNotMatch(script, /TRAIT AXES|RESPONSE PAC(?:E|ING)|HOUSE ASSIGNMENT|ASSIGNED HOUSE|TYPE CHARACTER|MEMBER ACCESS/);
    assert.match(script, /class="cw-story-house-line"[\s\S]*당신의 기숙사는[\s\S]*\$\{escapeHtml\(house\.name\)\}/);
    assert.match(css, /data-house-size="short"[\s\S]*font-size:\s*clamp\(92px, 25vw, 144px\)/);
    assert.match(css, /\.cw-story-cue\s*\{[^}]*bottom:\s*max\(108px, calc\(env\(safe-area-inset-bottom\) \+ 98px\)\)/);
    assert.match(css, /\.cw-story-cue\s*\{[^}]*padding:\s*0[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
    assert.match(css, /\.cw-story-track:not\(\.is-intro-settled\) \.cw-story-cue\s*\{[^}]*opacity:\s*0/);
    assert.match(css, /@keyframes cw-story-cue-drop/);
    assert.doesNotMatch(script, /내 선택에서 보인 모습|주된 방향 ·|함께 나타난 방향 ·/);
    assert.doesNotMatch(script, /function selectedAxisEvidence\(axisResult\)|axisEvidence:\s*Object\.fromEntries|resultAxisEvidence/);
    assert.doesNotMatch(script, /const HOUSE_(?:READINGS|REPORT_COPY)/);
    assert.doesNotMatch(script, /TYPE_CHANGE_ANALYSIS|AXIS_DETAIL_GUIDE|renderTypeReading|renderAxisGraph|renderMemberDetail|renderHouseCard|renderLockedDetail|playResultMeasurementAnimation|toggleReportDisclosure/);
    assert.doesNotMatch(script, /선택 리듬이 갈린 장면|이 조합의 강점|커뮤니티에서의 역할|균형 포인트/);
    assert.match(css, /\.cw-analysis-summary p\s*\{[^}]*font-size:\s*12\.5px[^}]*line-height:\s*1\.7/);
    assert.match(css, /\.cw-analysis-evidence blockquote\s*\{[^}]*font-size:\s*12px/);
    assert.match(css, /\.cw-speed-card\s*\{[^}]*margin:\s*18px 0 0/);
    assert.match(css, /\.cw-speed-card \.cw-report-section-head\s*\{[^}]*border-bottom:\s*0/);
    assert.match(css, /\.cw-result-section, \.cw-report-house\s*\{[^}]*border:\s*1px solid[^}]*background:\s*var\(--cw-surface-soft\)/);
    assert.match(css, /\.cw-speed-summary\s*\{[^}]*border:\s*1px solid[^}]*background:\s*var\(--cw-surface-soft\)/);
    assert.match(css, /\.cw-speed-reading > p\s*\{[^}]*font-size:\s*15px[^}]*line-height:\s*1\.72/);
    assert.match(css, /\.cw-report-house\s*\{[^}]*margin-top:\s*18px/);
    assert.match(css, /\.cw-report-house \.cw-report-section-head\s*\{[^}]*border-bottom:\s*0/);
    assert.doesNotMatch(css, /\.cw-house-assignment/);
    assert.match(css, /\.cw-house-declaration\s*\{[^}]*border-top:\s*3px solid[^}]*text-align:\s*center/);
    assert.match(css, /\.cw-house-declaration p\s*\{[^}]*display:\s*flex[^}]*white-space:\s*nowrap/);
    assert.match(css, /\.cw-house-declaration strong\s*\{[^}]*font-size:\s*clamp\(27px, 7\.8vw, 56px\)/);
    assert.match(css, /\.cw-report-section-action em\s*\{[^}]*font-size:\s*15px[^}]*font-weight:\s*800/);
    assert.doesNotMatch(css, /\.cw-report-section-toggle i/);
    assert.match(css, /\.cw-house-reading > p\s*\{[^}]*font-size:\s*15px[^}]*line-height:\s*1\.76/);
    assert.match(css, /\.cw-report-disclosure\[hidden\]\s*\{[^}]*display:\s*none/);
    assert.doesNotMatch(script, /data-axis-result data-final-pole=|axisPoles|querySelectorAll\('\[data-pole\]'\)/);
    assert.match(script, /if \(tab === 'result'\)[\s\S]*renderResult\(\{ animate: true \}\)[\s\S]*restoreLastResult\(\{ animate: true \}\)/);
    assert.doesNotMatch(script, /data-measure-axis|data-final-label/);
    assert.match(css, /\.cw-result-report\s*\{[^}]*border-radius:\s*6px/);
    assert.match(css, /\.cw-axis-detail-list\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.cw-axis-detail\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*10px/);
    assert.match(css, /\.cw-axis-detail header h3\s*\{[^}]*text-align:\s*center/);
    assert.match(css, /\.cw-axis-detail header h3\s*\{[^}]*font-size:\s*15px[^}]*font-weight:\s*800/);
    assert.match(css, /--cw-type-body:\s*14px/);
    assert.match(css, /--cw-control-height:\s*48px/);
    assert.match(css, /--cw-control-radius:\s*12px/);
    assert.match(css, /\.cw-primary-button\s*\{[^}]*background:\s*var\(--cw-ink\)/);
    assert.match(css, /\.cw-dialog-band-button\s*\{[^}]*background:\s*var\(--cw-green\)/);
    assert.match(css, /\.cw-share-action\.is-kakao\s*\{[^}]*background:\s*#fee500/);
    assert.match(css, /\.cw-share-action\.is-save\s*\{[^}]*background:\s*var\(--cw-ink\)/);
    assert.match(css, /\.cw-home-result\s*\{[^}]*justify-items:\s*center/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.cw-result-code-back\s*\{\s*left:\s*17%/);
    assert.match(css, /--cw-type-section:\s*18px/);
    assert.match(css, /--cw-weight-bold:\s*800/);
    assert.match(css, /\.cw-question-card > h1[\s\S]*font-weight:\s*var\(--cw-weight-bold\)/);
    assert.match(css, /\.cw-choice-button span[\s\S]*font-size:\s*16px/);
    assert.doesNotMatch(css, /\.cw-poster-kicker/);
    assert.match(css, /\.cw-intro-visual\s*\{[^}]*position:\s*fixed[^}]*inset:\s*-24px/);
    assert.match(css, /\.cw-intro-video\s*\{[^}]*object-fit:\s*cover[^}]*filter:\s*blur\(5px\)/);
    assert.match(css, /\.cw-intro::after\s*\{\s*display:\s*none/);
    assert.match(css, /\.cw-intro\s*\{[^}]*background:\s*#242724/);
    assert.match(css, /--cw-action-width:\s*340px/);
    assert.match(css, /html\s*\{[^}]*scrollbar-gutter:\s*stable/);
    assert.match(css, /\.cw-test-action\s*\{[^}]*width:\s*min\(100%, var\(--cw-action-width\)\)[^}]*height:\s*var\(--cw-control-height\)/);
    assert.match(css, /\.cw-result-empty button\s*\{[^}]*width:\s*min\(100%, var\(--cw-action-width\)\)/);
    assert.match(css, /\.cw-intro-content\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/);
    assert.match(css, /\.cw-intro\.is-video-ready\s+\.cw-intro-content\s*\{[^}]*opacity:\s*1/);
    assert.match(script, /classList\.add\('is-video-ready'\)/);
    assert.match(css, /\.cw-bottom-nav[\s\S]*position:\s*fixed/);
    assert.match(css, /\.cw-bottom-nav > div\s*\{[^}]*height:\s*var\(--cw-nav-height\)[^}]*place-items:\s*stretch/);
    assert.match(css, /\.cw-bottom-nav\s*\{[^}]*left:\s*50%[^}]*width:\s*min\(calc\(100vw - 24px\), 760px\)/);
    assert.doesNotMatch(script, /syncViewportNavigation|--cw-nav-center/);
    assert.match(css, /\.cw-bottom-nav\s*\{[^}]*bottom:\s*max\(10px, env\(safe-area-inset-bottom\)\)[^}]*border-radius:\s*16px/);
    assert.match(css, /:root\s*\{\s*--cw-nav-height:\s*58px/);
    assert.match(css, /\.cw-bottom-nav button\s*\{[^}]*font-size:\s*13\.5px/);
    assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.cw-intro-tagline\s*\{[^}]*font-size:\s*12\.25px/);
    assert.match(css, /@media \(max-height: 680px\) and \(max-width: 760px\)[\s\S]*\.cw-story-result-character,[\s\S]*height:\s*185px/);
    assert.doesNotMatch(css, /\.cw-bottom-nav\.is-result-hidden/);
    assert.doesNotMatch(script, /resultNavRevealed|updateResultNavigationVisibility/);
    assert.doesNotMatch(css, /body\.cw-keyboard-open \.cw-bottom-nav/);
    assert.match(css, /\.cw-band-page[\s\S]*min-height:\s*100dvh/);
    assert.doesNotMatch(css, /\.cw-band\.is-keyboard-open \.cw-band-account-head\s*\{[^}]*display:\s*none/);
    assert.doesNotMatch(css, /\.cw-band\.is-keyboard-open \.cw-member-status[^}]*display:\s*none/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.cw-result-code-front\s*\{\s*right:\s*17%/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.cw-axis-detail header h3\s*\{\s*font-size:\s*15px/);
    assert.doesNotMatch(css, /\.cw-axis-pole/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.cw-member-status\s*\{\s*font-size:\s*12px/);
    assert.match(script, /function syncMemberKeyboardState\(options = \{\}\)/);
    assert.match(script, /window\.visualViewport\?\.addEventListener\('resize'/);
    assert.match(css, /\.cw-result-code-front\s*\{[^}]*z-index:\s*1/);
    assert.match(css, /\.cw-intro::after\s*\{\s*display:\s*none/);
    assert.doesNotMatch(css, /\.cw-position-scale\.is-measuring \.cw-scale-line::after/);
    assert.match(css, /@keyframes cw-code-flicker/);
    assert.match(css, /@keyframes cw-house-roll/);
    assert.match(script, /function drawShareImageContain\(context, image, x, y, width, height\)/);
    assert.match(script, /drawShareImageContain\(context, character, 82, 240, 410, 500\)/);
    assert.doesNotMatch(css, /cw-scale-scan|rgba\(22, 129, 75, \.7\)/);
    assert.match(script, /class="cw-story-band" data-band-prompt href="\$\{escapeHtml\(bandTargetUrl\)\}"/);
    assert.match(script, /band-app-icon-official\.png/);
    assert.match(css, /\.cw-detail-preview\s*\{[^}]*filter:\s*blur\(5px\)/);
    assert.match(css, /\.cw-speed-head strong\s*\{[^}]*color:\s*var\(--cw-ink\)[^}]*font-size:\s*15px[^}]*font-weight:\s*800/);
    assert.match(css, /\.cw-report-house[\s\S]*border-top:\s*1px solid var\(--cw-line\)/);
});

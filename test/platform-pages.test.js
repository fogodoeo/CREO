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
    'auction-control.html',
    'broadcast-studio.html',
    'auction-live.html',
    'channel-shipping.html',
    'shipping-companies.html',
    'shipping-rates.html',
    'broadcast-router.html',
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
    assert.match(hub, /id="quick-survey"[^>]*href="crewart-survey\.html"[^>]*hidden/);
    assert.match(hub, /id="quick-shipping"/);
    assert.doesNotMatch(hub, /id="quick-companies"|shipping-companies\.html/);
    assert.match(hub, /id="quick-rounds"/);
    assert.doesNotMatch(hub, /id="quick-rankings"/);
    assert.match(hub, /id="quick-broadcast"/);
    assert.match(hub, /id="quick-settings"/);
    assert.match(hub, /id="quick-design"/);
    assert.match(hub, /function workspaceUrl\(c\)/);
    assert.match(hub, /runtime\.url\('shipping'\)/);
    assert.match(hub, /rounds\.href=runtime\.url\('archives'\)/);
    assert.doesNotMatch(hub, /runtime\.extension\('archives'\)/);
    assert.doesNotMatch(hub, /rankings\.href=runtime\.url\('rankings'\)/);
    assert.doesNotMatch(hub, /shipping\.href=`channel-shipping\.html/);
    assert.match(hub, /runtime\.extension\('survey'\)/);
    assert.match(hub, /runtime\.url\('control'\)/);
    assert.match(hub, /<strong>인쇄 페이지<\/strong>/);
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
    assert.match(studio, /CreoBroadcastProfiles\.broadcastTarget/);
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
    assert.match(workspace, /color-scheme:dark/);
    assert.match(workspace, /field\('groupId',term\('group','그룹'\),record\?\.groupId,'select'/);
    assert.match(workspace, /field\('status','상태',record\?\.status,'select'/);
    assert.match(workspace, /field\('winnerAlias','방송용 낙찰자명'/);
});

test('the new broadcast implements three independent camera overlays', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
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
    assert.match(live, /setInterval\(pollPulse,350\)/);
    assert.match(live, /function teamStats\(items\)/);
    assert.match(live, /function scoreboardRows\(channel,items,board\)/);
    assert.match(live, /function boardValue\(row,board,unit\)/);
    assert.match(live, /function placed\(value\)/);
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
    assert.match(operations, /channel-shipping\.html\?channel=cdcup/);
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
        assert.match(source, /CreoBroadcastProfiles\.usesLegacyEngine/);
        assert.doesNotMatch(source, /channelId\s*===\s*['"]cdcup['"]/);
    }
    assert.match(control, /profile\.defaultState/);
    assert.match(channelShipping, /location\.replace\(target\.pathname\+target\.search\)/);
    assert.match(channelShipping, /shipping\.html/);
    assert.doesNotMatch(channelShipping, /<a\b|id="channel-select"|id="manage-link"|id="control-link"/);
    assert.match(shipping, /SHIPPING_CHANNEL_ID/);
    assert.match(shipping, /channel-adapters\.js/);
    assert.match(shipping, /CreoChannelAdapters\.resolve/);
    assert.match(shipping, /adapter\.loadShippingItems/);
    assert.match(shipping, /adapter\.saveShippingItem/);
    assert.match(shipping, /saveShippingItem/);
    assert.match(shipping, /SHIPPING_COMPANY_STORAGE_KEY/);
    assert.match(shipping, /id="shipping-channel-home"/);
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
    assert.doesNotMatch(shippingStatus, /shipping-workspace-link/);
    assert.match(shippingStatus, /if \(!SHIPPING_CHANNEL_ID\) location\.replace\('\/'\)/);
    const companies = fs.readFileSync(path.join(__dirname, '..', 'public', 'shipping-companies.html'), 'utf8');
    assert.match(companies, /shipping-status\.html\?channel=\$\{encodeURIComponent\(channel\)\}&view=company/);
    assert.doesNotMatch(companies, /CreoChannelAdapters\.resolve|adapter\.loadShippingItems|<main/);
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

test('legacy broadcast bridge survives Supabase quota exhaustion with cached or standby data', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    const cdcup = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
    assert.match(bridge, /SUPABASE_QUOTA_COOLDOWN_MS/);
    assert.match(bridge, /_readBroadcastStorage\('items', \[\]\)/);
    assert.match(bridge, /_readBroadcastStorage\('config', \{\}\)/);
    assert.match(cdcup, /await _refreshBroadcastFromItems\(\[\]\)/);
});

test('CDCUP three-round format assigns round-two teams and round-three finalists', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
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
    assert.match(bridge, /active_tournament: '4'/);
    assert.match(registration, /id="tournament-company-options"/);
    assert.match(registration, /function applyTournamentCompanyOptions/);
    assert.match(registration, /3라운드 목록 준비/);
    assert.match(preview, /자동 편성 사용 중/);
    assert.match(preview, /3라운드 개인전/);
    assert.match(broadcast, /configuredGroups\?\.groups\.find\(group => group\.code === team\)\?\.name/);
    assert.match(broadcast, /2라운드 팀 순위/);
    assert.match(broadcast, /3라운드 개인 순위/);
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
    assert.match(broadcast, /min-height: 42px;[\s\S]*font-size: var\(--sb-label-size, 26px\)/);
    assert.match(broadcast, /Math\.max\(26, Number\(cfg\.scoreboard_label_fontsize\) \+ 4\)/);
    assert.doesNotMatch(broadcast, /<div class="p2-live-bidders-head">/);
    assert.match(broadcast, /function applyPage2LiveBiddersPlacement\(cfg\)/);
    assert.match(broadcast, /height: var\(--p2-bidders-height, 42vh\)/);
    assert.doesNotMatch(broadcast, /max-height: var\(--p2-bidders-height/);
    assert.match(broadcast, /'--p2-bidders-height': normalizeCssLength\(cfg\.p2_live_bidders_height\) \|\| '42vh'/);
    assert.match(preview, /id="draggable-live-bidders"/);
    assert.match(preview, /id="live-bidders-font-input"/);
    assert.match(preview, /configMap\.p2_live_bidders_font_size/);
    assert.match(broadcast, /const _p2LiveBiddersRankState = \{ itemKey: '', initialized: false \}/);
    assert.match(broadcast, /captureLeaderboardPositions\(listEl, '\.p2-live-bidder-row\[data-bidder-key\]'/);
    assert.match(broadcast, /animateLeaderboardRows\(listEl, beforePositions, '\.p2-live-bidder-row\[data-bidder-key\]'/);
    assert.match(broadcast, /@keyframes p2-bidder-row-enter/);
    assert.match(broadcast, /--p2-row-opacity/);
    assert.match(broadcast, /const rankOpacity = \[1, \.26, \.06, \.035/);
    assert.doesNotMatch(broadcast, /<span class="p2-live-bidder-rank">/);
    assert.match(preview, /\.bid-preview-row:nth-child\(3\) \{ opacity: \.06; \}/);
    assert.match(preview, /activeDragKey === 'banner' \? 24 : 32/);
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
    assert.match(control, /crewartSampleAssets/);
    assert.doesNotMatch(control, /quiz-section|name="quizQuestion"|돌발 퀴즈/);
    assert.match(control, /value="vendor">업체별 금액/);
    assert.match(control, /value="team">그룹별 금액/);
    assert.match(control, /name="scoreboardId"/);
    for (const positionField of ['page1HostsPosition', 'page1NoticePosition', 'page1BannerPosition', 'page2HeaderPosition', 'page2InfoPosition', 'page2PhotoPosition', 'page2PricePosition', 'page2SoldPosition', 'page2BannerPosition', 'page3BoardPosition']) {
        assert.match(control, new RegExp(`name="${positionField}"`));
    }
    assert.match(control, /function updatePositionWarnings/);
    assert.match(live, /function scoreboardRows/);
    assert.match(control, /seedCrewartAssets/);
    assert.match(live, /CREWART_DEFAULT_ASSETS/);
    const crewartLive = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-broadcast.html'), 'utf8');
    assert.match(crewartLive, /cfg\.ticker_show === '0'/);
    assert.match(crewartLive, /Number\(cfg\.ticker_interval\)/);
    assert.match(crewartLive, /crewart_ticker/);
    const legacySettings = fs.readFileSync(path.join(__dirname, '..', 'public', 'settings.html'), 'utf8');
    assert.doesNotMatch(legacySettings, /id="live-quiz-card"|id="cfg-live-quiz-question"|돌발 퀴즈/);
    assert.match(legacySettings, /<details class="advanced-panel" open>/);
    assert.match(legacySettings, /html\.embedded #event-module-card\{display:none\}/);
    assert.doesNotMatch(legacySettings, /embedded-crewart \[data-control-scope="cdcup"\]/);
    assert.match(legacySettings, /m\.crewart_ticker = m\.ticker/);
    assert.match(legacySettings, /delete m\.ticker/);
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
    assert.match(crewartModules, /CREWARTS HOUSE CUP/);
    assert.match(crewartModules, /houseOrder = \{R:0,G:1,B:2,Y:3\}/);
    assert.match(crewartLive, /class="cw-house-key"><b>R<\/b><b>G<\/b><b>B<\/b><b>Y<\/b>/);
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
    assert.match(html, /id="band-screen"/);
    assert.match(html, /data-nav="band"/);
    assert.match(html, /id="member-phone"/);
    assert.match(html, /id="member-check-submit-label">확인하기<\/strong>/);
    assert.match(html, /번호는 저장하지 않고 가입 후 자동 확인해요\./);
    assert.match(html, /<label for="member-phone">휴대전화번호<\/label>/);
    assert.match(html, /id="band-connection-status">연결되지 않음<\/span>/);
    assert.match(html, /class="cw-band-account-head"[\s\S]*id="member-check-title">회원 확인[\s\S]*class="cw-band-connection"/);
    assert.doesNotMatch(html, /cw-band-identity|band-page-title|크레와트 커뮤니티/);
    assert.doesNotMatch(html, /CREWARTS COMMUNITY|<h1 id="band-page-title">BAND<\/h1>|>MEMBERSHIP</);
    assert.doesNotMatch(html, /BAND 가입 번호를 확인할게요|가입 승인된 BAND 프로필|설문 답변·결과와 함께 저장되지 않습니다/);
    assert.doesNotMatch(html, /결과 확인 전 한 번만/);
    assert.match(html, /BAND 가입하기/);
    assert.match(html, /id="member-join-link"[\s\S]*data-band-join[\s\S]*BAND 가입하기/);
    assert.doesNotMatch(html, /id="member-join-link"[^>]*hidden/);
    assert.doesNotMatch(html, /supabase-bridge\.js/);
    assert.match(css, /\.cw-choice-button[\s\S]*min-height:\s*78px/);
    assert.match(script, /function verifyMembershipPhone/);
    assert.match(script, /\/api\/crewart-survey\/bootstrap/);
    assert.match(script, /\/api\/crewart-survey\/responses/);
    assert.doesNotMatch(script, /getConfigMap|saveCrewartSurveyEntry/);
    assert.doesNotMatch(script, /openBandJoinWindow|bandPopup|window\.open\('', '_blank'/);
    assert.match(script, /question-label'\)\.hidden = true/);
    assert.match(script, /if \(!payload\.member\)[\s\S]*가입 후 돌아오면 같은 번호로 자동 확인해요[\s\S]*joinLink\.hidden = false[\s\S]*is-recommended[\s\S]*submitLabel\.textContent = '다시 확인'/);
    assert.match(script, /handleMemberJoinReturn[\s\S]*가입 승인 후 돌아오면 자동으로 다시 확인해요/);
    assert.match(css, /\.cw-dialog-band-button\.is-recheck/);
    assert.match(css, /\.cw-member-status\.is-action/);
    assert.doesNotMatch(script, /window\.location\.assign\(bandTargetUrl\)/);
    assert.match(script, /function recheckPendingMembership[\s\S]*completeMembershipAccess\(payload, verifiedPhone\)/);
    assert.match(script, /visibilitychange[\s\S]*recheckPendingMembership\(\{ visibleOnly: true \}\)/);
    const openMemberCheckBody = script.match(/function openMemberCheck\(options = \{\}\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.doesNotMatch(openMemberCheckBody, /\.focus\(/);
    assert.match(openMemberCheckBody, /setScreen\('band-screen'\)/);
    const showResultBody = script.match(/function showResult\(skipMbti\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.match(showResultBody, /completeResultReveal\(\)/);
    assert.doesNotMatch(showResultBody, /openMemberCheck/);
    assert.match(script, /function handleUnlockDetail\(\)[\s\S]*navigateToTab\('band', \{ memberOptions: \{ revealResult: true \} \}\)/);
    assert.match(script, /function submitSurvey\(\)[\s\S]*!hasDetailedAccess\(\)/);
    assert.doesNotMatch(script, /BAND_OAUTH_API|beginBandLogin/);
});

test('CREWARTS home shows the saved result and only a masked authenticated phone', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey.js'), 'utf8');
    for (const id of ['auth-phone-number', 'auth-phone-edit', 'auth-phone-clear', 'home-result-card', 'home-retest', 'home-house-seal', 'home-house-name', 'app-nav']) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
    }
    assert.match(html, /MY CREWART PROFILE/);
    assert.match(html, /다시 시작/);
    assert.match(html, /data-nav="home"[\s\S]*data-nav="result"[\s\S]*data-nav="band"/);
    assert.doesNotMatch(html, /최근 결과|home-result-open|cw-home-panel|cw-home-member/);
    assert.match(script, /crewart_band_member_phone_mask_v1/);
    assert.match(script, /function maskPhone[\s\S]*\*\*\*\*/);
    assert.match(script, /if \(bandAuthToken && !bandAuthPhoneMask\)[\s\S]*removeItem\(MEMBERSHIP_STORAGE_KEY\)/);
    assert.match(script, /function saveLastResult/);
    assert.match(script, /function restoreLastResult/);
    assert.match(script, /function editMembershipAccess\(\)[\s\S]*editingMembership = true[\s\S]*updateBandState\(\)/);
    assert.match(script, /function clearMembershipAccess\(\)[\s\S]*removeItem\(MEMBERSHIP_STORAGE_KEY\)[\s\S]*removeItem\(MEMBERSHIP_PHONE_STORAGE_KEY\)/);
    assert.doesNotMatch(script, /확인된 회원으로 결과를 바로 볼 수 있어요/);
    assert.match(script, /document\.querySelectorAll\('\[data-band-join\]'\)/);
    assert.match(script, /function updateBandState\(\)[\s\S]*bandAuthPhoneMask/);
    assert.match(script, /function navigateToTab\(tab, options = \{\}\)[\s\S]*restoreLastResult\(\{ animate: true \}\)[\s\S]*openMemberCheck\(options\.memberOptions\)/);
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
    assert.doesNotMatch(html, /member-check-dialog|cw-guest-dialog/);
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
    assert.match(script, /결과 이미지 저장/);
    assert.match(script, /카카오톡 공유/);
    assert.match(script, /function saveResultImage/);
    assert.match(script, /CREWARTS_\$\{result\.code\}_\$\{typeName\}\.png/);
    assert.match(script, /canvas\.width = 1080/);
    assert.match(script, /canvas\.height = 1440/);
    assert.match(script, /createKakaoShareFile\(\)[\s\S]*canvas\.width = 1200[\s\S]*canvas\.height = 800/);
    assert.match(script, /imageWidth:\s*1200/);
    assert.match(script, /imageHeight:\s*800/);
    assert.match(script, /나는 크레 앞에서 어떤 유형일까\?\\n\$\{Core\.QUESTIONS\.length\}문항 약 3분/);
    assert.match(script, /title:\s*'나도 알아보기'/);
    assert.match(script, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
    assert.match(html, /id="result-save-dialog"/);
    assert.match(html, /id="result-save-preview"/);
    assert.match(html, /id="result-save-name"/);
    assert.match(html, /id="result-save-confirm"/);
    assert.match(html, /id="kakao-share-dialog"/);
    assert.match(html, /id="kakao-share-preview"/);
    assert.match(html, /공유창 열기[\s\S]*카카오톡 선택[\s\S]*친구·채팅방 선택/);
    assert.match(script, /function savePreparedResultImage/);
    assert.match(script, /function openKakaoShareGuide/);
    assert.match(script, /window\.showSaveFilePicker/);
    assert.match(script, /suggestedName: file\.name/);
    assert.match(script, /공유 앱에서 카카오톡을 선택해주세요/);
    assert.match(script, /KAKAO_JS_KEY/);
    assert.match(script, /const SURVEY_URL = 'https:\/\/creok\.onrender\.com\/crewart-survey\.html'/);
    assert.doesNotMatch(script, /const SURVEY_URL = new URL\([^\n]*document\.baseURI/);
    assert.match(html, /crewart-survey\.js\?v=20260815-fixed-story-v23/);
    assert.match(script, /function renderUnifiedResult\(profile, house\)/);
    assert.doesNotMatch(script, /resultViewVersion|resultViewFromLocation|changeResultView|report=deep|set-result-version/);
    assert.match(script, /function renderResult\(options = \{\}\)[\s\S]*renderUnifiedResult\(profile, house\);/);
    assert.match(script, /function setupResultStory\(\)/);
    assert.match(script, /data-result-story aria-label="스크롤로 확인하는 결과 리포트"/);
    assert.match(script, /class="cw-story-sticky"/);
    assert.match(script, /class="cw-story-scene is-axis"/);
    assert.match(script, /class="cw-story-scene is-profile"/);
    assert.match(script, /class="cw-story-scene is-time"/);
    assert.match(script, /class="cw-story-scene is-house"/);
    assert.match(script, /결국, 당신의 유형은/);
    assert.match(script, /당신의 핵심 강점/);
    assert.match(script, /가장 편안한 유형/);
    assert.match(script, /평균 문항 시간/);
    assert.match(script, /당신의 기숙사는/);
    assert.match(script, /data-action="share">카카오톡 공유하기/);
    assert.match(script, /const averageResponseTime = timingStats\?\.averageMs > 0 \? formatSeconds\(timingStats\.averageMs\) : '측정 전'/);
    assert.match(script, /const axisProgress = segment\(progress, \.015, \.19\)/);
    assert.match(script, /const mbtiProgress = segment\(progress, \.17, \.29\)/);
    assert.match(script, /const strengthProgress = segment\(progress, \.34, \.43\)/);
    assert.match(script, /const matchProgress = segment\(progress, \.44, \.55\)/);
    assert.match(script, /const shareProgress = segment\(progress, \.9, \.985\)/);
    assert.match(script, /row\.style\.setProperty\('--axis-current'/);
    assert.match(script, /root\.classList\.toggle\('is-share-ready', shareProgress >= \.98\)/);
    assert.match(script, /window\.addEventListener\('scroll', scheduleSync, \{ passive: true \}\)/);
    assert.match(script, /window\.removeEventListener\('scroll', scheduleSync\)/);
    assert.match(script, /resultExperienceCleanup\?\.\(\)/);
    assert.match(script, /function buildPreviewResult\(code\)/);
    assert.match(css, /\.cw-story-track\s*\{[\s\S]*height:\s*620svh/);
    assert.match(css, /\.cw-story-sticky\s*\{[^}]*position:\s*sticky[^}]*height:\s*100svh[^}]*overflow:\s*hidden/);
    assert.match(css, /\.cw-story-scene\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
    assert.match(css, /\.cw-story-axis-track b\s*\{[^}]*left:\s*var\(--axis-current, 50%\)/);
    assert.match(css, /\.cw-story-card\.is-strength\s*\{[^}]*opacity:\s*var\(--strength-progress\)/);
    assert.match(css, /\.cw-story-card\.is-match\s*\{[\s\S]*opacity:\s*var\(--match-progress\)/);
    assert.match(css, /\.cw-story-scene\.is-time > strong\s*\{[^}]*font-size:\s*clamp\(82px, 18vw, 164px\)/);
    assert.match(css, /\.cw-story-house-line\s*\{[^}]*white-space:\s*nowrap[^}]*var\(--house-progress\)/);
    assert.match(css, /\.cw-story-track\.is-share-ready \.cw-story-kakao\s*\{[^}]*animation:\s*cw-story-share-ready/);
    assert.match(css, /@keyframes cw-story-share-ready/);
    assert.doesNotMatch(script, /cw-depth-stage|cw-depth-step|cw-depth-mobile-summary|data-depth-scrolly/);
    assert.match(css, /html\s*\{[^}]*overflow-x:\s*clip/);
    assert.match(css, /body\s*\{[^}]*overflow-x:\s*clip/);
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
    assert.doesNotMatch(script, /locked: true|visual: '(?:strength|house|locked)'/);
    assert.doesNotMatch(script, /cw-scrolly-scroll-track|cw-scrolly-milestone|cw-step-panel|setupActiveScrollytelling/);
    assert.doesNotMatch(css, /\.cw-scrolly-scroll-track|\.cw-scrolly-milestone|\.cw-step-panel/);
    assert.match(script, /Kakao\.Share\.uploadImage/);
    assert.match(script, /Kakao\.Share\.sendDefault/);
    assert.match(script, /function sharePreparedNativeResult/);
    assert.match(html, /assets\/vendor\/kakao-2\.8\.1\.min\.js/);
    assert.match(css, /\.cw-save-dialog::backdrop/);
    assert.match(css, /\.cw-kakao-preview\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/);
    assert.match(css, /\.cw-save-preview img\s*\{[^}]*position:\s*absolute[^}]*object-fit:\s*contain/);
    assert.doesNotMatch(script, /data-action="instagram"|shareToInstagram/);
    assert.doesNotMatch(script, /data-action="band-result"/);
    assert.doesNotMatch(script, /크레\s*MBTI|나의 크레 MBTI|평소 MBTI/i);
    assert.match(script, /function typeCharacterPath\(code\)/);
    assert.match(script, /TYPE_CHARACTER_ROOT = 'assets\/crewart-types\/'/);
    assert.match(html, /crewart-survey-core\.js\?v=20260815-fixed-story-v23/);
    assert.match(html, /crewart-survey-v4\.css\?v=20260815-fixed-story-v23/);
    assert.match(html, /id="start-button"[^>]*>[\s\S]*시작하기/);
    assert.match(html, /id="home-retest"[^>]*>다시 시작/);
    assert.doesNotMatch(html, /start-button-v2|home-retest-v1|Ver 1 시작|Ver 2 시작/);
    assert.match(script, /function startCurrentSurvey\(\)[\s\S]*Core\.getSurveyVersion\('v2'\)\.questionsFile/);
    assert.doesNotMatch(script, /startSurveyVersion|start-button-v2|home-retest-v1/);
    assert.match(script, /Core\.MIN_RESPONSE_MS/);
    assert.match(script, /초 후 선택할 수 있어요/);
    assert.doesNotMatch(css, /\.cw-choice-button:disabled/);
    assert.doesNotMatch(script, /data-choice="\$\{index\}" disabled/);
    assert.doesNotMatch(script, /data-choice="\$\{index\}"[^>]*aria-disabled/);
    assert.match(script, /button\.dataset\.timeLocked = String\(locked\)/);
    assert.match(script, /choiceLockAttempted[\s\S]*아직 선택할 수 없어요/);
    assert.doesNotMatch(html, /cw-v2-button/);
    assert.doesNotMatch(css, /cw-v2-button|linear-gradient\(135deg, #e11d48, #f97316\)/);
    assert.match(css, /\.cw-home-start \.cw-test-action\s*\{[^}]*background:\s*rgba\(255, 255, 255, \.96\)/);
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
        fs.readdirSync(characterDirectory).filter(file => file.endsWith('.png')).sort(),
        characterCodes.map(code => `crewart-type-${code}.png`).sort()
    );
    characterCodes.forEach(code => {
        const png = fs.readFileSync(path.join(characterDirectory, `crewart-type-${code}.png`));
        assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
        assert.equal(png[25], 6, `${code} character should be RGBA PNG`);
    });
    assert.match(script, /root\.style\.setProperty\('--axis-progress', axisProgress\)/);
    assert.doesNotMatch(script, /dot\.addEventListener\('click'/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(script, /renderResult\(\{ animate: true \}\)/);
    assert.match(script, /평균 문항 시간/);
    assert.match(script, /Core\.chooseTendencyHouse\(result\)/);
    assert.doesNotMatch(script, /기숙사 참여하기|현재 커뮤니티 인원을 기준/);
    assert.match(css, /\.cw-scale-line[\s\S]*left:\s*50%/);
    assert.match(script, /if \(!hasDetailedAccess\(\)\)/);
    assert.doesNotMatch(script, /locked: true|axisFacts/);
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
    assert.doesNotMatch(css, /\.cw-bottom-nav\.is-result-hidden/);
    assert.doesNotMatch(script, /resultNavRevealed|updateResultNavigationVisibility/);
    assert.doesNotMatch(css, /body\.cw-keyboard-open \.cw-bottom-nav/);
    assert.match(css, /\.cw-band\.is-keyboard-open[\s\S]*--cw-visual-viewport-height/);
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
    assert.match(script, /drawShareImageContain\(context, character, 362, 72, 356, 452\)/);
    assert.doesNotMatch(css, /cw-scale-scan|rgba\(22, 129, 75, \.7\)/);
    assert.match(script, /data-action="unlock-detail">회원 상세 보기/);
    assert.match(css, /\.cw-detail-preview\s*\{[^}]*filter:\s*blur\(5px\)/);
    assert.match(css, /\.cw-speed-head strong\s*\{[^}]*color:\s*var\(--cw-ink\)[^}]*font-size:\s*15px[^}]*font-weight:\s*800/);
    assert.match(css, /\.cw-report-house[\s\S]*border-top:\s*1px solid var\(--cw-line\)/);
});

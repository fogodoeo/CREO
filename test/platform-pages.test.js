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
    'auction-live.html',
    'channel-shipping.html',
    'broadcast-router.html',
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

test('the universal broadcast route preserves CDCUP legacy output and uses the new renderer elsewhere', () => {
    const router = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast-router.html'), 'utf8');
    assert.doesNotMatch(router, /supabase-bridge|active_event_module|getRuntimeConfigMap/i);
    assert.match(router, /\/api\/platform\/active-channel/);
    assert.match(router, /auction-live\.html\?channel=/);
    assert.match(router, /channel==='cdcup'/);
    assert.match(router, /broadcast\.html\?page=/);
    assert.match(router, /module=cdcup&direct=1/);
    assert.doesNotMatch(router, /crewart-broadcast\.html\?page=/);
});

test('hub preserves established management and CDCUP broadcast control links', () => {
    const hub = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.match(hub, /id="login-gate"/);
    assert.match(hub, /id="dashboard" hidden/);
    assert.match(hub, /id="admin-password"/);
    assert.match(hub, /CreoPlatform\.verifyAdmin\(\)/);
    assert.match(hub, /CreoPlatform\.logout\(\)/);
    assert.match(hub, /\.channel-actions\{display:grid;grid-template-columns:1fr 1fr/);
    assert.match(hub, /c\.links\.workspace/);
    assert.match(hub, /c\.links\.control/);
    assert.match(hub, /legacy\?\.managementUrl/);
    assert.match(hub, /c\.links\.shipping/);
});

test('CDCUP platform links use the established control while other channels use the unified control', () => {
    const { channelLinks } = require('../platform-core');
    assert.equal(channelLinks('cdcup').control, '/settings.html?module=cdcup');
    assert.equal(channelLinks('sample').control, '/auction-control.html?channel=sample');
    const workspace = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-workspace.html'), 'utf8');
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-shipping.html'), 'utf8');
    assert.match(workspace, /c\?\.links\?\.control/);
    assert.match(shipping, /c\?\.links\?\.control/);
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
});

test('the new broadcast implements three independent camera overlays', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    assert.match(live, /1P · HOST/);
    assert.match(live, /2P · ITEM/);
    assert.match(live, /EXTRA INFORMATION/);
    assert.match(live, /function pageOne/);
    assert.match(live, /function pageTwo/);
    assert.match(live, /function pageThree/);
    assert.match(live, /page1BannerOn/);
    assert.match(live, /page2SoldOn/);
    assert.match(live, /if\(!s\.page3On\)return''/);
    assert.match(live, /background:transparent/);
    assert.match(live, /broadcast-pulse/);
    assert.match(live, /setInterval\(pollPulse,350\)/);
    assert.match(live, /document\.hidden/);
    assert.doesNotMatch(live, /setInterval\(refresh,1000\)/);
});

test('established CDCUP registration, list, print, and round archive remain intact', () => {
    const operations = fs.readFileSync(path.join(__dirname, '..', 'public', 'cdcup-index.html'), 'utf8');
    for (const label of ['개체 등록', '개체 목록', '인쇄', '회차 기록']) assert.match(operations, new RegExp(label));
    assert.match(operations, /channel-shipping\.html\?channel=cdcup/);
});

test('new CDCUP overlays and shipping retain compatibility with the established item list', () => {
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const shipping = fs.readFileSync(path.join(__dirname, '..', 'public', 'channel-shipping.html'), 'utf8');
    for (const source of [live, control, shipping]) {
        assert.match(source, /getBroadcastItemsCached/);
        assert.match(source, /channelId==='cdcup'/);
    }
    assert.match(shipping, /itemLotNumber/);
    assert.match(shipping, /itemVendorName/);
});

test('legacy broadcast bridge survives Supabase quota exhaustion with cached or standby data', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'public', 'supabase-bridge.js'), 'utf8');
    const cdcup = fs.readFileSync(path.join(__dirname, '..', 'public', 'broadcast.html'), 'utf8');
    assert.match(bridge, /SUPABASE_QUOTA_COOLDOWN_MS/);
    assert.match(bridge, /_readBroadcastStorage\('items', \[\]\)/);
    assert.match(bridge, /_readBroadcastStorage\('config', \{\}\)/);
    assert.match(cdcup, /await _refreshBroadcastFromItems\(\[\]\)/);
});

test('broadcast control manages reusable banners, sponsors, and vendor logos', () => {
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    for (const marker of ['배너·로고', '회전 배너', '협찬 로고', '업체 로고', 'importLegacyAssets']) {
        assert.match(control, new RegExp(marker));
    }
    assert.match(live, /function pageAssets/);
    assert.match(live, /function vendorLogo/);
    assert.match(live, /ticker-sponsors/);
    assert.match(live, /Math\.floor\(Date\.now\(\)\/6000\)/);
});

test('CREWARTS reveals the basic result first and unlocks member detail by phone', () => {
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
    assert.match(html, /새로 검사하기/);
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
    const managerHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey-manager.html'), 'utf8');
    const managerScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'crewart-survey-manager.js'), 'utf8');
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
    assert.doesNotMatch(managerHtml, />[^<]*MBTI[^<]*</i);
    assert.doesNotMatch(managerHtml, /supabase-bridge\.js/);
    assert.match(managerHtml, /platform-client\.js\?v=20260803-admin-session-v2/);
    assert.match(managerHtml, /id="manager-auth"/);
    assert.match(managerHtml, /id="manager-main" hidden/);
    assert.match(managerScript, /\/api\/crewart-survey\/content/);
    assert.match(managerScript, /CreoPlatform\.verifyAdmin\(\)/);
    assert.match(managerScript, /CreoPlatform\.logout\(\)/);
    assert.doesNotMatch(managerScript, /updateConfigs|getConfigMap/);
    assert.match(css, /font-family:\s*"Pretendard Variable"/);
    assert.doesNotMatch(css, /Cinzel|Georgia/i);
    assert.match(html, /assets\/band-app-icon-official\.png/);
    assert.match(script, /assets\/kakaolink_btn_medium\.png/);
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
    assert.match(script, /나는 크레 앞에서 어떤 유형일까\?\\n20문항 약 2분/);
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
    assert.match(script, /class="cw-scale-marker"/);
    assert.match(script, /data-final-position="\$\{position\}"/);
    assert.match(script, /function playResultMeasurementAnimation\(container\)/);
    assert.match(script, /function typeCharacterPath\(code\)/);
    assert.match(script, /TYPE_CHARACTER_ROOT = 'assets\/crewart-types\/'/);
    assert.match(script, /class="cw-character-reveal \$\{characterState\}" data-character-reveal/);
    assert.match(script, /cw-character-placeholder[^>]*[\s\S]*<span>\?<\/span>/);
    assert.match(script, /characterReveal\?\.classList\.add\('is-revealed'\)/);
    assert.match(css, /\.cw-character-reveal\.is-revealed img\s*\{[^}]*opacity:\s*1/);
    assert.match(css, /@keyframes cw-character-search/);
    assert.match(script, /cw-result-code cw-result-code-back/);
    assert.match(script, /cw-result-code cw-result-code-front/);
    assert.match(script, /class="cw-type-poster"/);
    assert.match(html, /20260803-analysis-v67/);
    assert.doesNotMatch(html, /question-illustration|question-image/);
    assert.doesNotMatch(script, /QUESTION_IMAGE_ROOT|question\.image|nextImage/);
    assert.doesNotMatch(html, /cw-home-guide|cw-home-disclaimer/);
    assert.match(script, /재미를 위한 성향 콘텐츠이며, 과학적·의학적 진단이 아닙니다\./);
    assert.match(script, /data-q0-start/);
    assert.match(html, /© 2026 CREO\. All rights reserved\./);
    assert.match(script, /© 2026 CREO\. All rights reserved\./);
    assert.match(script, /© 2026 CREO · ALL RIGHTS RESERVED/);
    assert.match(script, /class="cw-result-copyright"/);
    assert.match(css, /\.cw-q0-list li\s*\{[^}]*grid-template-columns:\s*30px 1fr/);
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
    assert.match(script, /letterPairs = \[\['E', 'I'\], \['S', 'N'\], \['T', 'F'\], \['J', 'P'\]\]/);
    assert.match(script, /settleDurations = \[560, 730, 900, 1070\]/);
    assert.match(script, /data-code-slot="\$\{startIndex \+ index\}"/);
    assert.match(script, /marker\.animate\(\[/);
    assert.match(script, /\{ left: '50%' \}[\s\S]*\{ left: `\$\{finalPosition\}%` \}/);
    assert.doesNotMatch(script, /left: index % 2 \? '84%' : '16%'/);
    assert.match(script, /Core\.HOUSE_KEYS\.map\(key => Core\.HOUSE_META\[key\]\?\.name\)/);
    assert.match(script, /prefers-reduced-motion: reduce/);
    assert.match(script, /renderResult\(\{ animate: true \}\)/);
    assert.match(script, /빠름[\s\S]*평균[\s\S]*신중/);
    assert.match(script, /Core\.chooseTendencyHouse\(result\)/);
    assert.doesNotMatch(script, /기숙사 참여하기|현재 커뮤니티 인원을 기준/);
    assert.match(css, /\.cw-scale-line[\s\S]*left:\s*50%/);
    assert.match(script, /renderMemberDetail\(\)\}\$\{renderSpeedCard\(\)\}\$\{renderHouseCard\(\)/);
    assert.match(script, /\? `\$\{renderMemberDetail\(\)\}\$\{renderSpeedCard\(\)\}\$\{renderHouseCard\(\)\}`/);
    assert.doesNotMatch(script, /class="cw-answer-detail"/);
    assert.doesNotMatch(script, /<span>\$\{escapeHtml\(meta\.title\)\}<\/span>/);
    assert.doesNotMatch(script, /cw-report-head|PERSONALITY REPORT|<dt>ID<\/dt>/);
    assert.doesNotMatch(script, /RESULT TYPE/);
    assert.doesNotMatch(script, /평소 유형과 같아요|글자 달라요/);
    assert.match(script, /Core\.buildMbtiComparison\(selectedMbti, result\.code\)/);
    assert.match(script, /function renderTypeComparisonAnalysis\(\)/);
    assert.match(script, /class="cw-analysis-summary"/);
    assert.match(script, /평소 \$\{escapeHtml\(comparison\.knownType\)\}와 같은 방향/);
    assert.doesNotMatch(script, /cw-profile-compare|typeComparisonSummary|USUAL TYPE|MATCH \$\{comparison\.sameCount\}/);
    assert.match(script, /EI: \{ title: '생각 정리', left: '함께 정리', right: '혼자 정리' \}/);
    assert.match(script, /SN: \{ title: '관찰 초점', left: '현재 정보', right: '성장 가능성' \}/);
    assert.match(script, /TF: \{ title: '선택 기준', left: '조건·근거', right: '취향·관계' \}/);
    assert.match(script, /JP: \{ title: '사육 방식', left: '계획·준비', right: '유연·조정' \}/);
    assert.match(script, /class="cw-axis-poles"/);
    assert.match(script, /class="cw-axis-meanings"/);
    assert.match(script, /data-pole-copy="left"/);
    assert.match(script, /data-report-toggle data-report-label=/);
    assert.match(script, /data-report-action>자세히/);
    assert.match(script, /action\.textContent = opening \? '접기' : '자세히'/);
    assert.doesNotMatch(script, /<strong>\$\{escapeHtml\(korean\)\}<\/strong>/);
    assert.match(script, /'axes-report-detail'/);
    assert.match(script, /'speed-report-detail'/);
    assert.match(script, /'house-report-detail'/);
    assert.match(script, /function toggleReportDisclosure\(event\)[\s\S]*panel\.hidden = !opening[\s\S]*aria-expanded/);
    assert.match(script, /id="axes-report-detail" hidden>\$\{renderTypeComparisonAnalysis\(\)\}\$\{axisInsights\}<\/div>\s*<div class="cw-axis-detail-list">/);
    assert.match(script, /id="speed-report-detail" hidden>[\s\S]*<div class="cw-speed-summary">/);
    assert.match(script, /id="house-report-detail" hidden>[\s\S]*<div class="cw-house-assignment">/);
    assert.match(script, /이번 응답에서 확인된 장면/);
    assert.match(script, /function selectedAxisExamples\(axisResult\)/);
    assert.match(script, /axisExamples:\s*Object\.fromEntries/);
    assert.match(script, /resultAxisExamples\[axisResult\.axis\]/);
    assert.match(script, /examples\.length \? `<section class="cw-analysis-evidence">/);
    assert.match(script, /class="cw-analysis-evidence"/);
    assert.match(script, /class="cw-analysis-reading"/);
    assert.match(script, /TYPE_CHANGE_ANALYSIS/);
    assert.match(script, /guide\.summary/);
    assert.match(script, /균형 포인트/);
    assert.match(script, /커뮤니티에서의 역할/);
    assert.match(script, /속도는 정확도나 성실도의 점수가 아닙니다/);
    assert.match(css, /\.cw-analysis-summary p\s*\{[^}]*font-size:\s*12\.5px[^}]*line-height:\s*1\.7/);
    assert.match(css, /\.cw-analysis-evidence blockquote\s*\{[^}]*font-size:\s*12px/);
    assert.match(css, /\.cw-speed-card\s*\{[^}]*margin:\s*18px 0 0/);
    assert.match(css, /\.cw-speed-card \.cw-report-section-head\s*\{[^}]*border-bottom:\s*0/);
    assert.match(css, /\.cw-result-section, \.cw-report-house\s*\{[^}]*border:\s*1px solid[^}]*background:\s*var\(--cw-surface-soft\)/);
    assert.match(css, /\.cw-speed-summary\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/);
    assert.match(css, /\.cw-report-house\s*\{[^}]*margin-top:\s*18px/);
    assert.match(css, /\.cw-report-house \.cw-report-section-head\s*\{[^}]*border-bottom:\s*0/);
    assert.match(css, /\.cw-house-assignment\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/);
    assert.match(css, /\.cw-report-disclosure\[hidden\]\s*\{[^}]*display:\s*none/);
    assert.match(script, /data-axis-result data-final-pole=/);
    assert.match(script, /axisPoles\.forEach[\s\S]*classList\.toggle\('is-selected'/);
    assert.match(script, /if \(tab === 'result'\)[\s\S]*renderResult\(\{ animate: true \}\)[\s\S]*restoreLastResult\(\{ animate: true \}\)/);
    assert.doesNotMatch(script, /data-measure-axis|data-final-label/);
    assert.match(css, /\.cw-result-report\s*\{[^}]*border-radius:\s*6px/);
    assert.match(css, /\.cw-axis-detail-list\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.cw-axis-detail\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*10px/);
    assert.match(css, /\.cw-axis-detail header h3\s*\{[^}]*text-align:\s*center/);
    assert.match(css, /\.cw-axis-pole\.is-selected[\s\S]*font-weight:\s*800/);
    assert.match(css, /\.cw-axis-pole\.is-right\s*\{[^}]*justify-content:\s*flex-end/);
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
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.cw-axis-detail header h3\s*\{\s*font-size:\s*12px/);
    assert.match(css, /\.cw-axis-pole\s*\{[^}]*z-index:\s*2/);
    assert.match(css, /\.cw-axis-pole strong\s*\{[^}]*font-size:\s*12\.5px[^}]*transform:\s*translateY\(-2px\)/);
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
    const lockedDetailBody = script.match(/function renderLockedDetail\(\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    assert.match(lockedDetailBody, /renderMemberDetail\(\)\}\$\{renderSpeedCard\(\)/);
    assert.match(lockedDetailBody, /renderHouseCard/);
    assert.match(css, /\.cw-detail-preview\s*\{[^}]*filter:\s*blur\(5px\)/);
    assert.match(css, /\.cw-speed-head strong\s*\{[^}]*color:\s*var\(--cw-ink\)[^}]*font-size:\s*15px[^}]*font-weight:\s*800/);
    assert.match(css, /\.cw-report-house[\s\S]*border-top:\s*1px solid var\(--cw-line\)/);
});

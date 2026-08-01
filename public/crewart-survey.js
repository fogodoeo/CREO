(function () {
    'use strict';

    const Core = window.CrewartSurveyCore;
    const SURVEY_URL = new URL('crewart-survey.html', document.baseURI).toString();
    const DEFAULT_BAND_URL = 'https://www.band.us/band/101992972/post';
    const BAND_MEMBER_API = '/api/band-membership';
    const KAKAO_JS_KEY = 'db7ffc8d6b9b7601b792ed69be4658fc';
    const QUESTION_IMAGE_ROOT = 'assets/crewart-illustrations/';
    const MEMBERSHIP_STORAGE_KEY = 'crewart_band_member_access_v1';
    const MEMBERSHIP_PHONE_STORAGE_KEY = 'crewart_band_member_phone_mask_v1';
    const LAST_RESULT_STORAGE_KEY = 'crewart_last_result_v1';
    const LAST_RESULT_VERSION = 1;
    const MEMBERSHIP_RECHECK_VISIBLE_MS = 1000;
    const MEMBERSHIP_RECHECK_HIDDEN_MS = 10000;
    const MEMBERSHIP_RECHECK_TIMEOUT_MS = 15 * 60 * 1000;
    const CONTENT_CONFIG_KEY = 'crewart_mbti_content_v1';
    const BAND_INTEGRATION_ENABLED = true;
    const IS_LOCAL_QA = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const IS_QA_MODE = IS_LOCAL_QA;

    let config = {};
    let cohortSummary = {
        houseCounts: Object.fromEntries(Core.HOUSE_KEYS.map(key => [key, 0])),
        timingMedians: [],
        sampleSize: 0
    };
    let questions = [];
    let answers = [];
    let responseTimings = [];
    let current = 0;
    let selectedMbti = '';
    let surveySessionId = '';
    let sessionCreatedAt = '';
    let assignedHouseKey = '';
    let result = null;
    let timingStats = null;
    let activeTimer = null;
    let advancing = false;
    let saveInFlight = false;
    let lastSavedSignature = '';
    let toastTimer = null;

    let bandAuthReady = false;
    let bandAuthConfigured = false;
    let bandAuthToken = '';
    let bandAuthUser = null;
    let bandAuthPhoneMask = '';
    let bandTargetUrl = DEFAULT_BAND_URL;
    let pendingResultReveal = false;
    let pendingSurveyStart = false;
    let pendingMemberPhone = '';
    let membershipRecheckTimer = null;
    let membershipRecheckStartedAt = 0;
    let membershipCheckInFlight = false;
    let bandJoinWindow = null;
    let showingStoredResult = false;

    function element(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function maskPhone(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        return /^010\d{8}$/.test(digits) ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '';
    }

    function loadLastResult() {
        try {
            const snapshot = JSON.parse(localStorage.getItem(LAST_RESULT_STORAGE_KEY) || 'null');
            if (snapshot?.version !== LAST_RESULT_VERSION || snapshot.questionVersion !== Core.SURVEY_VERSION) return null;
            if (!Core.MBTI_TYPES.includes(snapshot.result?.code)) return null;
            if (!Core.HOUSE_KEYS.includes(snapshot.assignedHouseKey)) return null;
            if (!Array.isArray(snapshot.result?.axes) || snapshot.result.axes.length !== 4) return null;
            return snapshot;
        } catch (_) {
            return null;
        }
    }

    function saveLastResult() {
        if (!result || !Core.MBTI_TYPES.includes(result.code) || !Core.HOUSE_KEYS.includes(assignedHouseKey)) return;
        const snapshot = {
            version: LAST_RESULT_VERSION,
            questionVersion: Core.SURVEY_VERSION,
            savedAt: new Date().toISOString(),
            selectedMbti: Core.MBTI_TYPES.includes(selectedMbti) ? selectedMbti : '',
            assignedHouseKey,
            result: {
                code: result.code,
                typeName: result.typeName,
                letters: { ...result.letters },
                axes: result.axes.map(axis => ({ ...axis }))
            },
            timingStats: timingStats ? {
                validCount: timingStats.validCount,
                totalMs: timingStats.totalMs,
                averageMs: timingStats.averageMs,
                medianMs: timingStats.medianMs,
                axisMedians: { ...timingStats.axisMedians },
                style: { ...timingStats.style },
                fastest: timingStats.fastest ? { ...timingStats.fastest } : null,
                slowest: timingStats.slowest ? { ...timingStats.slowest } : null
            } : null
        };
        try { localStorage.setItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(snapshot)); } catch (_) {}
        renderHome();
    }

    function formatSavedAt(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric'
        }).format(date);
    }

    function renderHome() {
        const snapshot = loadLastResult();
        const card = element('home-result-card');
        const startCard = element('home-start-card');
        if (!card || !startCard) return;
        card.hidden = !snapshot;
        startCard.hidden = Boolean(snapshot);
        if (!snapshot) return;
        element('home-result-code').textContent = snapshot.result.code;
        element('home-result-heading').textContent = snapshot.result.typeName;
        element('home-result-summary').textContent = typeSummary(snapshot.result.code);
        element('home-result-saved').textContent = `${formatSavedAt(snapshot.savedAt)}에 저장한 결과`;
    }

    function restoreLastResult() {
        const snapshot = loadLastResult();
        if (!snapshot) {
            renderHome();
            toast('저장된 결과가 없어요.', true);
            return;
        }
        pauseTimer();
        activeTimer = null;
        questions = [];
        answers = [];
        responseTimings = [];
        selectedMbti = snapshot.selectedMbti || '';
        surveySessionId = '';
        sessionCreatedAt = '';
        result = snapshot.result;
        assignedHouseKey = Core.chooseTendencyHouse(result);
        timingStats = snapshot.timingStats;
        showingStoredResult = true;
        renderResult();
        setScreen('result-screen');
    }

    function updateAuthHeader() {
        const chip = element('auth-phone-chip');
        const number = element('auth-phone-number');
        if (!chip || !number) return;
        const authenticated = Boolean(bandAuthUser?.isTargetMember);
        chip.hidden = !authenticated;
        number.textContent = bandAuthPhoneMask || 'BAND 회원 인증됨';
    }

    function toast(message, isError) {
        const target = element('toast');
        if (!target) return;
        target.textContent = message;
        target.style.borderColor = isError ? 'rgba(248,113,113,.55)' : 'rgba(220,196,134,.45)';
        target.classList.add('is-visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => target.classList.remove('is-visible'), 2600);
    }

    let wordmarkFontReady;

    function playWordmark() {
        const wordmark = element('crewart-wordmark');
        if (!wordmark) return;
        if (!wordmarkFontReady) {
            const fontLoad = document.fonts?.load
                ? document.fonts.load('900 72px "Pretendard Variable"').catch(() => [])
                : Promise.resolve([]);
            wordmarkFontReady = Promise.race([
                fontLoad,
                new Promise(resolve => setTimeout(resolve, 1400))
            ]);
        }
        void wordmarkFontReady.then(() => {
            wordmark.classList.remove('is-pending', 'is-writing');
            void wordmark.offsetWidth;
            wordmark.classList.add('is-writing');
        });
    }

    function setupIntroVideo() {
        const introVideo = element('intro-video');
        if (!introVideo) return;
        introVideo.controls = false;
        introVideo.muted = true;
        introVideo.defaultMuted = true;
        introVideo.playsInline = true;
        const reveal = () => introVideo.classList.add('is-playing');
        const conceal = () => introVideo.classList.remove('is-playing');
        introVideo.addEventListener('playing', reveal);
        introVideo.addEventListener('error', conceal);
        introVideo.addEventListener('emptied', conceal);
        if (!introVideo.paused && introVideo.readyState >= 3) reveal();
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            void introVideo.play().then(reveal).catch(conceal);
        }
    }

    function setScreen(screenId) {
        ['intro-screen', 'question-screen', 'mbti-screen', 'result-screen'].forEach(id => {
            const screen = element(id);
            const active = id === screenId;
            screen.hidden = !active;
            screen.classList.toggle('is-active', active);
            if (active) {
                screen.classList.remove('is-entering');
                requestAnimationFrame(() => screen.classList.add('is-entering'));
                if (id === 'intro-screen') playWordmark();
            }
        });
        const introVideo = element('intro-video');
        if (introVideo) {
            const canPlay = screenId === 'intro-screen' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (canPlay) void introVideo.play().then(() => introVideo.classList.add('is-playing')).catch(() => introVideo.classList.remove('is-playing'));
            else introVideo.pause();
        }
        updatePersistentActions();
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function createSessionId() {
        return window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    async function hashSessionId(value) {
        const source = new TextEncoder().encode(`crewart-session:${value}`);
        if (window.crypto?.subtle) {
            const digest = await window.crypto.subtle.digest('SHA-256', source);
            return Array.from(new Uint8Array(digest)).slice(0, 12).map(byte => byte.toString(16).padStart(2, '0')).join('');
        }
        let output = '';
        for (let round = 0; round < 3; round += 1) {
            let hash = (2166136261 ^ (round * 2654435761)) >>> 0;
            source.forEach(byte => {
                hash ^= byte + round;
                hash = Math.imul(hash, 16777619);
            });
            output += (hash >>> 0).toString(16).padStart(8, '0');
        }
        return output;
    }

    function applyManagedContent(raw) {
        if (!raw || questions.length) return;
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed?.version !== Core.SURVEY_VERSION) return;
            const items = Array.isArray(parsed) ? parsed : parsed?.questions;
            if (!Array.isArray(items)) return;
            items.forEach(item => {
                const target = Core.QUESTIONS.find(question => question.id === String(item?.id || '').toUpperCase());
                if (!target) return;
                if (String(item.label || '').trim()) target.label = String(item.label).trim();
                if (String(item.q || '').trim()) target.q = String(item.q).trim();
                if (Array.isArray(item.options) && item.options.length >= 2) {
                    const options = item.options.slice(0, 2).map(value => String(value || '').trim());
                    if (options.every(Boolean)) target.options = options;
                }
            });
        } catch (error) {
            console.warn('[Crewart managed questions]', error);
        }
    }

    async function loadConfig() {
        try {
            const response = await bandFetch('/api/crewart-survey/bootstrap', { cache: 'no-store' });
            if (!response.ok) throw new Error('CREWART survey bootstrap unavailable');
            const payload = await response.json();
            config = {
                [CONTENT_CONFIG_KEY]: payload.content || null,
                crewart_mbti_content_updated_at: payload.contentUpdatedAt || null
            };
            applyManagedContent(payload.content);
            cohortSummary = {
                houseCounts: Object.fromEntries(Core.HOUSE_KEYS.map(key => [
                    key,
                    Math.max(0, Number(payload.cohort?.houseCounts?.[key]) || 0)
                ])),
                timingMedians: (Array.isArray(payload.cohort?.timingMedians)
                    ? payload.cohort.timingMedians
                    : []).map(Number).filter(value => value >= 400 && value <= 30000),
                sampleSize: Math.max(0, Number(payload.cohort?.sampleSize) || 0)
            };
        } catch (error) {
            console.error('[Crewart config]', error);
            config = {};
            cohortSummary = {
                houseCounts: Object.fromEntries(Core.HOUSE_KEYS.map(key => [key, 0])),
                timingMedians: [],
                sampleSize: 0
            };
        }
    }

    function startTimer(index) {
        activeTimer = {
            index,
            elapsedMs: 0,
            visibleAt: document.visibilityState === 'visible' ? performance.now() : null
        };
    }

    function pauseTimer() {
        if (!activeTimer || activeTimer.visibleAt === null) return;
        activeTimer.elapsedMs += performance.now() - activeTimer.visibleAt;
        activeTimer.visibleAt = null;
    }

    function resumeTimer() {
        if (!activeTimer || activeTimer.visibleAt !== null || document.visibilityState !== 'visible') return;
        activeTimer.visibleAt = performance.now();
    }

    function captureTiming(index) {
        if (!activeTimer || activeTimer.index !== index) return;
        pauseTimer();
        const elapsedMs = Math.round(activeTimer.elapsedMs);
        responseTimings[index] = {
            questionId: questions[index].id,
            axis: questions[index].axis,
            elapsedMs,
            valid: elapsedMs >= 400 && elapsedMs <= 30000
        };
    }

    function startSurvey() {
        questions = Core.prepareQuestions();
        answers = [];
        responseTimings = [];
        current = 0;
        selectedMbti = '';
        surveySessionId = createSessionId();
        sessionCreatedAt = new Date().toISOString();
        assignedHouseKey = '';
        result = null;
        timingStats = null;
        showingStoredResult = false;
        advancing = false;
        lastSavedSignature = '';
        setScreen('question-screen');
        renderQuestion();
    }

    function openMemberCheck(options = {}) {
        const dialog = element('member-check-dialog');
        if (!dialog) return;
        pendingResultReveal = Boolean(options.revealResult);
        pendingSurveyStart = Boolean(options.startSurvey);
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        if (status) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-success');
        }
        if (joinLink) joinLink.hidden = true;
        dialog.hidden = false;
        requestAnimationFrame(() => element('member-phone')?.focus());
    }

    function closeMemberCheck() {
        const dialog = element('member-check-dialog');
        if (dialog) dialog.hidden = true;
        stopMembershipRecheck({ closePopup: true });
        pendingResultReveal = false;
        pendingSurveyStart = false;
    }

    function editMembershipAccess() {
        if (!hasDetailedAccess()) return;
        openMemberCheck();
    }

    function clearMembershipAccess() {
        if (!hasDetailedAccess()) return;
        if (!window.confirm('이 기기의 BAND 회원 확인을 해제할까요?')) return;
        stopMembershipRecheck({ closePopup: true });
        bandAuthToken = '';
        bandAuthUser = null;
        bandAuthPhoneMask = '';
        try {
            sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
            sessionStorage.removeItem(MEMBERSHIP_PHONE_STORAGE_KEY);
        } catch (_) {}
        updateBandUi();
        toast('BAND 회원 확인을 해제했어요.');
    }

    function returnToIntro() {
        const stage = currentStage();
        if ((stage === 'questions' || stage === 'mbti')
            && !window.confirm('진행 중인 테스트를 닫고 처음 화면으로 갈까요?\n\nBAND 회원 확인 상태와 이전에 저장한 결과는 유지됩니다.')) return;
        pauseTimer();
        activeTimer = null;
        questions = [];
        answers = [];
        responseTimings = [];
        current = 0;
        selectedMbti = '';
        surveySessionId = '';
        sessionCreatedAt = '';
        assignedHouseKey = '';
        result = null;
        timingStats = null;
        showingStoredResult = false;
        advancing = false;
        lastSavedSignature = '';
        element('result-content').replaceChildren();
        renderHome();
        setScreen('intro-screen');
    }

    function renderQuestion() {
        const question = questions[current];
        if (!question) return;
        advancing = false;
        element('progress-text').textContent = `${current + 1} / ${questions.length}`;
        element('progress-axis').textContent = '크레 앞의 나를 찾는 중';
        element('progress-bar').style.width = `${((current + 1) / questions.length) * 100}%`;
        element('question-back').disabled = current === 0;
        element('question-label').textContent = question.label;
        element('question-title').textContent = question.q;
        const illustration = element('question-illustration');
        const image = element('question-image');
        if (question.image) {
            illustration.hidden = false;
            image.src = `${QUESTION_IMAGE_ROOT}${question.image}`;
            image.alt = question.imageAlt || `${question.label} 상황 삽화`;
        } else {
            illustration.hidden = true;
            image.removeAttribute('src');
            image.alt = '';
        }
        element('choice-list').innerHTML = question.options.map((option, index) => `
            <button class="cw-choice-button${answers[current] === index ? ' is-selected' : ''}" type="button" data-choice="${index}">
                <b aria-hidden="true">${index === 0 ? 'A' : 'B'}</b><span>${escapeHtml(option)}</span>
            </button>`).join('');
        element('choice-list').querySelectorAll('[data-choice]').forEach(button => {
            button.addEventListener('click', () => chooseAnswer(Number(button.dataset.choice)));
        });
        const card = element('question-card');
        card.classList.remove('is-changing');
        requestAnimationFrame(() => card.classList.add('is-changing'));
        const nextImage = questions[current + 1]?.image;
        if (nextImage) {
            const preloader = new Image();
            preloader.src = `${QUESTION_IMAGE_ROOT}${nextImage}`;
        }
        startTimer(current);
    }

    function chooseAnswer(choice) {
        if (advancing) return;
        advancing = true;
        answers[current] = choice;
        captureTiming(current);
        element('choice-list').querySelectorAll('[data-choice]').forEach(button => {
            const selected = Number(button.dataset.choice) === choice;
            button.classList.toggle('is-selected', selected);
            button.disabled = true;
        });
        const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 260;
        setTimeout(() => {
            if (current < questions.length - 1) {
                current += 1;
                renderQuestion();
            } else {
                finishQuestions();
            }
        }, delay);
    }

    function previousQuestion() {
        if (advancing || current === 0) return;
        current -= 1;
        renderQuestion();
    }

    function finishQuestions() {
        activeTimer = null;
        const missing = questions.findIndex((_, index) => answers[index] === undefined);
        if (missing >= 0) {
            current = missing;
            renderQuestion();
            toast('선택하지 않은 질문이 있어요.', true);
            return;
        }
        result = Core.scoreAnswers(questions, answers);
        timingStats = Core.buildTimingStats(responseTimings, questions);
        assignedHouseKey = Core.chooseTendencyHouse(result);
        renderMbtiOptions();
        setScreen('mbti-screen');
    }

    function renderMbtiOptions() {
        element('mbti-grid').innerHTML = Core.MBTI_TYPES.map(type => `
            <button class="cw-mbti-option${selectedMbti === type ? ' is-selected' : ''}" type="button" data-mbti="${type}">${type}</button>`).join('');
        element('mbti-grid').querySelectorAll('[data-mbti]').forEach(button => {
            button.addEventListener('click', () => {
                selectedMbti = button.dataset.mbti;
                renderMbtiOptions();
                element('show-result').disabled = false;
            });
        });
    }

    function showResult(skipMbti) {
        if (!result) return;
        if (!selectedMbti && !skipMbti) {
            toast('평소 유형을 고르거나 건너뛰기를 눌러주세요.', true);
            return;
        }
        completeResultReveal();
    }

    function completeResultReveal() {
        showingStoredResult = false;
        saveLastResult();
        renderResult();
        setScreen('result-screen');
        void submitSurvey();
    }

    function formatSeconds(milliseconds) {
        return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}초`;
    }

    function typeSummary(code) {
        return [
            Core.AXIS_META.EI.letters[code[0]].short,
            Core.AXIS_META.SN.letters[code[1]].short,
            Core.AXIS_META.TF.letters[code[2]].short,
            Core.AXIS_META.JP.letters[code[3]].short
        ].join(' · ');
    }

    function hasDetailedAccess() {
        return IS_LOCAL_QA || Boolean(bandAuthUser && bandAuthUser.isTargetMember === true);
    }

    function openBandTarget() {
        if (!BAND_INTEGRATION_ENABLED) return false;
        window.open(bandTargetUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    function renderTypeRelation() {
        if (!selectedMbti) return '';
        const same = selectedMbti === result.code;
        return `<p class="cw-type-relation">${same
            ? '평소 유형과 같아요'
            : `평소 ${escapeHtml(selectedMbti)}에서 ${Core.buildMbtiComparison(selectedMbti, result.code).changes.length}글자 달라요`
        }</p>`;
    }

    function renderSpeedCard() {
        if (!timingStats?.style) return '';
        const valid = timingStats.validCount > 0;
        const median = valid ? formatSeconds(timingStats.medianMs) : '-';
        const samples = cohortSummary.timingMedians.map(Number).filter(value => value >= 400 && value <= 30000);
        const averageMs = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : timingStats.medianMs;
        const relative = valid && averageMs > 0 ? Math.log2(timingStats.medianMs / averageMs) : 0;
        const position = Math.max(7, Math.min(93, 50 + relative * 25));
        const comparison = samples.length
            ? `평균 ${formatSeconds(averageMs)} · ${samples.length}명`
            : '평균 데이터 준비 중';
        return `
            <section class="cw-result-section cw-speed-card">
                <header class="cw-speed-head">
                    <span>선택 속도</span>
                    <strong>문항당 ${escapeHtml(median)}</strong>
                </header>
                <div class="cw-position-scale cw-speed-scale" aria-label="빠름에서 신중함 사이 ${Math.round(position)}% 위치">
                    <span class="cw-scale-marker" style="--position:${position}%" aria-hidden="true"></span>
                    <div class="cw-scale-line"><i aria-hidden="true"></i></div>
                    <div class="cw-scale-labels"><span>빠름</span><span>평균</span><span>신중</span></div>
                </div>
                <small class="cw-speed-average">${escapeHtml(comparison)}</small>
            </section>`;
    }

    function renderMemberDetail() {
        const axisCards = result.axes.map(axisResult => {
            const meta = Core.AXIS_META[axisResult.axis];
            const dominant = meta.letters[axisResult.dominant];
            const first = axisResult.axis[0];
            const second = axisResult.axis[1];
            const firstCount = Number(result.letters[first]) || 0;
            const secondCount = Number(result.letters[second]) || 0;
            const position = Math.max(0, Math.min(100, (secondCount / 5) * 100));
            return `
                <article class="cw-axis-detail">
                    <header><strong>${axisResult.dominant} · ${escapeHtml(dominant.short)}</strong></header>
                    <div class="cw-position-scale cw-axis-scale" aria-label="${first} ${firstCount}, ${second} ${secondCount}">
                        <span class="cw-scale-marker" style="--position:${position}%" aria-hidden="true"></span>
                        <div class="cw-scale-line"><i aria-hidden="true"></i></div>
                        <div class="cw-scale-labels"><span>${first}</span><span>중립</span><span>${second}</span></div>
                    </div>
                    <p>${escapeHtml(dominant.description)}</p>
                </article>`;
        }).join('');
        return `
            <section class="cw-result-section cw-member-detail">
                <h2 class="cw-visually-hidden">성향 요약</h2>
                <div class="cw-axis-detail-list">${axisCards}</div>
            </section>`;
    }

    function renderHouseCard() {
        const house = Core.HOUSE_META[assignedHouseKey];
        return `
            <section class="cw-result-section cw-house-card">
                <span>기숙사</span>
                <div><h2>${house.name}</h2><b>${assignedHouseKey[0]} · ${assignedHouseKey[1]} 조합</b></div>
            </section>`;
    }

    function renderLockedDetail() {
        const configured = BAND_INTEGRATION_ENABLED && bandAuthConfigured;
        const label = configured ? 'BAND 회원 연동' : '연동 준비 중';
        const status = configured ? '확인 후 바로 열려요' : '회원 명단 연결을 준비하고 있어요';
        return `
            <section class="cw-detail-gate">
                <div class="cw-detail-preview" aria-hidden="true" inert>${renderMemberDetail()}${renderSpeedCard()}${renderHouseCard()}</div>
                <div class="cw-detail-shade" aria-hidden="true"></div>
                <div class="cw-detail-unlock">
                    <h2>전체 결과 보기</h2>
                    <button class="cw-band-cta" type="button" data-action="unlock-detail" ${configured ? '' : 'disabled'}><img src="assets/band-app-icon-official.png?v=20260801-logo-v2" width="24" height="24" alt=""><span>${escapeHtml(label)}</span><b aria-hidden="true">→</b></button>
                    <small class="cw-lock-status">${escapeHtml(status)}</small>
                </div>
            </section>`;
    }

    function renderResult() {
        const detail = BAND_INTEGRATION_ENABLED && hasDetailedAccess()
            ? `${renderMemberDetail()}${renderSpeedCard()}${renderHouseCard()}`
            : renderLockedDetail();
        const bandShare = BAND_INTEGRATION_ENABLED
            ? `<button class="cw-share-icon is-band" type="button" data-action="band-result" aria-label="크레와트 BAND 열기"><img src="assets/band-app-icon-official.png?v=20260801-logo-v2" width="28" height="28" alt=""></button>`
            : '';
        element('result-content').innerHTML = `
            <div class="cw-result-wrap">
                <section class="cw-result-poster">
                    <div class="cw-result-hero-copy">
                        <p class="cw-poster-kicker">나의 결과</p>
                        <strong class="cw-result-code">${escapeHtml(result.code)}</strong>
                        <h1>${escapeHtml(result.typeName)}</h1>
                        ${renderTypeRelation()}
                    </div>
                </section>
                ${detail}
                <section class="cw-result-section cw-share-section">
                    <div><p>SHARE</p><h2>결과 공유</h2></div>
                    <div class="cw-share-tools" aria-label="결과 공유">
                        <button class="cw-share-icon is-kakao" type="button" data-action="share" aria-label="카카오톡으로 공유">
                            <img src="assets/kakaolink_btn_medium.png" width="24" height="24" alt="">
                        </button>
                        <button class="cw-share-icon is-instagram" type="button" data-action="instagram" aria-label="인스타그램 스토리로 공유">
                            <img src="assets/instagram-glyph-official.svg" width="24" height="24" alt="">
                        </button>
                        ${bandShare}
                    </div>
                </section>
                <div class="cw-result-actions">
                    <button class="cw-primary-button" type="button" data-action="retest">다시 테스트하기</button>
                    <button class="cw-secondary-button" type="button" data-action="home">처음 화면으로</button>
                </div>
            </div>`;
        element('result-content').querySelector('[data-action="unlock-detail"]')?.addEventListener('click', handleUnlockDetail);
        element('result-content').querySelector('[data-action="open-band"]')?.addEventListener('click', openBandTarget);
        element('result-content').querySelector('[data-action="share"]')?.addEventListener('click', shareResult);
        element('result-content').querySelector('[data-action="instagram"]')?.addEventListener('click', shareToInstagram);
        element('result-content').querySelector('[data-action="band-result"]')?.addEventListener('click', handleResultBand);
        element('result-content').querySelector('[data-action="retest"]')?.addEventListener('click', startSurvey);
        element('result-content').querySelector('[data-action="home"]')?.addEventListener('click', returnToIntro);
    }

    function handleResultBand() {
        if (!BAND_INTEGRATION_ENABLED) return;
        openBandTarget();
    }

    function handleUnlockDetail() {
        if (!BAND_INTEGRATION_ENABLED) {
            toast('BAND 연동은 현재 준비 중이에요.');
            return;
        }
        if (hasDetailedAccess()) {
            renderResult();
            return;
        }
        openMemberCheck({ revealResult: true });
    }

    async function submitSurvey() {
        if (IS_QA_MODE || !result || !surveySessionId || saveInFlight || !hasDetailedAccess()) return;
        const signature = JSON.stringify({ session: surveySessionId, answers, selectedMbti, band: bandAuthUser?.id || '', member: bandAuthUser?.isTargetMember || false });
        if (signature === lastSavedSignature) return;
        saveInFlight = true;
        try {
            const participantKey = await hashSessionId(surveySessionId);
            const response = {
                participantKey,
                creMbti: result.code,
                crebtiType: result.code,
                knownMbti: selectedMbti || null,
                axisScores: result.letters,
                assignedHouseKey,
                houseId: assignedHouseKey,
                answers: answers.slice(),
                answerLabels: questions.map((question, index) => ({
                    questionId: question.id,
                    axis: question.axis,
                    displayedPosition: answers[index] + 1,
                    score: question.scores[answers[index]],
                    responseMs: responseTimings[index]?.elapsedMs || null,
                    timingValid: Boolean(responseTimings[index]?.valid)
                })),
                responseTimes: responseTimings.slice(),
                timingStats: {
                    validCount: timingStats.validCount,
                    totalMs: timingStats.totalMs,
                    averageMs: timingStats.averageMs,
                    medianMs: timingStats.medianMs,
                    axisMedians: timingStats.axisMedians,
                    style: timingStats.style.key,
                    fastest: timingStats.fastest,
                    slowest: timingStats.slowest
                },
                questionVersion: Core.SURVEY_VERSION,
                questionContentUpdatedAt: config.crewart_mbti_content_updated_at || null,
                createdAt: sessionCreatedAt,
                syncedAt: new Date().toISOString()
            };
            const saved = await bandFetch('/api/crewart-survey/responses', {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${bandAuthToken}`
                },
                body: JSON.stringify({ response })
            });
            if (!saved.ok) {
                const payload = await saved.json().catch(() => ({}));
                throw new Error(payload.error || '설문 결과를 저장하지 못했습니다.');
            }
            lastSavedSignature = signature;
        } catch (error) {
            console.error('[Crewart survey save]', error);
        } finally {
            saveInFlight = false;
        }
    }

    function currentStage() {
        if (!element('result-screen').hidden) return 'result';
        if (!element('mbti-screen').hidden) return 'mbti';
        if (!element('question-screen').hidden) return 'questions';
        return 'intro';
    }

    async function bandFetch(url, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        try {
            return await fetch(url, { ...(options || {}), signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function verifyBandSession(token) {
        const response = await bandFetch(`${BAND_MEMBER_API}/session`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        if (!response.ok) throw new Error('BAND membership session expired');
        return response.json();
    }

    function updateBandUi() {
        const button = element('band-float');
        const label = element('band-float-label');
        const note = element('band-entry-note');
        const authenticated = hasDetailedAccess();
        button.disabled = !bandAuthReady || authenticated;
        button.classList.toggle('is-verified', authenticated);
        button.hidden = !BAND_INTEGRATION_ENABLED;
        if (note) note.hidden = !BAND_INTEGRATION_ENABLED || authenticated;
        label.textContent = authenticated ? 'BAND 회원 확인 완료' : 'BAND 회원 연동';
        if (note && !authenticated) note.textContent = bandAuthConfigured
                ? '전화번호는 가입 여부 확인에만 사용해요'
                : '회원 명단 연결을 준비하고 있어요';
        button.setAttribute('aria-label', label.textContent);
        updateAuthHeader();
        updatePersistentActions();
        if (result && !element('result-screen').hidden) renderResult();
    }

    function updatePersistentActions() {
        const footer = element('survey-footer');
        const home = element('persistent-home-button');
        if (home) home.hidden = currentStage() === 'intro';
        if (footer) footer.hidden = true;
    }

    function handlePersistentBand() {
        if (!BAND_INTEGRATION_ENABLED) return;
        if (!bandAuthReady) return;
        if (hasDetailedAccess()) toast('BAND 회원 확인이 완료됐어요.');
        else openMemberCheck({ revealResult: currentStage() === 'mbti' && Boolean(result) });
    }

    function handleBandEntry() {
        if (hasDetailedAccess()) return;
        openMemberCheck({ startSurvey: true });
    }

    async function initBandMembership() {
        try {
            bandAuthToken = sessionStorage.getItem(MEMBERSHIP_STORAGE_KEY) || '';
            bandAuthPhoneMask = sessionStorage.getItem(MEMBERSHIP_PHONE_STORAGE_KEY) || '';
            if (bandAuthToken && !bandAuthPhoneMask) {
                bandAuthToken = '';
                sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
            }
        } catch (_) {
            bandAuthToken = '';
            bandAuthPhoneMask = '';
        }
        try {
            const response = await bandFetch(`${BAND_MEMBER_API}/config`, { cache: 'no-store' });
            if (!response.ok) throw new Error('BAND membership config unavailable');
            const memberConfig = await response.json();
            bandAuthConfigured = Boolean(memberConfig.configured);
            bandTargetUrl = memberConfig.targetBandUrl || DEFAULT_BAND_URL;
            if (bandAuthConfigured && bandAuthToken) {
                const session = await verifyBandSession(bandAuthToken);
                bandAuthUser = session.user || null;
                bandTargetUrl = session.targetBandUrl || bandTargetUrl;
            }
        } catch (error) {
            console.error('[Crewart BAND membership]', error);
            bandAuthUser = null;
            bandAuthToken = '';
            bandAuthPhoneMask = '';
            try {
                sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
                sessionStorage.removeItem(MEMBERSHIP_PHONE_STORAGE_KEY);
            } catch (_) {}
        } finally {
            bandAuthReady = true;
            updateBandUi();
        }
    }

    function stopMembershipRecheck(options = {}) {
        if (membershipRecheckTimer) clearTimeout(membershipRecheckTimer);
        membershipRecheckTimer = null;
        pendingMemberPhone = '';
        membershipRecheckStartedAt = 0;
        membershipCheckInFlight = false;
        if (options.closePopup && bandJoinWindow) {
            try {
                if (!bandJoinWindow.closed) bandJoinWindow.close();
            } catch (_) {}
            bandJoinWindow = null;
        }
    }

    function openBandJoinWindow() {
        stopMembershipRecheck({ closePopup: true });
        try {
            bandJoinWindow = window.open('', '_blank', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
            if (!bandJoinWindow) return null;
            bandJoinWindow.document.title = 'BAND 연결 중';
            bandJoinWindow.document.body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7f6;color:#202421;font:600 16px system-ui,sans-serif';
            bandJoinWindow.document.body.textContent = 'BAND 가입 여부를 확인하고 있어요…';
            bandJoinWindow.opener = null;
            return bandJoinWindow;
        } catch (_) {
            bandJoinWindow = null;
            return null;
        }
    }

    async function requestPhoneMembership(phone) {
        const response = await bandFetch(`${BAND_MEMBER_API}/verify`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const payload = await response.json().catch(() => ({}));
        bandTargetUrl = payload.targetBandUrl || bandTargetUrl;
        const joinLink = element('member-join-link');
        if (joinLink) joinLink.href = bandTargetUrl;
        if (!response.ok) throw new Error(payload.error || '가입 여부를 확인하지 못했어요.');
        return payload;
    }

    function completeMembershipAccess(payload, verifiedPhone) {
        const status = element('member-check-status');
        const phoneInput = element('member-phone');
        stopMembershipRecheck({ closePopup: true });
        bandAuthToken = payload.token || '';
        bandAuthUser = payload.user || { id: 'band_member', name: 'BAND 회원', isTargetMember: true };
        bandAuthPhoneMask = maskPhone(verifiedPhone) || bandAuthPhoneMask;
        if (bandAuthToken) {
            try {
                sessionStorage.setItem(MEMBERSHIP_STORAGE_KEY, bandAuthToken);
                if (bandAuthPhoneMask) sessionStorage.setItem(MEMBERSHIP_PHONE_STORAGE_KEY, bandAuthPhoneMask);
            } catch (_) {}
        }
        if (status) {
            status.hidden = false;
            status.textContent = 'BAND 회원 연동 완료! 자동으로 이어갈게요.';
            status.classList.remove('is-error');
            status.classList.add('is-success');
        }
        updateBandUi();
        const reveal = pendingResultReveal && Boolean(result);
        const startAfterCheck = pendingSurveyStart;
        pendingResultReveal = false;
        pendingSurveyStart = false;
        setTimeout(() => {
            const dialog = element('member-check-dialog');
            if (dialog) dialog.hidden = true;
            if (phoneInput) phoneInput.value = '';
            if (reveal) completeResultReveal();
            else if (startAfterCheck) startSurvey();
            else toast('BAND 회원 확인이 완료됐어요.');
        }, 250);
    }

    function scheduleMembershipRecheck() {
        if (!pendingMemberPhone || membershipRecheckTimer) return;
        const delay = document.visibilityState === 'visible' && document.hasFocus()
            ? MEMBERSHIP_RECHECK_VISIBLE_MS
            : MEMBERSHIP_RECHECK_HIDDEN_MS;
        membershipRecheckTimer = setTimeout(() => {
            membershipRecheckTimer = null;
            void recheckPendingMembership();
        }, delay);
    }

    async function recheckPendingMembership(options = {}) {
        if (!pendingMemberPhone || membershipCheckInFlight || hasDetailedAccess()) return;
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        if (Date.now() - membershipRecheckStartedAt > MEMBERSHIP_RECHECK_TIMEOUT_MS) {
            stopMembershipRecheck();
            if (status) {
                status.hidden = false;
                status.textContent = '가입 승인 확인 시간이 지났어요. 같은 번호로 다시 확인해주세요.';
                status.classList.add('is-error');
            }
            return;
        }
        if (options.visibleOnly && document.visibilityState !== 'visible') {
            scheduleMembershipRecheck();
            return;
        }
        membershipCheckInFlight = true;
        try {
            const payload = await requestPhoneMembership(pendingMemberPhone);
            if (payload.member) {
                const verifiedPhone = pendingMemberPhone;
                completeMembershipAccess(payload, verifiedPhone);
                return;
            }
            if (status) {
                status.hidden = false;
                status.textContent = 'BAND 가입·승인 후 이 화면으로 돌아오면 자동으로 이어져요.';
                status.classList.remove('is-success');
            }
            if (joinLink && !bandJoinWindow) joinLink.hidden = false;
        } catch (error) {
            if (status) {
                status.hidden = false;
                status.textContent = '가입 승인을 기다리고 있어요. 화면으로 돌아오면 다시 확인할게요.';
            }
        } finally {
            membershipCheckInFlight = false;
            if (pendingMemberPhone) scheduleMembershipRecheck();
        }
    }

    async function verifyMembershipPhone(event) {
        event.preventDefault();
        const phoneInput = element('member-phone');
        const submit = element('member-check-submit');
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        if (!phoneInput || !submit || !status || !joinLink) return;
        status.hidden = false;
        status.classList.remove('is-error', 'is-success');
        joinLink.hidden = true;
        if (!bandAuthConfigured) {
            status.textContent = '회원 명단 연결을 준비하고 있어요. 잠시 후 다시 시도해주세요.';
            status.classList.add('is-error');
            return;
        }
        const phoneDigits = String(phoneInput.value || '').replace(/\D/g, '');
        if (!/^010\d{8}$/.test(phoneDigits)) {
            status.textContent = '010으로 시작하는 휴대전화번호 11자리를 입력해주세요.';
            status.classList.add('is-error');
            return;
        }
        const bandPopup = openBandJoinWindow();
        submit.disabled = true;
        status.textContent = 'BAND 회원 명단을 확인하고 있어요…';
        try {
            const payload = await requestPhoneMembership(phoneDigits);
            if (!payload.member) {
                status.textContent = bandPopup
                    ? 'BAND 가입·승인 후 설문으로 돌아오면 자동으로 이어져요.'
                    : '아래 버튼에서 BAND 가입 후 돌아오면 자동으로 이어져요.';
                status.classList.remove('is-error', 'is-success');
                pendingMemberPhone = phoneDigits;
                membershipRecheckStartedAt = Date.now();
                if (bandPopup) {
                    try { bandPopup.location.replace(bandTargetUrl); }
                    catch (_) { joinLink.hidden = false; }
                } else {
                    joinLink.hidden = false;
                }
                scheduleMembershipRecheck();
                return;
            }
            completeMembershipAccess(payload, phoneDigits);
        } catch (error) {
            stopMembershipRecheck({ closePopup: true });
            status.textContent = error.message || '가입 여부를 확인하지 못했어요.';
            status.classList.add('is-error');
        } finally {
            submit.disabled = false;
        }
    }

    function formatMemberPhone(event) {
        const input = event.currentTarget;
        const digits = String(input.value || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length > 7) input.value = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        else if (digits.length > 3) input.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
        else input.value = digits;
    }

    function handleMemberJoinReturn() {
        if (!element('member-check-dialog')?.hidden) {
            const status = element('member-check-status');
            if (status) {
                status.hidden = false;
                status.textContent = '가입 후 명단에 반영되면 같은 번호로 다시 확인해주세요.';
            }
        }
    }

    function resultShareTitle() {
        return selectedMbti ? `평소 ${selectedMbti} → 크레 앞 ${result.code}` : `나의 크레 성향은 ${result.code}`;
    }

    function drawRoundedRect(context, x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + safeRadius, y);
        context.arcTo(x + width, y, x + width, y + height, safeRadius);
        context.arcTo(x + width, y + height, x, y + height, safeRadius);
        context.arcTo(x, y + height, x, y, safeRadius);
        context.arcTo(x, y, x + width, y, safeRadius);
        context.closePath();
    }

    function loadShareImage(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = source;
        });
    }

    function canvasBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('공유 이미지를 만들 수 없습니다.')), 'image/png', .96);
        });
    }

    async function createResultShareFile(layout = 'story') {
        if (!result) throw new Error('공유할 결과가 없습니다.');
        await document.fonts?.ready;
        const isStory = layout === 'story';
        const canvas = document.createElement('canvas');
        canvas.width = isStory ? 1080 : 1200;
        canvas.height = isStory ? 1920 : 630;
        const context = canvas.getContext('2d');
        const font = '"Pretendard Variable", Pretendard, sans-serif';

        context.fillStyle = '#f4f4f1';
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (isStory) {
            context.fillStyle = '#0e6539';
            context.font = `800 28px ${font}`;
            context.letterSpacing = '3px';
            context.fillText('CREWARTS', 80, 108);
            context.letterSpacing = '0px';

            context.fillStyle = '#202421';
            context.font = `850 58px ${font}`;
            context.fillText('크레와트 성향 테스트', 80, 190);
            context.fillStyle = '#6f746f';
            context.font = `700 28px ${font}`;
            context.fillText('나의 결과', 80, 316);
            context.fillStyle = '#202421';
            context.font = `900 190px ${font}`;
            context.fillText(result.code, 72, 500);
            context.fillStyle = '#6f746f';
            context.font = `700 34px ${font}`;
            context.fillText(result.typeName, 80, 565);

            result.axes.forEach((axisResult, index) => {
                const meta = Core.AXIS_META[axisResult.axis];
                const dominant = meta.letters[axisResult.dominant];
                const first = axisResult.axis[0];
                const second = axisResult.axis[1];
                const firstCount = Number(result.letters[first]) || 0;
                const secondCount = Number(result.letters[second]) || 0;
                const x = 70 + (index % 2) * 475;
                const y = 670 + Math.floor(index / 2) * 360;
                const width = 440;
                const height = 320;
                drawRoundedRect(context, x, y, width, height, 30);
                context.fillStyle = '#ffffff';
                context.fill();
                context.strokeStyle = '#dedfd9';
                context.lineWidth = 2;
                context.stroke();

                context.fillStyle = '#6f746f';
                context.font = `650 21px ${font}`;
                context.fillText(meta.title, x + 30, y + 48);
                context.fillStyle = '#202421';
                context.font = `800 27px ${font}`;
                context.fillText(`${axisResult.dominant} · ${dominant.short}`, x + 30, y + 88);
                context.fillStyle = '#0e6539';
                context.font = `800 22px ${font}`;
                context.textAlign = 'right';
                context.fillText(`${firstCount} : ${secondCount}`, x + width - 30, y + 48);
                context.textAlign = 'left';

                context.fillStyle = '#d9cdd0';
                drawRoundedRect(context, x + 30, y + 128, width - 60, 12, 6);
                context.fill();
                context.fillStyle = '#16814b';
                drawRoundedRect(context, x + 30, y + 128, (width - 60) * (firstCount / 5), 12, 6);
                context.fill();
                context.fillStyle = '#6f746f';
                context.font = `800 18px ${font}`;
                context.fillText(first, x + 30, y + 170);
                context.textAlign = 'right';
                context.fillText(second, x + width - 30, y + 170);
                context.textAlign = 'left';
                context.font = `600 20px ${font}`;
                const description = dominant.description.replace(/\.$/, '');
                const midpoint = Math.min(description.length, 24);
                context.fillText(description.slice(0, midpoint), x + 30, y + 224);
                if (description.length > midpoint) context.fillText(description.slice(midpoint), x + 30, y + 258);
            });

            context.fillStyle = '#6f746f';
            context.font = `650 22px ${font}`;
            context.fillText('creok.onrender.com/crewart-survey.html', 80, 1778);
            try {
                const bandIcon = await loadShareImage(new URL('assets/band-app-icon-official.png?v=20260801-logo-v2', document.baseURI).toString());
                context.drawImage(bandIcon, 80, 1810, 54, 54);
                context.fillStyle = '#202421';
                context.font = `750 23px ${font}`;
                context.fillText('크레와트 BAND', 152, 1846);
            } catch (_) {
                // The result image remains usable if the optional mark fails to load.
            }
        } else {
            context.fillStyle = '#0e6539';
            context.font = `800 24px ${font}`;
            context.fillText('CREWARTS', 62, 72);
            context.fillStyle = '#202421';
            context.font = `850 38px ${font}`;
            context.fillText('크레와트 성향 테스트', 62, 126);
            context.font = `900 116px ${font}`;
            context.fillText(result.code, 58, 274);
            context.fillStyle = '#6f746f';
            context.font = `700 27px ${font}`;
            context.fillText(result.typeName, 64, 322);

            result.axes.forEach((axisResult, index) => {
                const meta = Core.AXIS_META[axisResult.axis];
                const dominant = meta.letters[axisResult.dominant];
                const first = axisResult.axis[0];
                const second = axisResult.axis[1];
                const firstCount = Number(result.letters[first]) || 0;
                const x = 62 + index * 277;
                const y = 382;
                drawRoundedRect(context, x, y, 250, 170, 20);
                context.fillStyle = '#ffffff';
                context.fill();
                context.strokeStyle = '#dedfd9';
                context.lineWidth = 2;
                context.stroke();
                context.fillStyle = '#6f746f';
                context.font = `650 16px ${font}`;
                context.fillText(meta.title, x + 18, y + 32);
                context.fillStyle = '#202421';
                context.font = `800 20px ${font}`;
                context.fillText(`${axisResult.dominant} · ${dominant.short}`, x + 18, y + 62);
                context.fillStyle = '#d9cdd0';
                drawRoundedRect(context, x + 18, y + 92, 214, 9, 5);
                context.fill();
                context.fillStyle = '#16814b';
                drawRoundedRect(context, x + 18, y + 92, 214 * (firstCount / 5), 9, 5);
                context.fill();
                context.fillStyle = '#6f746f';
                context.font = `800 14px ${font}`;
                context.fillText(first, x + 18, y + 126);
                context.textAlign = 'right';
                context.fillText(second, x + 232, y + 126);
                context.textAlign = 'left';
            });
        }

        const blob = await canvasBlob(canvas);
        return new File([blob], `crewart-${result.code}-${isStory ? 'story' : 'share'}.png`, { type: 'image/png' });
    }

    async function uploadKakaoShareImage(file) {
        if (!window.Kakao?.Share?.uploadImage || typeof DataTransfer === 'undefined') return '';
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const response = await window.Kakao.Share.uploadImage({ file: transfer.files });
        return response?.infos?.original?.url || '';
    }

    function downloadShareFile(file) {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function shareResult() {
        const title = resultShareTitle();
        const text = `${title}\n${result.typeName}`;
        try {
            if (window.Kakao) {
                if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
                let imageUrl = new URL('assets/crewart-cave-mobile.webp', document.baseURI).toString();
                try {
                    imageUrl = await uploadKakaoShareImage(await createResultShareFile('feed')) || imageUrl;
                } catch (imageError) {
                    console.warn('[Crewart Kakao image]', imageError);
                }
                window.Kakao.Share.sendDefault({
                    objectType: 'feed',
                    content: {
                        title,
                        description: `${result.typeName} · 20개의 선택으로 확인한 나의 크레 성향`,
                        imageUrl,
                        link: { mobileWebUrl: SURVEY_URL, webUrl: SURVEY_URL }
                    },
                    buttons: [{ title: '나도 테스트하기', link: { mobileWebUrl: SURVEY_URL, webUrl: SURVEY_URL } }]
                });
                return;
            }
        } catch (error) {
            console.error('[Crewart Kakao share]', error);
        }
        if (navigator.share) {
            try {
                await navigator.share({ title: `${title} | 크레와트`, text, url: SURVEY_URL });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(`${text}\n${SURVEY_URL}`);
            toast('결과와 링크를 복사했어요.');
        } catch (_) {
            window.prompt('아래 내용을 복사해주세요.', `${text}\n${SURVEY_URL}`);
        }
    }

    async function shareToInstagram() {
        const title = resultShareTitle();
        const text = `${title}\n${result.typeName}`;
        try {
            const file = await createResultShareFile('story');
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: `${title} | 크레와트`, text });
                return;
            }
            downloadShareFile(file);
            try {
                await navigator.clipboard.writeText(SURVEY_URL);
            } catch (_) {
                // Saving the story image is the primary fallback.
            }
            toast('스토리 이미지를 저장했어요. 인스타그램에서 열어주세요.');
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('[Crewart Instagram share]', error);
        }
        if (navigator.share) {
            try {
                await navigator.share({ title: `${title} | 크레와트`, text, url: SURVEY_URL });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(`${text}\n${SURVEY_URL}`);
            toast('링크를 복사했어요. 인스타그램에서 공유해 주세요.');
        } catch (_) {
            window.prompt('인스타그램에 공유할 내용을 복사해주세요.', `${text}\n${SURVEY_URL}`);
        }
    }

    if (IS_LOCAL_QA) {
        window.CrewartShareQA = Object.freeze({ createResultShareFile });
    }

    function syncThemeColor() {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f4f4f1');
    }

    function bindEvents() {
        element('start-button').addEventListener('click', startSurvey);
        element('home-result-open')?.addEventListener('click', restoreLastResult);
        element('home-retest')?.addEventListener('click', startSurvey);
        element('auth-phone-edit')?.addEventListener('click', editMembershipAccess);
        element('auth-phone-clear')?.addEventListener('click', clearMembershipAccess);
        element('member-check-close')?.addEventListener('click', closeMemberCheck);
        element('member-check-form')?.addEventListener('submit', verifyMembershipPhone);
        element('member-phone')?.addEventListener('input', formatMemberPhone);
        element('member-join-link')?.addEventListener('click', handleMemberJoinReturn);
        element('member-check-dialog')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeMemberCheck();
        });
        element('question-back').addEventListener('click', previousQuestion);
        element('mbti-unknown').addEventListener('click', () => {
            selectedMbti = '';
            showResult(true);
        });
        element('show-result').addEventListener('click', () => showResult(false));
        element('band-float').addEventListener('click', handleBandEntry);
        element('persistent-band-button').addEventListener('click', handlePersistentBand);
        element('persistent-home-button').addEventListener('click', returnToIntro);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !element('member-check-dialog')?.hidden) closeMemberCheck();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') pauseTimer();
            else {
                resumeTimer();
                void recheckPendingMembership({ visibleOnly: true });
            }
        });
        window.addEventListener('pageshow', () => void recheckPendingMembership({ visibleOnly: true }));
        window.addEventListener('focus', () => void recheckPendingMembership({ visibleOnly: true }));
    }

    function initialize() {
        if (!Core || Core.QUESTIONS.length !== 20) {
            toast('테스트 데이터를 불러오지 못했어요.', true);
            return;
        }
        setupIntroVideo();
        bindEvents();
        renderHome();
        syncThemeColor();
        const start = element('start-button');
        start.disabled = true;
        start.querySelector('span').textContent = '문항 준비 중…';
        playWordmark();
        void loadConfig().finally(() => {
            start.disabled = false;
            start.querySelector('span').textContent = '테스트 시작하기';
        });
        if (!BAND_INTEGRATION_ENABLED) {
            bandAuthReady = false;
            updateBandUi();
        } else {
            void initBandMembership();
        }
    }

    initialize();
}());

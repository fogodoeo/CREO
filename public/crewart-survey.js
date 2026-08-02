(function () {
    'use strict';

    const Core = window.CrewartSurveyCore;
    const SURVEY_URL = new URL('crewart-survey.html', document.baseURI).toString();
    const DEFAULT_BAND_URL = 'https://www.band.us/band/101992972/post';
    const BAND_MEMBER_API = '/api/band-membership';
    const KAKAO_JS_KEY = 'db7ffc8d6b9b7601b792ed69be4658fc';
    const QUESTION_IMAGE_ROOT = 'assets/crewart-illustrations/';
    const TYPE_CHARACTER_ROOT = 'assets/crewart-types/';
    const TYPE_CHARACTER_VERSION = '20260802-character-v1';
    const MEMBERSHIP_STORAGE_KEY = 'crewart_band_member_access_v1';
    const MEMBERSHIP_PHONE_STORAGE_KEY = 'crewart_band_member_phone_mask_v1';
    const LAST_RESULT_STORAGE_KEY = 'crewart_last_result_v1';
    const LAST_RESULT_VERSION = 1;
    const MEMBERSHIP_RECHECK_VISIBLE_MS = 1000;
    const MEMBERSHIP_RECHECK_HIDDEN_MS = 10000;
    const MEMBERSHIP_RECHECK_TIMEOUT_MS = 15 * 60 * 1000;
    const CONTENT_CONFIG_KEY = 'crewart_mbti_content_v1';
    const BAND_INTEGRATION_ENABLED = true;
    const AXIS_REPORT_COPY = Object.freeze({
        EI: { title: '생각 정리', left: '함께 정리', right: '혼자 정리' },
        SN: { title: '관찰 초점', left: '현재 정보', right: '성장 가능성' },
        TF: { title: '선택 기준', left: '조건·근거', right: '취향·관계' },
        JP: { title: '사육 방식', left: '계획·준비', right: '유연·조정' }
    });
    const HOUSE_REPORT_COPY = Object.freeze({
        SF: '지금의 감각과 관계를 세심하게 챙기는 기숙사',
        ST: '확인되는 정보와 근거로 안정적으로 운영하는 기숙사',
        NT: '가능성을 논리적으로 설계하고 실험하는 기숙사',
        NF: '성장 가능성과 관계를 연결해 방향을 만드는 기숙사'
    });
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
    let resultSavedAt = '';
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
    let editingMembership = false;
    let pendingMemberPhone = '';
    let membershipRecheckTimer = null;
    let membershipRecheckStartedAt = 0;
    let membershipCheckInFlight = false;
    let showingStoredResult = false;
    let memberKeyboardTimer = null;

    function element(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function typeCharacterPath(code) {
        const normalized = String(code || '').toLowerCase();
        return `${TYPE_CHARACTER_ROOT}crewart-type-${normalized}.png?v=${TYPE_CHARACTER_VERSION}`;
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
        const savedAt = new Date().toISOString();
        resultSavedAt = savedAt;
        const snapshot = {
            version: LAST_RESULT_VERSION,
            questionVersion: Core.SURVEY_VERSION,
            savedAt,
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

    function renderHome() {
        const snapshot = loadLastResult();
        const card = element('home-result-card');
        const startCard = element('home-start-card');
        const intro = element('intro-screen');
        if (!card || !startCard) return;
        card.hidden = !snapshot;
        startCard.hidden = Boolean(snapshot);
        intro?.classList.toggle('has-result', Boolean(snapshot));
        if (!snapshot) return;
        const house = Core.HOUSE_META[snapshot.assignedHouseKey];
        element('home-result-code').textContent = snapshot.result.code;
        element('home-result-heading').textContent = snapshot.result.typeName;
        element('home-house-seal').textContent = house?.seal || snapshot.assignedHouseKey[0];
        element('home-house-name').textContent = house?.name || snapshot.assignedHouseKey;
        card.style.setProperty('--house-accent', house?.accent || '#fff');
    }

    function restoreLastResult(options = {}) {
        const snapshot = loadLastResult();
        if (!snapshot) {
            renderHome();
            renderEmptyResult();
            setScreen('result-screen');
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
        resultSavedAt = snapshot.savedAt || '';
        assignedHouseKey = Core.chooseTendencyHouse(result);
        timingStats = snapshot.timingStats;
        showingStoredResult = true;
        renderResult({ animate: Boolean(options.animate) });
        setScreen('result-screen');
    }

    function updateBandState() {
        const form = element('member-check-form');
        const verified = element('band-verified-state');
        const number = element('auth-phone-number');
        const connection = element('band-connection-status');
        const bandScreen = element('band-screen');
        const authenticated = Boolean(bandAuthUser?.isTargetMember);
        const state = authenticated && editingMembership
            ? 'editing'
            : authenticated
                ? 'connected'
                : pendingMemberPhone
                    ? 'pending'
                    : bandAuthReady
                        ? 'disconnected'
                        : 'loading';
        if (form) form.hidden = authenticated && !editingMembership;
        if (verified) verified.hidden = !authenticated || editingMembership;
        if (number) number.textContent = bandAuthPhoneMask || '확인된 회원';
        if (connection) connection.textContent = ({
            connected: '연결됨',
            editing: '번호 변경 중',
            pending: '가입 승인 확인 중',
            disconnected: '연결되지 않음',
            loading: '상태 확인 중'
        })[state];
        if (bandScreen) bandScreen.dataset.membershipState = state;
        const navStatus = element('band-nav-status');
        navStatus?.classList.toggle('is-verified', authenticated);
        navStatus?.classList.toggle('is-pending', state === 'pending');
        if (navStatus) navStatus.hidden = authenticated;
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
        if (screenId !== 'band-screen') {
            element('member-phone')?.blur();
            document.body.classList.remove('cw-keyboard-open');
            element('band-screen')?.classList.remove('is-keyboard-open');
        }
        ['intro-screen', 'question-screen', 'mbti-screen', 'result-screen', 'band-screen'].forEach(id => {
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
        syncThemeColor(screenId);
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function syncMemberKeyboardState(options = {}) {
        const input = element('member-phone');
        const screen = element('band-screen');
        const viewport = window.visualViewport;
        const viewportHeight = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight);
        const focused = Boolean(input && screen && !screen.hidden && document.activeElement === input);
        document.documentElement.style.setProperty('--cw-visual-viewport-height', `${viewportHeight}px`);
        document.body.classList.toggle('cw-keyboard-open', focused);
        screen?.classList.toggle('is-keyboard-open', focused);
        if (!focused || options.ensureVisible === false) return;
        if (memberKeyboardTimer) clearTimeout(memberKeyboardTimer);
        memberKeyboardTimer = setTimeout(() => {
            if (document.activeElement !== input || screen?.hidden) return;
            input.closest('.cw-member-form')?.scrollIntoView({
                block: 'center',
                behavior: options.immediate ? 'auto' : 'smooth'
            });
        }, options.immediate ? 20 : 90);
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
        resultSavedAt = '';
        timingStats = null;
        showingStoredResult = false;
        advancing = false;
        lastSavedSignature = '';
        setScreen('question-screen');
        renderQuestion();
    }

    function openMemberCheck(options = {}) {
        pendingResultReveal = Boolean(options.revealResult);
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        const submit = element('member-check-submit');
        const submitLabel = element('member-check-submit-label');
        if (status && !pendingMemberPhone) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-success', 'is-action');
        }
        if (joinLink) {
            joinLink.hidden = false;
            joinLink.classList.remove('is-recommended');
        }
        if (submit) {
            submit.disabled = false;
            submit.classList.remove('is-recheck');
        }
        if (submitLabel) submitLabel.textContent = '확인하기';
        if (!hasDetailedAccess()) editingMembership = false;
        updateBandState();
        setScreen('band-screen');
        if (!hasDetailedAccess() || editingMembership) {
            requestAnimationFrame(() => {
                const input = element('member-phone');
                if (!input) return;
                try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
                syncMemberKeyboardState({ immediate: true });
            });
        }
    }

    function editMembershipAccess() {
        if (!hasDetailedAccess()) return;
        editingMembership = true;
        const status = element('member-check-status');
        if (status) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-success', 'is-action');
        }
        updateBandState();
        requestAnimationFrame(() => {
            const input = element('member-phone');
            if (!input) return;
            try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
            syncMemberKeyboardState({ immediate: true });
        });
    }

    function clearMembershipAccess() {
        if (!hasDetailedAccess()) return;
        if (!window.confirm('이 기기의 BAND 회원 확인을 해제할까요?')) return;
        stopMembershipRecheck();
        bandAuthToken = '';
        bandAuthUser = null;
        bandAuthPhoneMask = '';
        editingMembership = false;
        try {
            sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
            sessionStorage.removeItem(MEMBERSHIP_PHONE_STORAGE_KEY);
        } catch (_) {}
        updateBandUi();
        toast('회원 확인을 해제했어요.');
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
        renderResult({ animate: true });
        setScreen('result-screen');
        void submitSurvey();
    }

    function formatSeconds(milliseconds) {
        return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}초`;
    }

    function hasDetailedAccess() {
        return IS_LOCAL_QA || Boolean(bandAuthUser && bandAuthUser.isTargetMember === true);
    }

    function openBandTarget() {
        if (!BAND_INTEGRATION_ENABLED) return false;
        window.open(bandTargetUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    function reportIdentity() {
        const source = new Date(resultSavedAt || sessionCreatedAt || Date.now());
        const date = Number.isNaN(source.getTime()) ? new Date() : source;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const compactDate = `${year}${month}${day}`;
        const seed = `${date.getTime()}-${result?.code || ''}-${assignedHouseKey}`;
        let hash = 2166136261;
        for (const character of seed) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        const suffix = (hash >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(-4);
        return {
            id: `CW-${compactDate.slice(2)}-${suffix}`,
            date: `${year}.${month}.${day}`
        };
    }

    function renderReportSectionHead(index, english, korean, controls) {
        return `
            <header class="cw-report-section-head">
                <button class="cw-report-section-toggle" type="button" data-report-toggle aria-expanded="false" aria-controls="${escapeHtml(controls)}">
                    <span>${escapeHtml(index)}</span>
                    <span><small>${escapeHtml(english)}</small><strong>${escapeHtml(korean)}</strong></span>
                    <i aria-hidden="true">＋</i>
                </button>
            </header>`;
    }

    function axisStrength(axisResult) {
        const first = axisResult.axis[0];
        const second = axisResult.axis[1];
        const difference = Math.abs((Number(result.letters[first]) || 0) - (Number(result.letters[second]) || 0));
        if (difference >= 5) return '매우 뚜렷';
        if (difference >= 3) return '비교적 뚜렷';
        return '균형에 가까움';
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
                ${renderReportSectionHead('02', 'RESPONSE PACE', '선택 속도', 'speed-report-detail')}
                <header class="cw-speed-head">
                    <strong data-measure-speed data-final-text="문항당 ${escapeHtml(median)}">문항당 ${escapeHtml(median)}</strong>
                    <span>${escapeHtml(comparison)}</span>
                </header>
                <div class="cw-position-scale cw-speed-scale" aria-label="빠름에서 신중함 사이 ${Math.round(position)}% 위치">
                    <span class="cw-scale-marker" data-final-position="${position}" style="--position:${position}%" aria-hidden="true"></span>
                    <div class="cw-scale-line"><i aria-hidden="true"></i></div>
                    <div class="cw-scale-labels"><span>빠름</span><span>평균</span><span>신중</span></div>
                </div>
                <div class="cw-report-disclosure cw-speed-disclosure" id="speed-report-detail" hidden>
                    <header><strong>${escapeHtml(timingStats.style.label)}</strong><span>유효 선택 ${escapeHtml(timingStats.validCount)}개</span></header>
                    <p>${escapeHtml(timingStats.style.copy)}</p>
                    <dl>
                        <div><dt>문항당 선택</dt><dd>${escapeHtml(median)}</dd></div>
                        <div><dt>측정된 전체 시간</dt><dd>${escapeHtml(formatSeconds(timingStats.totalMs))}</dd></div>
                    </dl>
                </div>
            </section>`;
    }

    function renderMemberDetail() {
        const axisCards = result.axes.map(axisResult => {
            const copy = AXIS_REPORT_COPY[axisResult.axis];
            const first = axisResult.axis[0];
            const second = axisResult.axis[1];
            const secondCount = Number(result.letters[second]) || 0;
            const position = Math.max(0, Math.min(100, (secondCount / 5) * 100));
            const firstSelected = axisResult.dominant === first;
            return `
                <article class="cw-axis-detail" data-axis-result data-final-pole="${firstSelected ? 'left' : 'right'}">
                    <header><h3>${escapeHtml(copy.title)}</h3></header>
                    <div class="cw-axis-poles">
                        <div class="cw-axis-pole is-left${firstSelected ? ' is-selected' : ''}" data-pole="left"><strong>${escapeHtml(first)}</strong><span>${escapeHtml(copy.left)}</span></div>
                        <div class="cw-axis-pole is-right${firstSelected ? '' : ' is-selected'}" data-pole="right"><strong>${escapeHtml(second)}</strong><span>${escapeHtml(copy.right)}</span></div>
                    </div>
                    <div class="cw-position-scale cw-axis-scale" aria-label="${escapeHtml(copy.title)}: ${escapeHtml(first)} ${escapeHtml(copy.left)}, ${escapeHtml(second)} ${escapeHtml(copy.right)} 중 ${escapeHtml(axisResult.dominant)} 쪽">
                        <span class="cw-scale-marker" data-final-position="${position}" style="--position:${position}%" aria-hidden="true"></span>
                        <div class="cw-scale-line"><i aria-hidden="true"></i></div>
                    </div>
                </article>`;
        }).join('');
        const axisInsights = result.axes.map(axisResult => {
            const meta = Core.AXIS_META[axisResult.axis];
            const dominant = meta.letters[axisResult.dominant];
            return `
                <article class="cw-axis-insight">
                    <header><strong>${escapeHtml(axisResult.dominant)} · ${escapeHtml(dominant.short)}</strong><span>${escapeHtml(axisStrength(axisResult))}</span></header>
                    <p>${escapeHtml(dominant.description)}</p>
                </article>`;
        }).join('');
        return `
            <section class="cw-result-section cw-member-detail">
                ${renderReportSectionHead('01', 'TRAIT AXES', '성향 지표', 'axes-report-detail')}
                <div class="cw-axis-detail-list">${axisCards}</div>
                <div class="cw-report-disclosure cw-axis-insights" id="axes-report-detail" hidden>${axisInsights}</div>
            </section>`;
    }

    function renderHouseCard() {
        const house = Core.HOUSE_META[assignedHouseKey];
        const snAxis = result.axes.find(axisResult => axisResult.axis === 'SN');
        const tfAxis = result.axes.find(axisResult => axisResult.axis === 'TF');
        const snCopy = snAxis?.dominant === 'S' ? AXIS_REPORT_COPY.SN.left : AXIS_REPORT_COPY.SN.right;
        const tfCopy = tfAxis?.dominant === 'T' ? AXIS_REPORT_COPY.TF.left : AXIS_REPORT_COPY.TF.right;
        return `
            <section class="cw-report-house" style="--house-accent:${escapeHtml(house.accent)}">
                ${renderReportSectionHead('03', 'HOUSE ASSIGNMENT', '기숙사', 'house-report-detail')}
                <div class="cw-house-assignment">
                    <b aria-hidden="true">${escapeHtml(house.seal)}</b>
                    <div><small>ASSIGNED HOUSE</small><strong aria-label="${escapeHtml(house.name)}"><span data-measure-house data-final-text="${escapeHtml(house.name)}">${escapeHtml(house.name)}</span></strong></div>
                </div>
                <div class="cw-report-disclosure cw-house-disclosure" id="house-report-detail" hidden>
                    <strong>${escapeHtml(HOUSE_REPORT_COPY[assignedHouseKey] || '')}</strong>
                    <p>관찰 초점과 선택 기준의 조합을 반영해 배정했어요.</p>
                    <dl>
                        <div><dt>관찰 초점</dt><dd>${escapeHtml(snAxis?.dominant || '')} · ${escapeHtml(snCopy)}</dd></div>
                        <div><dt>선택 기준</dt><dd>${escapeHtml(tfAxis?.dominant || '')} · ${escapeHtml(tfCopy)}</dd></div>
                    </dl>
                </div>
            </section>`;
    }

    function renderLockedDetail() {
        const configured = BAND_INTEGRATION_ENABLED && bandAuthConfigured;
        const label = configured ? '회원 확인' : '확인 준비 중';
        const status = configured ? '확인 후 상세 결과가 열려요' : '회원 명단 연결을 준비하고 있어요';
        return `
            <section class="cw-detail-gate">
                <div class="cw-detail-preview" aria-hidden="true" inert>${renderMemberDetail()}${renderSpeedCard()}${renderHouseCard()}</div>
                <div class="cw-detail-shade" aria-hidden="true"></div>
                <div class="cw-detail-unlock">
                    <small>MEMBER ACCESS</small>
                    <h2>상세 결과 잠김</h2>
                    <button class="cw-band-cta" type="button" data-action="unlock-detail" ${configured ? '' : 'disabled'}><span>${escapeHtml(label)}</span><b aria-hidden="true">→</b></button>
                    <small class="cw-lock-status">${escapeHtml(status)}</small>
                </div>
            </section>`;
    }

    function playResultMeasurementAnimation(container) {
        if (!container) return;
        const characterReveal = container.querySelector('[data-character-reveal]');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            characterReveal?.classList.remove('is-pending', 'is-resolving');
            characterReveal?.classList.add('is-revealed');
            return;
        }
        const codeSlots = [...container.querySelectorAll('[data-code-slot]')];
        const name = container.querySelector('[data-final-name]');
        const relation = container.querySelector('.cw-type-relation');
        const axisCards = [...container.querySelectorAll('[data-axis-result]')];
        const speedValues = [...container.querySelectorAll('[data-measure-speed]')];
        const houseNames = [...container.querySelectorAll('[data-measure-house]')];
        const letterPairs = [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']];
        const slotDelays = [0, 70, 145, 225];
        const settleDurations = [560, 730, 900, 1070];
        const tickDelays = [43, 55, 67, 79];

        container.classList.add('is-measuring');
        name?.classList.add('is-measure-pending');
        relation?.classList.add('is-measure-pending');
        axisCards.forEach(card => {
            card.classList.add('is-cycling');
            card.querySelectorAll('[data-pole]').forEach(pole => pole.classList.remove('is-selected'));
        });
        speedValues.forEach(node => {
            node.textContent = '측정 중…';
            node.classList.add('is-measure-pending');
        });

        codeSlots.forEach((slot, index) => {
            let tick = 0;
            setTimeout(() => {
                const startedAt = performance.now();
                slot.classList.add('is-cycling');
                const axisCard = axisCards[index];
                const axisPoles = [...(axisCard?.querySelectorAll('[data-pole]') || [])];
                const cycleSlot = () => {
                    if (!container.isConnected) return;
                    if (performance.now() - startedAt >= settleDurations[index]) {
                        slot.textContent = slot.dataset.finalLetter;
                        slot.classList.remove('is-cycling');
                        slot.classList.add('is-settled');
                        axisPoles.forEach(pole => pole.classList.toggle('is-selected', pole.dataset.pole === axisCard?.dataset.finalPole));
                        axisCard?.classList.remove('is-cycling');
                        axisCard?.classList.add('is-settled');
                        return;
                    }
                    const candidate = tick % 2;
                    slot.textContent = letterPairs[index][candidate];
                    axisPoles.forEach((pole, poleIndex) => pole.classList.toggle('is-selected', poleIndex === candidate));
                    tick += 1;
                    setTimeout(cycleSlot, tickDelays[index]);
                };
                cycleSlot();
            }, slotDelays[index]);
        });

        const markers = [...container.querySelectorAll('.cw-scale-marker[data-final-position]')];
        markers.forEach((marker, index) => {
            const finalPosition = Math.max(0, Math.min(100, Number(marker.dataset.finalPosition) || 0));
            if (typeof marker.animate !== 'function') return;
            const animation = marker.animate([
                { left: '50%' },
                { left: `${finalPosition}%` }
            ], {
                duration: 650 + index * 70,
                delay: 170 + index * 85,
                easing: 'cubic-bezier(.18,.78,.22,1)',
                fill: 'both'
            });
            animation.finished.then(() => {
                animation.cancel();
                marker.classList.add('is-settled');
            }).catch(() => {});
        });

        const houseOrder = Core.HOUSE_KEYS.map(key => Core.HOUSE_META[key]?.name).filter(Boolean);
        houseNames.forEach((node, nodeIndex) => {
            let step = nodeIndex;
            const rollHouse = () => {
                if (!container.isConnected) return;
                if (step >= 12 + nodeIndex) {
                    node.textContent = node.dataset.finalText;
                    node.classList.remove('is-house-rolling');
                    node.classList.add('is-settled');
                    return;
                }
                node.textContent = houseOrder[step % houseOrder.length];
                node.classList.remove('is-house-rolling');
                void node.offsetWidth;
                node.classList.add('is-house-rolling');
                step += 1;
                setTimeout(rollHouse, 92 + step * 5);
            };
            setTimeout(rollHouse, 180 + nodeIndex * 40);
        });

        setTimeout(() => {
            if (!container.isConnected) return;
            [name, relation].filter(Boolean).forEach(node => {
                node.classList.remove('is-measure-pending');
                node.classList.add('is-measure-revealed');
            });
        }, 1380);
        setTimeout(() => {
            if (!container.isConnected) return;
            speedValues.forEach(node => {
                node.textContent = node.dataset.finalText;
                node.classList.remove('is-measure-pending');
                node.classList.add('is-measure-revealed');
            });
        }, 1480);
        setTimeout(() => {
            if (!container.isConnected) return;
            characterReveal?.classList.add('is-resolving');
        }, 1050);
        setTimeout(() => {
            if (!container.isConnected) return;
            characterReveal?.classList.remove('is-pending', 'is-resolving');
            characterReveal?.classList.add('is-revealed');
        }, 1460);
        setTimeout(() => {
            if (container.isConnected) container.classList.remove('is-measuring');
        }, 2200);
    }

    function toggleReportDisclosure(event) {
        const button = event.currentTarget;
        const panel = element(button.getAttribute('aria-controls'));
        if (!panel) return;
        const opening = panel.hidden;
        panel.hidden = !opening;
        button.setAttribute('aria-expanded', String(opening));
        const icon = button.querySelector('i');
        if (icon) icon.textContent = opening ? '−' : '＋';
        button.closest('.cw-result-section, .cw-report-house')?.classList.toggle('is-expanded', opening);
    }

    function renderResult(options = {}) {
        const report = reportIdentity();
        const detail = BAND_INTEGRATION_ENABLED && hasDetailedAccess()
            ? `${renderMemberDetail()}${renderSpeedCard()}${renderHouseCard()}`
            : renderLockedDetail();
        const bandShare = BAND_INTEGRATION_ENABLED
            ? `<button class="cw-share-icon is-band" type="button" data-action="band-result" aria-label="크레와트 BAND 열기"><img src="assets/band-app-icon-official.png?v=20260801-logo-v2" width="28" height="28" alt=""></button>`
            : '';
        const resultCodeLetters = [...result.code];
        const renderResultCodeSlots = (letters, startIndex) => letters
            .map((letter, index) => `<span data-code-slot="${startIndex + index}" data-final-letter="${escapeHtml(letter)}">${escapeHtml(letter)}</span>`)
            .join('');
        const resultCodeBackSlots = renderResultCodeSlots(resultCodeLetters.slice(0, 2), 0);
        const resultCodeFrontSlots = renderResultCodeSlots(resultCodeLetters.slice(2), 2);
        const characterState = options.animate ? 'is-pending' : 'is-revealed';
        const characterPath = typeCharacterPath(result.code);
        element('result-content').innerHTML = `
            <div class="cw-result-wrap">
                <article class="cw-result-report">
                    <header class="cw-report-head" aria-label="크레와트 성향 보고서 명세">
                        <div class="cw-report-brand"><strong>CREWARTS</strong><span>PERSONALITY REPORT</span></div>
                        <dl class="cw-report-meta">
                            <div><dt>ID</dt><dd>${escapeHtml(report.id)}</dd></div>
                            <div><dt>DATE</dt><dd>${escapeHtml(report.date)}</dd></div>
                            <div><dt>FORMAT</dt><dd>20 ITEMS</dd></div>
                        </dl>
                    </header>
                    <section class="cw-result-identity">
                        <div class="cw-type-poster" data-final-code="${escapeHtml(result.code)}">
                            <span class="cw-visually-hidden">${escapeHtml(result.code)}</span>
                            <strong class="cw-result-code cw-result-code-back" aria-hidden="true">${resultCodeBackSlots}</strong>
                            <figure class="cw-character-reveal ${characterState}" data-character-reveal>
                                <div class="cw-character-placeholder" aria-hidden="true"><span>?</span><small>TYPE CHARACTER</small></div>
                                <img src="${escapeHtml(characterPath)}" width="360" height="520" alt="${escapeHtml(`${result.code} ${result.typeName} 아기 크레 캐릭터`)}" loading="eager" decoding="async">
                            </figure>
                            <strong class="cw-result-code cw-result-code-front" aria-hidden="true">${resultCodeFrontSlots}</strong>
                        </div>
                        <h1 class="cw-result-type-name" data-final-name="${escapeHtml(result.typeName)}">${escapeHtml(result.typeName)}</h1>
                    </section>
                    ${detail}
                    <footer class="cw-report-footer">
                        <p>성향을 이해하기 위한 참고 결과입니다.</p>
                        <section class="cw-share-section">
                            <button class="cw-share-toggle" type="button" data-action="share-menu" aria-expanded="false">결과 공유 <span aria-hidden="true">＋</span></button>
                            <div class="cw-share-tools" aria-label="결과 공유" hidden>
                            <button class="cw-share-icon is-kakao" type="button" data-action="share" aria-label="카카오톡으로 공유">
                                <img src="assets/kakaolink_btn_medium.png" width="24" height="24" alt="">
                            </button>
                            <button class="cw-share-icon is-instagram" type="button" data-action="instagram" aria-label="인스타그램 스토리로 공유">
                                <img src="assets/instagram-glyph-official.svg" width="24" height="24" alt="">
                            </button>
                            ${bandShare}
                            </div>
                        </section>
                    </footer>
                </article>
            </div>`;
        element('result-content').querySelector('[data-action="unlock-detail"]')?.addEventListener('click', handleUnlockDetail);
        element('result-content').querySelector('[data-action="open-band"]')?.addEventListener('click', openBandTarget);
        element('result-content').querySelector('[data-action="share"]')?.addEventListener('click', shareResult);
        element('result-content').querySelector('[data-action="instagram"]')?.addEventListener('click', shareToInstagram);
        element('result-content').querySelector('[data-action="band-result"]')?.addEventListener('click', handleResultBand);
        element('result-content').querySelectorAll('[data-report-toggle]').forEach(button => {
            button.addEventListener('click', toggleReportDisclosure);
        });
        element('result-content').querySelector('[data-action="share-menu"]')?.addEventListener('click', event => {
            const button = event.currentTarget;
            const tools = button.nextElementSibling;
            const opening = Boolean(tools?.hidden);
            if (tools) tools.hidden = !opening;
            button.setAttribute('aria-expanded', String(opening));
            button.querySelector('span').textContent = opening ? '−' : '＋';
        });
        if (options.animate) playResultMeasurementAnimation(element('result-content').querySelector('.cw-result-wrap'));
    }

    function renderEmptyResult() {
        element('result-content').innerHTML = `
            <section class="cw-result-empty">
                <p>CREWARTS PERSONALITY TEST</p>
                <h1>아직 결과가 없어요</h1>
                <button class="cw-primary-button" type="button" data-action="start-empty">검사 시작</button>
            </section>`;
        element('result-content').querySelector('[data-action="start-empty"]')?.addEventListener('click', startSurvey);
    }

    function handleResultBand() {
        if (!BAND_INTEGRATION_ENABLED) return;
        openBandTarget();
    }

    function handleUnlockDetail() {
        if (!BAND_INTEGRATION_ENABLED) {
            toast('BAND 회원 확인은 현재 준비 중이에요.');
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
        if (!element('band-screen').hidden) return 'band';
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
        document.querySelectorAll('[data-band-join]').forEach(link => { link.href = bandTargetUrl; });
        updateBandState();
        updatePersistentActions();
        if (result && !element('result-screen').hidden) renderResult();
    }

    function updatePersistentActions() {
        const nav = element('app-nav');
        const home = element('persistent-home-button');
        const stage = currentStage();
        const focused = stage === 'questions' || stage === 'mbti';
        if (home) home.hidden = !focused;
        if (nav) nav.hidden = focused;
        const activeTab = stage === 'intro' ? 'home' : stage;
        document.querySelectorAll('[data-nav]').forEach(button => {
            const active = button.dataset.nav === activeTab;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    function navigateToTab(tab) {
        if (tab === 'home') {
            returnToIntro();
            return;
        }
        if (tab === 'result') {
            if (result) {
                renderResult({ animate: true });
                setScreen('result-screen');
            } else restoreLastResult({ animate: true });
            return;
        }
        if (tab === 'band') openMemberCheck();
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

    function stopMembershipRecheck() {
        if (membershipRecheckTimer) clearTimeout(membershipRecheckTimer);
        membershipRecheckTimer = null;
        pendingMemberPhone = '';
        membershipRecheckStartedAt = 0;
        membershipCheckInFlight = false;
    }

    async function requestPhoneMembership(phone) {
        const response = await bandFetch(`${BAND_MEMBER_API}/verify`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const payload = await response.json().catch(() => ({}));
        bandTargetUrl = payload.targetBandUrl || bandTargetUrl;
        document.querySelectorAll('[data-band-join]').forEach(link => { link.href = bandTargetUrl; });
        if (!response.ok) throw new Error(payload.error || '가입 여부를 확인하지 못했어요.');
        return payload;
    }

    function completeMembershipAccess(payload, verifiedPhone) {
        const status = element('member-check-status');
        const phoneInput = element('member-phone');
        stopMembershipRecheck();
        bandAuthToken = payload.token || '';
        bandAuthUser = payload.user || { id: 'band_member', name: 'BAND 회원', isTargetMember: true };
        bandAuthPhoneMask = maskPhone(verifiedPhone) || bandAuthPhoneMask;
        editingMembership = false;
        if (bandAuthToken) {
            try {
                sessionStorage.setItem(MEMBERSHIP_STORAGE_KEY, bandAuthToken);
                if (bandAuthPhoneMask) sessionStorage.setItem(MEMBERSHIP_PHONE_STORAGE_KEY, bandAuthPhoneMask);
            } catch (_) {}
        }
        if (status) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-action', 'is-success');
        }
        updateBandUi();
        const reveal = pendingResultReveal && Boolean(result);
        pendingResultReveal = false;
        setTimeout(() => {
            if (phoneInput) phoneInput.value = '';
            if (reveal) completeResultReveal();
            else toast('회원 확인이 완료됐어요.');
        }, 350);
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
        if (!pendingMemberPhone || membershipCheckInFlight || (hasDetailedAccess() && !editingMembership)) return;
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        if (Date.now() - membershipRecheckStartedAt > MEMBERSHIP_RECHECK_TIMEOUT_MS) {
            stopMembershipRecheck();
            updateBandState();
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
                status.textContent = '아직 가입 확인이 안 됐어요.';
                status.classList.remove('is-error', 'is-success');
                status.classList.add('is-action');
            }
            if (joinLink) joinLink.hidden = false;
            if (joinLink) joinLink.classList.add('is-recommended');
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
        const submitLabel = element('member-check-submit-label');
        if (!phoneInput || !submit || !submitLabel || !status || !joinLink) return;
        status.hidden = false;
        status.classList.remove('is-error', 'is-success', 'is-action');
        joinLink.hidden = false;
        joinLink.classList.remove('is-recommended');
        submit.classList.remove('is-recheck');
        if (!bandAuthConfigured) {
            status.textContent = '회원 명단 연결을 준비하고 있어요. 잠시 후 다시 시도해주세요.';
            status.classList.add('is-error');
            submitLabel.textContent = '다시 시도';
            submit.classList.add('is-recheck');
            return;
        }
        const phoneDigits = String(phoneInput.value || '').replace(/\D/g, '');
        if (!/^010\d{8}$/.test(phoneDigits)) {
            status.textContent = '010으로 시작하는 휴대전화번호 11자리를 입력해주세요.';
            status.classList.add('is-error');
            return;
        }
        stopMembershipRecheck();
        submit.disabled = true;
        submitLabel.textContent = '확인 중…';
        status.textContent = '회원 명단을 확인하고 있어요…';
        phoneInput.blur();
        syncMemberKeyboardState({ ensureVisible: false });
        try {
            const payload = await requestPhoneMembership(phoneDigits);
            if (!payload.member) {
                status.textContent = '아직 가입 확인이 안 됐어요.';
                status.classList.remove('is-error', 'is-success');
                status.classList.add('is-action');
                pendingMemberPhone = phoneDigits;
                membershipRecheckStartedAt = Date.now();
                updateBandState();
                joinLink.hidden = false;
                joinLink.classList.add('is-recommended');
                submitLabel.textContent = '다시 확인';
                submit.classList.add('is-recheck');
                scheduleMembershipRecheck();
                return;
            }
            completeMembershipAccess(payload, phoneDigits);
        } catch (error) {
            stopMembershipRecheck();
            updateBandState();
            status.textContent = error.message || '가입 여부를 확인하지 못했어요.';
            status.classList.add('is-error');
            submitLabel.textContent = '다시 확인';
            submit.classList.add('is-recheck');
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
        if (currentStage() === 'band') {
            const status = element('member-check-status');
            if (status) {
                status.hidden = false;
                status.textContent = pendingMemberPhone
                    ? '가입 승인 후 돌아오면 자동으로 다시 확인해요.'
                    : '가입 후 이 화면에서 회원 확인을 진행해주세요.';
                status.classList.remove('is-error', 'is-success');
                status.classList.add('is-action');
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
                        buttons: [{ title: '나도 검사하기', link: { mobileWebUrl: SURVEY_URL, webUrl: SURVEY_URL } }]
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

    function syncThemeColor(screenId) {
        const color = screenId === 'intro-screen' ? '#111712' : '#f4f4f1';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    }

    function bindEvents() {
        element('start-button').addEventListener('click', startSurvey);
        element('home-retest')?.addEventListener('click', startSurvey);
        element('auth-phone-edit')?.addEventListener('click', editMembershipAccess);
        element('auth-phone-clear')?.addEventListener('click', clearMembershipAccess);
        element('member-check-form')?.addEventListener('submit', verifyMembershipPhone);
        element('member-phone')?.addEventListener('input', formatMemberPhone);
        element('member-phone')?.addEventListener('focus', () => syncMemberKeyboardState());
        element('member-phone')?.addEventListener('blur', () => {
            setTimeout(() => syncMemberKeyboardState({ ensureVisible: false }), 80);
        });
        element('member-join-link')?.addEventListener('click', handleMemberJoinReturn);
        element('question-back').addEventListener('click', previousQuestion);
        element('mbti-unknown').addEventListener('click', () => {
            selectedMbti = '';
            showResult(true);
        });
        element('show-result').addEventListener('click', () => showResult(false));
        element('persistent-home-button').addEventListener('click', returnToIntro);
        document.querySelectorAll('[data-nav]').forEach(button => {
            button.addEventListener('click', () => navigateToTab(button.dataset.nav));
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
        window.visualViewport?.addEventListener('resize', () => syncMemberKeyboardState());
        window.visualViewport?.addEventListener('scroll', () => syncMemberKeyboardState({ ensureVisible: false }));
        window.addEventListener('resize', () => syncMemberKeyboardState({ ensureVisible: false }));
    }

    function initialize() {
        if (!Core || Core.QUESTIONS.length !== 20) {
            toast('테스트 데이터를 불러오지 못했어요.', true);
            return;
        }
        setupIntroVideo();
        bindEvents();
        renderHome();
        updatePersistentActions();
        syncThemeColor('intro-screen');
        const start = element('start-button');
        start.disabled = true;
        start.querySelector('span').textContent = '문항 준비 중…';
        playWordmark();
        void loadConfig().finally(() => {
            start.disabled = false;
            start.querySelector('span').textContent = '검사 시작';
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

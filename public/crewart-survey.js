(function () {
    'use strict';

    const Core = window.CrewartSurveyCore;
    const SURVEY_URL = new URL('crewart-survey.html', document.baseURI).toString();
    const DEFAULT_BAND_URL = 'https://www.band.us/band/101992972/post';
    const BAND_MEMBER_API = '/api/band-membership';
    const KAKAO_JS_KEY = 'db7ffc8d6b9b7601b792ed69be4658fc';
    const QUESTION_IMAGE_ROOT = 'assets/crewart-illustrations/';
    const MEMBERSHIP_STORAGE_KEY = 'crewart_band_member_access_v1';
    const CONTENT_CONFIG_KEY = 'crewart_mbti_content_v1';
    const BAND_INTEGRATION_ENABLED = true;
    const IS_LOCAL_QA = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const IS_QA_MODE = IS_LOCAL_QA;

    let config = {};
    let cohortResponses = [];
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
    let bandTargetUrl = DEFAULT_BAND_URL;
    let pendingResultReveal = false;
    let pendingSurveyStart = false;

    function element(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
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
                ? document.fonts.load('900 72px "Cinzel Decorative"').catch(() => [])
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
        let hash = 2166136261;
        source.forEach(byte => {
            hash ^= byte;
            hash = Math.imul(hash, 16777619);
        });
        return `legacy-${(hash >>> 0).toString(16)}`;
    }

    function parseCohortResponses(raw) {
        let parsed = [];
        try {
            parsed = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch (_) {
            parsed = [];
        }
        const deduped = new Map();
        parsed.forEach((response, index) => {
            if (!response || response.questionVersion !== Core.SURVEY_VERSION) return;
            const key = response.surveySessionId || response.participantKey || `response-${index}`;
            const previous = deduped.get(key);
            if (!previous || String(previous.syncedAt || previous.createdAt || '') <= String(response.syncedAt || response.createdAt || '')) {
                deduped.set(key, response);
            }
        });
        return Array.from(deduped.values());
    }

    function applyManagedContent(raw) {
        if (!raw || questions.length) return;
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
            config = await getConfigMap() || {};
            applyManagedContent(config[CONTENT_CONFIG_KEY]);
            cohortResponses = parseCohortResponses(config.crewart_survey_responses);
        } catch (error) {
            console.error('[Crewart config]', error);
            config = {};
            cohortResponses = [];
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
        pendingResultReveal = false;
        pendingSurveyStart = false;
    }

    function returnToIntro() {
        if (currentStage() !== 'intro' && !window.confirm('처음부터 다시 할까요?\n\n현재 테스트 진행 내용은 초기화되지만 BAND 회원 확인 상태는 유지됩니다.')) return;
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
        advancing = false;
        lastSavedSignature = '';
        element('result-content').replaceChildren();
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
                <span>${escapeHtml(option)}</span>
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
        if (!assignedHouseKey) assignedHouseKey = Core.chooseBalancedHouse(result, currentHouseCounts(), surveySessionId);
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

    function currentHouseCounts() {
        const counts = Object.fromEntries(Core.HOUSE_KEYS.map(key => [key, 0]));
        cohortResponses.forEach(response => {
            const key = response.assignedHouseKey || response.houseId;
            if (key in counts) counts[key] += 1;
        });
        return counts;
    }

    function showResult(skipMbti) {
        if (!result) return;
        if (!selectedMbti && !skipMbti) {
            toast('평소 MBTI를 고르거나 잘 모르겠어요를 눌러주세요.', true);
            return;
        }
        if (!hasDetailedAccess()) {
            openMemberCheck({ revealResult: true });
            return;
        }
        completeResultReveal();
    }

    function completeResultReveal() {
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

    function speedSamples() {
        return cohortResponses.map(response => Number(response?.timingStats?.medianMs)).filter(Boolean);
    }

    function hasDetailedAccess() {
        return IS_LOCAL_QA || Boolean(bandAuthUser && bandAuthUser.isTargetMember === true);
    }

    function openBandTarget() {
        if (!BAND_INTEGRATION_ENABLED) return false;
        window.open(bandTargetUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    function renderComparison(comparison) {
        if (!selectedMbti) return '';
        const changes = comparison.changes.length
            ? `<div class="cw-change-list">${comparison.changes.map(change => `
                <div class="cw-change-row"><b>${change.from} → ${change.to}</b><span>${escapeHtml(change.message)}</span></div>`).join('')}</div>`
            : '<p class="cw-same-note">평소와 크레 앞의 내가 네 글자 모두 같아요.</p>';
        return `
            <section class="cw-result-insight">
                <header><h2>평소와 달라진 점</h2><span>${comparison.changes.length ? `${comparison.changes.length}개 축 변화` : '같은 유형'}</span></header>
                ${changes}
            </section>`;
    }

    function renderSpeedCard() {
        const valid = timingStats.validCount > 0;
        const total = valid ? formatSeconds(timingStats.totalMs) : '측정 안 됨';
        const median = valid ? formatSeconds(timingStats.medianMs) : '-';
        const benchmark = Core.buildSpeedBenchmark(timingStats.medianMs, speedSamples());
        return `
            <section class="cw-result-section cw-speed-card">
                <div class="cw-result-section-head">
                    <div><span>선택 속도</span><strong>${escapeHtml(timingStats.style.label)}</strong></div>
                    <div class="cw-speed-number">${escapeHtml(median)}<small> 문항당</small></div>
                </div>
                <p class="cw-speed-copy">${escapeHtml(timingStats.style.copy)}</p>
                <div class="cw-speed-measure"><span>전체 응답 ${escapeHtml(total)}</span><span>유효 ${timingStats.validCount} / ${questions.length}</span></div>
                <div class="cw-benchmark-inline"><b>${escapeHtml(benchmark.badge)}</b><span>${escapeHtml(benchmark.message)}</span></div>
            </section>`;
    }

    function detailedAnswerRows(axis) {
        return questions.map((question, index) => ({
            question,
            answer: question.options[answers[index]],
            letter: question.scores[answers[index]],
            timing: responseTimings[index]
        })).filter(item => item.question.axis === axis).map(item => `
            <li><span><b>${item.letter}</b> · ${escapeHtml(item.answer)}</span><time>${item.timing?.valid ? formatSeconds(item.timing.elapsedMs) : '측정 제외'}</time></li>`).join('');
    }

    function renderMemberDetail() {
        const axisCards = result.axes.map(axisResult => {
            const meta = Core.AXIS_META[axisResult.axis];
            const dominant = meta.letters[axisResult.dominant];
            return `
                <article class="cw-axis-detail">
                    <header><div><span>${escapeHtml(meta.title)}</span><strong>${axisResult.dominant} · ${escapeHtml(dominant.short)}</strong></div><b>${axisResult.dominantCount} : ${axisResult.oppositeCount}</b></header>
                    <p>${escapeHtml(dominant.description)}</p>
                    <details class="cw-answer-detail"><summary>내 선택 5개와 응답시간 보기</summary><ul>${detailedAnswerRows(axisResult.axis)}</ul></details>
                </article>`;
        }).join('');
        const slowestQuestion = questions.find(question => question.id === timingStats.slowest?.questionId);
        const fastestQuestion = questions.find(question => question.id === timingStats.fastest?.questionId);
        return `
            <section class="cw-result-section cw-member-detail">
                <h2 class="cw-detail-title">내가 뭘 골랐길래?</h2>
                <div class="cw-axis-detail-list">${axisCards}</div>
                <div class="cw-speed-meta">
                    ${fastestQuestion ? `<span>가장 빠른 선택 · ${escapeHtml(fastestQuestion.label)} ${formatSeconds(timingStats.fastest.elapsedMs)}</span>` : ''}
                    ${slowestQuestion ? `<span>가장 오래 고민 · ${escapeHtml(slowestQuestion.label)} ${formatSeconds(timingStats.slowest.elapsedMs)}</span>` : ''}
                </div>
            </section>`;
    }

    function renderHouseCard() {
        const house = Core.HOUSE_META[assignedHouseKey];
        const bandAction = BAND_INTEGRATION_ENABLED
            ? `<button class="cw-band-cta" type="button" data-action="open-band"><span>${house.name} 기숙사 참여하기</span><b aria-hidden="true">↗</b></button>`
            : '';
        return `
            <section class="cw-result-section cw-house-card" style="--house-accent:${house.accent}">
                <div class="cw-house-row"><div class="cw-house-seal">${house.seal}</div><div><small>CREWART COMMUNITY HOUSE</small><h2>${house.name}</h2></div></div>
                <p>${house.korean} · ${house.color}. MBTI와 별개로 커뮤니티 인원이 고르게 만나도록 배정된 기숙사예요.</p>
                ${bandAction}
            </section>`;
    }

    function renderLockedDetail() {
        const configured = BAND_INTEGRATION_ENABLED && bandAuthConfigured;
        const label = configured ? '전화번호로 BAND 회원 확인' : '회원 확인 준비 중';
        const status = configured
            ? '가입할 때 프로필에 적은 전화번호로 확인해요.'
            : '회원 명단 연결을 준비하고 있어요.';
        const description = '선택 근거, 고민한 문항과 기숙사 배정은<br>BAND 가입 확인 후 바로 열려요.';
        return `
            <section class="cw-detail-gate">
                <div class="cw-detail-preview" aria-hidden="true" inert>${renderMemberDetail()}${renderHouseCard()}</div>
                <div class="cw-detail-shade" aria-hidden="true"></div>
                <div class="cw-detail-unlock">
                    <span class="cw-lock-icon" aria-hidden="true">⌁</span>
                    <h2>세부 결과가 궁금한가요?</h2>
                    <p>${description}</p>
                    <button class="cw-band-cta" type="button" data-action="unlock-detail" ${configured ? '' : 'disabled'}><span>${escapeHtml(label)}</span><b aria-hidden="true">→</b></button>
                    <small class="cw-lock-status">${escapeHtml(status)}</small>
                </div>
            </section>`;
    }

    function renderResult() {
        const comparison = Core.buildMbtiComparison(selectedMbti, result.code);
        const typeFlow = selectedMbti
            ? `<div class="cw-result-code-flow"><div><small>평소</small><strong>${escapeHtml(selectedMbti)}</strong></div><i aria-hidden="true">→</i><div class="is-cre"><small>크레 앞</small><strong>${escapeHtml(result.code)}</strong></div></div>`
            : `<div class="cw-result-code-flow is-single"><div class="is-cre"><small>크레 앞의 나는</small><strong>${escapeHtml(result.code)}</strong></div></div>`;
        const detail = BAND_INTEGRATION_ENABLED && hasDetailedAccess() ? `${renderMemberDetail()}${renderHouseCard()}` : renderLockedDetail();
        const bandShare = BAND_INTEGRATION_ENABLED
            ? `<button class="cw-share-icon is-band" type="button" data-action="band-result" aria-label="크레와트 BAND 열기"><strong aria-hidden="true">B</strong></button>`
            : '';
        element('result-content').innerHTML = `
            <div class="cw-result-wrap">
                <section class="cw-result-poster">
                    <img class="cw-result-crest" src="assets/crewart-crest-v2.webp" width="720" height="838" alt="" aria-hidden="true">
                    <p class="cw-poster-kicker">CREWART PERSONALITY TEST</p>
                    ${typeFlow}
                    <h1>${escapeHtml(result.typeName)}</h1>
                    <p>${escapeHtml(typeSummary(result.code))}</p>
                </section>
                <div class="cw-share-tools" aria-label="결과 공유">
                    <button class="cw-share-icon is-kakao" type="button" data-action="share" aria-label="카카오톡으로 공유">
                        <img src="assets/kakaolink_btn_medium.png" width="24" height="24" alt="">
                    </button>
                    <button class="cw-share-icon is-instagram" type="button" data-action="instagram" aria-label="인스타그램으로 공유">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5"></rect><circle cx="12" cy="12" r="4.1"></circle><circle class="cw-instagram-dot" cx="17.4" cy="6.8" r="1.1"></circle></svg>
                    </button>
                    ${bandShare}
                </div>
                ${renderComparison(comparison)}
                ${renderSpeedCard()}
                ${detail}
            </div>`;
        element('result-content').querySelector('[data-action="unlock-detail"]')?.addEventListener('click', handleUnlockDetail);
        element('result-content').querySelector('[data-action="open-band"]')?.addEventListener('click', openBandTarget);
        element('result-content').querySelector('[data-action="share"]')?.addEventListener('click', shareResult);
        element('result-content').querySelector('[data-action="instagram"]')?.addEventListener('click', shareToInstagram);
        element('result-content').querySelector('[data-action="band-result"]')?.addEventListener('click', handleResultBand);
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
        if (IS_QA_MODE || !result || !surveySessionId || saveInFlight) return;
        const signature = JSON.stringify({ session: surveySessionId, answers, selectedMbti, band: bandAuthUser?.id || '', member: bandAuthUser?.isTargetMember || false });
        if (signature === lastSavedSignature) return;
        saveInFlight = true;
        try {
            const participantKey = await hashSessionId(surveySessionId);
            const house = Core.HOUSE_META[assignedHouseKey];
            const comparison = Core.buildMbtiComparison(selectedMbti, result.code);
            const response = {
                participantKey,
                surveySessionId,
                participationMode: bandAuthUser ? 'official' : 'guest',
                anonymous: !bandAuthUser,
                bandUserId: bandAuthUser?.id || null,
                bandProfileName: bandAuthUser?.name || null,
                bandIsTargetMember: bandAuthUser?.isTargetMember ?? null,
                name: bandAuthUser?.name || '익명 참여자',
                phone: null,
                creMbti: result.code,
                crebtiType: result.code,
                profile: `${result.code} · ${result.typeName}`,
                knownMbti: selectedMbti || null,
                mbtiComparison: selectedMbti ? comparison : null,
                axisScores: result.letters,
                assignedHouseKey,
                house: house.name,
                houseId: assignedHouseKey,
                houseColor: house.color,
                answers: answers.slice(),
                answerLabels: questions.map((question, index) => ({
                    questionId: question.id,
                    axis: question.axis,
                    question: question.q,
                    displayedPosition: answers[index] + 1,
                    label: question.options[answers[index]],
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
            const identity = bandAuthUser?.id || `anonymous-${participantKey}`;
            const participantLine = [identity, house.name, bandAuthUser?.name || '익명 참여자'].join(',');
            await saveCrewartSurveyEntry(participantKey, participantLine, response);
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
        button.disabled = !bandAuthReady;
        button.hidden = !BAND_INTEGRATION_ENABLED;
        if (note) note.hidden = !BAND_INTEGRATION_ENABLED;
        label.textContent = hasDetailedAccess() ? 'BAND 회원 확인 완료' : '전화번호로 BAND 회원 확인';
        if (note) note.textContent = hasDetailedAccess()
            ? '확인된 회원으로 결과를 바로 볼 수 있어요'
            : bandAuthConfigured
                ? '전화번호는 가입 여부 확인에만 사용해요'
                : '회원 명단 연결을 준비하고 있어요';
        button.setAttribute('aria-label', label.textContent);
        updatePersistentActions();
        if (result && !element('result-screen').hidden) renderResult();
    }

    function updatePersistentActions() {
        const footer = element('survey-footer');
        const button = element('persistent-band-button');
        const label = element('persistent-band-label');
        const note = element('persistent-band-note');
        const home = element('persistent-home-button');
        if (!footer || !button || !label || !note || !home) return;

        const stage = currentStage();
        home.hidden = stage === 'intro';
        footer.hidden = stage === 'intro' || !BAND_INTEGRATION_ENABLED;
        if (footer.hidden) return;

        button.hidden = false;
        note.hidden = false;
        button.disabled = !bandAuthReady;
        if (!bandAuthReady || !bandAuthConfigured) {
            label.textContent = 'BAND 회원 확인 준비 중';
            note.textContent = '회원 명단 연결을 확인하고 있어요.';
        } else if (!hasDetailedAccess()) {
            label.textContent = '전화번호로 BAND 회원 확인';
            note.textContent = '결과를 열기 전에 가입 여부를 확인해요.';
        } else {
            label.textContent = 'BAND 회원 확인 완료';
            note.textContent = '결과를 바로 열 수 있어요.';
        }
        button.setAttribute('aria-label', label.textContent);
    }

    function handlePersistentBand() {
        if (!BAND_INTEGRATION_ENABLED) return;
        if (!bandAuthReady) return;
        if (hasDetailedAccess()) toast('BAND 회원 확인이 완료됐어요.');
        else openMemberCheck({ revealResult: currentStage() === 'mbti' && Boolean(result) });
    }

    function handleBandEntry() {
        if (hasDetailedAccess()) {
            startSurvey();
            return;
        }
        openMemberCheck({ startSurvey: true });
    }

    async function initBandMembership() {
        try {
            bandAuthToken = sessionStorage.getItem(MEMBERSHIP_STORAGE_KEY) || '';
        } catch (_) {
            bandAuthToken = '';
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
            try { sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY); } catch (_) {}
        } finally {
            bandAuthReady = true;
            updateBandUi();
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
        submit.disabled = true;
        status.textContent = 'BAND 회원 명단을 확인하고 있어요…';
        try {
            const response = await bandFetch(`${BAND_MEMBER_API}/verify`, {
                method: 'POST', cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phoneInput.value })
            });
            const payload = await response.json().catch(() => ({}));
            bandTargetUrl = payload.targetBandUrl || bandTargetUrl;
            joinLink.href = bandTargetUrl;
            if (!response.ok) throw new Error(payload.error || '가입 여부를 확인하지 못했어요.');
            if (!payload.member) {
                status.textContent = '가입된 회원 명단에서 확인되지 않았어요.';
                status.classList.add('is-error');
                joinLink.hidden = false;
                return;
            }
            bandAuthToken = payload.token || '';
            bandAuthUser = payload.user || { id: 'band_member', name: 'BAND 회원', isTargetMember: true };
            if (bandAuthToken) {
                try { sessionStorage.setItem(MEMBERSHIP_STORAGE_KEY, bandAuthToken); } catch (_) {}
            }
            status.textContent = '가입 확인 완료! 결과를 열게요.';
            status.classList.add('is-success');
            updateBandUi();
            const reveal = pendingResultReveal && Boolean(result);
            const startAfterCheck = pendingSurveyStart;
            pendingResultReveal = false;
            pendingSurveyStart = false;
            setTimeout(() => {
                const dialog = element('member-check-dialog');
                if (dialog) dialog.hidden = true;
                phoneInput.value = '';
                if (reveal) completeResultReveal();
                else if (startAfterCheck) startSurvey();
                else toast('BAND 회원 확인이 완료됐어요.');
            }, 350);
        } catch (error) {
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

    async function shareResult() {
        const title = selectedMbti ? `평소 ${selectedMbti} → 크레 ${result.code}` : `나의 크레 MBTI는 ${result.code}`;
        const text = `${title}\n${result.typeName} · 문항당 ${formatSeconds(timingStats.medianMs)}`;
        try {
            if (window.Kakao) {
                if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
                window.Kakao.Share.sendDefault({
                    objectType: 'feed',
                    content: {
                        title,
                        description: `${result.typeName} · 20개의 선택으로 확인한 크레 앞의 나`,
                        imageUrl: new URL('assets/crewart-cave-mobile.webp', document.baseURI).toString(),
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
        const title = selectedMbti ? `평소 ${selectedMbti} → 크레 ${result.code}` : `나의 크레 MBTI는 ${result.code}`;
        const text = `${title}\n${result.typeName}`;
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

    function syncThemeColor() {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171819' : '#f4f1e9');
    }

    function bindEvents() {
        element('start-button').addEventListener('click', startSurvey);
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
            else resumeTimer();
        });
    }

    function initialize() {
        if (!Core || Core.QUESTIONS.length !== 20) {
            toast('테스트 데이터를 불러오지 못했어요.', true);
            return;
        }
        setupIntroVideo();
        bindEvents();
        syncThemeColor();
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);
        const start = element('start-button');
        start.disabled = false;
        start.querySelector('span').textContent = '먼저 테스트하기';
        playWordmark();
        void loadConfig();
        if (!BAND_INTEGRATION_ENABLED) {
            bandAuthReady = false;
            updateBandUi();
        } else {
            void initBandMembership();
        }
    }

    initialize();
}());

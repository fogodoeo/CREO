'use strict';

const { verifyToken } = require('./band-membership');
const { readJson } = require('./platform-api');
const Core = require('./public/crewart-survey-core');

const CONTENT_KEY = 'crewart_mbti_content_v1';
const CONTENT_UPDATED_KEY = 'crewart_mbti_content_updated_at';
const LEGACY_RESPONSES_KEY = 'crewart_survey_responses';
const RESPONSE_PREFIX = 'crewart_survey_response_entry_';
const RESPONSE_LIMIT = 500;
const MBTI_PATTERN = /^[EI][SN][TF][JP]$/;
const AXIS_PAIRS = [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']];

function jsonParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
}

function replyJson(res, status, value, headers = {}) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        ...headers
    });
    res.end(body);
}

function requestOriginAllowed(req) {
    const origin = String(req.headers?.origin || '').trim();
    if (!origin) return true;
    try { return new URL(origin).host === String(req.headers?.host || ''); }
    catch { return false; }
}

function bearerToken(req) {
    const match = String(req.headers?.authorization || '').match(/^Bearer\s+([^\s]+)$/i);
    return match ? match[1] : '';
}

function cleanText(value, maximum = 120) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum);
}

function finiteInteger(value, minimum, maximum, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function exactInteger(value, minimum, maximum) {
    const number = Number(value);
    return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function validDate(value, fallback) {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function normalizeAxisScores(input) {
    const scores = {};
    const axisTotal = Number(Core.AXIS_SCORE_TOTAL) || 5;
    for (const [left, right] of AXIS_PAIRS) {
        scores[left] = exactInteger(input?.[left], 0, axisTotal);
        scores[right] = exactInteger(input?.[right], 0, axisTotal);
        if (scores[left] === null || scores[right] === null || scores[left] + scores[right] !== axisTotal) {
            const error = new Error('축 점수 형식이 올바르지 않습니다.');
            error.status = 422;
            throw error;
        }
    }
    return scores;
}

function codeFromScores(scores) {
    return (scores.E > scores.I ? 'E' : 'I')
        + (scores.S > scores.N ? 'S' : 'N')
        + (scores.T > scores.F ? 'T' : 'F')
        + (scores.J > scores.P ? 'J' : 'P');
}

function sanitizeSubmission(input, nowIso) {
    const participantKey = cleanText(input?.participantKey, 48).toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(participantKey)) {
        const error = new Error('참여 세션 형식이 올바르지 않습니다.');
        error.status = 422;
        throw error;
    }
    if (input?.questionVersion !== Core.SURVEY_VERSION) {
        const error = new Error('현재 문항 버전과 맞지 않습니다. 테스트를 새로 시작해 주세요.');
        error.status = 409;
        throw error;
    }
    const answers = Array.isArray(input.answers) ? input.answers.map(Number) : [];
    if (answers.length !== Core.QUESTIONS.length || answers.some((answer, index) => answer < 0 || answer >= (Core.QUESTIONS[index]?.options?.length || 0))) {
        const error = new Error('응답 개수가 올바르지 않습니다.');
        error.status = 422;
        throw error;
    }
    const axisScores = normalizeAxisScores(input.axisScores);
    const creMbti = cleanText(input.creMbti || input.crebtiType, 4).toUpperCase();
    if (!MBTI_PATTERN.test(creMbti) || codeFromScores(axisScores) !== creMbti) {
        const error = new Error('결과 점수가 일치하지 않습니다.');
        error.status = 422;
        throw error;
    }
    const assignedHouseKey = cleanText(input.assignedHouseKey || input.houseId, 2).toUpperCase();
    const expectedHouseKey = Core.chooseTendencyHouse({ code: creMbti, letters: axisScores });
    if (!Core.HOUSE_KEYS.includes(assignedHouseKey) || assignedHouseKey !== expectedHouseKey) {
        const error = new Error('기숙사 배정값이 올바르지 않습니다.');
        error.status = 422;
        throw error;
    }
    const knownMbti = cleanText(input.knownMbti, 4).toUpperCase();
    if (knownMbti && !Core.MBTI_TYPES.includes(knownMbti)) {
        const error = new Error('평소 MBTI 형식이 올바르지 않습니다.');
        error.status = 422;
        throw error;
    }
    const questionById = new Map(Core.QUESTIONS.map((question) => [question.id, question]));
    const seenQuestionIds = new Set();
    const scoreCounts = Object.fromEntries(AXIS_PAIRS.flat().map((letter) => [letter, 0]));
    const answerLabels = (Array.isArray(input.answerLabels) ? input.answerLabels : [])
        .slice(0, Core.QUESTIONS.length)
        .map((answer, index) => {
            const questionId = cleanText(answer?.questionId, 3).toUpperCase();
            const axis = cleanText(answer?.axis, 2).toUpperCase();
            const secondaryAxis = cleanText(answer?.secondaryAxis, 2).toUpperCase();
            const choiceId = cleanText(answer?.choiceId, 12).toUpperCase();
            const question = questionById.get(questionId);
            const choiceIndex = question?.optionIds?.findIndex(id => id.toUpperCase() === choiceId) ?? -1;
            const displayedPosition = exactInteger(answer?.displayedPosition, 1, question?.options?.length || 0);
            const expectedSecondaryAxis = question?.secondaryAxis || '';
            if (
                !question
                || seenQuestionIds.has(questionId)
                || question.axis !== axis
                || secondaryAxis !== expectedSecondaryAxis
                || choiceIndex < 0
                || displayedPosition !== answers[index] + 1
            ) return null;
            const signalScores = Core.answerScoreMap(question, choiceIndex);
            const scoreLetters = Core.answerLetters(question, choiceIndex);
            const responseMs = exactInteger(answer?.responseMs, 0, Core.MAX_RESPONSE_MS) ?? 0;
            seenQuestionIds.add(questionId);
            Object.entries(signalScores).forEach(([letter, points]) => { scoreCounts[letter] += points; });
            return {
                questionId,
                axis,
                secondaryAxis,
                choiceId,
                displayedPosition,
                score: scoreLetters[0] || '',
                secondaryScore: scoreLetters[1] || '',
                signalScores,
                responseMs,
                timingValid: responseMs >= Core.MIN_RESPONSE_MS && responseMs <= Core.MAX_RESPONSE_MS
            };
        })
        .filter(Boolean);
    if (answerLabels.length !== Core.QUESTIONS.length) {
        const error = new Error('문항별 응답 형식이 올바르지 않습니다.');
        error.status = 422;
        throw error;
    }
    if (answerLabels.some((answer) => !answer.timingValid)) {
        const error = new Error(`각 문항은 최소 ${Core.MIN_RESPONSE_MS / 1000}초 이상 확인해 주세요.`);
        error.status = 422;
        throw error;
    }
    if (Object.entries(scoreCounts).some(([letter, count]) => axisScores[letter] !== count)) {
        const error = new Error('문항별 선택과 축 점수가 일치하지 않습니다.');
        error.status = 422;
        throw error;
    }
    const calculatedTiming = Core.buildTimingStats(answerLabels.map((answer) => ({
        questionId: answer.questionId,
        axis: answer.axis,
        elapsedMs: answer.responseMs,
        valid: answer.timingValid
    })), []);
    return {
        participantKey,
        participationMode: 'official',
        anonymous: true,
        memberVerified: true,
        creMbti,
        crebtiType: creMbti,
        knownMbti: knownMbti || null,
        axisScores,
        assignedHouseKey,
        houseId: assignedHouseKey,
        answers,
        answerLabels,
        timingStats: {
            validCount: calculatedTiming.validCount,
            totalMs: calculatedTiming.totalMs,
            averageMs: calculatedTiming.averageMs,
            medianMs: calculatedTiming.medianMs,
            axisMedians: calculatedTiming.axisMedians,
            style: calculatedTiming.style.key
        },
        questionVersion: Core.SURVEY_VERSION,
        questionContentUpdatedAt: validDate(input.questionContentUpdatedAt, null),
        createdAt: validDate(input.createdAt, nowIso),
        syncedAt: nowIso
    };
}

function sanitizeManagedContent(input) {
    if (input?.version !== Core.SURVEY_VERSION) {
        const error = new Error('현재 문항 버전과 맞지 않습니다. 새로고침 후 다시 저장해 주세요.');
        error.status = 409;
        throw error;
    }
    const items = Array.isArray(input?.questions) ? input.questions : [];
    if (items.length !== Core.QUESTIONS.length) {
        const error = new Error(`${Core.QUESTIONS.length}개 문항이 모두 필요합니다.`);
        error.status = 422;
        throw error;
    }
    const byId = new Map();
    for (const item of items) {
        const id = cleanText(item?.id, 3).toUpperCase();
        if (!Core.QUESTIONS.some((question) => question.id === id) || byId.has(id)) {
            const error = new Error('문항 번호가 중복되었거나 올바르지 않습니다.');
            error.status = 422;
            throw error;
        }
        byId.set(id, item);
    }
    const questions = Core.QUESTIONS.map((question) => {
        const item = byId.get(question.id);
        const label = cleanText(item?.label, 40);
        const q = cleanText(item?.q, 160);
        const options = Array.isArray(item?.options)
            ? item.options.slice(0, 4).map((option) => cleanText(option, 120))
            : [];
        if (!label || !q || options.length !== 4 || options.some((option) => option.length < 6) || new Set(options).size !== options.length) {
            const error = new Error(`${question.id} 문항의 문구를 확인해 주세요.`);
            error.status = 422;
            throw error;
        }
        return { id: question.id, label, q, options };
    });
    return { version: Core.SURVEY_VERSION, questions };
}

function responseIdentity(response, fallback) {
    return cleanText(response?.participantKey || response?.surveySessionId || fallback, 80);
}

function aggregateResponses(rows, legacyValue) {
    const responses = new Map();
    const legacy = jsonParse(legacyValue, []);
    if (Array.isArray(legacy)) {
        legacy.forEach((response, index) => {
            responses.set(responseIdentity(response, `legacy-${index}`), response);
        });
    }
    rows.forEach((row, index) => {
        const response = jsonParse(row.value, null);
        if (!response) return;
        responses.set(responseIdentity(response, row.key || `entry-${index}`), response);
    });
    const houseCounts = Object.fromEntries(Core.HOUSE_KEYS.map((key) => [key, 0]));
    const timingMedians = [];
    let sampleSize = 0;
    for (const response of responses.values()) {
        if (response?.questionVersion !== Core.SURVEY_VERSION) continue;
        const house = cleanText(response.assignedHouseKey || response.houseId, 2).toUpperCase();
        if (house in houseCounts) houseCounts[house] += 1;
        const median = Number(response?.timingStats?.medianMs);
        if (Number.isFinite(median) && median >= Core.MIN_RESPONSE_MS && median <= Core.MAX_RESPONSE_MS) timingMedians.push(Math.round(median));
        sampleSize += 1;
    }
    const aggregate = { houseCounts, timingMedians: timingMedians.slice(-RESPONSE_LIMIT), sampleSize };
    Object.defineProperty(aggregate, 'identities', {
        value: new Set(responses.keys()),
        enumerable: false
    });
    return aggregate;
}

function createCrewartSurveyApi(options = {}) {
    const repository = options.repository;
    const bandMembership = options.bandMembership;
    const isAdmin = options.isAdmin;
    const logger = options.logger || console;
    const now = options.now || Date.now;
    const cacheMs = Math.max(5000, Math.min(300000, Number(options.cacheMs) || 60000));
    const submissionAttempts = new Map();
    let bootstrapCache = null;
    let bootstrapRequest = null;
    if (!repository) throw new Error('repository is required');

    function allowSubmission(subject) {
        const current = now();
        const cutoff = current - 3600000;
        const recent = (submissionAttempts.get(subject) || []).filter((timestamp) => timestamp > cutoff);
        if (recent.length >= 20) return false;
        recent.push(current);
        submissionAttempts.set(subject, recent);
        return true;
    }

    async function buildBootstrap() {
        const [namedRows, responseRows] = await Promise.all([
            repository.getRowsByKeys([CONTENT_KEY, CONTENT_UPDATED_KEY, LEGACY_RESPONSES_KEY]),
            repository.listRowsByPrefix(RESPONSE_PREFIX, RESPONSE_LIMIT)
        ]);
        const map = new Map(namedRows.map((row) => [row.key, row.value]));
        const managed = jsonParse(map.get(CONTENT_KEY), null);
        const content = managed?.version === Core.SURVEY_VERSION ? managed : null;
        return {
            questionVersion: Core.SURVEY_VERSION,
            content,
            contentUpdatedAt: content ? validDate(map.get(CONTENT_UPDATED_KEY), null) : null,
            cohort: aggregateResponses(responseRows, map.get(LEGACY_RESPONSES_KEY))
        };
    }

    async function bootstrap() {
        if (bootstrapCache && bootstrapCache.expiresAt > now()) return bootstrapCache.value;
        if (bootstrapRequest) return bootstrapRequest;
        bootstrapRequest = buildBootstrap()
            .then((value) => {
                bootstrapCache = { value, expiresAt: now() + cacheMs };
                return value;
            })
            .finally(() => { bootstrapRequest = null; });
        return bootstrapRequest;
    }

    async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/crewart-survey/')) return false;
        if (!requestOriginAllowed(req)) {
            replyJson(res, 403, { error: '허용되지 않은 요청입니다.' });
            return true;
        }
        try {
            if (url.pathname === '/api/crewart-survey/bootstrap' && req.method === 'GET') {
                replyJson(res, 200, await bootstrap(), {
                    'Cache-Control': 'public, max-age=15, stale-while-revalidate=45'
                });
                return true;
            }
            if (url.pathname === '/api/crewart-survey/content' && req.method === 'GET') {
                if (typeof isAdmin !== 'function' || !await isAdmin(req)) {
                    replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
                    return true;
                }
                const current = await bootstrap();
                const defaults = {
                    version: Core.SURVEY_VERSION,
                    questions: Core.QUESTIONS.map((question) => ({
                        id: question.id,
                        label: question.label,
                        q: question.q,
                        options: question.options.slice()
                    }))
                };
                replyJson(res, 200, {
                    questionVersion: Core.SURVEY_VERSION,
                    content: current.content || defaults,
                    contentUpdatedAt: current.contentUpdatedAt,
                    usingDefaults: !current.content
                });
                return true;
            }
            if (url.pathname === '/api/crewart-survey/content' && req.method === 'PUT') {
                if (typeof isAdmin !== 'function' || !await isAdmin(req)) {
                    replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
                    return true;
                }
                const body = await readJson(req);
                const content = sanitizeManagedContent(body.content);
                const updatedAt = new Date(now()).toISOString();
                await repository.upsertRows([
                    { key: CONTENT_KEY, value: JSON.stringify(content) },
                    { key: CONTENT_UPDATED_KEY, value: updatedAt }
                ]);
                bootstrapCache = null;
                replyJson(res, 200, { saved: true, content, contentUpdatedAt: updatedAt });
                return true;
            }
            if (url.pathname === '/api/crewart-survey/responses' && req.method === 'DELETE') {
                if (typeof isAdmin !== 'function' || !await isAdmin(req)) {
                    replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
                    return true;
                }
                let deleted = 0;
                while (true) {
                    const responseRows = await repository.listRowsByPrefix(RESPONSE_PREFIX, RESPONSE_LIMIT);
                    if (!responseRows.length) break;
                    for (let index = 0; index < responseRows.length; index += 25) {
                        await Promise.all(responseRows.slice(index, index + 25).map((row) => repository.deleteRow(row.key)));
                    }
                    deleted += responseRows.length;
                }
                await repository.deleteRow(LEGACY_RESPONSES_KEY);
                bootstrapCache = null;
                replyJson(res, 200, { cleared: true, deleted });
                return true;
            }
            if (url.pathname === '/api/crewart-survey/responses' && req.method === 'POST') {
                const secret = String(bandMembership?.config?.sessionSecret || '');
                if (secret.length < 32) {
                    replyJson(res, 503, { error: '설문 저장 기능을 준비하고 있습니다.' });
                    return true;
                }
                let session;
                try { session = verifyToken(bearerToken(req), secret, now()); }
                catch {
                    replyJson(res, 401, { error: 'BAND 회원 확인 시간이 만료됐어요.' });
                    return true;
                }
                if (!allowSubmission(session.sub)) {
                    replyJson(res, 429, { error: '짧은 시간에 저장된 테스트가 많습니다.' });
                    return true;
                }
                const body = await readJson(req);
                const nowIso = new Date(now()).toISOString();
                const response = sanitizeSubmission(body.response, nowIso);
                await repository.upsertRows([{
                    key: `${RESPONSE_PREFIX}${response.participantKey}`,
                    value: JSON.stringify(response)
                }]);
                if (bootstrapCache) {
                    const cohort = bootstrapCache.value.cohort;
                    const alreadyCounted = cohort.identities.has(response.participantKey);
                    cohort.identities.add(response.participantKey);
                    if (!alreadyCounted) {
                        cohort.houseCounts[response.assignedHouseKey] += 1;
                        if (response.timingStats.medianMs >= Core.MIN_RESPONSE_MS) {
                            cohort.timingMedians.push(response.timingStats.medianMs);
                            cohort.timingMedians = cohort.timingMedians.slice(-RESPONSE_LIMIT);
                        }
                        cohort.sampleSize += 1;
                    } else {
                        // Replacing a participant's response may change its house or
                        // timing. Rebuild on the next bootstrap instead of guessing
                        // the previous values from the aggregate-only cache.
                        bootstrapCache = null;
                    }
                }
                replyJson(res, 201, { saved: true });
                return true;
            }
            replyJson(res, 404, { error: 'Not found' });
            return true;
        } catch (error) {
            logger.error?.('[crewart-survey-api]', error.message);
            const status = Number(error.status) || 500;
            replyJson(res, status, {
                error: status >= 500 ? '설문 데이터를 처리하지 못했습니다.' : error.message
            });
            return true;
        }
    }

    return { handle, bootstrap, sanitizeSubmission };
}

module.exports = {
    CONTENT_KEY,
    CONTENT_UPDATED_KEY,
    LEGACY_RESPONSES_KEY,
    RESPONSE_PREFIX,
    aggregateResponses,
    createCrewartSurveyApi,
    sanitizeManagedContent,
    sanitizeSubmission
};

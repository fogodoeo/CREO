'use strict';

const { verifyToken } = require('./band-membership');
const { readJson } = require('./platform-api');
const Core = require('./public/crewart-survey-core');

const CONTENT_KEY = 'crewart_mbti_content_v1';
const CONTENT_UPDATED_KEY = 'crewart_mbti_content_updated_at';
const LEGACY_RESPONSES_KEY = 'crewart_survey_responses';
const RESPONSE_PREFIX = 'crewart_survey_response_entry_';
const RESPONSE_PAGE_SIZE = 1000;
const TIMING_SAMPLE_LIMIT = 500;
const REFERRAL_PREFIX = 'crewart_referral_v1_';
const REFERRAL_OWNER_PREFIX = 'crewart_referral_owner_v1_';
const REFERRAL_MEMBER_PREFIX = 'crewart_referral_member_v1_';
const REFERRAL_LIMIT = 1000;
const REFERRAL_OWNER_LINK_LIMIT = 80;
const REFERRAL_EVENTS = Object.freeze({
    share: 'sharedAt',
    landing: 'landedAt',
    band_click: 'bandClickedAt',
    verified: 'verifiedAt'
});
const HOUSE_ASSIGNMENT_VERSION = 'balanced-v1';
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

function normalizeReferralId(value) {
    const id = cleanText(value, 64);
    return /^[a-zA-Z0-9_-]{16,64}$/.test(id) ? id : '';
}

function memberIdentity(session) {
    return cleanText(session?.mid, 80);
}

function normalizeTimingMedians(values) {
    return (values || [])
        .map(Number)
        .filter(Number.isFinite)
        .map(Math.round)
        .filter((value) => value > Core.MIN_RESPONSE_MS && value <= Core.MAX_RESPONSE_MS);
}

function summarizeReferrals(rows) {
    const entries = rows.map((row) => jsonParse(row.value, null)).filter(Boolean);
    const counts = {
        shared: entries.filter((entry) => entry.sharedAt).length,
        landed: entries.filter((entry) => entry.landedAt).length,
        bandClicked: entries.filter((entry) => entry.bandClickedAt).length,
        verified: entries.reduce((sum, entry) => sum + (Number(entry.verifiedCount) || (entry.verifiedAt ? 1 : 0)), 0),
        convertedLinks: entries.filter((entry) => entry.verifiedAt).length
    };
    return {
        counts,
        verifiedConversionRate: counts.landed ? Math.round((counts.verified / counts.landed) * 1000) / 10 : 0,
        entries: entries.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    };
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

function sanitizeSubmission(input, nowIso, options = {}) {
    const memberVerified = options.memberVerified === true;
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
        participationMode: memberVerified ? 'official' : 'anonymous',
        anonymous: true,
        memberVerified,
        creMbti,
        crebtiType: creMbti,
        knownMbti: knownMbti || null,
        axisScores,
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

function chooseLeastPopulatedHouse(houseCounts, random = Math.random) {
    const counts = Object.fromEntries(Core.HOUSE_KEYS.map((key) => [
        key,
        Math.max(0, Number(houseCounts?.[key]) || 0)
    ]));
    const minimum = Math.min(...Object.values(counts));
    const candidates = Core.HOUSE_KEYS.filter((key) => counts[key] === minimum);
    const roll = Number(random());
    const index = Number.isFinite(roll)
        ? Math.min(candidates.length - 1, Math.max(0, Math.floor(roll * candidates.length)))
        : 0;
    return candidates[index] || Core.HOUSE_KEYS[0];
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
    const timingAverages = [];
    let sampleSize = 0;
    for (const response of responses.values()) {
        const house = cleanText(response.assignedHouseKey || response.houseId, 2).toUpperCase();
        if (house in houseCounts) houseCounts[house] += 1;
        const average = Number(response?.timingStats?.averageMs ?? response?.timingStats?.medianMs);
        if (Number.isFinite(average) && average > Core.MIN_RESPONSE_MS && average <= Core.MAX_RESPONSE_MS) {
            timingAverages.push(Math.round(average));
        }
        sampleSize += 1;
    }
    const timingTotalMs = timingAverages.reduce((sum, value) => sum + value, 0);
    const rawTimingMedians = timingAverages.slice(-TIMING_SAMPLE_LIMIT);
    const aggregate = {
        houseCounts,
        timingMedians: normalizeTimingMedians(rawTimingMedians),
        timingAverageMs: timingAverages.length ? Math.round(timingTotalMs / timingAverages.length) : 0,
        timingSampleSize: timingAverages.length,
        sampleSize
    };
    Object.defineProperty(aggregate, 'identities', {
        value: new Set(responses.keys()),
        enumerable: false
    });
    Object.defineProperty(aggregate, 'rawTimingMedians', {
        value: rawTimingMedians,
        enumerable: false,
        writable: true
    });
    Object.defineProperty(aggregate, 'rawTimingTotalMs', {
        value: timingTotalMs,
        enumerable: false,
        writable: true
    });
    return aggregate;
}

function createCrewartSurveyApi(options = {}) {
    const repository = options.repository;
    const bandMembership = options.bandMembership;
    const crewartHouseService = options.crewartHouseService;
    const isAdmin = options.isAdmin;
    const logger = options.logger || console;
    const now = options.now || Date.now;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const cacheMs = Math.max(5000, Math.min(300000, Number(options.cacheMs) || 60000));
    const submissionAttempts = new Map();
    let bootstrapCache = null;
    let bootstrapRequest = null;
    let assignmentQueue = Promise.resolve();
    let referralQueue = Promise.resolve();
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

    async function listAllResponseRows() {
        const rows = [];
        let offset = 0;
        while (true) {
            const page = await repository.listRowsByPrefix(RESPONSE_PREFIX, RESPONSE_PAGE_SIZE, offset);
            rows.push(...page);
            if (page.length < RESPONSE_PAGE_SIZE) return rows;
            offset += page.length;
        }
    }

    async function buildBootstrap() {
        const [namedRows, responseRows] = await Promise.all([
            repository.getRowsByKeys([CONTENT_KEY, CONTENT_UPDATED_KEY, LEGACY_RESPONSES_KEY]),
            listAllResponseRows()
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

    function serializeAssignment(task) {
        const pending = assignmentQueue.then(task, task);
        assignmentQueue = pending.catch(() => undefined);
        return pending;
    }

    function serializeReferral(task) {
        const pending = referralQueue.then(task, task);
        referralQueue = pending.catch(() => undefined);
        return pending;
    }

    async function recordReferral(input, authenticatedMemberKey = '') {
        const shareId = normalizeReferralId(input?.shareId);
        const eventName = cleanText(input?.event, 24);
        const timestampField = REFERRAL_EVENTS[eventName];
        const isMemberVerification = eventName === 'verified';
        if ((!shareId && !isMemberVerification) || !timestampField) {
            const error = new Error('공유 추적 정보 형식이 올바르지 않습니다.');
            error.status = 422;
            throw error;
        }
        if ((eventName === 'share' || eventName === 'verified') && !authenticatedMemberKey) {
            const error = new Error('BAND 회원 확인이 필요합니다.');
            error.status = 401;
            throw error;
        }
        return serializeReferral(async () => {
            const key = shareId ? `${REFERRAL_PREFIX}${shareId}` : '';
            const ownerKey = eventName === 'share' ? `${REFERRAL_OWNER_PREFIX}${authenticatedMemberKey}` : '';
            const memberKey = isMemberVerification ? `${REFERRAL_MEMBER_PREFIX}${authenticatedMemberKey}` : '';
            const rows = await repository.getRowsByKeys([key, ownerKey, memberKey].filter(Boolean));
            const previous = jsonParse(rows.find((row) => row.key === key)?.value, {});
            const existingMemberClaim = jsonParse(rows.find((row) => row.key === memberKey)?.value, null);
            const verifiedSubjects = Array.isArray(previous.verifiedSubjects)
                ? previous.verifiedSubjects.map((subject) => cleanText(subject, 80)).filter(Boolean)
                : [];
            if (isMemberVerification && existingMemberClaim) return existingMemberClaim;
            if (eventName !== 'verified' && previous[timestampField]) return previous;
            const nowIso = new Date(now()).toISOString();

            if (isMemberVerification) {
                const ownerMemberKey = cleanText(previous.ownerMemberKey, 80);
                const alreadyOnThisLink = verifiedSubjects.includes(authenticatedMemberKey);
                const attributable = Boolean(
                    shareId
                    && previous.sharedAt
                    && ownerMemberKey
                    && ownerMemberKey !== authenticatedMemberKey
                );
                const memberClaim = {
                    firstVerifiedAt: nowIso,
                    attributed: attributable,
                    shareId: attributable ? shareId : '',
                    ownerMemberKey: attributable ? ownerMemberKey : ''
                };
                const updates = [{ key: memberKey, value: JSON.stringify(memberClaim) }];

                if (attributable && !alreadyOnThisLink) {
                    const next = {
                        shareId,
                        source: cleanText(input?.source, 24) || previous.source || 'kakao',
                        createdAt: previous.createdAt || nowIso,
                        ...previous,
                        verifiedAt: previous.verifiedAt || nowIso,
                        lastVerifiedAt: nowIso,
                        updatedAt: nowIso,
                        verifiedSubjects: [...verifiedSubjects, authenticatedMemberKey].slice(-500)
                    };
                    next.verifiedCount = next.verifiedSubjects.length;
                    updates.unshift({ key, value: JSON.stringify(next) });
                }

                await repository.upsertRows(updates);
                return memberClaim;
            }

            const next = {
                shareId,
                source: cleanText(input?.source, 24) || 'kakao',
                createdAt: previous.createdAt || nowIso,
                ...previous,
                [timestampField]: nowIso,
                updatedAt: nowIso
            };
            const updates = [{ key, value: JSON.stringify(next) }];
            if (eventName === 'share') {
                next.ownerMemberKey = authenticatedMemberKey;
                updates[0].value = JSON.stringify(next);
                const ownerRecord = jsonParse(rows.find((row) => row.key === ownerKey)?.value, {});
                const shareIds = Array.isArray(ownerRecord.shareIds)
                    ? ownerRecord.shareIds.map(normalizeReferralId).filter(Boolean)
                    : [];
                updates.push({
                    key: ownerKey,
                    value: JSON.stringify({
                        memberKey: authenticatedMemberKey,
                        shareIds: [...new Set([...shareIds, shareId])].slice(-REFERRAL_OWNER_LINK_LIMIT),
                        updatedAt: nowIso
                    })
                });
            }
            await repository.upsertRows(updates);
            return next;
        });
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
            if (url.pathname === '/api/crewart-survey/shares' && req.method === 'POST') {
                const body = await readJson(req);
                let authenticatedMemberKey = '';
                if (bearerToken(req)) {
                    const secret = String(bandMembership?.config?.sessionSecret || '');
                    try {
                        authenticatedMemberKey = memberIdentity(verifyToken(bearerToken(req), secret, now()));
                        if (!authenticatedMemberKey) throw new Error('member scope unavailable');
                    }
                    catch {
                        replyJson(res, 401, { error: 'BAND 회원 확인 시간이 만료됐어요.' });
                        return true;
                    }
                }
                await recordReferral(body, authenticatedMemberKey);
                replyJson(res, 202, { accepted: true });
                return true;
            }
            if (url.pathname === '/api/crewart-survey/shares' && req.method === 'GET') {
                if (bearerToken(req)) {
                    const secret = String(bandMembership?.config?.sessionSecret || '');
                    let authenticatedMemberKey = '';
                    try {
                        authenticatedMemberKey = memberIdentity(verifyToken(bearerToken(req), secret, now()));
                        if (!authenticatedMemberKey) throw new Error('member scope unavailable');
                    }
                    catch {
                        replyJson(res, 401, { error: 'BAND 회원 확인 시간이 만료됐어요.' });
                        return true;
                    }
                    const ownerKey = `${REFERRAL_OWNER_PREFIX}${authenticatedMemberKey}`;
                    const ownerRows = await repository.getRowsByKeys([ownerKey]);
                    const owner = jsonParse(ownerRows[0]?.value, {});
                    const ownedIds = Array.isArray(owner.shareIds)
                        ? [...new Set(owner.shareIds.map(normalizeReferralId).filter(Boolean))].slice(-REFERRAL_OWNER_LINK_LIMIT)
                        : [];
                    const rows = ownedIds.length
                        ? await repository.getRowsByKeys(ownedIds.map((id) => `${REFERRAL_PREFIX}${id}`))
                        : [];
                    const summary = summarizeReferrals(rows);
                    replyJson(res, 200, {
                        counts: summary.counts,
                        verifiedConversionRate: summary.verifiedConversionRate
                    });
                    return true;
                }
                if (typeof isAdmin !== 'function' || !await isAdmin(req)) {
                    replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
                    return true;
                }
                const rows = await repository.listRowsByPrefix(REFERRAL_PREFIX, REFERRAL_LIMIT);
                replyJson(res, 200, summarizeReferrals(rows));
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
                    const responseRows = await repository.listRowsByPrefix(RESPONSE_PREFIX, RESPONSE_PAGE_SIZE);
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
            if (url.pathname === '/api/crewart-survey/house-link' && req.method === 'POST') {
                const secret = String(bandMembership?.config?.sessionSecret || '');
                const token = bearerToken(req);
                let session = null;
                try { session = secret.length >= 32 && token ? verifyToken(token, secret, now()) : null; }
                catch { session = null; }
                if (!session?.mid) {
                    replyJson(res, 401, { error: 'BAND 회원 확인이 필요합니다.' });
                    return true;
                }
                if (!allowSubmission(`house-link:${session.sub}`)) {
                    replyJson(res, 429, { error: '연결 확인 요청이 너무 많습니다.' });
                    return true;
                }
                const body = await readJson(req);
                const houseKey = cleanText(body.houseKey, 2).toUpperCase();
                const resultCode = cleanText(body.resultCode, 4).toUpperCase();
                const scoreKeys = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'];
                const axisScores = Object.fromEntries(scoreKeys.map(key => [key, Number(body.axisScores?.[key])]));
                const timing = {
                    validCount: Number(body.timingStats?.validCount),
                    totalMs: Number(body.timingStats?.totalMs),
                    averageMs: Number(body.timingStats?.averageMs),
                    medianMs: Number(body.timingStats?.medianMs)
                };
                const proofValid = Core.HOUSE_KEYS.includes(houseKey)
                    && Core.MBTI_TYPES.includes(resultCode)
                    && Object.values(axisScores).every(Number.isFinite)
                    && Object.values(timing).every(Number.isFinite);
                if (!proofValid) {
                    replyJson(res, 422, { error: '저장된 설문 결과를 확인할 수 없습니다.' });
                    return true;
                }
                const matches = (await listAllResponseRows()).map(row => jsonParse(row.value, null)).filter(response => {
                    if (!response || response.memberVerified !== true) return false;
                    if (cleanText(response.assignedHouseKey || response.houseId, 2).toUpperCase() !== houseKey) return false;
                    if (cleanText(response.creMbti || response.crebtiType, 4).toUpperCase() !== resultCode) return false;
                    if (scoreKeys.some(key => Number(response.axisScores?.[key]) !== axisScores[key])) return false;
                    return Object.entries(timing).every(([key, value]) => Number(response.timingStats?.[key]) === value);
                });
                if (matches.length !== 1 || typeof crewartHouseService?.linkSurveyAssignment !== 'function') {
                    replyJson(res, 409, { error: '기존 설문 결과를 자동 연결하지 못했습니다. 테스트를 다시 완료해 주세요.' });
                    return true;
                }
                await crewartHouseService.linkSurveyAssignment(
                    session.mid,
                    houseKey,
                    matches[0].participantKey
                );
                replyJson(res, 200, { linked: true, houseKey });
                return true;
            }
            if (url.pathname === '/api/crewart-survey/responses' && req.method === 'POST') {
                const secret = String(bandMembership?.config?.sessionSecret || '');
                const token = bearerToken(req);
                let session = null;
                if (token) {
                    if (secret.length < 32) {
                        replyJson(res, 503, { error: '설문 저장 기능을 준비하고 있습니다.' });
                        return true;
                    }
                    try { session = verifyToken(token, secret, now()); }
                    catch {
                        replyJson(res, 401, { error: 'BAND 회원 확인 시간이 만료됐어요.' });
                        return true;
                    }
                }
                const body = await readJson(req);
                const nowIso = new Date(now()).toISOString();
                const sanitized = sanitizeSubmission(body.response, nowIso, { memberVerified: Boolean(session) });
                const submissionSubject = session?.sub || `anonymous:${sanitized.participantKey}`;
                if (!allowSubmission(submissionSubject)) {
                    replyJson(res, 429, { error: '짧은 시간에 저장된 테스트가 많습니다.' });
                    return true;
                }
                const response = await serializeAssignment(async () => {
                    const responseKey = `${RESPONSE_PREFIX}${sanitized.participantKey}`;
                    const previousRows = await repository.getRowsByKeys([responseKey]);
                    const previous = jsonParse(previousRows[0]?.value, null);
                    const previousHouse = cleanText(previous?.assignedHouseKey || previous?.houseId, 2).toUpperCase();
                    let assigned;
                    if (!session) {
                        if (previous?.memberVerified === true) return previous;
                        assigned = {
                            ...sanitized,
                            assignedHouseKey: '',
                            houseId: '',
                            houseAssignmentVersion: null
                        };
                    } else {
                        const current = await bootstrap();
                        const keepPreviousHouse = previous?.houseAssignmentVersion === HOUSE_ASSIGNMENT_VERSION
                            && Core.HOUSE_KEYS.includes(previousHouse);
                        const allocationCounts = { ...current.cohort.houseCounts };
                        if (!keepPreviousHouse && Core.HOUSE_KEYS.includes(previousHouse)) {
                            allocationCounts[previousHouse] = Math.max(0, Number(allocationCounts[previousHouse]) - 1);
                        }
                        const assignedHouseKey = keepPreviousHouse
                            ? previousHouse
                            : chooseLeastPopulatedHouse(allocationCounts, random);
                        assigned = {
                            ...sanitized,
                            assignedHouseKey,
                            houseId: assignedHouseKey,
                            houseAssignmentVersion: HOUSE_ASSIGNMENT_VERSION
                        };
                    }
                    const writes = [repository.upsertRows([{ key: responseKey, value: JSON.stringify(assigned) }])];
                    if (
                        session?.mid
                        && Core.HOUSE_KEYS.includes(assigned.assignedHouseKey)
                        && typeof crewartHouseService?.linkSurveyAssignment === 'function'
                    ) {
                        writes.push(crewartHouseService.linkSurveyAssignment(
                            session.mid,
                            assigned.assignedHouseKey,
                            assigned.participantKey
                        ));
                    }
                    await Promise.all(writes);
                    if (bootstrapCache) {
                        const cohort = bootstrapCache.value.cohort;
                        const alreadyCounted = cohort.identities.has(assigned.participantKey);
                        cohort.identities.add(assigned.participantKey);
                        if (!alreadyCounted) {
                            if (Core.HOUSE_KEYS.includes(assigned.assignedHouseKey)) {
                                cohort.houseCounts[assigned.assignedHouseKey] += 1;
                            }
                            if (assigned.timingStats.averageMs > Core.MIN_RESPONSE_MS
                                && assigned.timingStats.averageMs <= Core.MAX_RESPONSE_MS) {
                                cohort.rawTimingMedians.push(assigned.timingStats.averageMs);
                                cohort.rawTimingMedians = cohort.rawTimingMedians.slice(-TIMING_SAMPLE_LIMIT);
                                cohort.timingMedians = normalizeTimingMedians(cohort.rawTimingMedians);
                                cohort.rawTimingTotalMs += assigned.timingStats.averageMs;
                                cohort.timingSampleSize += 1;
                                cohort.timingAverageMs = Math.round(cohort.rawTimingTotalMs / cohort.timingSampleSize);
                            }
                            cohort.sampleSize += 1;
                        } else {
                            bootstrapCache = null;
                        }
                    }
                    return assigned;
                });
                replyJson(res, 201, {
                    saved: true,
                    memberVerified: response.memberVerified === true,
                    assignedHouseKey: Core.HOUSE_KEYS.includes(response.assignedHouseKey) ? response.assignedHouseKey : '',
                    houseId: Core.HOUSE_KEYS.includes(response.assignedHouseKey) ? response.assignedHouseKey : ''
                });
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
    HOUSE_ASSIGNMENT_VERSION,
    LEGACY_RESPONSES_KEY,
    REFERRAL_PREFIX,
    REFERRAL_MEMBER_PREFIX,
    REFERRAL_OWNER_PREFIX,
    RESPONSE_PREFIX,
    aggregateResponses,
    chooseLeastPopulatedHouse,
    createCrewartSurveyApi,
    normalizeTimingMedians,
    sanitizeManagedContent,
    sanitizeSubmission,
    summarizeReferrals
};

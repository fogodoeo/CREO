'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { SESSION_TYPE, signToken } = require('../band-membership');
const {
    CONTENT_KEY,
    CONTENT_UPDATED_KEY,
    LEGACY_RESPONSES_KEY,
    RESPONSE_PREFIX,
    createCrewartSurveyApi
} = require('../crewart-survey-api');
const Core = require('../public/crewart-survey-core');

const NOW = Date.parse('2026-08-01T00:00:00.000Z');
const SECRET = 'crewart-survey-session-secret-longer-than-thirty-two-characters';

class CapturedResponse {
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; }
    end(body = '') { this.body = String(body || ''); }
}

class FakeRepository {
    constructor(rows = {}) {
        this.rows = new Map(Object.entries(rows));
        this.namedReads = 0;
        this.prefixReads = 0;
        this.writes = [];
    }
    async getRowsByKeys(keys) {
        this.namedReads += 1;
        return keys.filter((key) => this.rows.has(key)).map((key) => ({ key, value: this.rows.get(key) }));
    }
    async listRowsByPrefix(prefix) {
        this.prefixReads += 1;
        return Array.from(this.rows, ([key, value]) => ({ key, value })).filter((row) => row.key.startsWith(prefix));
    }
    async upsertRows(rows) {
        this.writes.push(...rows);
        rows.forEach((row) => this.rows.set(row.key, row.value));
    }
}

function request(method, body = '', headers = {}) {
    const req = Readable.from(body ? [Buffer.from(body)] : []);
    req.method = method;
    req.headers = { host: 'creok.example.com', ...headers };
    req.socket = { remoteAddress: '127.0.0.1' };
    return req;
}

function memberToken() {
    return signToken({
        typ: SESSION_TYPE,
        sub: 'member_random_session_subject',
        iat: Math.floor(NOW / 1000),
        exp: Math.floor(NOW / 1000) + 3600
    }, SECRET);
}

function validSubmission() {
    return {
        participantKey: 'a'.repeat(24),
        creMbti: 'ESTJ',
        crebtiType: 'ESTJ',
        knownMbti: 'INFP',
        axisScores: { E: 5, I: 0, S: 5, N: 0, T: 5, F: 0, J: 5, P: 0 },
        assignedHouseKey: 'ST',
        houseId: 'ST',
        answers: Array(20).fill(0),
        answerLabels: Core.QUESTIONS.map((question) => ({
            questionId: question.id,
            axis: question.axis,
            displayedPosition: 1,
            score: question.scores[0],
            responseMs: 1800,
            timingValid: true,
            label: '서버에 저장하면 안 되는 선택지 원문'
        })),
        timingStats: {
            validCount: 20,
            totalMs: 36000,
            averageMs: 1800,
            medianMs: 1800,
            axisMedians: { EI: 1800, SN: 1800, TF: 1800, JP: 1800 },
            style: 'instinct'
        },
        questionVersion: Core.SURVEY_VERSION,
        createdAt: '2026-08-01T00:00:00.000Z',
        bandProfileName: '저장하면 안 되는 이름',
        phone: '01012345678'
    };
}

test('bootstrap returns version-matched content and aggregate data only', async () => {
    const managed = { version: Core.SURVEY_VERSION, questions: [{ id: 'Q01', q: '관리 문항' }] };
    const legacy = [{
        participantKey: 'legacy-person', questionVersion: Core.SURVEY_VERSION,
        assignedHouseKey: 'NT', timingStats: { medianMs: 2400 }, name: '비공개 이름'
    }];
    const repository = new FakeRepository({
        [CONTENT_KEY]: JSON.stringify(managed),
        [CONTENT_UPDATED_KEY]: '2026-08-01T00:00:00.000Z',
        [LEGACY_RESPONSES_KEY]: JSON.stringify(legacy),
        [`${RESPONSE_PREFIX}${'b'.repeat(24)}`]: JSON.stringify({
            participantKey: 'new-person', questionVersion: Core.SURVEY_VERSION,
            assignedHouseKey: 'SF', timingStats: { medianMs: 1800 }, bandProfileName: '숨길 이름', answers: [0, 1]
        }),
        [`${RESPONSE_PREFIX}${'c'.repeat(24)}`]: JSON.stringify({
            participantKey: 'old-version', questionVersion: 'cre-mbti-v1.0',
            assignedHouseKey: 'NT', timingStats: { medianMs: 1000 }
        })
    });
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        now: () => NOW
    });
    const response = new CapturedResponse();
    await api.handle(
        request('GET'), response,
        new URL('https://creok.example.com/api/crewart-survey/bootstrap')
    );
    assert.equal(response.status, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.content.version, Core.SURVEY_VERSION);
    assert.deepEqual(payload.cohort.houseCounts, { SF: 1, ST: 0, NT: 1, NF: 0 });
    assert.deepEqual(payload.cohort.timingMedians, [2400, 1800]);
    assert.equal(payload.cohort.sampleSize, 2);
    assert.equal(response.body.includes('비공개 이름'), false);
    assert.equal(response.body.includes('숨길 이름'), false);
    assert.equal(response.body.includes('answers'), false);

    const cached = new CapturedResponse();
    await api.handle(
        request('GET'), cached,
        new URL('https://creok.example.com/api/crewart-survey/bootstrap')
    );
    assert.equal(repository.namedReads, 1);
    assert.equal(repository.prefixReads, 1);
});

test('old managed question versions cannot override the deployed questionnaire', async () => {
    const repository = new FakeRepository({
        [CONTENT_KEY]: JSON.stringify({ version: 'cre-mbti-v1.0', questions: [{ id: 'Q01', q: '오래된 문항' }] })
    });
    const api = createCrewartSurveyApi({ repository, bandMembership: { config: { sessionSecret: SECRET } }, now: () => NOW });
    const payload = await api.bootstrap();
    assert.equal(payload.content, null);
    assert.equal(payload.contentUpdatedAt, null);
});

test('question content management requires admin auth and stores copy-only fields', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        now: () => NOW
    });
    const contentUrl = new URL('https://creok.example.com/api/crewart-survey/content');

    const unauthorized = new CapturedResponse();
    await api.handle(request('GET'), unauthorized, contentUrl);
    assert.equal(unauthorized.status, 401);

    const defaults = new CapturedResponse();
    await api.handle(request('GET', '', { 'x-creo-admin': 'secret' }), defaults, contentUrl);
    assert.equal(defaults.status, 200);
    const defaultPayload = JSON.parse(defaults.body);
    assert.equal(defaultPayload.usingDefaults, true);
    assert.equal(defaultPayload.content.questions.length, 20);

    const edited = {
        version: Core.SURVEY_VERSION,
        questions: Core.QUESTIONS.map((question, index) => ({
            id: question.id,
            label: question.label,
            q: index === 0 ? '관리자가 수정한 질문' : question.q,
            options: question.options,
            scores: ['X', 'Y'],
            axis: 'XX'
        }))
    };
    const saved = new CapturedResponse();
    await api.handle(request('PUT', JSON.stringify({ content: edited }), { 'x-creo-admin': 'secret' }), saved, contentUrl);
    assert.equal(saved.status, 200);
    assert.equal(repository.writes.length, 2);
    const stored = JSON.parse(repository.rows.get(CONTENT_KEY));
    assert.equal(stored.questions[0].q, '관리자가 수정한 질문');
    assert.deepEqual(Object.keys(stored.questions[0]).sort(), ['id', 'label', 'options', 'q']);
    assert.equal(repository.rows.get(CONTENT_UPDATED_KEY), '2026-08-01T00:00:00.000Z');
    assert.equal((await api.bootstrap()).content.questions[0].q, '관리자가 수정한 질문');

    const duplicate = structuredClone(edited);
    duplicate.questions[1].id = duplicate.questions[0].id;
    const rejected = new CapturedResponse();
    await api.handle(request('PUT', JSON.stringify({ content: duplicate }), { 'x-creo-admin': 'secret' }), rejected, contentUrl);
    assert.equal(rejected.status, 422);
});

test('response storage requires a valid BAND session and strips personal fields', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        now: () => NOW
    });
    const unauthorized = new CapturedResponse();
    await api.handle(
        request('POST', JSON.stringify({ response: validSubmission() })),
        unauthorized,
        new URL('https://creok.example.com/api/crewart-survey/responses')
    );
    assert.equal(unauthorized.status, 401);

    const accepted = new CapturedResponse();
    const acceptedSubmission = validSubmission();
    acceptedSubmission.timingStats = {
        validCount: 0,
        totalMs: 0,
        averageMs: 0,
        medianMs: 30000,
        axisMedians: { EI: 30000, SN: 30000, TF: 30000, JP: 30000 },
        style: 'deliberate'
    };
    acceptedSubmission.answerLabels[0].timingValid = false;
    await api.handle(
        request('POST', JSON.stringify({ response: acceptedSubmission }), {
            authorization: `Bearer ${memberToken()}`,
            origin: 'https://creok.example.com'
        }),
        accepted,
        new URL('https://creok.example.com/api/crewart-survey/responses')
    );
    assert.equal(accepted.status, 201);
    assert.equal(repository.writes.length, 1);
    assert.equal(repository.writes[0].key, `${RESPONSE_PREFIX}${'a'.repeat(24)}`);
    const stored = JSON.parse(repository.writes[0].value);
    assert.equal(stored.memberVerified, true);
    assert.equal(stored.anonymous, true);
    assert.equal('bandProfileName' in stored, false);
    assert.equal('phone' in stored, false);
    assert.equal('surveySessionId' in stored, false);
    assert.equal('label' in stored.answerLabels[0], false);
    assert.equal(repository.writes[0].value.includes('member_random_session_subject'), false);
    assert.equal(stored.timingStats.validCount, 20);
    assert.equal(stored.timingStats.medianMs, 1800);
    assert.equal(stored.timingStats.style, 'instinct');
    assert.equal(stored.answerLabels[0].timingValid, true);
});

test('tampered result codes are rejected before storage', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({ repository, bandMembership: { config: { sessionSecret: SECRET } }, now: () => NOW });
    const submission = validSubmission();
    submission.creMbti = 'ENTJ';
    const response = new CapturedResponse();
    await api.handle(
        request('POST', JSON.stringify({ response: submission }), { authorization: `Bearer ${memberToken()}` }),
        response,
        new URL('https://creok.example.com/api/crewart-survey/responses')
    );
    assert.equal(response.status, 422);
    assert.equal(repository.writes.length, 0);
});

test('tampered question identities and score totals are rejected', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({ repository, bandMembership: { config: { sessionSecret: SECRET } }, now: () => NOW });
    const submission = validSubmission();
    submission.answerLabels[0].questionId = submission.answerLabels[1].questionId;
    const response = new CapturedResponse();
    await api.handle(
        request('POST', JSON.stringify({ response: submission }), { authorization: `Bearer ${memberToken()}` }),
        response,
        new URL('https://creok.example.com/api/crewart-survey/responses')
    );
    assert.equal(response.status, 422);
    assert.equal(repository.writes.length, 0);
});

test('resubmitting one participant replaces the row without double-counting the cohort', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        now: () => NOW
    });
    assert.equal((await api.bootstrap()).cohort.sampleSize, 0);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = new CapturedResponse();
        await api.handle(
            request('POST', JSON.stringify({ response: validSubmission() }), {
                authorization: `Bearer ${memberToken()}`,
                origin: 'https://creok.example.com'
            }),
            response,
            new URL('https://creok.example.com/api/crewart-survey/responses')
        );
        assert.equal(response.status, 201);
    }
    assert.equal(repository.rows.size, 1);
    assert.equal((await api.bootstrap()).cohort.sampleSize, 1);
});

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
    chooseLeastPopulatedHouse,
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
    async deleteRow(key) {
        this.rows.delete(key);
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
    const prepared = Core.prepareQuestions(() => 0.42);
    const target = 'ESTJ';
    const answers = prepared.map(question => {
        const targetLetters = [question.axis, question.secondaryAxis]
            .map(axis => target[Core.AXES.indexOf(axis)]);
        const values = question.optionScores.map(score => targetLetters.reduce((sum, letter, axisIndex) => {
            const axis = axisIndex === 0 ? question.axis : question.secondaryAxis;
            const opposite = axis[0] === letter ? axis[1] : axis[0];
            return sum + score[letter] - score[opposite];
        }, 0));
        return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
    });
    const calculated = Core.scoreAnswers(prepared, answers);
    assert.equal(calculated.code, target);
    const axisScores = calculated.letters;
    const totalMs = Core.QUESTIONS.length * 3200;
    return {
        participantKey: 'a'.repeat(24),
        creMbti: calculated.code,
        crebtiType: calculated.code,
        knownMbti: 'INFP',
        axisScores,
        answers,
        answerLabels: prepared.map((question, index) => {
            const choice = answers[index];
            const letters = Core.answerLetters(question, choice);
            return {
                questionId: question.id,
                axis: question.axis,
                secondaryAxis: question.secondaryAxis,
                choiceId: question.optionIds[choice],
                displayedPosition: choice + 1,
                score: letters[0] || '',
                secondaryScore: letters[1] || '',
                signalScores: Core.answerScoreMap(question, choice),
                responseMs: 3200,
                timingValid: true,
                label: '서버에 저장하면 안 되는 선택지 원문'
            };
        }),
        timingStats: {
            validCount: Core.QUESTIONS.length,
            totalMs,
            averageMs: 3200,
            medianMs: 3200,
            axisMedians: { EI: 3200, SN: 3200, TF: 3200, JP: 3200 },
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
        assignedHouseKey: 'NT', timingStats: { medianMs: 3400 }, name: '비공개 이름'
    }];
    const repository = new FakeRepository({
        [CONTENT_KEY]: JSON.stringify(managed),
        [CONTENT_UPDATED_KEY]: '2026-08-01T00:00:00.000Z',
        [LEGACY_RESPONSES_KEY]: JSON.stringify(legacy),
        [`${RESPONSE_PREFIX}${'b'.repeat(24)}`]: JSON.stringify({
            participantKey: 'new-person', questionVersion: Core.SURVEY_VERSION,
            assignedHouseKey: 'SF', timingStats: { medianMs: 3200 }, bandProfileName: '숨길 이름', answers: [0, 1]
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
    assert.deepEqual(payload.cohort.timingMedians, [3400, 3200]);
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
    assert.equal(defaultPayload.content.questions.length, Core.QUESTIONS.length);

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
    assert.equal(Core.HOUSE_KEYS.includes(stored.assignedHouseKey), true);
    assert.equal(JSON.parse(accepted.body).assignedHouseKey, stored.assignedHouseKey);
    assert.equal(stored.anonymous, true);
    assert.equal('bandProfileName' in stored, false);
    assert.equal('phone' in stored, false);
    assert.equal('surveySessionId' in stored, false);
    assert.equal('label' in stored.answerLabels[0], false);
    assert.equal(repository.writes[0].value.includes('member_random_session_subject'), false);
    assert.equal(stored.timingStats.validCount, Core.QUESTIONS.length);
    assert.equal(stored.timingStats.medianMs, 3200);
    assert.equal(stored.timingStats.style, 'balanced');
    assert.equal(stored.answerLabels[0].timingValid, true);
});

test('thoughtful mobile responses remain valid for up to ninety seconds per question', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        now: () => NOW
    });
    const submission = validSubmission();
    submission.answerLabels.forEach((answer) => { answer.responseMs = 60000; });
    const response = new CapturedResponse();
    await api.handle(
        request('POST', JSON.stringify({ response: submission }), {
            authorization: `Bearer ${memberToken()}`,
            origin: 'https://creok.example.com'
        }),
        response,
        new URL('https://creok.example.com/api/crewart-survey/responses')
    );
    assert.equal(response.status, 201);
    const stored = JSON.parse(repository.writes[0].value);
    assert.equal(stored.timingStats.validCount, Core.QUESTIONS.length);
    assert.equal(stored.timingStats.medianMs, 60000);
    assert.equal(stored.answerLabels.every((answer) => answer.timingValid), true);
});

test('house assignment targets the smallest cohort and randomizes only equal minima', () => {
    assert.equal(chooseLeastPopulatedHouse({ SF: 8, ST: 2, NT: 2, NF: 5 }, () => 0), 'ST');
    assert.equal(chooseLeastPopulatedHouse({ SF: 8, ST: 2, NT: 2, NF: 5 }, () => 0.999), 'NT');
    assert.equal(chooseLeastPopulatedHouse({ SF: 0, ST: 0, NT: 0, NF: 0 }, () => 0.51), 'NT');
});

test('concurrent members are serialized into the least populated houses', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        now: () => NOW,
        random: () => 0
    });
    const submissions = Core.HOUSE_KEYS.map((_, index) => {
        const submission = validSubmission();
        submission.participantKey = String(index + 1).repeat(24);
        submission.assignedHouseKey = 'SF';
        submission.houseId = 'SF';
        const response = new CapturedResponse();
        return api.handle(
            request('POST', JSON.stringify({ response: submission }), { authorization: `Bearer ${memberToken()}` }),
            response,
            new URL('https://creok.example.com/api/crewart-survey/responses')
        ).then(() => response);
    });
    const responses = await Promise.all(submissions);
    assert.deepEqual(responses.map(response => JSON.parse(response.body).assignedHouseKey), Core.HOUSE_KEYS);
    assert.deepEqual((await api.bootstrap()).cohort.houseCounts, { SF: 1, ST: 1, NT: 1, NF: 1 });
});

test('responses faster than the three-second reading lock are rejected', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        now: () => NOW
    });
    const submission = validSubmission();
    submission.answerLabels[0].responseMs = Core.MIN_RESPONSE_MS - 1;
    const response = new CapturedResponse();
    await api.handle(
        request('POST', JSON.stringify({ response: submission }), { authorization: `Bearer ${memberToken()}` }),
        response,
        new URL('https://creok.example.com/api/crewart-survey/responses')
    );
    assert.equal(response.status, 422);
    assert.match(JSON.parse(response.body).error, /최소 3초/);
    assert.equal(repository.writes.length, 0);
});

test('only an administrator can clear survey responses without deleting question content', async () => {
    const responseKey = `${RESPONSE_PREFIX}${'d'.repeat(24)}`;
    const repository = new FakeRepository({
        [CONTENT_KEY]: JSON.stringify({ version: Core.SURVEY_VERSION, questions: [] }),
        [LEGACY_RESPONSES_KEY]: JSON.stringify([{ participantKey: 'legacy' }]),
        [responseKey]: JSON.stringify({ participantKey: 'd'.repeat(24) })
    });
    const api = createCrewartSurveyApi({
        repository,
        bandMembership: { config: { sessionSecret: SECRET } },
        isAdmin: async (req) => req.headers['x-creo-admin'] === 'secret',
        now: () => NOW
    });
    const url = new URL('https://creok.example.com/api/crewart-survey/responses');
    const unauthorized = new CapturedResponse();
    await api.handle(request('DELETE'), unauthorized, url);
    assert.equal(unauthorized.status, 401);
    assert.equal(repository.rows.has(responseKey), true);

    const cleared = new CapturedResponse();
    await api.handle(request('DELETE', '', { 'x-creo-admin': 'secret' }), cleared, url);
    assert.equal(cleared.status, 200);
    assert.deepEqual(JSON.parse(cleared.body), { cleared: true, deleted: 1 });
    assert.equal(repository.rows.has(responseKey), false);
    assert.equal(repository.rows.has(LEGACY_RESPONSES_KEY), false);
    assert.equal(repository.rows.has(CONTENT_KEY), true);
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

test('unknown stable choice ids are rejected before score storage', async () => {
    const repository = new FakeRepository();
    const api = createCrewartSurveyApi({ repository, bandMembership: { config: { sessionSecret: SECRET } }, now: () => NOW });
    const submission = validSubmission();
    submission.answerLabels[0].choiceId = 'Q01-99';
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

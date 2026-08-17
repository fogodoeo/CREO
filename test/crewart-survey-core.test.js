'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Core = require('../public/crewart-survey-core');

const specPath = path.join(__dirname, '../public/crewart-survey-questions-v29.json');
const resultsSpecPath = path.join(__dirname, '../public/crewart-survey-results-v28.json');
if (fs.existsSync(specPath)) {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    if (fs.existsSync(resultsSpecPath)) {
        spec.results = JSON.parse(fs.readFileSync(resultsSpecPath, 'utf8'));
    }
    Core.applyQuestionnaireSpec(spec);
}

test('questionnaire spec has balanced four-choice scenarios', () => {
    const spec = Core.getQuestionnaireSpec();
    assert.equal(Core.SURVEY_VERSION, spec.version);
    assert.equal(Core.QUESTIONS.length, spec.questions.length);
    assert.equal(Core.QUESTIONS[0].id, 'Q01');
    assert.equal(new Set(Core.QUESTIONS.map(question => question.id)).size, Core.QUESTIONS.length);

    const primaryCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    const secondaryCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    for (const question of Core.QUESTIONS) {
        assert.ok(question.label.length <= 40);
        assert.ok(question.q.length >= 30 && question.q.length <= 80, 'Question length out of range 30..80');
        assert.equal(question.options.length, 4);
        assert.equal(question.optionIds.length, 4);
        assert.equal(question.optionScores.length, 4);
        assert.equal(question.scorePairs.length, 4);
        assert.equal(question.secondaryAxis.length, 2);
        primaryCounts[question.axis] += 1;
        secondaryCounts[question.secondaryAxis] += 1;
        assert.equal(new Set(question.options).size, 4);
        assert.equal(new Set(question.optionIds).size, 4);
        question.optionScores.forEach((score, index) => {
            assert.deepEqual(Object.keys(score).sort(), [...question.axis, ...question.secondaryAxis].sort());
            assert.equal(score[question.axis[0]] + score[question.axis[1]], Core.PRIMARY_SIGNAL_POINTS);
            assert.equal(score[question.secondaryAxis[0]] + score[question.secondaryAxis[1]], Core.SECONDARY_SIGNAL_POINTS);
            const totalSignal = Core.answerSignals(question, index).reduce((sum, signal) => sum + signal.points, 0);
            assert.equal(totalSignal, Core.PRIMARY_SIGNAL_POINTS + Core.SECONDARY_SIGNAL_POINTS);
        });
    }
    const primaryExpected = Number(spec.scoring.primaryQuestionsPerAxis) || 0;
    const secondaryExpected = Number(spec.scoring.secondaryQuestionsPerAxis) || 0;
    assert.deepEqual(Object.values(primaryCounts), Object.values(primaryCounts).map(() => primaryExpected));
    assert.deepEqual(Object.values(secondaryCounts), Object.values(secondaryCounts).map(() => secondaryExpected));
});

test('choices avoid direct MBTI answer-key language and narrow auction context', () => {
    const loaded = /정답|객관적|합리적|감정적|충동|대충|무조건|옳은|더 좋은/;
    const revealing = /외향|내향|감각형|직관형|사고형|감정형|판단형|인식형|계획적|즉흥적/;
    const narrowContext = /낙찰|브리딩|컬렉션|최대 금액/;
    const forcedLegacyScene = /정식 이름표|단 한 장 남긴다면|답할 순서를 정해|우리 사이의 다음 장면|마감 숫자가 내려|계속 바꿔간다|나중에 생각나는 한마디|이제 내 차례/;
    for (const question of Core.QUESTIONS) {
        const copy = [question.label, question.q, ...question.options].join(' ');
        assert.equal(loaded.test(copy), false, `Loaded pattern match in ${question.id}`);
        assert.equal(revealing.test(copy), false, `Revealing pattern match in ${question.id}`);
        assert.equal(narrowContext.test(copy), false, `Narrow context match in ${question.id}`);
        assert.equal(forcedLegacyScene.test(copy), false, `Forced legacy scene match in ${question.id}`);
        assert.ok(question.options.every(option => option.length >= 15 && option.length <= 32), 'Option length out of range');
    }
});

test('questionnaire uses recognizable 2026 Korean keeper contexts', () => {
    const copy = Core.QUESTIONS.map(question => [question.q, ...question.options].join(' ')).join(' ');
    ['밴드 경매', '파충류 박람회', '단체방', '카톡', '해칭', '성장 기록'].forEach(context => {
        assert.match(copy, new RegExp(context));
    });
});

test('prepared surveys keep option ids and graded score maps aligned while shuffling', () => {
    let state = 123456789;
    const rng = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    const firstQuestionIds = new Set();
    for (let run = 0; run < 100; run += 1) {
        const prepared = Core.prepareQuestions(rng);
        assert.equal(prepared.length, Core.QUESTIONS.length);
        firstQuestionIds.add(prepared[0].id);
        prepared.forEach((question, index) => {
            if (index > 0) assert.notEqual(question.axis, prepared[index - 1].axis);
            assert.notDeepEqual(question.optionIds, Core.QUESTIONS.find(item => item.id === question.id).optionIds);
            question.options.forEach((option, choice) => {
                assert.ok(option);
                const source = Core.QUESTIONS.find(item => item.id === question.id);
                const sourceChoice = source.optionIds.indexOf(question.optionIds[choice]);
                assert.ok(sourceChoice >= 0);
                assert.equal(option, source.options[sourceChoice]);
                assert.deepEqual(question.optionScores[choice], source.optionScores[sourceChoice]);
                assert.deepEqual(Core.answerScoreMap(question, choice), source.optionScores[sourceChoice]);
            });
        });
    }
    assert.ok(firstQuestionIds.size > 1, 'the first question should vary between survey runs');
    assert.ok([...firstQuestionIds].some(id => id !== 'Q01'), 'Q01 should not be pinned to the first position');
});

test('weighted scoring keeps all sixteen intended profiles reachable', () => {
    let states = new Map([['0,0,0,0', []]]);
    Core.QUESTIONS.forEach(question => {
        const next = new Map();
        for (const [key, answers] of states) {
            const differences = key.split(',').map(Number);
            question.optionScores.forEach((score, choice) => {
                const updated = differences.map((difference, index) => {
                    const axis = Core.AXES[index];
                    return difference + (Number(score[axis[0]]) || 0) - (Number(score[axis[1]]) || 0);
                });
                const updatedKey = updated.join(',');
                if (!next.has(updatedKey)) next.set(updatedKey, [...answers, choice]);
            });
        }
        states = next;
    });

    const answersByType = new Map();
    for (const [key, answers] of states) {
        const code = key.split(',').map((difference, index) => (
            Number(difference) > 0 ? Core.AXES[index][0] : Core.AXES[index][1]
        )).join('');
        if (!answersByType.has(code)) answersByType.set(code, answers);
    }
    for (const target of Core.MBTI_TYPES) {
        assert.ok(answersByType.has(target), `${target} must remain reachable`);
        const result = Core.scoreAnswers(Core.QUESTIONS, answersByType.get(target));
        assert.equal(result.code, target);
        Core.AXES.forEach(axis => {
            assert.equal(result.letters[axis[0]] + result.letters[axis[1]], Core.AXIS_SCORE_TOTAL);
        });
    }
});

test('differential supporting axis model maintains signal distribution and pole invariants', () => {
    assert.equal(Core.AXIS_SCORE_TOTAL % 2, 1, 'each axis total must be odd so a score tie is impossible');
    for (const question of Core.QUESTIONS) {
        const primaryPair = question.axis;
        const secondaryPair = question.secondaryAxis;
        question.optionScores.forEach((score, choice) => {
            const secLeft = Number(score[secondaryPair[0]]) || 0;
            const secRight = Number(score[secondaryPair[1]]) || 0;
            assert.equal(secLeft + secRight, Core.SECONDARY_SIGNAL_POINTS);
            assert.ok(secLeft > 0 || secRight > 0);
        });
    }
});

test('uniform random choices do not structurally favor either MBTI pole', () => {
    let state = 0x1a2b3c4d;
    const rng = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    const leftCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    const runs = 50000;
    for (let run = 0; run < runs; run += 1) {
        const answers = Core.QUESTIONS.map(() => Math.floor(rng() * 4));
        const result = Core.scoreAnswers(Core.QUESTIONS, answers);
        Core.AXES.forEach((axis, index) => {
            if (result.code[index] === axis[0]) leftCounts[axis] += 1;
        });
    }
    Core.AXES.forEach(axis => {
        const leftRatio = leftCounts[axis] / runs;
        assert.ok(leftRatio >= 0.48 && leftRatio <= 0.52, `${axis} left-pole ratio ${leftRatio} is structurally biased`);
    });
});

test('house assignments use the unified RGBY team names', () => {
    assert.deepEqual(
        Core.HOUSE_KEYS.map(key => ({ key, name: Core.HOUSE_META[key].name, seal: Core.HOUSE_META[key].seal })),
        [
            { key: 'SF', name: 'RED', seal: 'R' },
            { key: 'ST', name: 'GREEN', seal: 'G' },
            { key: 'NT', name: 'BLUE', seal: 'B' },
            { key: 'NF', name: 'YELLOW', seal: 'Y' }
        ]
    );
});

test('usual type comparison identifies each matching and changed axis', () => {
    const comparison = Core.buildMbtiComparison('ISTJ', 'ISFJ');
    assert.equal(comparison.knownType, 'ISTJ');
    assert.equal(comparison.creType, 'ISFJ');
    assert.equal(comparison.sameCount, 3);
    assert.deepEqual(comparison.changes.map(change => ({ axis: change.axis, from: change.from, to: change.to })), [
        { axis: 'TF', from: 'T', to: 'F' }
    ]);
});

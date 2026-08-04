'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/crewart-survey-core');

test('v12.3 questionnaire has twelve balanced four-choice scenarios', () => {
    assert.equal(Core.SURVEY_VERSION, 'crewart-tendency-v12.3-balanced-3to2');
    assert.equal(Core.QUESTIONS.length, 12);
    assert.equal(Core.QUESTIONS[0].id, 'Q01');
    assert.equal(new Set(Core.QUESTIONS.map(question => question.id)).size, 12);

    const primaryCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    const secondaryCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    for (const question of Core.QUESTIONS) {
        assert.ok(question.label.length <= 40);
        assert.ok(question.q.length <= 80);
        assert.equal(question.options.length, 4);
        assert.equal(question.scores.length, 4);
        assert.equal(question.scorePairs.length, 4);
        assert.equal(question.scoreWeights.length, 4);
        assert.equal(question.secondaryAxis.length, 2);
        primaryCounts[question.axis] += 1;
        secondaryCounts[question.secondaryAxis] += 1;
        assert.equal(new Set(question.options).size, 4);
        question.scorePairs.forEach((pair, index) => {
            assert.deepEqual(pair, Object.keys({ [pair[0]]: 1, [pair[1]]: 1 }));
            assert.ok(question.axis.includes(pair[0]));
            assert.ok(question.secondaryAxis.includes(pair[1]));
            assert.equal(question.scores[index], pair[0]);
            assert.deepEqual(question.scoreWeights[index], [3, 2]);
        });
    }
    assert.deepEqual(primaryCounts, { EI: 3, SN: 3, TF: 3, JP: 3 });
    assert.deepEqual(secondaryCounts, { EI: 3, SN: 3, TF: 3, JP: 3 });
});

test('choices avoid direct MBTI answer-key language and narrow auction context', () => {
    const loaded = /정답|객관적|합리적|감정적|충동|대충|무조건|옳은|더 좋은/;
    const revealing = /외향|내향|감각형|직관형|사고형|감정형|판단형|인식형|계획적|즉흥적/;
    const narrowContext = /경매|낙찰|브리딩|컬렉션|최대 금액/;
    for (const question of Core.QUESTIONS) {
        const copy = [question.label, question.q, ...question.options].join(' ');
        assert.equal(loaded.test(copy), false);
        assert.equal(revealing.test(copy), false);
        assert.equal(narrowContext.test(copy), false);
        assert.ok(question.options.every(option => option.length >= 10 && option.length <= 60));
    }
});

test('prepared surveys keep options, score pairs, weights, and Q01 first', () => {
    let state = 123456789;
    const rng = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    for (let run = 0; run < 100; run += 1) {
        const prepared = Core.prepareQuestions(rng);
        assert.equal(prepared.length, 12);
        assert.equal(prepared[0].id, 'Q01');
        prepared.forEach((question, index) => {
            if (index > 0) assert.notEqual(question.axis, prepared[index - 1].axis);
            question.options.forEach((option, choice) => {
                assert.ok(option);
                assert.ok(question.scorePairs[choice].includes(question.scores[choice]));
                assert.deepEqual(question.scoreWeights[choice], [3, 2]);
            });
        });
    }
});

test('weighted scoring recovers all sixteen intended profiles', () => {
    const prepared = Core.prepareQuestions(() => 0.42);
    assert.equal(prepared[0].id, 'Q01');
    for (const target of Core.MBTI_TYPES) {
        const answers = prepared.map(question => question.scorePairs.findIndex(pair => (
            pair[0] === target[Core.AXES.indexOf(question.axis)]
            && pair[1] === target[Core.AXES.indexOf(question.secondaryAxis)]
        )));
        assert.ok(answers.every(answer => answer >= 0));
        const result = Core.scoreAnswers(prepared, answers);
        assert.equal(result.code, target);
        assert.deepEqual(Object.values(result.letters).filter(Number.isFinite).sort((a, b) => a - b), [0, 0, 0, 0, 15, 15, 15, 15]);
    }
});

test('secondary signals can influence an axis when primary evidence is close', () => {
    const prepared = Core.prepareQuestions(() => 0.2);
    const target = prepared.find(question => question.axis === 'EI' && question.secondaryAxis === 'JP');
    assert.ok(target);
    const choice = target.scorePairs.findIndex(pair => pair[0] === 'E' && pair[1] === 'J');
    const signals = Core.answerSignals(target, choice);
    assert.deepEqual(signals, [{ letter: 'E', points: 3 }, { letter: 'J', points: 2 }]);
});

test('house assignment follows the result SN and TF combination', () => {
    const prepared = Core.prepareQuestions(() => 0.2);
    const answers = prepared.map(question => question.scorePairs.findIndex(pair => pair[0] === question.axis[0] && pair[1] === question.secondaryAxis[0]));
    const result = Core.scoreAnswers(prepared, answers);
    assert.equal(Core.chooseTendencyHouse(result), 'ST');
    assert.equal(Core.chooseTendencyHouse({ code: 'ENFJ' }), 'NF');
    assert.equal(Core.chooseTendencyHouse({ code: 'INTJ' }), 'NT');
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

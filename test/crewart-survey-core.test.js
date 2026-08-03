'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/crewart-survey-core');

test('v9 questionnaire is ten scenarios with four balanced action choices', () => {
    assert.equal(Core.SURVEY_VERSION, 'crewart-tendency-v9.0');
    assert.equal(Core.QUESTIONS.length, 10);
    assert.equal(Core.QUESTIONS[0].id, 'Q01');
    assert.equal(new Set(Core.QUESTIONS.map(question => question.id)).size, 10);

    const axisCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    for (const question of Core.QUESTIONS) {
        assert.ok(question.label.length <= 40);
        assert.ok(question.q.length <= 80);
        assert.equal(question.options.length, 4);
        assert.equal(question.scores.length, 4);
        assert.equal(question.scorePairs.length, 4);
        assert.equal(question.secondaryAxis.length, 2);
        axisCounts[question.axis] += 1;
        axisCounts[question.secondaryAxis] += 1;
        assert.equal(new Set(question.options).size, 4);
        question.scorePairs.forEach((pair, index) => {
            assert.equal(pair.length, 2);
            assert.ok(question.axis.includes(pair[0]));
            assert.ok(question.secondaryAxis.includes(pair[1]));
            assert.equal(question.scores[index], pair[0]);
        });
        assert.equal('image' in question, false);
    }
    assert.deepEqual(axisCounts, { EI: 5, SN: 5, TF: 5, JP: 5 });
});

test('choices avoid obvious answer-key language and narrow auction context', () => {
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

test('prepared surveys keep options and score pairs aligned and start with Q01', () => {
    let state = 123456789;
    const rng = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    for (let run = 0; run < 100; run += 1) {
        const prepared = Core.prepareQuestions(rng);
        assert.equal(prepared.length, 10);
        assert.equal(prepared[0].id, 'Q01');
        prepared.forEach((question, index) => {
            if (index > 0) assert.notEqual(question.axis, prepared[index - 1].axis);
            assert.equal(question.options.length, 4);
            question.options.forEach((option, choice) => {
                assert.ok(option);
                assert.ok(question.scorePairs[choice].includes(question.scores[choice]));
            });
        });
    }
});

test('scoring recovers all sixteen intended profiles from four-choice answers', () => {
    const prepared = Core.prepareQuestions(() => 0.42);
    assert.equal(prepared[0].id, 'Q01');
    for (const target of Core.MBTI_TYPES) {
        const answers = prepared.map(question => question.scorePairs.findIndex(pair => pair[0] === target[Core.AXES.indexOf(question.axis)] && pair[1] === target[Core.AXES.indexOf(question.secondaryAxis)]));
        assert.ok(answers.every(answer => answer >= 0));
        assert.equal(Core.scoreAnswers(prepared, answers).code, target);
    }
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

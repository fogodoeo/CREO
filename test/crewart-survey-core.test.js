'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/crewart-survey-core');

test('v7 questionnaire covers five distinct facets on every axis', () => {
    assert.equal(Core.SURVEY_VERSION, 'crewart-tendency-v7.0');
    assert.equal(Core.QUESTIONS.length, 20);
    assert.equal(new Set(Core.QUESTIONS.map((question) => question.id)).size, 20);
    for (const axis of Core.AXES) {
        const questions = Core.QUESTIONS.filter((question) => question.axis === axis);
        assert.equal(questions.length, 5);
        assert.equal(new Set(questions.map((question) => question.facet)).size, 5);
    }
});
test('paired choices have symmetric structure and avoid loaded pole wording', () => {
    const loaded = /정답|객관적|합리적|감정적|충동|대충|무조건|옳은|더 좋은/;
    const revealing = /외향|내향|감각형|직관형|사고형|감정형|판단형|인식형|계획적|즉흥적|유연하게|혼자|사람들과|가능성|근거/;
    const narrowContext = /경매|낙찰|브리딩|컬렉션|최대 금액/;
    for (const question of Core.QUESTIONS) {
        assert.equal(question.options.length, 2);
        assert.equal(question.scores.length, 2);
        assert.deepEqual([...question.scores].sort(), [...question.axis].sort());
        assert.ok(question.options.every((option) => option.length >= 10 && option.length <= 32));
        assert.ok(Math.abs(question.options[0].length - question.options[1].length) <= 6);
        assert.equal(question.options.some((option) => loaded.test(option)), false);
        assert.equal([question.label, question.q, ...question.options].some((copy) => revealing.test(copy)), false);
        assert.equal([question.label, question.q, ...question.options].some((copy) => narrowContext.test(copy)), false);
        assert.equal('image' in question, false);
    }
    const optionCopy = Core.QUESTIONS.flatMap(question => question.options).join(' ');
    assert.ok((optionCopy.match(/순서/g) || []).length <= 1, 'one repeated surface cue must not reveal the JP key');
});

test('every pole wins exactly half of all possible answer patterns on its axis', () => {
    for (const axis of Core.AXES) {
        const questions = Core.QUESTIONS.filter((question) => question.axis === axis);
        const wins = { [axis[0]]: 0, [axis[1]]: 0 };
        for (let pattern = 0; pattern < 2 ** questions.length; pattern += 1) {
            const counts = { [axis[0]]: 0, [axis[1]]: 0 };
            questions.forEach((question, index) => {
                counts[question.scores[(pattern >> index) & 1]] += 1;
            });
            wins[counts[axis[0]] > counts[axis[1]] ? axis[0] : axis[1]] += 1;
        }
        assert.deepEqual(wins, { [axis[0]]: 16, [axis[1]]: 16 });
    }
});

test('prepared surveys balance option positions within each axis', () => {
    let state = 123456789;
    const rng = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    for (let run = 0; run < 100; run += 1) {
        const prepared = Core.prepareQuestions(rng);
        assert.equal(prepared.length, 20);
        prepared.forEach((question, index) => {
            if (index > 0) assert.notEqual(question.axis, prepared[index - 1].axis);
        });
        for (const axis of Core.AXES) {
            const flipped = prepared.filter((question) => question.axis === axis && question.flipped).length;
            assert.ok(flipped === 2 || flipped === 3);
        }
    }
});

test('scoring recovers all sixteen intended profiles without an NT shortcut', () => {
    const prepared = Core.prepareQuestions(() => 0.42);
    for (const target of Core.MBTI_TYPES) {
        const answers = prepared.map((question) => {
            const axisIndex = Core.AXES.indexOf(question.axis);
            return question.scores.indexOf(target[axisIndex]);
        });
        assert.equal(Core.scoreAnswers(prepared, answers).code, target);
    }
});

test('house assignment follows the result SN and TF combination', () => {
    const prepared = Core.prepareQuestions(() => 0.2);
    const answers = prepared.map((question) => question.scores.indexOf(question.axis[0]));
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

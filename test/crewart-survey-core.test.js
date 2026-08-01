'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/crewart-survey-core');

test('v2 questionnaire covers five distinct facets on every axis', () => {
    assert.equal(Core.SURVEY_VERSION, 'cre-mbti-v2.0');
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
    for (const question of Core.QUESTIONS) {
        assert.equal(question.options.length, 2);
        assert.equal(question.scores.length, 2);
        assert.deepEqual([...question.scores].sort(), [...question.axis].sort());
        assert.ok(question.options.every((option) => option.length >= 10 && option.length <= 32));
        assert.ok(Math.abs(question.options[0].length - question.options[1].length) <= 6);
        assert.equal(question.options.some((option) => loaded.test(option)), false);
        assert.match(question.image, /^question-c\d{2}\.webp$/);
    }
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

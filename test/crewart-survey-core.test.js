'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/crewart-survey-core');

test('questionnaire spec has balanced four-choice scenarios', () => {
    const spec = Core.getQuestionnaireSpec();
    assert.equal(Core.SURVEY_VERSION, spec.version);
    assert.equal(Core.QUESTIONS.length, spec.questions.length);
    assert.equal(Core.QUESTIONS[0].id, 'Q01');
    assert.equal(new Set(Core.QUESTIONS.map(question => question.id)).size, Core.QUESTIONS.length);

    const primaryCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    const secondaryCounts = Object.fromEntries(Core.AXES.map(axis => [axis, 0]));
    let neutralSupportingChoices = 0;
    for (const question of Core.QUESTIONS) {
        assert.ok(question.label.length <= 40);
        assert.ok(question.q.length >= 75 && question.q.length <= 115);
        assert.equal(question.options.length, 4);
        assert.equal(question.optionIds.length, 4);
        assert.equal(question.optionScores.length, 4);
        assert.equal(question.scores.length, 4);
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
            assert.equal(Core.answerSignals(question, index).reduce((sum, signal) => sum + signal.points, 0), 5);
            assert.equal(question.scores[index], Core.answerLetters(question, index)[0]);
            if (score[question.secondaryAxis[0]] === score[question.secondaryAxis[1]]) neutralSupportingChoices += 1;
        });
        assert.deepEqual(
            question.optionScores.map(score => score[question.axis[0]]).sort((a, b) => a - b),
            [0, 1, 2, 3]
        );
    }
    const primaryExpected = Number(spec.scoring.primaryQuestionsPerAxis) || 0;
    const secondaryExpected = Number(spec.scoring.secondaryQuestionsPerAxis) || 0;
    assert.deepEqual(Object.values(primaryCounts), Object.values(primaryCounts).map(() => primaryExpected));
    assert.deepEqual(Object.values(secondaryCounts), Object.values(secondaryCounts).map(() => secondaryExpected));
    assert.equal(neutralSupportingChoices, Core.QUESTIONS.length * 4);
});

test('choices avoid direct MBTI answer-key language and narrow auction context', () => {
    const loaded = /정답|객관적|합리적|감정적|충동|대충|무조건|옳은|더 좋은/;
    const revealing = /외향|내향|감각형|직관형|사고형|감정형|판단형|인식형|계획적|즉흥적/;
    const narrowContext = /낙찰|브리딩|컬렉션|최대 금액/;
    for (const question of Core.QUESTIONS) {
        const copy = [question.label, question.q, ...question.options].join(' ');
        assert.equal(loaded.test(copy), false);
        assert.equal(revealing.test(copy), false);
        assert.equal(narrowContext.test(copy), false);
        assert.ok(question.options.every(option => option.length >= 23 && option.length <= 38));
    }
});

test('prepared surveys keep option ids and graded score maps aligned while shuffling', () => {
    let state = 123456789;
    const rng = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    for (let run = 0; run < 100; run += 1) {
        const prepared = Core.prepareQuestions(rng);
        assert.equal(prepared.length, Core.QUESTIONS.length);
        assert.equal(prepared[0].id, 'Q01');
        prepared.forEach((question, index) => {
            if (index > 0) assert.notEqual(question.axis, prepared[index - 1].axis);
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
});

test('weighted scoring recovers all sixteen intended profiles', () => {
    const prepared = Core.prepareQuestions(() => 0.42);
    assert.equal(prepared[0].id, 'Q01');
    for (const target of Core.MBTI_TYPES) {
        const answers = prepared.map(question => {
            const targetLetters = [question.axis, question.secondaryAxis]
                .map(axis => target[Core.AXES.indexOf(axis)]);
            const utility = score => targetLetters.reduce((sum, letter, axisIndex) => {
                const axis = axisIndex === 0 ? question.axis : question.secondaryAxis;
                const opposite = axis[0] === letter ? axis[1] : axis[0];
                return sum + score[letter] - score[opposite];
            }, 0);
            return question.optionScores
                .map(utility)
                .reduce((best, value, index, values) => value > values[best] ? index : best, 0);
        });
        assert.ok(answers.every(answer => answer >= 0));
        const result = Core.scoreAnswers(prepared, answers);
        assert.equal(result.code, target);
        Core.AXES.forEach(axis => {
            assert.equal(result.letters[axis[0]] + result.letters[axis[1]], Core.AXIS_SCORE_TOTAL);
        });
    }
});

test('supporting axes can be neutral instead of forcing every answer to one pole', () => {
    const question = Core.QUESTIONS.find(item => item.id === 'Q02');
    const choice = question.optionScores.findIndex(score => score.J === 1 && score.P === 2 && score.E === 1 && score.I === 1);
    assert.ok(choice >= 0);
    assert.deepEqual(Core.answerLetters(question, choice), ['P']);
    assert.deepEqual(Core.answerScoreMap(question, choice), { J: 1, P: 2, E: 1, I: 1 });
});

test('house assignment follows the result SN and TF combination', () => {
    const prepared = Core.prepareQuestions(() => 0.2);
    const answers = prepared.map(question => question.optionScores
        .map(score => score[question.axis[0]] + score[question.secondaryAxis[0]])
        .reduce((best, value, index, values) => value > values[best] ? index : best, 0));
    const result = Core.scoreAnswers(prepared, answers);
    assert.equal(Core.chooseTendencyHouse(result), 'ST');
    assert.equal(Core.chooseTendencyHouse({ code: 'ENFJ' }), 'NF');
    assert.equal(Core.chooseTendencyHouse({ code: 'INTJ' }), 'NT');
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

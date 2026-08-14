(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    let SURVEY_VERSION = 'crewart-tendency-v28.0-pasamo-ultimate';

    const SURVEY_VERSION_REGISTRY = {
        v1: {
            id: 'v1',
            versionKey: 'v24',
            displayName: 'Ver 1',
            questionVersion: 'crewart-tendency-v12.3-balanced-3to2',
            resultsVersion: 'crewart-results-v1-legacy',
            questionsFile: 'crewart-survey-questions-v24.json',
            resultsFile: null,
            active: false,
            legacy: true
        },
        v2: {
            id: 'v2',
            versionKey: 'v28',
            displayName: 'Ver 2',
            questionVersion: 'crewart-tendency-v28.0-pasamo-ultimate',
            resultsVersion: 'crewart-results-v28.0-pasamo-ultimate',
            questionsFile: 'crewart-survey-questions-v28.json',
            resultsFile: 'crewart-survey-results-v28.json',
            active: true,
            legacy: false
        }
    };

    function getSurveyVersion(keyOrId) {
        if (!keyOrId) return SURVEY_VERSION_REGISTRY.v2;
        const normalized = String(keyOrId).trim().toLowerCase();
        if (SURVEY_VERSION_REGISTRY[normalized]) return SURVEY_VERSION_REGISTRY[normalized];
        for (const reg of Object.values(SURVEY_VERSION_REGISTRY)) {
            if (reg.versionKey.toLowerCase() === normalized || reg.id.toLowerCase() === normalized || reg.questionVersion.toLowerCase() === normalized) {
                return reg;
            }
        }
        return SURVEY_VERSION_REGISTRY.v2;
    }

    let AXIS_SCORE_TOTAL = 15;
    let PRIMARY_SIGNAL_POINTS = 3;
    let SECONDARY_SIGNAL_POINTS = 2;
    const MIN_RESPONSE_MS = 3000;
    const MAX_RESPONSE_MS = 90000;
    const AXES = ['EI', 'SN', 'TF', 'JP'];
    const HOUSE_KEYS = ['SF', 'ST', 'NT', 'NF'];
    const MBTI_TYPES = [
        'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
        'ISTP', 'ISFP', 'INFP', 'INTP',
        'ESTP', 'ESFP', 'ENFP', 'ENTP',
        'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ];

    // This inline set remains only as a compatibility fallback. The deployed v24
    // questionnaire and its graded, single-axis signals load from the JSON spec below.
    const QUESTIONS = [
        { id: 'Q01', axis: 'TF', secondaryAxis: 'JP', facet: 'selection', label: '두 개체 중 하나를 고를 때', q: '둘 중 하나를 정하기 위해 마지막으로 하는 일은?', options: ['두 개체 사진을 한 화면에 놓고 본다', '한 마리씩 따로 다시 살펴본다', '잠깐 다른 곳을 본 뒤 다시 돌아온다', '각각 마음에 드는 점을 하나씩 짚어본다'], scores: ['T', 'T', 'F', 'F'], scorePairs: [['T', 'J'], ['T', 'P'], ['F', 'P'], ['F', 'J']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q02', axis: 'JP', secondaryAxis: 'EI', facet: 'orientation', label: '찾던 부스가 보이지 않을 때', q: '먼저 어떻게 할까?', options: ['안내 요원에게 위치를 묻는다', '온라인 지도를 다시 확인한다', '주변 부스를 보며 근처부터 찾아본다', '다음에 볼 부스로 갔다가 나중에 돌아온다'], scores: ['J', 'J', 'P', 'P'], scorePairs: [['J', 'E'], ['J', 'I'], ['P', 'E'], ['P', 'I']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q03', axis: 'TF', secondaryAxis: 'JP', facet: 'shortlist', label: '후보 세 개를 하나로 줄일 때', q: '세 후보를 하나로 줄이는 방식은?', options: ['세 글을 나란히 띄워 한꺼번에 본다', '가장 기억에 남는 후보를 기준으로 비교한다', '가장 덜 끌리는 후보 하나를 먼저 뺀다', '두 개씩 짝지어 비교해 마지막 둘을 남긴다'], scores: ['T', 'F', 'F', 'T'], scorePairs: [['T', 'P'], ['F', 'J'], ['F', 'P'], ['T', 'J']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q04', axis: 'EI', secondaryAxis: 'SN', facet: 'storytelling', label: '행사를 설명할 때', q: '나는 어떻게 이야기를 시작할까?', options: ['가장 기억나는 한 마리부터 이야기한다', '찍어둔 사진 한 장부터 보여준다', '마지막까지 고민했던 두 마리를 비교한다', '행사 전체 분위기부터 설명한다'], scores: ['I', 'E', 'I', 'E'], scorePairs: [['I', 'S'], ['E', 'S'], ['I', 'N'], ['E', 'N']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q05', axis: 'SN', secondaryAxis: 'TF', facet: 'naming', label: '이름 후보가 둘 남았을 때', q: '마지막 결정은 어떻게 할까?', options: ['사진을 보며 이름을 각각 소리 내어 부른다', '사진 아래에 두 이름을 번갈아 써본다', '두 이름에서 나올 별명을 각각 떠올린다', '가까운 사람에게 두 이름을 들려주고 반응을 본다'], scores: ['S', 'S', 'N', 'N'], scorePairs: [['S', 'F'], ['S', 'T'], ['N', 'T'], ['N', 'F']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q06', axis: 'SN', secondaryAxis: 'TF', facet: 'concept', label: '두 가지 콘셉트를 비교할 때', q: '처음 비교하는 방식은?', options: ['두 이미지를 번갈아 전체로 본다', '같은 위치의 소품끼리 비교한다', '내 공간에 놓인 모습을 각각 떠올린다', '각 이미지에서 마음에 드는 부분을 하나씩 찾는다'], scores: ['N', 'S', 'N', 'S'], scorePairs: [['N', 'F'], ['S', 'T'], ['N', 'T'], ['S', 'F']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q07', axis: 'JP', secondaryAxis: 'EI', facet: 'free-time', label: '행사에서 시간이 남았을 때', q: '남은 시간을 어떻게 쓸까?', options: ['가장 기억나는 부스에 다시 간다', '아직 자세히 안 본 구역을 둘러본다', '잠깐 앉아서 찍은 사진을 확인한다', '같이 간 사람과 한 곳을 정해 다시 간다'], scores: ['J', 'P', 'P', 'J'], scorePairs: [['J', 'I'], ['P', 'E'], ['P', 'I'], ['J', 'E']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q08', axis: 'JP', secondaryAxis: 'SN', facet: 'sorting', label: '행사 사진을 정리할 때', q: '처음 정리하는 방식은?', options: ['촬영 순서를 유지한 채 정리한다', '부스별로 묶을 폴더부터 만든다', '눈에 띄는 사진부터 표시해둔다', '전체를 훑으며 비슷한 사진끼리 묶는다'], scores: ['J', 'J', 'P', 'P'], scorePairs: [['J', 'S'], ['J', 'N'], ['P', 'S'], ['P', 'N']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q09', axis: 'EI', secondaryAxis: 'SN', facet: 'incoming-photos', label: '사진 여러 장을 채팅으로 받았을 때', q: '사진을 처음 확인할 때 나는?', options: ['전체 썸네일을 훑고 눈에 띈 사진에 바로 반응한다', '받은 순서대로 본 뒤 한 번에 답한다', '비슷한 사진을 비교한 뒤 궁금한 점을 묻는다', '가장 인상적인 사진을 저장해두고 나중에 다시 본다'], scores: ['E', 'I', 'E', 'I'], scorePairs: [['E', 'N'], ['I', 'S'], ['E', 'S'], ['I', 'N']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q10', axis: 'TF', secondaryAxis: 'EI', facet: 'explaining', label: '처음 가는 친구에게 설명할 때', q: '나는 어떻게 답하기 시작할까?', options: ['무엇을 기대하는지 먼저 물어본다', '재미있었는지 결론부터 말해준다', '행사에서 찍은 사진 두 장을 보여준다', '기억에 남는 장면 하나를 이야기한다'], scores: ['T', 'T', 'F', 'F'], scorePairs: [['T', 'E'], ['T', 'I'], ['F', 'E'], ['F', 'I']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q11', axis: 'EI', secondaryAxis: 'JP', facet: 'rejoining', label: '친구와 다시 합류했을 때', q: '다시 만난 뒤 먼저 하는 행동은?', options: ['서로 가장 기억나는 부스를 말하고 한 곳을 정한다', '서로 찍은 사진을 보며 다음에 볼 곳을 고른다', '내가 찍은 사진을 훑고 다시 볼 한 곳을 정한다', '각자 조금 더 둘러본 뒤 다시 만나자고 한다'], scores: ['E', 'E', 'I', 'I'], scorePairs: [['E', 'J'], ['E', 'P'], ['I', 'J'], ['I', 'P']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] },
        { id: 'Q12', axis: 'SN', secondaryAxis: 'TF', facet: 'name-card', label: '이름표 시안 중 하나를 고를 때', q: '두 시안을 처음 비교하는 방식은?', options: ['글자 크기와 사진 배치의 차이를 본다', '매일 볼 때 어느 쪽이 더 마음에 들지 본다', '사육장 전체 분위기와 어떻게 이어질지 본다', '나중에 사진이나 장식을 바꿔도 어울릴지 본다'], scores: ['S', 'S', 'N', 'N'], scorePairs: [['S', 'T'], ['S', 'F'], ['N', 'F'], ['N', 'T']], scoreWeights: [[3, 2], [3, 2], [3, 2], [3, 2]] }
    ];

    let QUESTIONNAIRE_FILE = 'crewart-survey-questions-v28.json';
    let questionnaireSpec = null;

    function normalizeQuestionnaireSpec(spec) {
        if (!spec || !Array.isArray(spec.questions) || !spec.questions.length) {
            throw new Error('Questionnaire spec must contain a non-empty questions array.');
        }
        const scoring = spec.scoring || {};
        const primaryPoints = Number(scoring.strongSignalPoints) || PRIMARY_SIGNAL_POINTS;
        const secondaryPoints = Number(scoring.supportingSignalPoints) || SECONDARY_SIGNAL_POINTS;
        const questions = spec.questions.map((question, index) => {
            if (!question.id || !question.axis || !question.secondaryAxis
                || !AXES.includes(question.axis) || !AXES.includes(question.secondaryAxis)
                || question.axis === question.secondaryAxis
                || !Array.isArray(question.options) || question.options.length !== 4) {
                throw new Error(`Invalid questionnaire item at index ${index}.`);
            }
            const allowedLetters = [...question.axis, ...question.secondaryAxis];
            let optionScores;
            if (Array.isArray(question.optionScores)) {
                optionScores = question.optionScores.map((rawScore, choiceIndex) => {
                    const score = Object.fromEntries(allowedLetters.map(letter => [letter, Number(rawScore?.[letter])]));
                    if (Object.values(score).some(points => !Number.isInteger(points) || points < 0)
                        || score[question.axis[0]] + score[question.axis[1]] !== primaryPoints
                        || score[question.secondaryAxis[0]] + score[question.secondaryAxis[1]] !== secondaryPoints) {
                        throw new Error(`Invalid option score at question ${question.id}, choice ${choiceIndex + 1}.`);
                    }
                    return score;
                });
            } else {
                const optionCriteria = Array.isArray(question.optionCriteria)
                    ? question.optionCriteria
                    : question.scorePairs;
                const legacyPairs = Array.isArray(optionCriteria)
                    ? optionCriteria.map(criteria => {
                        if (Array.isArray(criteria)) return criteria.slice(0, 2);
                        return [criteria?.[question.axis], criteria?.[question.secondaryAxis]];
                    })
                    : [];
                const legacyWeights = (question.optionWeights || question.scoreWeights || [])
                    .map(weight => Array.isArray(weight) ? weight.slice(0, 2).map(Number) : [primaryPoints, secondaryPoints]);
                if (legacyPairs.length !== 4 || legacyWeights.length !== 4
                    || legacyPairs.some(pair => pair.length !== 2 || !pair[0] || !pair[1])) {
                    throw new Error(`Invalid legacy questionnaire item at index ${index}.`);
                }
                optionScores = legacyPairs.map((pair, choiceIndex) => {
                    const score = Object.fromEntries(allowedLetters.map(letter => [letter, 0]));
                    score[pair[0]] += legacyWeights[choiceIndex][0];
                    score[pair[1]] += legacyWeights[choiceIndex][1];
                    return score;
                });
            }
            if (optionScores.length !== 4) throw new Error(`Question ${question.id} must contain four option scores.`);
            const dominantLetter = (axis, score) => (
                score[axis[0]] === score[axis[1]] ? '' : score[axis[0]] > score[axis[1]] ? axis[0] : axis[1]
            );
            const scorePairs = optionScores.map(score => [
                dominantLetter(question.axis, score),
                dominantLetter(question.secondaryAxis, score)
            ].filter(Boolean));
            const optionIds = Array.isArray(question.optionIds) && question.optionIds.length === 4
                ? question.optionIds.map(String)
                : question.options.map((_, choiceIndex) => `${question.id}-${choiceIndex + 1}`);
            if (new Set(optionIds).size !== 4) throw new Error(`Question ${question.id} option ids must be unique.`);
            return {
                ...question,
                options: question.options.slice(),
                optionIds,
                optionScores,
                scores: scorePairs.map(pair => pair[0]),
                scorePairs,
                scoreWeights: scorePairs.map((pair, choiceIndex) => pair.map(letter => optionScores[choiceIndex][letter]))
            };
        });
        const ids = new Set(questions.map(question => question.id));
        if (ids.size !== questions.length) throw new Error('Questionnaire item ids must be unique.');
        return {
            version: String(spec.version || SURVEY_VERSION),
            scoring,
            questions
        };
    }

    function applyQuestionnaireSpec(spec) {
        const normalized = normalizeQuestionnaireSpec(spec);
        questionnaireSpec = normalized;
        SURVEY_VERSION = normalized.version;
        PRIMARY_SIGNAL_POINTS = Number(normalized.scoring.strongSignalPoints) || PRIMARY_SIGNAL_POINTS;
        SECONDARY_SIGNAL_POINTS = Number(normalized.scoring.supportingSignalPoints) || SECONDARY_SIGNAL_POINTS;
        AXIS_SCORE_TOTAL = (Number(normalized.scoring.primaryQuestionsPerAxis) || 3) * PRIMARY_SIGNAL_POINTS
            + (Number(normalized.scoring.secondaryQuestionsPerAxis) || 3) * SECONDARY_SIGNAL_POINTS;
        QUESTIONS.splice(0, QUESTIONS.length, ...normalized.questions);
        return normalized;
    }

    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
    });

    if (typeof module === 'object' && module.exports && typeof require === 'function') {
        try {
            applyQuestionnaireSpec(require(`./${QUESTIONNAIRE_FILE}`));
            readyResolve();
        } catch (error) {
            readyReject(error);
        }
    } else if (typeof fetch === 'function' && typeof document !== 'undefined') {
        const url = new URL(QUESTIONNAIRE_FILE, document.baseURI).href;
        fetch(url, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error(`Questionnaire fetch failed: ${response.status}`);
                return response.json();
            })
            .then(spec => { applyQuestionnaireSpec(spec); readyResolve(); })
            .catch(readyReject);
    } else {
        readyResolve();
    }

    const AXIS_META = {
        EI: {
            title: '생각을 정리하는 방향',
            letters: {
                E: { short: '함께 나누며 정리', description: '사람들과 경험을 주고받을 때 판단이 더 선명해져요.' },
                I: { short: '혼자 관찰하며 정리', description: '조용히 관찰하고 기록을 비교할 때 판단이 더 선명해져요.' }
            }
        },
        SN: {
            title: '크레를 바라보는 시선',
            letters: {
                S: { short: '지금 보이는 정보', description: '현재 확인되는 컨디션과 구체적인 차이를 먼저 봐요.' },
                N: { short: '앞으로의 가능성', description: '성장 흐름과 아직 드러나지 않은 다음 모습을 먼저 그려요.' }
            }
        },
        TF: {
            title: '선택을 결정하는 기준',
            letters: {
                T: { short: '조건과 근거', description: '비교할 수 있는 조건과 이유가 분명할 때 확신해요.' },
                F: { short: '취향과 관계', description: '나와 잘 맞고 오래 마음이 가는지를 중요하게 봐요.' }
            }
        },
        JP: {
            title: '사육을 운영하는 방식',
            letters: {
                J: { short: '미리 정하고 준비', description: '순서와 기준을 먼저 정해 두면 마음이 편해요.' },
                P: { short: '보면서 유연하게 조정', description: '실제 반응을 확인하며 계획을 바꿀 때 자연스러워요.' }
            }
        }
    };

    const CHANGE_MESSAGES = {
        'E>I': '평소보다 크레 앞에서는 혼자 관찰하고 정리하는 시간이 길어져요.',
        'I>E': '평소보다 크레 앞에서는 사람과 경험을 나눌 때 판단이 빨라져요.',
        'S>N': '평소보다 크레 앞에서는 현재 모습보다 성장 흐름과 다음 가능성을 더 봐요.',
        'N>S': '평소보다 크레 앞에서는 가능성보다 지금 확인되는 상태를 더 꼼꼼히 봐요.',
        'T>F': '평소보다 크레를 고를 때 조건보다 취향과 오래 갈 마음을 더 믿어요.',
        'F>T': '평소보다 크레 앞에서는 마음만큼 비교할 수 있는 조건과 근거를 챙겨요.',
        'J>P': '평소보다 크레를 돌볼 때 실제 반응에 맞춰 계획을 유연하게 바꿔요.',
        'P>J': '평소보다 크레 앞에서는 기준과 순서를 미리 정해 두는 편이에요.'
    };

    const TYPE_NAMES = {
        ISTJ: '기록 설계자', ISFJ: '세심한 보호자', INFJ: '성장 관찰자', INTJ: '장기 설계자',
        ISTP: '현장 조율자', ISFP: '감각 돌봄형', INFP: '애착 발견자', INTP: '원리 탐구자',
        ESTP: '즉시 해결사', ESFP: '반응 공유자', ENFP: '가능성 발견자', ENTP: '실험 개척자',
        ESTJ: '루틴 운영자', ESFJ: '함께 돌보는 사람', ENFJ: '방향 연결자', ENTJ: '프로젝트 지휘자'
    };

    // The four teams use a single, immediately readable RGBY system everywhere.
    // Keys stay semantic so existing saved results and score aggregation remain compatible.
    const HOUSE_META = {
        SF: { name: 'RED', korean: '레드', color: 'RED', seal: 'R', accent: '#df5a4b' },
        ST: { name: 'GREEN', korean: '그린', color: 'GREEN', seal: 'G', accent: '#5f9667' },
        NT: { name: 'BLUE', korean: '블루', color: 'BLUE', seal: 'B', accent: '#4f7fc8' },
        NF: { name: 'YELLOW', korean: '옐로우', color: 'YELLOW', seal: 'Y', accent: '#d9a83e' }
    };

    function cloneQuestions() {
        return QUESTIONS.map(question => ({
            ...question,
            options: question.options.slice(),
            optionIds: question.optionIds?.slice(),
            optionScores: question.optionScores?.map(score => ({ ...score })),
            scores: question.scores.slice(),
            scorePairs: question.scorePairs?.map(pair => pair.slice()),
            scoreWeights: question.scoreWeights?.map(pair => pair.slice()),
            flipped: false
        }));
    }

    function randomInt(limit, rng) {
        return Math.floor((rng || Math.random)() * limit);
    }

    function shuffle(items, rng) {
        const result = items.slice();
        for (let index = result.length - 1; index > 0; index -= 1) {
            const target = randomInt(index + 1, rng);
            [result[index], result[target]] = [result[target], result[index]];
        }
        return result;
    }

    function prepareQuestions(rng) {
        const questions = cloneQuestions();
        const axesByFlipCount = shuffle(AXES, rng);
        axesByFlipCount.forEach((axis, axisIndex) => {
            const group = shuffle(questions.filter(question => question.axis === axis && !question.scorePairs), rng);
            const flipCount = axisIndex < 2 ? 3 : 2;
            group.slice(0, flipCount).forEach(question => {
                [question.options[0], question.options[1]] = [question.options[1], question.options[0]];
                [question.scores[0], question.scores[1]] = [question.scores[1], question.scores[0]];
                question.flipped = true;
            });
        });

        questions.filter(question => question.scorePairs).forEach(question => {
            const choices = shuffle(question.options.map((option, index) => ({
                option,
                optionId: question.optionIds?.[index],
                optionScore: question.optionScores?.[index],
                score: question.scores[index],
                pair: question.scorePairs[index],
                weight: question.scoreWeights?.[index]
            })), rng);
            question.options = choices.map(item => item.option);
            question.optionIds = choices.map(item => item.optionId);
            question.optionScores = choices.map(item => ({ ...item.optionScore }));
            question.scores = choices.map(item => item.score);
            question.scorePairs = choices.map(item => item.pair);
            question.scoreWeights = choices.map(item => item.weight);
        });

        let ordered = questions;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const candidate = shuffle(questions, rng);
            const previewStartsFirst = !questions.some(question => question.scorePairs) || candidate[0]?.id === 'Q01';
            if (previewStartsFirst && candidate.every((question, index) => index === 0 || candidate[index - 1].axis !== question.axis)) {
                ordered = candidate;
                break;
            }
        }
        if (ordered === questions) {
            const remaining = questions.filter(question => question.id !== 'Q01');
            const first = questions.find(question => question.id === 'Q01');
            ordered = first ? [first] : [];
            while (remaining.length) {
                const previousAxis = ordered[ordered.length - 1]?.axis;
                let nextIndex = remaining.findIndex(question => question.axis !== previousAxis);
                if (nextIndex < 0) nextIndex = 0;
                ordered.push(remaining.splice(nextIndex, 1)[0]);
            }
        }
        return ordered;
    }

    function answerScoreMap(question, choice) {
        const configured = question?.optionScores?.[choice];
        if (configured && typeof configured === 'object') return { ...configured };
        const letters = Array.isArray(question?.scorePairs)
            ? question.scorePairs[choice] || []
            : [question?.scores?.[choice]].filter(Boolean);
        const weights = question?.scoreWeights?.[choice] || letters.map(() => 1);
        return Object.fromEntries(letters.map((letter, index) => [letter, Number(weights[index]) || 1]));
    }

    function answerLetters(question, choice) {
        const score = answerScoreMap(question, choice);
        return [question?.axis, question?.secondaryAxis].filter(Boolean).map(axis => {
            const left = Number(score[axis[0]]) || 0;
            const right = Number(score[axis[1]]) || 0;
            return left === right ? '' : left > right ? axis[0] : axis[1];
        }).filter(Boolean);
    }

    function answerSignals(question, choice) {
        return Object.entries(answerScoreMap(question, choice))
            .filter(([, points]) => Number(points) > 0)
            .map(([letter, points]) => ({ letter, points: Number(points) }));
    }

    function scoreAnswers(questions, answers) {
        const letters = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
        questions.forEach((question, index) => {
            answerSignals(question, answers[index]).forEach(signal => {
                if (signal.letter in letters) letters[signal.letter] += signal.points;
            });
        });
        const code = (letters.E > letters.I ? 'E' : 'I')
            + (letters.S > letters.N ? 'S' : 'N')
            + (letters.T > letters.F ? 'T' : 'F')
            + (letters.J > letters.P ? 'J' : 'P');

        const axes = AXES.map((axis, index) => {
            const dominant = code[index];
            const opposite = axis[0] === dominant ? axis[1] : axis[0];
            const diff = Math.abs(letters[dominant] - letters[opposite]);
            const confidence = diff / AXIS_SCORE_TOTAL;
            const confidenceLabel = diff <= 2
                ? `${dominant}에 조금 가까움`
                : `확실한 ${dominant} 성향`;
            return {
                axis,
                dominant,
                opposite,
                dominantCount: letters[dominant],
                oppositeCount: letters[opposite],
                confidence,
                confidenceLabel
            };
        });

        return { letters, code, axes, typeName: TYPE_NAMES[code] || '크레 집사' };
    }

    function buildMbtiComparison(knownType, creType) {
        if (!knownType || !MBTI_TYPES.includes(knownType)) return { knownType: '', creType, changes: [], sameCount: 0 };
        const changes = AXES.map((axis, index) => {
            if (knownType[index] === creType[index]) return null;
            const key = `${knownType[index]}>${creType[index]}`;
            return {
                axis,
                title: AXIS_META[axis].title,
                from: knownType[index],
                to: creType[index],
                message: CHANGE_MESSAGES[key]
            };
        }).filter(Boolean);
        return { knownType, creType, changes, sameCount: 4 - changes.length };
    }

    function median(values) {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function average(values) {
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }

    function buildTimingStats(entries, questions) {
        const normalized = (entries || []).map((entry, index) => ({
            questionId: entry?.questionId || questions[index]?.id || '',
            axis: entry?.axis || questions[index]?.axis || '',
            elapsedMs: Math.round(Number(entry?.elapsedMs) || 0),
            valid: entry?.valid !== false
                && Number(entry?.elapsedMs) >= MIN_RESPONSE_MS
                && Number(entry?.elapsedMs) <= MAX_RESPONSE_MS
        }));
        const valid = normalized.filter(entry => entry.valid);
        const values = valid.map(entry => entry.elapsedMs);
        const axisMedians = {};
        AXES.forEach(axis => {
            axisMedians[axis] = Math.round(median(valid.filter(entry => entry.axis === axis).map(entry => entry.elapsedMs)));
        });
        const medianMs = Math.round(median(values));
        const style = medianMs < 2500
            ? { key: 'instinct', label: '빠른 직감형', copy: '첫 느낌을 빠르게 붙잡는 편이에요.' }
            : medianMs < 5000
                ? { key: 'balanced', label: '균형 판단형', copy: '직감과 확인 사이의 속도가 균형 잡혀 있어요.' }
                : { key: 'deliberate', label: '신중한 숙고형', copy: '한 번 더 비교한 뒤 선택하는 편이에요.' };
        return {
            entries: normalized,
            validCount: valid.length,
            totalMs: Math.round(values.reduce((sum, value) => sum + value, 0)),
            averageMs: Math.round(average(values)),
            medianMs,
            axisMedians,
            fastest: valid.slice().sort((a, b) => a.elapsedMs - b.elapsedMs)[0] || null,
            slowest: valid.slice().sort((a, b) => b.elapsedMs - a.elapsedMs)[0] || null,
            style
        };
    }

    function buildSpeedBenchmark(medianMs, sampleValues) {
        const samples = (sampleValues || []).map(Number)
            .filter(value => value >= MIN_RESPONSE_MS && value <= MAX_RESPONSE_MS);
        if (samples.length < 10) {
            return {
                ready: false,
                sampleSize: samples.length,
                needed: 10 - samples.length,
                badge: `기준 데이터 ${samples.length} / 10`,
                message: '초기 응답이 쌓이면 다른 참여자와 선택 속도를 비교해 드려요.'
            };
        }
        const sampleAverage = Math.round(average(samples));
        const deltaMs = Math.abs(medianMs - sampleAverage);
        const fasterCount = samples.filter(value => value < medianMs).length;
        const rank = fasterCount + 1;
        const topPercent = Math.min(100, Math.max(10, Math.ceil((rank / (samples.length + 1)) * 10) * 10));
        const isFaster = medianMs <= sampleAverage;
        return {
            ready: true,
            sampleSize: samples.length,
            sampleAverage,
            deltaMs,
            topPercent,
            badge: isFaster && topPercent <= 50 ? `빠른 응답 상위 ${topPercent}%` : `참여자 ${samples.length}명 기준`,
            message: deltaMs < 250
                ? '현재 참여자 평균과 거의 같은 속도로 골랐어요.'
                : `현재 참여자 평균보다 ${Math.max(0.1, deltaMs / 1000).toFixed(1)}초 ${isFaster ? '빠르게' : '천천히'} 골랐어요.`
        };
    }

    function chooseTendencyHouse(result) {
        const code = String(result?.code || '').toUpperCase();
        const codeKey = `${code[1] || ''}${code[2] || ''}`;
        if (HOUSE_KEYS.includes(codeKey)) return codeKey;
        const letters = result?.letters || {};
        const perception = Number(letters.S) > Number(letters.N) ? 'S' : 'N';
        const decision = Number(letters.T) > Number(letters.F) ? 'T' : 'F';
        return `${perception}${decision}`;
    }


    function loadQuestionnaireFile(questionsFile, resultsFile) {
        if (typeof fetch !== 'function' || typeof document === 'undefined') return Promise.resolve(null);
        const questionsUrl = new URL(questionsFile, document.baseURI).href;
        const fetchQuestions = fetch(questionsUrl, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error(`Questions fetch failed: ${response.status}`);
                return response.json();
            });

        const fetchResults = resultsFile
            ? fetch(new URL(resultsFile, document.baseURI).href, { cache: 'no-store' })
                .then(response => response.ok ? response.json() : null)
                .catch(() => null)
            : Promise.resolve(null);

        return Promise.all([fetchQuestions, fetchResults]).then(([spec, resultsSpec]) => {
            if (resultsSpec && resultsSpec.results) {
                spec.results = resultsSpec;
            }
            return applyQuestionnaireSpec(spec);
        });
    }

    function loadQuestionnaireVersion(versionKey) {
        const reg = getSurveyVersion(versionKey);
        return loadQuestionnaireFile(reg.questionsFile, reg.resultsFile);
    }

    function getResultProfile(code) {
        if (questionnaireSpec && questionnaireSpec.results && questionnaireSpec.results.results && questionnaireSpec.results.results[code]) {
            return questionnaireSpec.results.results[code];
        }
        return {
            mbti: code,
            title: TYPE_NAMES[code] || '크레 집사',
            subtitle: `${code} 성향의 마스터 크레 집사`,
            summary: `나만의 뚜렷한 사육 철학과 행동 방식으로 크레 라이프를 즐기는 ${code} 타입 집사입니다.`,
            traits: [
                '뚜렷한 판단 기준과 관찰력으로 사육장을 다스림',
                '개체 피딩과 환경 케어를 자신만의 방식으로 완성함',
                '파박 탐방과 커뮤니티 소통에서 고유한 존재감을 드러냄',
                '지속적인 호기심과 애정으로 크레 집사 생활을 이어감'
            ],
            superpower: '나만의 개성과 노하우로 완성하는 크레 케어 능력',
            weakness: '자신만의 방식에 몰입하여 가끔 휴식이 필요함',
            bestMatch: { mbti: 'ESFP', title: '파사모 톡방 인싸 집사' },
            worstMatch: { mbti: 'ENFP', title: '모프 상상 창작집사' },
            actionItem: '오늘 밤엔 편안하게 꼬물이 슈푸 먹방을 보며 힐링하세요!'
        };
    }


    const api = {
        AXES,
        HOUSE_KEYS,
        HOUSE_META,
        MBTI_TYPES,
        MIN_RESPONSE_MS,
        MAX_RESPONSE_MS,
        QUESTIONS,
        AXIS_META,
        TYPE_NAMES,
        prepareQuestions,
        scoreAnswers,
        answerLetters,
        answerSignals,
        answerScoreMap,
        buildMbtiComparison,
        buildTimingStats,
        buildSpeedBenchmark,
        chooseTendencyHouse,
        median,
        average,
        ready,
        loadQuestionnaireFile,
        loadQuestionnaireVersion,
        getSurveyVersion,
        getResultProfile,
        SURVEY_VERSION_REGISTRY,
        applyQuestionnaireSpec,
        questionnaireFile: QUESTIONNAIRE_FILE,
        getQuestionnaireSpec: () => questionnaireSpec
    };
    Object.defineProperties(api, {
        SURVEY_VERSION: { enumerable: true, get: () => SURVEY_VERSION },
        AXIS_SCORE_TOTAL: { enumerable: true, get: () => AXIS_SCORE_TOTAL },
        PRIMARY_SIGNAL_POINTS: { enumerable: true, get: () => PRIMARY_SIGNAL_POINTS },
        SECONDARY_SIGNAL_POINTS: { enumerable: true, get: () => SECONDARY_SIGNAL_POINTS }
    });
    return api;
}));

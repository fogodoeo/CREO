(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SURVEY_VERSION = 'crewart-tendency-v9.0';
    const AXES = ['EI', 'SN', 'TF', 'JP'];
    const HOUSE_KEYS = ['SF', 'ST', 'NT', 'NF'];
    const MBTI_TYPES = [
        'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
        'ISTP', 'ISFP', 'INFP', 'INTP',
        'ESTP', 'ESFP', 'ENFP', 'ENTP',
        'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ];

    // v9.0 uses ten short situations. Each four-choice block measures two axes at once.
    const QUESTIONS = [
        { id: 'Q01', axis: 'EI', secondaryAxis: 'JP', facet: 'processing', label: '행사에서 두 후보의 설명을 모두 들었다.', q: '결정을 정리할 때 가장 먼저 하는 일은?', options: ['동행인과 기준을 정해 비교한다', '동행인과 마음 가는 쪽을 이야기한다', '자리를 옮겨 기준대로 다시 본다', '자리를 옮겨 끌리는 쪽을 더 본다'], scores: ['E', 'E', 'I', 'I'], scorePairs: [['E', 'J'], ['E', 'P'], ['I', 'J'], ['I', 'P']] },
        { id: 'Q02', axis: 'SN', secondaryAxis: 'TF', facet: 'tracking', label: '체중이 한 번 줄었다가 다시 돌아왔다.', q: '기록에서 먼저 확인하는 것은?', options: ['줄어든 날 먹이와 온도를 적어본다', '그날 어떤 불편이 있었는지 떠올린다', '비슷한 변화가 전에도 있었는지 찾는다', '앞으로 편하게 이어질 생활을 그려본다'], scores: ['S', 'S', 'N', 'N'], scorePairs: [['S', 'T'], ['S', 'F'], ['N', 'T'], ['N', 'F']] },
        { id: 'Q03', axis: 'EI', secondaryAxis: 'TF', facet: 'decision', label: '마음에 드는 두 크레 중 한 마리만 데려올 수 있다.', q: '끝까지 비교하게 되는 것은?', options: ['관리 조건을 다른 사람과 함께 비교한다', '어느 쪽과 더 오래 지낼지 이야기한다', '사육 환경과 기록을 혼자 다시 확인한다', '계속 마음이 가는 쪽을 혼자 돌아본다'], scores: ['E', 'E', 'I', 'I'], scorePairs: [['E', 'T'], ['E', 'F'], ['I', 'T'], ['I', 'F']] },
        { id: 'Q04', axis: 'SN', secondaryAxis: 'JP', facet: 'readiness', label: '성체용 사육장으로 바꿀 시기가 다가온다.', q: '크기를 정할 때 더 가까운 방법은?', options: ['지금 몸길이에 맞춰 바로 정한다', '현재 움직임을 보며 필요한 크기를 찾는다', '앞으로 자랄 크기까지 계산해 정한다', '자랄 모습에 맞춰 바꿀 여지를 남긴다'], scores: ['S', 'S', 'N', 'N'], scorePairs: [['S', 'J'], ['S', 'P'], ['N', 'J'], ['N', 'P']] },
        { id: 'Q05', axis: 'EI', secondaryAxis: 'SN', facet: 'approach', label: '설명을 들었지만 두 후보가 계속 눈에 남는다.', q: '다음으로 하는 일은?', options: ['동행인과 지금 보이는 차이를 말한다', '동행인과 자란 뒤 모습을 이야기한다', '자리를 옮겨 사진 속 차이를 다시 본다', '자리를 옮겨 앞으로의 모습을 그려본다'], scores: ['E', 'E', 'I', 'I'], scorePairs: [['E', 'S'], ['E', 'N'], ['I', 'S'], ['I', 'N']] },
        { id: 'Q06', axis: 'TF', secondaryAxis: 'JP', facet: 'coordination', label: '두 사람이 크레 돌봄을 나눠 맡기로 했다.', q: '역할을 정할 때 먼저 맞추는 것은?', options: ['급여량과 기록 방법부터 정한다', '문제가 생겼을 때 볼 기준부터 정한다', '각자 맡을 일을 날짜별로 나눈다', '서로 편한 일을 먼저 고른다'], scores: ['T', 'T', 'F', 'F'], scorePairs: [['T', 'J'], ['T', 'P'], ['F', 'J'], ['F', 'P']] },
        { id: 'Q07', axis: 'EI', secondaryAxis: 'JP', facet: 'routine', label: '오늘 청소할 사육장이 여러 개인데 시간이 부족하다.', q: '남은 시간을 쓰는 방법은?', options: ['동행인과 순서를 정해 한 곳을 마친다', '동행인과 급한 곳부터 나눠 한다', '혼자 순서를 정해 한 곳을 마친다', '전체를 보고 필요한 곳부터 한다'], scores: ['E', 'E', 'I', 'I'], scorePairs: [['E', 'J'], ['E', 'P'], ['I', 'J'], ['I', 'P']] },
        { id: 'Q08', axis: 'SN', secondaryAxis: 'TF', facet: 'feeding', label: '평소 잘 먹던 크레가 오늘 먹이를 남겼다.', q: '먼저 확인하는 것은?', options: ['오늘 온도와 먹이 양을 확인한다', '오늘 불편해 보인 행동을 살핀다', '최근 며칠 행동과 함께 비교한다', '앞으로 먹기 편한 환경을 만들어본다'], scores: ['S', 'S', 'N', 'N'], scorePairs: [['S', 'T'], ['S', 'F'], ['N', 'T'], ['N', 'F']] },
        { id: 'Q09', axis: 'EI', secondaryAxis: 'SN', facet: 'reward', label: '기다리던 성장 변화가 뚜렷하게 보였다.', q: '사진을 찍은 다음 하는 일은?', options: ['사진을 보여주며 지금 달라진 점을 말한다', '사진을 보여주며 다음 모습을 이야기한다', '예전 사진과 지금의 차이를 확인한다', '예전 사진을 보며 앞으로를 그려본다'], scores: ['E', 'E', 'I', 'I'], scorePairs: [['E', 'S'], ['E', 'N'], ['I', 'S'], ['I', 'N']] },
        { id: 'Q10', axis: 'TF', secondaryAxis: 'JP', facet: 'readiness', label: '새 크레가 사흘 뒤 집에 온다.', q: '준비할 때 더 가까운 방법은?', options: ['필요한 용품과 배치를 미리 끝낸다', '필수 용품만 갖추고 반응을 본다', '오래 돌볼 일정과 역할을 먼저 맞춘다', '함께 돌볼 사람이 편한 방법을 고른다'], scores: ['T', 'T', 'F', 'F'], scorePairs: [['T', 'J'], ['T', 'P'], ['F', 'J'], ['F', 'P']] }
    ];

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

    const HOUSE_META = {
        SF: { name: 'ALPHA', korean: '알파', color: 'RED', seal: 'A', accent: '#df5a4b' },
        ST: { name: 'BRAVO', korean: '브라보', color: 'GREEN', seal: 'B', accent: '#6f9164' },
        NT: { name: 'CHARLIE', korean: '찰리', color: 'YELLOW', seal: 'C', accent: '#d9a83e' },
        NF: { name: 'DELTA', korean: '델타', color: 'BLUE', seal: 'D', accent: '#567fc4' }
    };

    function cloneQuestions() {
        return QUESTIONS.map(question => ({
            ...question,
            options: question.options.slice(),
            scores: question.scores.slice(),
            scorePairs: question.scorePairs?.map(pair => pair.slice()),
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
                score: question.scores[index],
                pair: question.scorePairs[index]
            })), rng);
            question.options = choices.map(item => item.option);
            question.scores = choices.map(item => item.score);
            question.scorePairs = choices.map(item => item.pair);
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
        return ordered;
    }

    function answerLetters(question, choice) {
        if (Array.isArray(question?.scorePairs)) return question.scorePairs[choice]?.slice() || [];
        const letter = question?.scores?.[choice];
        return letter ? [letter] : [];
    }

    function scoreAnswers(questions, answers) {
        const letters = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
        questions.forEach((question, index) => {
            answerLetters(question, answers[index]).forEach(letter => {
                if (letter in letters) letters[letter] += 1;
            });
        });
        const code = (letters.E > letters.I ? 'E' : 'I')
            + (letters.S > letters.N ? 'S' : 'N')
            + (letters.T > letters.F ? 'T' : 'F')
            + (letters.J > letters.P ? 'J' : 'P');
        const axes = AXES.map((axis, index) => {
            const dominant = code[index];
            const opposite = axis[0] === dominant ? axis[1] : axis[0];
            return {
                axis,
                dominant,
                opposite,
                dominantCount: letters[dominant],
                oppositeCount: letters[opposite],
                confidence: Math.abs(letters[dominant] - letters[opposite]) / 5
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
            valid: entry?.valid !== false && Number(entry?.elapsedMs) >= 400 && Number(entry?.elapsedMs) <= 30000
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
        const samples = (sampleValues || []).map(Number).filter(value => value >= 400 && value <= 30000);
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

    return {
        SURVEY_VERSION,
        AXES,
        HOUSE_KEYS,
        HOUSE_META,
        MBTI_TYPES,
        QUESTIONS,
        AXIS_META,
        TYPE_NAMES,
        prepareQuestions,
        scoreAnswers,
        answerLetters,
        buildMbtiComparison,
        buildTimingStats,
        buildSpeedBenchmark,
        chooseTendencyHouse,
        median,
        average
    };
}));

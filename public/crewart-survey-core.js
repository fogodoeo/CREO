(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SURVEY_VERSION = 'crewart-tendency-v4.0';
    const AXES = ['EI', 'SN', 'TF', 'JP'];
    const HOUSE_KEYS = ['SF', 'ST', 'NT', 'NF'];
    const MBTI_TYPES = [
        'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
        'ISTP', 'ISFP', 'INFP', 'INTP',
        'ESTP', 'ESFP', 'ENFP', 'ENTP',
        'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ];

    // v4.0 bias controls:
    // - both choices describe competent, responsible behaviour;
    // - no pole is framed as the emotional, careless, or less-informed answer;
    // - every axis samples five different behavioural facets;
    // - choices describe concrete micro-behaviours without naming the axis traits;
    // - option order is randomized later without changing the score mapping.
    const QUESTIONS = [
        { id: 'Q01', axis: 'EI', facet: 'processing', label: '설명을 듣다 궁금해졌을 때', q: '다음 질문이 떠오르는 순간은?', options: ['답을 주고받는 사이 질문이 이어진다', '전체 설명을 듣고 나면 질문이 떠오른다'], scores: ['E', 'I'] },
        { id: 'Q02', axis: 'SN', facet: 'evidence', label: '소개 사진을 한 장 받았을 때', q: '개체를 더 이해하려면 어떤 사진이 궁금한가?', options: ['같은 날 다른 각도에서 찍은 사진', '몇 달 간격으로 이어서 찍은 사진'], scores: ['S', 'N'] },
        { id: 'Q03', axis: 'TF', facet: 'resources', label: '조건이 비슷한 두 개체 사이에서', q: '마지막으로 다시 확인하게 되는 것은?', options: ['처음 정한 기준에서 빠진 항목이 없는지', '내 생활에서 자연스럽게 돌볼 수 있는지'], scores: ['T', 'F'] },
        { id: 'Q04', axis: 'JP', facet: 'setup', label: '새 크레를 맞이하기 전', q: '준비가 끝났다고 느끼는 순간은?', options: ['도착 뒤 확인할 항목까지 적어 두었을 때', '기본 환경을 맞추고 첫 반응을 볼 수 있을 때'], scores: ['J', 'P'] },

        { id: 'Q05', axis: 'EI', facet: 'recovery', label: '행사 사진을 다시 볼 때', q: '기억이 가장 또렷해지는 순간은?', options: ['사진 이야기를 주고받으며 장면을 되짚을 때', '사진을 넘겨보며 그날 장면을 되짚을 때'], scores: ['E', 'I'] },
        { id: 'Q06', axis: 'SN', facet: 'tracking', label: '석 달치 기록을 펼쳤을 때', q: '표시하고 싶은 곳에 더 가까운 것은?', options: ['먹이와 체중이 달라진 각각의 날짜', '변화가 시작되고 방향이 바뀐 구간'], scores: ['S', 'N'] },
        { id: 'Q07', axis: 'TF', facet: 'advice', label: '친구의 선택을 함께 볼 때', q: '결정을 돕는 질문에 더 가까운 것은?', options: ['둘 중 포기해도 되는 조건은 무엇인지', '둘 중 놓치면 더 아쉬운 쪽은 무엇인지'], scores: ['T', 'F'] },
        { id: 'Q08', axis: 'JP', facet: 'comparison', label: '여러 개체를 비교할 때', q: '실제로 사진을 보는 순서는?', options: ['한 번 훑은 뒤 다시 볼 개체에 표시한다', '눈에 머무는 개체부터 보며 범위를 좁힌다'], scores: ['J', 'P'] },

        { id: 'Q09', axis: 'EI', facet: 'learning', label: '새 사육법이 궁금할 때', q: '내 것으로 이해됐다는 느낌은 언제 드나?', options: ['경험자와 예시를 주고받으며 말해볼 때', '내 상황에 대입해 설명을 다시 적어볼 때'], scores: ['E', 'I'] },
        { id: 'Q10', axis: 'SN', facet: 'classification', label: '처음 보는 무늬를 발견했을 때', q: '사진 설명의 첫 문장은?', options: ['색의 경계와 무늬가 놓인 위치를 적는다', '익숙한 특징들이 어떻게 이어졌는지 적는다'], scores: ['S', 'N'] },
        { id: 'Q11', axis: 'TF', facet: 'disagreement', label: '서로 다른 관리법을 들었을 때', q: '두 방법의 차이를 이해하려면 먼저?', options: ['같은 조건에서 결과가 달라진 지점을 찾는다', '각 방법이 어떤 개체와 사람에게 맞았는지 묻는다'], scores: ['T', 'F'] },
        { id: 'Q12', axis: 'JP', facet: 'routine', label: '급여와 청소가 겹친 저녁', q: '손이 먼저 가는 곳은?', options: ['평소 확인하던 순서의 첫 번째 사육장', '그날 가장 먼저 눈에 들어온 사육장'], scores: ['J', 'P'] },

        { id: 'Q13', axis: 'EI', facet: 'stimulation', label: '처음 보는 모임에 갔을 때', q: '관심 있는 개체를 발견했다. 다음 행동은?', options: ['옆 사람에게 보이는 특징을 바로 물어본다', '잠시 살펴본 뒤 궁금한 특징을 물어본다'], scores: ['E', 'I'] },
        { id: 'Q14', axis: 'SN', facet: 'planning', label: '여러 사진을 한꺼번에 볼 때', q: '나중에도 기억에 남는 개체는?', options: ['색이나 무늬 한 부분이 또렷한 개체', '자라며 달라질 모습이 궁금한 개체'], scores: ['S', 'N'] },
        { id: 'Q15', axis: 'TF', facet: 'boundaries', label: '이번에는 데려오지 않기로 할 때', q: '결정을 굳히는 생각에 더 가까운 것은?', options: ['확인한 조건이 처음 세운 기준과 맞지 않는다', '지금 생활에서는 오래 돌보는 모습이 그려지지 않는다'], scores: ['T', 'F'] },
        { id: 'Q16', axis: 'JP', facet: 'disruption', label: '예상보다 늦게 집에 왔을 때', q: '남은 관리를 시작하는 방식은?', options: ['정해 둔 최소 관리 목록대로 움직인다', '전체를 둘러본 뒤 필요한 일부터 고른다'], scores: ['J', 'P'] },

        { id: 'Q17', axis: 'EI', facet: 'reward', label: '기다리던 변화가 보였을 때', q: '기쁨이 오래 남는 방식에 더 가까운 것은?', options: ['사진과 과정을 보여주며 반응을 나눈다', '전후 사진을 차분히 보며 변화를 음미한다'], scores: ['E', 'I'] },
        { id: 'Q18', axis: 'SN', facet: 'anomaly', label: '예상과 다르게 자랐을 때', q: '어떤 사진을 먼저 남기게 되나?', options: ['달라진 부위를 같은 각도로 다시 찍는다', '예전 사진과 이어 놓고 변화 순서를 본다'], scores: ['S', 'N'] },
        { id: 'Q19', axis: 'TF', facet: 'collaboration', label: '함께 돌보는 방식이 다를 때', q: '가장 먼저 맞추고 싶은 것은?', options: ['누가 해도 확인할 수 있는 관리 기준', '서로 무리 없이 맡을 수 있는 관리 범위'], scores: ['T', 'F'] },
        { id: 'Q20', axis: 'JP', facet: 'change', label: '사육장 배치를 바꾸려 할 때', q: '실제로 손을 움직이는 방식은?', options: ['완성할 배치를 정한 뒤 순서대로 옮긴다', '한 곳을 옮겨보고 다음 위치를 찾아간다'], scores: ['J', 'P'] }
    ];

    const QUESTION_IMAGES = [
        'question-c01.webp', 'question-c02.webp', 'question-c04.webp', 'question-c08.webp',
        'question-c05.webp', 'question-c06.webp', 'question-c07.webp', 'question-c03.webp',
        'question-c10.webp', 'question-c10.webp', 'question-c11.webp', 'question-c12.webp',
        'question-c09.webp', 'question-c02.webp', 'question-c07.webp', 'question-c12.webp',
        'question-c05.webp', 'question-c06.webp', 'question-c01.webp', 'question-c08.webp'
    ];

    QUESTIONS.forEach((question, index) => {
        question.image = QUESTION_IMAGES[index];
        question.imageAlt = `${question.label} 상황 삽화`;
    });

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
            const group = shuffle(questions.filter(question => question.axis === axis), rng);
            const flipCount = axisIndex < 2 ? 3 : 2;
            group.slice(0, flipCount).forEach(question => {
                [question.options[0], question.options[1]] = [question.options[1], question.options[0]];
                [question.scores[0], question.scores[1]] = [question.scores[1], question.scores[0]];
                question.flipped = true;
            });
        });

        let ordered = questions;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const candidate = shuffle(questions, rng);
            if (candidate.every((question, index) => index === 0 || candidate[index - 1].axis !== question.axis)) {
                ordered = candidate;
                break;
            }
        }
        return ordered;
    }

    function scoreAnswers(questions, answers) {
        const letters = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
        questions.forEach((question, index) => {
            const choice = answers[index];
            const letter = question.scores[choice];
            if (letter in letters) letters[letter] += 1;
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
        buildMbtiComparison,
        buildTimingStats,
        buildSpeedBenchmark,
        chooseTendencyHouse,
        median,
        average
    };
}));

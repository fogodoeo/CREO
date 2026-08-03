(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SURVEY_VERSION = 'crewart-tendency-v8.1';
    const AXES = ['EI', 'SN', 'TF', 'JP'];
    const HOUSE_KEYS = ['SF', 'ST', 'NT', 'NF'];
    const MBTI_TYPES = [
        'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
        'ISTP', 'ISFP', 'INFP', 'INTP',
        'ESTP', 'ESFP', 'ENFP', 'ENTP',
        'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ];

    // v8.0 bias controls:
    // - both choices describe competent, responsible behaviour;
    // - no pole is framed as the emotional, careless, or less-informed answer;
    // - every axis samples five different behavioural facets;
    // - choices describe concrete micro-behaviours without naming the axis traits;
    // - option order is randomized later without changing the score mapping.
    const QUESTIONS = [
        { id: 'Q01', axis: 'EI', facet: 'processing', label: '새로 온 사진을 보니 후보가 둘로 좁혀졌다.', q: '마지막 판단을 정리할 때 나는?', options: ['두 사진을 보여주며 다른 사람과 의견을 나눈다', '두 사진을 번갈아 보며 내 생각을 정리한다'], scores: ['E', 'I'], previewOptions: ['동행인과 기준을 정해 비교한다', '동행인과 마음 가는 쪽을 이야기한다', '자리를 옮겨 기준대로 다시 본다', '자리를 옮겨 끌리는 쪽을 더 본다'], previewScores: [0, 0, 1, 1] },
        { id: 'Q02', axis: 'SN', facet: 'noticing', label: '지난달 사진과 오늘 사진을 나란히 놓았다.', q: '변화를 볼 때 먼저 확인하는 것은?', options: ['무늬·체중처럼 실제로 달라진 부분', '전체 모습이 어느 방향으로 변하는지'], scores: ['S', 'N'] },
        { id: 'Q03', axis: 'TF', facet: 'decision', label: '마음에 드는 두 크레 중 한 마리만 데려올 수 있다.', q: '끝까지 비교하게 되는 것은?', options: ['내 환경에서 더 안정적으로 관리할 수 있는 쪽', '내가 더 오래 애정을 갖고 돌볼 수 있는 쪽'], scores: ['T', 'F'] },
        { id: 'Q04', axis: 'JP', facet: 'readiness', label: '새 크레가 사흘 뒤 집에 온다.', q: '준비를 마쳤다고 느끼는 때는?', options: ['사육장 위치와 용품 배치를 모두 끝냈을 때', '필수 용품을 갖추고 반응에 맞출 여지를 남겼을 때'], scores: ['J', 'P'] },

        { id: 'Q05', axis: 'EI', facet: 'approach', label: '행사에서 두 후보의 설명을 모두 들었다.', q: '결정을 정리할 때 더 가까운 행동은?', options: ['동행인과 사진을 보며 생각을 말해본다', '잠시 자리를 옮겨 사진을 조용히 다시 본다'], scores: ['E', 'I'] },
        { id: 'Q06', axis: 'SN', facet: 'tracking', label: '체중이 한 번 줄었다가 다시 돌아왔다.', q: '기록에서 먼저 확인하는 것은?', options: ['줄어든 날 먹이와 온도에 무엇이 달랐는지', '비슷한 오르내림이 전에도 반복됐는지'], scores: ['S', 'N'] },
        { id: 'Q07', axis: 'TF', facet: 'advice', label: '친구가 조건이 비슷한 두 크레 중 고민한다.', q: '먼저 건네는 말은?', options: ['관리할 때 실제로 달라지는 점부터 비교해봐', '어느 쪽을 놓치면 더 아쉬울지 생각해봐'], scores: ['T', 'F'] },
        { id: 'Q08', axis: 'JP', facet: 'selection', label: '저장해둔 분양 사진이 열 장 넘게 쌓였다.', q: '후보를 줄일 때 더 가까운 방법은?', options: ['같은 기준으로 한 번에 비교해 몇 장만 남긴다', '가장 끌리는 사진부터 보며 하나씩 제외한다'], scores: ['J', 'P'] },

        { id: 'Q09', axis: 'EI', facet: 'learning', label: '새 먹이 방법을 일주일 시험해봤다.', q: '다음 방법을 정할 때 나는?', options: ['경험을 공유하고 다른 집사의 반응을 참고한다', '내 급여 기록을 다시 보고 바꿀 점을 정한다'], scores: ['E', 'I'] },
        { id: 'Q10', axis: 'SN', facet: 'interpretation', label: '성체용 사육장으로 바꿀 시기가 다가온다.', q: '사육장 크기를 정할 때 먼저 보는 것은?', options: ['지금 몸길이와 실제로 사용하는 공간', '앞으로 자랄 크기와 움직임의 변화'], scores: ['S', 'N'] },
        { id: 'Q11', axis: 'TF', facet: 'disagreement', label: '같은 문제를 두 사람이 다르게 해결했다.', q: '먼저 궁금한 것은?', options: ['어떤 환경에서 결과가 달라졌는지', '왜 그 방법을 계속 쓰게 됐는지'], scores: ['T', 'F'] },
        { id: 'Q12', axis: 'JP', facet: 'routine', label: '오늘 청소할 사육장이 여러 개인데 시간이 부족하다.', q: '남은 시간을 쓰는 방식은?', options: ['정해둔 곳부터 끝낼 수 있는 만큼 마친다', '전체를 빠르게 보고 급한 곳부터 처리한다'], scores: ['J', 'P'] },

        { id: 'Q13', axis: 'EI', facet: 'reward', label: '기다리던 성장 변화가 뚜렷하게 보였다.', q: '사진을 찍은 다음 더 가까운 행동은?', options: ['지인이나 커뮤니티에 바로 보여준다', '예전 사진과 먼저 비교해본다'], scores: ['E', 'I'] },
        { id: 'Q14', axis: 'SN', facet: 'recall', label: '행사에서 여러 크레를 보고 집에 돌아왔다.', q: '나중에도 더 선명한 것은?', options: ['특이했던 무늬나 눈 색처럼 구체적인 모습', '자라면 어떤 분위기가 될지 떠올린 모습'], scores: ['S', 'N'] },
        { id: 'Q15', axis: 'TF', facet: 'boundary', label: '마음에 들지만 이번에는 데려오지 않기로 했다.', q: '마음을 정리할 때 더 크게 작용하는 것은?', options: ['예산이나 사육 공간이 정한 선을 넘는다는 점', '지금 데려오면 충분히 마음 써주기 어렵다는 점'], scores: ['T', 'F'] },
        { id: 'Q16', axis: 'JP', facet: 'disruption', label: '예상보다 늦게 집에 도착해 관리 시간이 줄었다.', q: '평소 순서를 모두 지키기 어려울 때 나는?', options: ['꼭 할 일만 남긴 짧은 순서대로 진행한다', '각 사육장 상태를 보며 필요한 것부터 한다'], scores: ['J', 'P'] },

        { id: 'Q17', axis: 'EI', facet: 'contribution', label: '커뮤니티에 내가 겪었던 문제가 질문으로 올라왔다.', q: '답변할 때 더 가까운 방식은?', options: ['아는 내용을 먼저 쓰고 질문을 받으며 보탠다', '당시 기록을 확인한 뒤 한 번에 정리해 올린다'], scores: ['E', 'I'] },
        { id: 'Q18', axis: 'SN', facet: 'anomaly', label: '평소 잘 먹던 크레가 오늘 먹이를 남겼다.', q: '먼저 확인하는 것은?', options: ['오늘 온도와 먹이 양처럼 바로 달라진 점', '최근 며칠 동안 함께 달라진 행동'], scores: ['S', 'N'] },
        { id: 'Q19', axis: 'TF', facet: 'coordination', label: '두 사람이 크레 돌봄을 나눠 맡기로 했다.', q: '역할을 정할 때 먼저 맞추는 것은?', options: ['누가 맡아도 같은 결과가 나오는 관리 기준', '각자가 잘하고 부담 없이 맡을 수 있는 일'], scores: ['T', 'F'] },
        { id: 'Q20', axis: 'JP', facet: 'change', label: '사육장 세 개의 위치를 바꾸기로 했다.', q: '옮길 때 더 가까운 방식은?', options: ['새 배치를 먼저 정하고 한 번에 옮긴다', '하나를 옮겨본 뒤 다음 위치를 정한다'], scores: ['J', 'P'] }
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
            previewOptions: question.previewOptions?.slice(),
            previewScores: question.previewScores?.slice(),
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
            const group = shuffle(questions.filter(question => question.axis === axis && !question.previewOptions), rng);
            const flipCount = axisIndex < 2 ? 3 : 2;
            group.slice(0, flipCount).forEach(question => {
                [question.options[0], question.options[1]] = [question.options[1], question.options[0]];
                [question.scores[0], question.scores[1]] = [question.scores[1], question.scores[0]];
                question.flipped = true;
            });
        });

        questions.filter(question => question.previewOptions).forEach(question => {
            const preview = shuffle(question.previewOptions.map((option, index) => ({
                option,
                score: question.previewScores[index]
            })), rng);
            question.previewOptions = preview.map(item => item.option);
            question.previewScores = preview.map(item => item.score);
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

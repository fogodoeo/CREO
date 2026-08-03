(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SURVEY_VERSION = 'crewart-tendency-v3.0';
    const AXES = ['EI', 'SN', 'TF', 'JP'];
    const HOUSE_KEYS = ['SF', 'ST', 'NT', 'NF'];
    const MBTI_TYPES = [
        'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
        'ISTP', 'ISFP', 'INFP', 'INTP',
        'ESTP', 'ESFP', 'ENFP', 'ENTP',
        'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ];

    // v2.0 bias controls:
    // - both choices describe competent, responsible behaviour;
    // - no pole is framed as the emotional, careless, or less-informed answer;
    // - every axis samples five different behavioural facets;
    // - option order is randomized later without changing the score mapping.
    const QUESTIONS = [
        { id: 'Q01', axis: 'EI', facet: 'processing', label: '두 마리 사이에서 고민할 때', q: '둘 다 마음에 든다. 먼저 하는 일은?', options: ['친구와 이야기하며 내 기준을 찾는다', '사진과 기록을 보며 혼자 기준을 정리한다'], scores: ['E', 'I'] },
        { id: 'Q02', axis: 'SN', facet: 'evidence', label: '짧은 설명을 들었을 때', q: '개체를 더 알아보려면 먼저?', options: ['현재 체중과 최근 먹이 반응을 묻는다', '부모·형제의 성장 흐름을 함께 묻는다'], scores: ['S', 'N'] },
        { id: 'Q03', axis: 'TF', facet: 'resources', label: '마지막 한 마리를 고를 때', q: '조건이 비슷한 두 개체 중 마지막 기준은?', options: ['비용과 관리 조건을 다시 비교한다', '내 생활과 애착이 오래 갈 쪽을 본다'], scores: ['T', 'F'] },
        { id: 'Q04', axis: 'JP', facet: 'setup', label: '새 크레를 맞이할 때', q: '새 크레가 오기 전, 나는?', options: ['필요한 환경과 물품을 미리 갖춰 둔다', '필수 환경부터 준비하고 반응에 맞춰 보완한다'], scores: ['J', 'P'] },

        { id: 'Q05', axis: 'EI', facet: 'recovery', label: '행사를 마치고 돌아왔을 때', q: '집에 돌아온 저녁, 먼저 하고 싶은 일은?', options: ['기억에 남은 일을 사람들과 나눈다', '혼자 쉬며 본 것과 느낀 점을 정리한다'], scores: ['E', 'I'] },
        { id: 'Q06', axis: 'SN', facet: 'tracking', label: '성장 기록을 볼 때', q: '석 달치 기록에서 먼저 보이는 것은?', options: ['날짜별 체중과 먹이 반응의 차이', '변화가 이어지는 전체 성장 흐름'], scores: ['S', 'N'] },
        { id: 'Q07', axis: 'TF', facet: 'advice', label: '친구의 선택을 도울 때', q: '친구가 두 개체 중 고민한다. 먼저 묻는 것은?', options: ['각 선택의 장단점과 필요한 조건', '친구의 생활 방식과 마음이 가는 쪽'], scores: ['T', 'F'] },
        { id: 'Q08', axis: 'JP', facet: 'bidding', label: '경매 목록을 열었을 때', q: '관심 있는 개체가 여럿 보인다. 나는?', options: ['후보와 최대 금액을 먼저 정한다', '흐름을 보며 후보와 금액을 조정한다'], scores: ['J', 'P'] },

        { id: 'Q09', axis: 'EI', facet: 'learning', label: '낯선 사육법을 배울 때', q: '처음 접한 방법을 이해하려면?', options: ['경험자와 대화하며 핵심을 잡는다', '자료를 읽으며 핵심과 질문을 정리한다'], scores: ['E', 'I'] },
        { id: 'Q10', axis: 'SN', facet: 'classification', label: '낯선 특징을 발견했을 때', q: '처음 보는 색과 무늬가 눈에 띈다. 나는 먼저?', options: ['지금 보이는 특징을 익숙한 개체와 비교한다', '혈통과 조합에서 다음 변화를 상상한다'], scores: ['S', 'N'] },
        { id: 'Q11', axis: 'TF', facet: 'disagreement', label: '관리 의견이 갈렸을 때', q: '서로 다른 방법을 추천받았다. 먼저 볼 것은?', options: ['같은 조건에서 확인한 결과와 근거', '개체 반응과 돌보는 사람의 상황'], scores: ['T', 'F'] },
        { id: 'Q12', axis: 'JP', facet: 'routine', label: '매일 관리할 때', q: '급여와 청소를 이어가기 편한 방식은?', options: ['정한 주기와 순서대로 관리한다', '그날 상태에 맞춰 순서를 바꾼다'], scores: ['J', 'P'] },

        { id: 'Q13', axis: 'EI', facet: 'stimulation', label: '경매에서 낙찰받았을 때', q: '치열했던 경매 끝에 원하던 개체를 낙찰받았다! 나는?', options: ['사진과 소식을 바로 공유하며 자랑한다', '조용히 한숨 돌리며 결제와 사육장을 준비한다'], scores: ['E', 'I'] },
        { id: 'Q14', axis: 'SN', facet: 'planning', label: '다음 한 마리를 계획할 때', q: '컬렉션에 더할 방향을 정한다. 먼저 보는 것은?', options: ['지금 비어 있는 색과 무늬의 특징', '앞으로 이어 가고 싶은 성장 라인'], scores: ['S', 'N'] },
        { id: 'Q15', axis: 'TF', facet: 'boundaries', label: '데려오지 않기로 정했을 때', q: '좋아 보이지만 이번에는 보내준다. 결정적인 이유는?', options: ['확인한 조건이 내 선택 기준과 달라서', '내 생활에서 오래 마음 쓰기 어려워서'], scores: ['T', 'F'] },
        { id: 'Q16', axis: 'JP', facet: 'disruption', label: '바쁜 한 주를 앞두고', q: '다음 주 일정이 자주 바뀐다. 관리는?', options: ['며칠치 할 일과 대안을 미리 짠다', '그날 시간과 개체 상태에 맞춰 정한다'], scores: ['J', 'P'] },

        { id: 'Q17', axis: 'EI', facet: 'reward', label: '좋은 변화를 발견했을 때', q: '기다리던 변화가 보였다. 더 뿌듯한 순간은?', options: ['사진과 과정을 공유하며 함께 기뻐할 때', '전후 기록을 조용히 비교하며 확인할 때'], scores: ['E', 'I'] },
        { id: 'Q18', axis: 'SN', facet: 'anomaly', label: '예상과 다르게 자랐을 때', q: '기대와 다른 변화가 보였다. 먼저 기록할 것은?', options: ['언제 어떤 특징이 달라졌는지', '여러 변화가 어떤 흐름으로 이어졌는지'], scores: ['S', 'N'] },
        { id: 'Q19', axis: 'TF', facet: 'collaboration', label: '함께 계획을 정할 때', q: '브리딩 방향을 두고 의견이 갈렸다. 먼저 맞출 것은?', options: ['확인 기준과 계획을 멈출 조건', '서로 중요하게 여기는 점과 부담'], scores: ['T', 'F'] },
        { id: 'Q20', axis: 'JP', facet: 'change', label: '사육장을 바꿀 때', q: '환경을 한 단계 바꾸려 한다. 나는?', options: ['목표와 필요한 물품을 정해 한 번에 바꾼다', '하나씩 바꾸며 개체 반응을 확인한다'], scores: ['J', 'P'] }
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

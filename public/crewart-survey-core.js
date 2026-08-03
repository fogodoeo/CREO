(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SURVEY_VERSION = 'crewart-tendency-v6.0';
    const AXES = ['EI', 'SN', 'TF', 'JP'];
    const HOUSE_KEYS = ['SF', 'ST', 'NT', 'NF'];
    const MBTI_TYPES = [
        'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
        'ISTP', 'ISFP', 'INFP', 'INTP',
        'ESTP', 'ESFP', 'ENFP', 'ENTP',
        'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    ];

    // v6.0 bias controls:
    // - both choices describe competent, responsible behaviour;
    // - no pole is framed as the emotional, careless, or less-informed answer;
    // - every axis samples five different behavioural facets;
    // - choices describe concrete micro-behaviours without naming the axis traits;
    // - option order is randomized later without changing the score mapping.
    const QUESTIONS = [
        { id: 'Q01', axis: 'EI', facet: 'processing', label: '분양자에게 새 사진과 설명이 도착했다.', q: '궁금한 점이 생기면 보통?', options: ['사진을 보며 떠오르는 대로 묻고 답을 잇는다', '사진을 다 본 뒤 궁금한 점을 묶어 보낸다'], scores: ['E', 'I'] },
        { id: 'Q02', axis: 'SN', facet: 'noticing', label: '처음 보는 크레를 손 위에서 만났다.', q: '가장 먼저 눈에 들어오는 건?', options: ['발가락과 꼬리, 피부의 작은 차이', '무늬와 체형이 함께 만드는 전체 느낌'], scores: ['S', 'N'] },
        { id: 'Q03', axis: 'TF', facet: 'decision', label: '마음에 드는 두 마리 중 하나만 데려올 수 있다.', q: '마지막으로 확인하는 건?', options: ['두 마리를 같은 항목에 놓고 차이를 다시 본다', '내가 오래 돌보는 장면이 자연스러운 쪽을 본다'], scores: ['T', 'F'] },
        { id: 'Q04', axis: 'JP', facet: 'readiness', label: '새 크레가 이번 주에 집에 온다.', q: '준비됐다는 느낌이 드는 때는?', options: ['온도계와 용품이 쓸 자리에 모두 놓였을 때', '기본 환경을 갖춰 첫 반응에 맞출 수 있을 때'], scores: ['J', 'P'] },

        { id: 'Q05', axis: 'EI', facet: 'approach', label: '처음 간 파충류 행사에서 눈길 가는 크레를 봤다.', q: '더 알고 싶을 때의 모습은?', options: ['설명을 들으며 바로 질문을 주고받는다', '한동안 살펴보고 궁금한 것만 골라 묻는다'], scores: ['E', 'I'] },
        { id: 'Q06', axis: 'SN', facet: 'tracking', label: '몇 달치 체중과 먹이 기록을 펼쳐봤다.', q: '변화를 찾을 때 먼저 보는 곳은?', options: ['먹이와 체중이 달라진 각각의 날짜', '변화가 시작되고 흐름이 꺾인 구간'], scores: ['S', 'N'] },
        { id: 'Q07', axis: 'TF', facet: 'advice', label: '친구가 두 크레 사이에서 고민하고 있다.', q: '처음 건넬 말에 더 가까운 건?', options: ['두 후보를 같은 항목으로 다시 비교해보자 한다', '계속 마음이 갔던 순간을 떠올려보라 한다'], scores: ['T', 'F'] },
        { id: 'Q08', axis: 'JP', facet: 'selection', label: '분양 목록에 후보 사진이 한 화면 가득하다.', q: '후보를 줄여가는 방식은?', options: ['전체를 훑고 다시 볼 사진에 표시해 둔다', '끌리는 사진을 열어보며 다음 후보를 찾는다'], scores: ['J', 'P'] },

        { id: 'Q09', axis: 'EI', facet: 'learning', label: '처음 해보는 관리법을 며칠 적용해봤다.', q: '내 방식으로 익숙해지는 과정은?', options: ['해본 과정을 설명하며 빠진 부분을 발견한다', '전후 차이를 되짚어 짧은 기록으로 남긴다'], scores: ['E', 'I'] },
        { id: 'Q10', axis: 'SN', facet: 'interpretation', label: '사육장 위치를 바꾼 다음 날이다.', q: '잘 적응하는지 살필 때는?', options: ['먹이 반응과 머문 위치가 달라졌는지 본다', '이 변화가 다음 생활 리듬을 바꿀지 본다'], scores: ['S', 'N'] },
        { id: 'Q11', axis: 'TF', facet: 'disagreement', label: '같은 문제에 서로 다른 관리법을 추천받았다.', q: '차이를 이해하려고 먼저 묻는 건?', options: ['온도와 기간처럼 서로 같은 조건부터 맞춰본다', '각 방식이 어떤 크레와 보호자에게 맞았는지 묻는다'], scores: ['T', 'F'] },
        { id: 'Q12', axis: 'JP', facet: 'routine', label: '급여와 청소가 한꺼번에 겹친 저녁이다.', q: '몸이 먼저 움직이는 방식은?', options: ['한 곳을 모두 마친 뒤 다음 곳으로 간다', '한 바퀴 살피며 눈에 띈 일부터 한다'], scores: ['J', 'P'] },

        { id: 'Q13', axis: 'EI', facet: 'reward', label: '기다리던 성장 변화가 드디어 보였다.', q: '기쁨이 가장 실감 나는 때는?', options: ['소식을 전하고 돌아오는 반응을 마주할 때', '예전 모습과 나란히 보며 차이를 발견할 때'], scores: ['E', 'I'] },
        { id: 'Q14', axis: 'SN', facet: 'recall', label: '어린 크레 여러 마리를 보고 집에 돌아왔다.', q: '오래 기억에 남는 쪽은?', options: ['색이나 무늬의 한 부분이 선명했던 크레', '자란 뒤 모습까지 자꾸 상상되던 크레'], scores: ['S', 'N'] },
        { id: 'Q15', axis: 'TF', facet: 'boundary', label: '마음에 들지만 이번에는 데려오지 않기로 했다.', q: '결정을 지키게 하는 생각은?', options: ['처음 세운 조건에서 벗어난 점이 있었다', '지금 생활과 오래 맞추기 어렵다고 느꼈다'], scores: ['T', 'F'] },
        { id: 'Q16', axis: 'JP', facet: 'disruption', label: '예상보다 늦게 집에 도착한 날이다.', q: '남은 관리를 시작하는 방식은?', options: ['평소 하던 일에서 오늘 뺄 것부터 고른다', '전체 상태를 본 뒤 급해 보이는 일부터 한다'], scores: ['J', 'P'] },

        { id: 'Q17', axis: 'EI', facet: 'contribution', label: '커뮤니티에 내가 겪어본 질문이 올라왔다.', q: '답을 남기는 모습은?', options: ['겪은 일을 먼저 적고 추가 질문에 답한다', '기록을 확인한 뒤 한 번에 정리해 답한다'], scores: ['E', 'I'] },
        { id: 'Q18', axis: 'SN', facet: 'anomaly', label: '크레가 평소와 다른 행동을 보인다.', q: '원인을 알아보는 첫 행동은?', options: ['온도와 먹이 등 지금 달라진 점을 확인한다', '최근 며칠의 변화를 이어서 흐름을 살핀다'], scores: ['S', 'N'] },
        { id: 'Q19', axis: 'TF', facet: 'coordination', label: '둘이 나눠 돌보다 관리 방식이 달라졌다.', q: '먼저 맞추고 싶은 건?', options: ['누가 맡아도 확인되는 공통 항목', '각자 오래 무리 없이 맡을 수 있는 범위'], scores: ['T', 'F'] },
        { id: 'Q20', axis: 'JP', facet: 'change', label: '사육장 여러 개의 배치를 바꾸기로 했다.', q: '실제로 자리를 옮기는 방식은?', options: ['빈자리를 만든 뒤 한 번에 자리를 바꾼다', '하나를 옮긴 자리에 다음 것을 맞춰간다'], scores: ['J', 'P'] }
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

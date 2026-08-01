(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CrewartSurveyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SURVEY_VERSION = 'cre-mbti-v2.0';
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
        { id: 'Q01', axis: 'EI', facet: 'processing', label: '선택이 막혔을 때', q: '후보 둘 사이에서 생각이 엉켰다. 자연스럽게 먼저 하는 것은?', options: ['누군가에게 상황을 말하며 기준을 찾아간다', '사진과 메모를 혼자 다시 보며 기준을 세운다'], scores: ['E', 'I'] },
        { id: 'Q02', axis: 'SN', facet: 'evidence', label: '짧은 설명을 들을 때', q: '판매자의 설명을 3분만 들을 수 있다. 먼저 확인하고 싶은 것은?', options: ['현재 체중·먹이 반응·사진에서 보이는 특징', '부모·형제의 변화와 이 조합이 보여온 흐름'], scores: ['S', 'N'] },
        { id: 'Q03', axis: 'TF', facet: 'resources', label: '예산을 넘었을 때', q: '매력적인 개체가 정한 예산을 넘었다. 결정을 정리하는 기준은?', options: ['우선순위와 총비용을 다시 계산해 선을 정한다', '내 생활에 들일 의미와 오래 책임질 마음을 살핀다'], scores: ['T', 'F'] },
        { id: 'Q04', axis: 'JP', facet: 'setup', label: '입양을 준비할 때', q: '새 크레가 오기 전 사육장은 어떻게 준비할까?', options: ['필요 항목을 점검해 입주 전 기준까지 맞춘다', '필수 조건부터 갖추고 반응을 보며 세부를 맞춘다'], scores: ['J', 'P'] },

        { id: 'Q05', axis: 'EI', facet: 'recovery', label: '행사를 마친 저녁', q: '크레 행사에서 돌아온 뒤 가장 먼저 하고 싶은 것은?', options: ['만난 사람들과 인상 깊었던 장면을 나눈다', '혼자 쉬며 본 것과 느낀 점을 정리한다'], scores: ['E', 'I'] },
        { id: 'Q06', axis: 'SN', facet: 'tracking', label: '성장 기록을 볼 때', q: '같은 크레의 석 달 기록을 펼쳤다. 먼저 잡히는 것은?', options: ['날짜별 체중·색·먹이 반응의 구체적인 차이', '여러 변화가 함께 향하는 전체 성장 패턴'], scores: ['S', 'N'] },
        { id: 'Q07', axis: 'TF', facet: 'advice', label: '친구의 선택을 도울 때', q: '친구가 두 개체 중 골라 달라고 한다. 어떤 질문부터 할까?', options: ['각 선택에서 얻고 잃는 조건이 무엇인지', '어느 선택이 친구의 생활과 취향에 더 맞는지'], scores: ['T', 'F'] },
        { id: 'Q08', axis: 'JP', facet: 'bidding', label: '경매를 시작할 때', q: '경매 목록을 처음 펼쳤다. 나에게 더 편한 진행 방식은?', options: ['후보와 상한선을 정하고 그 범위 안에서 본다', '전체 흐름을 보며 후보와 상한선을 계속 조정한다'], scores: ['J', 'P'] },

        { id: 'Q09', axis: 'EI', facet: 'learning', label: '낯선 방법을 배울 때', q: '처음 보는 사육 방법을 이해해야 한다. 더 편한 시작은?', options: ['경험자와 문답을 주고받으며 범위를 좁힌다', '자료를 읽고 내 질문을 정리한 뒤 묻는다'], scores: ['E', 'I'] },
        { id: 'Q10', axis: 'SN', facet: 'classification', label: '낯선 표현을 볼 때', q: '처음 보는 표현의 크레를 만났다. 이해를 시작하는 방식은?', options: ['눈에 보이는 부분을 기존 개체와 하나씩 비교한다', '관련 혈통과 조합을 연결해 가능한 설명을 그린다'], scores: ['S', 'N'] },
        { id: 'Q11', axis: 'TF', facet: 'disagreement', label: '관리 의견이 갈릴 때', q: '같은 관리 문제를 두고 의견이 갈렸다. 내 판단을 움직이는 것은?', options: ['조건을 같게 두고 다시 확인한 결과', '그 개체의 반응과 돌보는 사람의 현실적인 맥락'], scores: ['T', 'F'] },
        { id: 'Q12', axis: 'JP', facet: 'routine', label: '관리를 이어갈 때', q: '급여와 청소를 오래 이어갈 때 더 편한 방식은?', options: ['정한 주기와 순서로 하고 변화만 따로 기록한다', '매일 상태를 보고 필요한 관리부터 조정한다'], scores: ['J', 'P'] },

        { id: 'Q13', axis: 'EI', facet: 'stimulation', label: '입찰이 뜨거워질 때', q: '원하던 개체의 입찰이 치열해졌다. 내 반응에 가까운 것은?', options: ['옆 사람과 상황을 주고받으며 긴장을 푼다', '화면에 집중하고 속으로 판단을 정리한다'], scores: ['E', 'I'] },
        { id: 'Q14', axis: 'SN', facet: 'planning', label: '다음 개체를 정할 때', q: '다음 한 마리를 계획하며 내 목록을 보는 관점은?', options: ['현재 보유 개체 사이에 비어 있는 특징을 찾는다', '앞으로 만들고 싶은 라인의 방향을 먼저 그린다'], scores: ['S', 'N'] },
        { id: 'Q15', axis: 'TF', facet: 'boundaries', label: '데려오지 않기로 했을 때', q: '좋아 보이지만 이번에는 데려오지 않기로 했다. 이유를 설명한다면?', options: ['충족되지 않은 조건과 선택 기준을 말한다', '지금 함께하기 어려운 생활상의 이유를 말한다'], scores: ['T', 'F'] },
        { id: 'Q16', axis: 'JP', facet: 'disruption', label: '바쁜 주를 앞두고', q: '다음 주 일정이 불규칙하다. 크레 관리를 어떻게 준비할까?', options: ['며칠치 할 일을 나누고 대체 계획도 적어 둔다', '매일 가능한 시간과 상태에 맞춰 우선순위를 정한다'], scores: ['J', 'P'] },

        { id: 'Q17', axis: 'EI', facet: 'reward', label: '좋은 변화를 발견했을 때', q: '오래 기다린 긍정적 변화가 보였다. 만족이 가장 커지는 순간은?', options: ['과정을 보여주고 함께 반응을 나눌 때', '기록을 완성하고 스스로 변화를 확인할 때'], scores: ['E', 'I'] },
        { id: 'Q18', axis: 'SN', facet: 'anomaly', label: '예상과 다르게 자랐을 때', q: '예상과 다른 모습으로 자랐다. 가장 먼저 남길 기록은?', options: ['언제 무엇이 달라졌는지 관찰 조건과 함께 적는다', '변화들이 어떻게 이어졌는지 가설 지도로 묶는다'], scores: ['S', 'N'] },
        { id: 'Q19', axis: 'TF', facet: 'collaboration', label: '함께 계획을 정할 때', q: '공동 브리딩 계획에서 의견이 갈렸다. 합의의 출발점은?', options: ['검증할 기준과 중단 조건을 명확히 맞춘다', '각자가 중요하게 여기는 가치와 부담을 맞춘다'], scores: ['T', 'F'] },
        { id: 'Q20', axis: 'JP', facet: 'change', label: '사육장을 바꿀 때', q: '사육장을 업그레이드하려 한다. 더 자연스러운 진행은?', options: ['목표와 부품을 정리해 한 번의 작업으로 마친다', '한 요소씩 바꾸고 반응을 확인한 뒤 다음을 정한다'], scores: ['J', 'P'] }
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

    function stableHash(value) {
        let hash = 2166136261;
        String(value || '').split('').forEach(character => {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        });
        return hash >>> 0;
    }

    function chooseBalancedHouse(result, counts, seed) {
        const safeCounts = Object.fromEntries(HOUSE_KEYS.map(key => [key, Math.max(0, Number(counts?.[key]) || 0)]));
        const minimum = Math.min(...HOUSE_KEYS.map(key => safeCounts[key]));
        const candidates = HOUSE_KEYS.filter(key => safeCounts[key] === minimum);
        const affinity = {
            SF: result.letters.S + result.letters.F,
            ST: result.letters.S + result.letters.T,
            NT: result.letters.N + result.letters.T,
            NF: result.letters.N + result.letters.F
        };
        const bestScore = Math.max(...candidates.map(key => affinity[key]));
        const best = candidates.filter(key => affinity[key] === bestScore);
        return best[stableHash(seed) % best.length];
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
        chooseBalancedHouse,
        median,
        average
    };
}));

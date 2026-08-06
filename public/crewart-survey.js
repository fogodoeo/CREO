(function () {
    'use strict';

    const Core = window.CrewartSurveyCore;
    const SURVEY_URL = 'https://creok.onrender.com/crewart-survey.html';
    const DEFAULT_BAND_URL = 'https://www.band.us/band/101992972/post';
    const BAND_MEMBER_API = '/api/band-membership';
    const KAKAO_JS_KEY = 'db7ffc8d6b9b7601b792ed69be4658fc';
    const TYPE_CHARACTER_ROOT = 'assets/crewart-types/';
    const TYPE_CHARACTER_VERSION = '20260802-character-v1';
    const MEMBERSHIP_STORAGE_KEY = 'crewart_band_member_access_v1';
    const MEMBERSHIP_PHONE_STORAGE_KEY = 'crewart_band_member_phone_mask_v1';
    const LAST_RESULT_STORAGE_KEY = 'crewart_last_result_v1';
    const LAST_RESULT_VERSION = 1;
    const LEGACY_RESULT_QUESTION_VERSIONS = Object.freeze([
        'crewart-tendency-v8.1',
        'crewart-tendency-v8.0'
    ]);
    const isCompatibleResultQuestionVersion = version => (
        version === Core.SURVEY_VERSION || LEGACY_RESULT_QUESTION_VERSIONS.includes(version)
    );
    const MEMBERSHIP_RECHECK_VISIBLE_MS = 1000;
    const MEMBERSHIP_RECHECK_HIDDEN_MS = 10000;
    const MEMBERSHIP_RECHECK_TIMEOUT_MS = 15 * 60 * 1000;
    const CONTENT_CONFIG_KEY = 'crewart_mbti_content_v1';
    const BAND_INTEGRATION_ENABLED = true;
    const APP_HISTORY_KEY = 'crewartTab';
    const APP_TABS = Object.freeze(['home', 'result', 'band']);
    const AXIS_REPORT_COPY = Object.freeze({
        EI: { title: '생각 정리', left: '함께 정리', right: '혼자 정리' },
        SN: { title: '관찰 초점', left: '현재 정보', right: '성장 가능성' },
        TF: { title: '선택 기준', left: '조건·근거', right: '취향·관계' },
        JP: { title: '사육 방식', left: '계획·준비', right: '유연·조정' }
    });
    const TYPE_CHANGE_ANALYSIS = Object.freeze({
        'E>I': '크레 관련 상황에서는 외부 반응보다 독립적인 관찰과 내부 검토의 비중이 높아졌습니다.',
        'I>E': '크레 관련 상황에서는 경험을 주고받는 과정이 판단을 정리하는 데 더 크게 작용했습니다.',
        'S>N': '현재 상태를 확인하는 데서 더 나아가 성장 흐름과 이후 변화까지 먼저 그리는 경향이 나타났습니다.',
        'N>S': '예상되는 변화보다 지금 직접 확인할 수 있는 상태와 차이를 우선하는 경향이 나타났습니다.',
        'T>F': '동일한 조건 비교보다 취향, 관계, 장기적인 만족도를 더 크게 반영했습니다.',
        'F>T': '개인적인 만족만큼 비교 가능한 조건과 판단의 일관성을 더 크게 반영했습니다.',
        'J>P': '미리 정한 운영 방식보다 실제 반응에 맞춰 다음 행동을 조정하는 경향이 나타났습니다.',
        'P>J': '상황에 따라 움직이기보다 범위와 완료 기준을 먼저 정하는 경향이 나타났습니다.'
    });
    const HOUSE_REPORT_COPY = Object.freeze({
        SF: '지금의 감각과 관계를 세심하게 챙기는 기숙사',
        ST: '확인되는 정보와 근거로 안정적으로 운영하는 기숙사',
        NT: '가능성을 논리적으로 설계하고 실험하는 기숙사',
        NF: '성장 가능성과 관계를 연결해 방향을 만드는 기숙사'
    });
    const HOUSE_READINGS = Object.freeze({
        SF: '이곳에는 크레의 작은 표정과 컨디션 변화를 먼저 알아보는 사람들이 모입니다. 누군가 지나친 신호도 조용히 챙겨 편안한 분위기로 바꾸고, 처음 온 사람까지 자연스럽게 자리를 잡게 해요. 다만 모두를 살피느라 자신의 여유를 놓치지 않도록, 가끔은 돌봄을 나누어 맡는 것이 좋습니다.',
        ST: '이곳에서는 해야 할 일이 흐트러진 채 오래 남지 않습니다. 확인한 정보를 기준으로 순서를 세우고, 누구나 다시 따라 할 수 있는 방식으로 정리하는 사람들이 중심을 잡아요. 익숙한 방법이 안정감을 주지만, 새로운 신호가 보이는 날에는 작은 예외 하나를 허용해도 괜찮습니다.',
        NT: '이곳에는 당연하게 여겨온 방식에도 한 번쯤 새로운 질문을 던지는 사람들이 모입니다. 흩어진 단서를 연결해 원리를 찾고, 더 나은 환경과 다음 시도를 설계하며 커뮤니티의 가능성을 넓혀가요. 좋은 생각이 머릿속에만 머물지 않도록 가장 작은 실험부터 시작해보세요.',
        NF: '이곳에서는 한 마리의 성장도 사람들을 이어주는 이야기가 됩니다. 아직 드러나지 않은 가능성을 먼저 발견하고, 서로 다른 마음이 같은 방향을 바라보도록 분위기를 만드는 사람들이 많아요. 오래 이어질 이야기에는 현실적인 일정과 역할도 필요하다는 점만 함께 기억하면 좋습니다.'
    });
    const AXIS_DETAIL_GUIDE = Object.freeze({
        E: {
            summary: '생각을 완성한 뒤 말하기보다, 주고받는 과정에서 생각이 완성되는 쪽에 가깝습니다.',
            signals: ['처음 보는 상황에서도 질문과 반응을 빠르게 연결해 필요한 정보를 끌어냅니다.', '혼자라면 지나칠 단서도 대화 속에서 발견해 다음 행동으로 옮기는 힘이 있습니다.'],
            balance: '의견이 많이 들어오는 날에는 결정 전에 잠깐 멈춰 “내가 처음 중요하게 본 것은 무엇이었나”를 확인하면 중심을 지키기 쉽습니다.'
        },
        I: {
            summary: '말보다 관찰이 먼저이고, 충분히 정리된 생각을 필요한 순간에 꺼내는 쪽에 가깝습니다.',
            signals: ['겉으로 조용해 보여도 안에서는 조건과 차이를 촘촘하게 비교합니다.', '시간을 두고 다시 볼 때 작은 변화와 누락을 발견하는 집중력이 돋보입니다.'],
            balance: '확신이 생길 때까지 검토가 길어질 수 있으니 결정 시점을 먼저 정해두면 좋은 관찰을 실제 행동으로 연결하기 쉽습니다.'
        },
        S: {
            summary: '막연한 인상보다 지금 눈앞에서 확인되는 작은 차이를 놓치지 않는 쪽에 가깝습니다.',
            signals: ['컨디션 변화가 생기면 실제로 달라진 지점을 빠르게 찾아냅니다.', '확인한 사실을 급여·온도·환경 같은 구체적인 관리 행동으로 바꾸는 힘이 있습니다.'],
            balance: '현재 상태를 정확히 보는 강점에 최근의 흐름까지 함께 붙이면, 문제가 커지기 전 다음 변화를 예상하기 쉬워집니다.'
        },
        N: {
            summary: '현재의 한 장면보다 여러 단서를 연결해 다음 모습을 그리는 쪽에 가깝습니다.',
            signals: ['따로 보이는 기록에서도 성장의 방향과 반복되는 흐름을 찾아냅니다.', '아직 드러나지 않은 변화와 새로운 조합을 먼저 발견하는 상상력이 돋보입니다.'],
            balance: '떠오른 그림을 선택으로 옮기기 전에 현재 컨디션과 관리 여건을 한 번 확인하면 아이디어의 실현 가능성이 높아집니다.'
        },
        T: {
            summary: '마음이 가는 것과 실제로 맞는 조건을 분리해, 설명 가능한 선택을 만드는 쪽에 가깝습니다.',
            signals: ['문제가 생기면 감정에 휩쓸리기보다 원인과 해결 순서를 빠르게 나눕니다.', '판단 기준이 분명해 경험을 다른 사람도 다시 활용할 수 있는 정보로 만드는 힘이 있습니다.'],
            balance: '조건 차이가 거의 없는 선택에서는 오래 보고 싶은 마음도 하나의 유효한 기준으로 인정하면 결정 뒤 만족도가 높아질 수 있습니다.'
        },
        F: {
            summary: '개체를 조건표로만 보지 않고, 함께 지낼 시간과 관계까지 선택에 넣는 쪽에 가깝습니다.',
            signals: ['작은 반응에서도 그 개체만의 매력을 발견하고 오래 기억합니다.', '사람과 개체 모두가 무리 없이 이어갈 수 있는 돌봄 방식을 찾는 감각이 돋보입니다.'],
            balance: '마음이 크게 움직이는 선택일수록 공간·비용·관리 시간을 숫자로 한 번 확인하면 애착을 더 안정적으로 지킬 수 있습니다.'
        },
        J: {
            summary: '돌봄을 그날의 감각에 맡기기보다, 끝나는 기준을 만들어 안정적으로 운영하는 쪽에 가깝습니다.',
            signals: ['반복되는 급여와 청소도 빠뜨리지 않는 자기만의 구조를 만듭니다.', '무엇부터 어디까지 할지 분명해 여러 개체를 돌볼 때도 흐름이 쉽게 무너지지 않습니다.'],
            balance: '예상 밖 반응이 나온 날에는 계획을 지키는 것보다 개체 상태를 우선하는 예외 기준을 두면 안정성과 대응력을 함께 지킬 수 있습니다.'
        },
        P: {
            summary: '처음 정한 방식에 매이기보다, 실제 반응을 보고 가장 맞는 다음 행동을 찾는 쪽에 가깝습니다.',
            signals: ['예상 밖의 변화가 생겨도 당황하기보다 우선순위를 빠르게 다시 배치합니다.', '정답이 없는 상황에서 여러 방법을 시험하며 그 개체에게 맞는 방식을 찾아내는 힘이 있습니다.'],
            balance: '급여·온도·기록처럼 반드시 지킬 최소선만 고정하면 적응력은 살리면서 관리 편차와 누락을 줄일 수 있습니다.'
        }
    });
    const TYPE_READINGS = Object.freeze({
        ISTJ: '당신이 돌본 크레의 변화는 기억보다 기록에 오래 남습니다. 어제와 비슷해 보이는 하루에서도 작은 차이를 찾아내고, 문제가 생기면 감으로 넘기기보다 언제부터 무엇이 달라졌는지 차분히 되짚어요. 덕분에 주변에서는 흔들릴 때 기준을 잡아주는 사람으로 기억하지만, 한 번 세운 방식이 잘 맞았던 만큼 새로운 신호를 기존 기록 안에서만 찾으려 할 때도 있습니다. 익숙한 기준 밖에서 들어온 작은 예외 하나가 오히려 다음 돌봄을 더 단단하게 만들어줄 수 있어요.',
        ISFJ: '당신 곁의 크레는 평소와 다른 작은 움직임도 쉽게 지나치지 않습니다. 말로 크게 드러내지는 않아도 어느 아이가 무엇을 좋아하고 언제 편안해지는지 오래 기억해두었다가 필요한 순간에 먼저 챙겨줘요. 그래서 함께 있는 사람들은 당신의 돌봄 안에서 안정감을 느끼지만, 모두가 편안하기를 바라는 마음 때문에 자신의 피로를 뒤늦게 알아차리기도 합니다. 오래 돌보기 위해 잠시 쉬는 것 역시 당신다운 책임의 한 부분이에요.',
        INFJ: '처음 만난 크레를 볼 때 당신의 시선은 지금 모습에서 오래 머물지 않습니다. 작은 반응과 지나온 기록을 천천히 이어보며 이 아이가 앞으로 어떤 모습으로 자랄지, 어떤 환경에서 가장 편안할지를 마음속에 그려요. 주변에서는 미처 말로 설명하지 못한 변화까지 먼저 알아채는 사람으로 느끼지만, 한 번 의미를 발견한 뒤에는 그 흐름을 너무 오래 믿고 싶어질 때도 있습니다. 가끔은 오늘 눈앞의 상태만 다시 바라보는 일이 당신의 깊은 직감을 더 정확하게 지켜줍니다.',
        INTJ: '한 마리를 데려오는 일도 당신에게는 오늘의 선택으로 끝나지 않습니다. 성장한 뒤의 모습과 관리가 이어질 방식까지 미리 그려본 다음, 오래 흔들리지 않을 구조를 조용히 만들어가요. 처음에는 혼자 멀리 보는 것처럼 보여도 시간이 지나면 주변 사람들은 당신이 왜 그 순서를 택했는지 뒤늦게 이해하게 됩니다. 다만 완성도 높은 그림일수록 예상 밖의 반응이 끼어들 자리가 좁아질 수 있으니, 계획 속에 작은 빈칸 하나를 남겨두는 편이 오히려 더 멀리 가게 해줘요.',
        ISTP: '예상하지 못한 문제가 생긴 순간, 당신은 걱정을 길게 설명하기보다 먼저 손이 움직이는 사람입니다. 눈앞의 상태를 빠르게 살피고 지금 바꿀 수 있는 것부터 건드리면서 가장 단순한 해결점을 찾아내요. 평소에는 존재감이 크지 않아 보여도 급한 순간이 오면 주변에서 자연스럽게 당신을 찾게 됩니다. 다만 문제가 해결된 뒤 기록을 남기는 일은 뒤로 밀릴 수 있으니, 짧은 한 줄만 남겨도 다음번의 빠른 감각이 훨씬 강해질 거예요.',
        ISFP: '당신은 설명을 오래 듣기 전부터 크레가 편안한지 아닌지를 먼저 느끼는 사람입니다. 남들이 비슷하다고 넘긴 색과 움직임에서도 그 아이만의 분위기를 발견하고, 정해진 방식보다 지금 필요한 돌봄을 조용히 건네요. 그래서 당신 곁의 개체는 비교의 대상보다 하나의 고유한 존재로 남지만, 마음이 깊어진 뒤에는 불편한 현실을 쉽게 끊어내지 못할 때도 있습니다. 좋아하는 마음을 오래 지키려면 때때로 거리와 기준도 돌봄의 일부가 되어야 해요.',
        INFP: '남들이 잠깐 보고 지나친 크레가 이상하게 오래 마음에 남는다면, 당신에게는 이미 작은 이야기가 시작된 것입니다. 지금 드러난 조건보다 그 아이가 앞으로 보여줄 모습과 함께 쌓일 시간을 떠올리며 천천히 애착을 키워가요. 그래서 익숙한 기준 밖에 있는 개체에서도 누구도 알아보지 못한 매력을 발견하지만, 마음속 이야기가 깊어질수록 현실적인 부담을 나중에 계산하기도 합니다. 그 이야기를 오래 이어가고 싶다면 시작 전에 생활 속 자리를 먼저 마련해주는 것이 좋아요.',
        INTP: '이상한 변화 하나가 보이면 당신의 머릿속에는 곧 여러 개의 가설이 생깁니다. 단순히 원인을 찾는 데서 멈추지 않고 기록과 환경을 다시 연결하며 왜 이런 반응이 나타났는지 스스로 납득할 때까지 파고들어요. 주변에서는 복잡한 문제를 새로운 관점으로 풀어내는 사람으로 보지만, 답이 거의 보이는 순간에도 더 나은 설명을 찾느라 행동이 늦어질 수 있습니다. 완벽한 해답보다 지금 시험할 수 있는 작은 한 가지를 고르면 탐구가 실제 변화로 이어져요.',
        ESTP: '문제가 생긴 자리에서 가장 먼저 상황을 읽고 움직이는 사람은 대개 당신입니다. 긴 설명을 기다리기보다 눈앞의 반응을 확인하며 지금 효과가 있는 방법을 빠르게 찾아내고, 분위기가 굳기 전에 다음 선택을 만들어내요. 덕분에 주변에서는 함께 있으면 어떻게든 풀릴 것 같은 사람으로 느끼지만, 해결이 빨랐던 만큼 원인을 기록하는 일은 가볍게 지나칠 수 있습니다. 일이 끝난 뒤 단 한 번만 되짚어봐도 타고난 대응력이 반복 가능한 실력으로 남게 됩니다.',
        ESFP: '좋은 변화를 발견한 순간 당신의 기쁨은 혼자 있는 법이 없습니다. 사진 한 장과 짧은 이야기만으로도 그 아이의 매력을 생생하게 전하고, 주변 사람들까지 자연스럽게 같은 순간을 즐기게 만들어요. 그래서 당신이 있는 자리에서는 작은 성장도 모두가 기억하는 장면이 되지만, 즐거운 반응이 클수록 다음 관리의 부담은 잠시 뒤로 밀릴 때가 있습니다. 설렘이 가장 클 때 필요한 것 하나만 먼저 확인해두면 즐거움도 훨씬 오래갑니다.',
        ENFP: '아직 작고 평범해 보이는 크레에게서 남들이 보지 못한 다음 모습을 먼저 발견하는 사람이 있습니다. 당신은 그 작은 가능성에 이야기를 붙이고 주변과 나누는 동안, 처음의 호기심을 모두가 기다리는 기대감으로 바꿔놓아요. 새로운 매력을 만날 때마다 세계가 조금씩 넓어지는 듯하지만, 마음을 끄는 가능성이 많아질수록 이미 시작한 돌봄의 무게가 흐릿해질 때도 있습니다. 새로 열린 문 하나를 고르기 전에 지금 품고 있는 이야기부터 돌아보면 당신의 발견은 더 오래 빛날 거예요.',
        ENTP: '모두가 익숙한 방법을 따를 때 당신은 자연스럽게 다른 가능성을 떠올립니다. 크레의 작은 반응 하나에서도 새로운 가설을 만들고, 사람들과 의견을 주고받으며 금세 다음 실험으로 이어가요. 정답이 없는 문제일수록 오히려 눈빛이 살아나 주변의 생각까지 움직이게 하지만, 흥미로운 다음 시도가 나타나면 이전 결과를 끝까지 정리하는 일은 지루해질 수 있습니다. 발견한 것을 한 줄이라도 남겨두면 당신의 호기심은 순간의 아이디어가 아니라 모두가 활용할 수 있는 길이 됩니다.',
        ESTJ: '개체가 늘고 해야 할 일이 겹쳐도 당신이 있는 곳에서는 곧 흐름이 생깁니다. 누가 무엇을 언제까지 해야 하는지 빠르게 정리하고, 복잡한 돌봄을 누구나 따라갈 수 있는 방식으로 바꾸는 힘이 있어요. 주변에서는 일이 흔들릴 때 믿고 맡길 수 있는 사람으로 느끼지만, 잘 돌아가던 기준일수록 개체마다 다른 작은 예외가 불편하게 보일 수 있습니다. 원칙을 버리지 않고도 예외 하나를 받아들일 자리를 만들면 당신의 운영은 더 오래 단단하게 유지됩니다.',
        ESFJ: '누가 어떤 크레를 아끼는지, 어느 아이가 평소와 조금 다른지를 당신은 생각보다 오래 기억합니다. 필요한 일을 먼저 발견하고도 혼자 처리한 티를 내기보다 주변이 함께 돌볼 수 있도록 자연스럽게 사람을 불러 모아요. 덕분에 당신이 있는 곳에서는 개체도 사람도 쉽게 소외되지 않지만, 모두의 필요를 챙기다 보면 자신의 여유가 가장 마지막에 남기도 합니다. 당신이 편안해야 돌봄의 분위기도 오래 유지된다는 사실을 잊지 않는 것이 좋아요.',
        ENFJ: '당신이 마음에 둔 크레는 이상하게 주변 사람들의 기억에도 오래 남습니다. 처음에는 사진 한 장을 보여줬을 뿐인데, 이야기를 나누는 사이 그 아이의 매력과 앞으로 달라질 모습이 점점 선명해지고 어느새 모두가 함께 성장을 기다리게 돼요. 무언가를 혼자 좋아하는 데서 끝내기보다 그 마음이 사람들 사이에 머물 자리를 만들어주는 사람에 가깝습니다. 다만 기대가 커질수록 현실적인 부담은 조금 늦게 보일 수 있으니, 마지막에는 지금의 생활과 오래 맞을지만 조용히 확인해보세요.',
        ENTJ: '마음에 드는 크레를 발견하면 당신의 관심은 한 마리에서 곧 더 큰 그림으로 이어집니다. 어떻게 관리해야 오래 안정적으로 성장할지, 필요한 사람과 자원을 어디에 놓아야 할지 자연스럽게 구조를 만들어요. 처음에는 속도가 빠르고 기준이 분명해 보이지만 결국 주변 사람들까지 같은 목표를 바라보게 만드는 힘이 있습니다. 다만 목표가 선명할수록 개체가 보내는 느린 신호를 일정의 변수처럼 볼 수 있으니, 계획이 잠시 멈추는 순간도 과정 안에 남겨두는 것이 좋아요.'
    });
    const IS_LOCAL_QA = ['127.0.0.1', 'localhost'].includes(location.hostname);
    const IS_QA_MODE = IS_LOCAL_QA;

    let config = {};
    let cohortSummary = {
        houseCounts: Object.fromEntries(Core.HOUSE_KEYS.map(key => [key, 0])),
        timingMedians: [],
        sampleSize: 0
    };
    let questions = [];
    let answers = [];
    let displayedChoices = [];
    let responseTimings = [];
    let current = 0;
    let selectedMbti = '';
    let surveySessionId = '';
    let sessionCreatedAt = '';
    let assignedHouseKey = '';
    let result = null;
    let resultSavedAt = '';
    let timingStats = null;
    let activeTimer = null;
    let advancing = false;
    let saveInFlight = false;
    let lastSavedSignature = '';
    let toastTimer = null;

    let bandAuthReady = false;
    let bandAuthConfigured = false;
    let bandAuthToken = '';
    let bandAuthUser = null;
    let bandAuthPhoneMask = '';
    let bandTargetUrl = DEFAULT_BAND_URL;
    let pendingResultReveal = false;
    let editingMembership = false;
    let pendingMemberPhone = '';
    let membershipRecheckTimer = null;
    let membershipRecheckStartedAt = 0;
    let membershipCheckInFlight = false;
    let showingStoredResult = false;
    let memberKeyboardTimer = null;
    let preparedSaveFile = null;
    let preparedSaveUrl = '';
    let preparedKakaoShareFile = null;
    let preparedKakaoShareUrl = '';

    function element(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function typeCharacterPath(code) {
        const normalized = String(code || '').toLowerCase();
        return `${TYPE_CHARACTER_ROOT}crewart-type-${normalized}.png?v=${TYPE_CHARACTER_VERSION}`;
    }

    function maskPhone(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        return /^010\d{8}$/.test(digits) ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '';
    }

    function loadLastResult() {
        try {
            const snapshot = JSON.parse(localStorage.getItem(LAST_RESULT_STORAGE_KEY) || 'null');
            if (snapshot?.version !== LAST_RESULT_VERSION || !isCompatibleResultQuestionVersion(snapshot.questionVersion)) return null;
            if (!Core.MBTI_TYPES.includes(snapshot.result?.code)) return null;
            if (!Core.HOUSE_KEYS.includes(snapshot.assignedHouseKey)) return null;
            if (!Array.isArray(snapshot.result?.axes) || snapshot.result.axes.length !== 4) return null;
            return snapshot;
        } catch (_) {
            return null;
        }
    }

    function saveLastResult() {
        if (!result || !Core.MBTI_TYPES.includes(result.code) || !Core.HOUSE_KEYS.includes(assignedHouseKey)) return;
        const savedAt = new Date().toISOString();
        resultSavedAt = savedAt;
        const snapshot = {
            version: LAST_RESULT_VERSION,
            questionVersion: Core.SURVEY_VERSION,
            savedAt,
            selectedMbti: Core.MBTI_TYPES.includes(selectedMbti) ? selectedMbti : '',
            assignedHouseKey,
            result: {
                code: result.code,
                typeName: result.typeName,
                letters: { ...result.letters },
                axes: result.axes.map(axis => ({ ...axis }))
            },
            timingStats: timingStats ? {
                validCount: timingStats.validCount,
                totalMs: timingStats.totalMs,
                averageMs: timingStats.averageMs,
                medianMs: timingStats.medianMs,
                axisMedians: { ...timingStats.axisMedians },
                style: { ...timingStats.style },
                fastest: timingStats.fastest ? { ...timingStats.fastest } : null,
                slowest: timingStats.slowest ? { ...timingStats.slowest } : null
            } : null
        };
        try { localStorage.setItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(snapshot)); } catch (_) {}
        renderHome();
    }

    function renderHome() {
        const snapshot = loadLastResult();
        const card = element('home-result-card');
        const startCard = element('home-start-card');
        const intro = element('intro-screen');
        if (!card || !startCard) return;
        card.hidden = !snapshot;
        startCard.hidden = Boolean(snapshot);
        intro?.classList.toggle('has-result', Boolean(snapshot));
        if (!snapshot) return;
        const house = Core.HOUSE_META[snapshot.assignedHouseKey];
        element('home-result-code').textContent = snapshot.result.code;
        element('home-result-heading').textContent = snapshot.result.typeName;
        element('home-house-seal').textContent = house?.seal || snapshot.assignedHouseKey[0];
        element('home-house-name').textContent = house?.name || snapshot.assignedHouseKey;
        card.style.setProperty('--house-accent', house?.accent || '#fff');
    }

    function restoreLastResult(options = {}) {
        const snapshot = loadLastResult();
        if (!snapshot) {
            renderHome();
            renderEmptyResult();
            setScreen('result-screen');
            return;
        }
        pauseTimer();
        activeTimer = null;
        questions = [];
        answers = [];
        displayedChoices = [];
        responseTimings = [];
        selectedMbti = snapshot.selectedMbti || '';
        surveySessionId = '';
        sessionCreatedAt = '';
        result = snapshot.result;
        resultSavedAt = snapshot.savedAt || '';
        assignedHouseKey = Core.chooseTendencyHouse(result);
        timingStats = snapshot.timingStats;
        showingStoredResult = true;
        renderResult({ animate: Boolean(options.animate) });
        setScreen('result-screen');
    }

    function updateBandState() {
        const form = element('member-check-form');
        const verified = element('band-verified-state');
        const number = element('auth-phone-number');
        const connection = element('band-connection-status');
        const bandScreen = element('band-screen');
        const authenticated = Boolean(bandAuthUser?.isTargetMember);
        const state = authenticated && editingMembership
            ? 'editing'
            : authenticated
                ? 'connected'
                : pendingMemberPhone
                    ? 'pending'
                    : bandAuthReady
                        ? 'disconnected'
                        : 'loading';
        if (form) form.hidden = authenticated && !editingMembership;
        if (verified) verified.hidden = !authenticated || editingMembership;
        if (number) number.textContent = bandAuthPhoneMask || '확인된 회원';
        if (connection) connection.textContent = ({
            connected: '연결됨',
            editing: '번호 변경 중',
            pending: '가입 승인 확인 중',
            disconnected: '연결되지 않음',
            loading: '상태 확인 중'
        })[state];
        if (bandScreen) bandScreen.dataset.membershipState = state;
        const navStatus = element('band-nav-status');
        navStatus?.classList.toggle('is-verified', authenticated);
        navStatus?.classList.toggle('is-pending', state === 'pending');
        if (navStatus) navStatus.hidden = authenticated;
    }

    function toast(message, isError) {
        const target = element('toast');
        if (!target) return;
        target.textContent = message;
        target.style.borderColor = isError ? 'rgba(248,113,113,.55)' : 'rgba(220,196,134,.45)';
        target.classList.add('is-visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => target.classList.remove('is-visible'), 2600);
    }

    let wordmarkFontReady;

    function playWordmark() {
        const wordmark = element('crewart-wordmark');
        if (!wordmark) return;
        if (!wordmarkFontReady) {
            const fontLoad = document.fonts?.load
                ? document.fonts.load('900 72px "Pretendard Variable"').catch(() => [])
                : Promise.resolve([]);
            wordmarkFontReady = Promise.race([
                fontLoad,
                new Promise(resolve => setTimeout(resolve, 1400))
            ]);
        }
        void wordmarkFontReady.then(() => {
            wordmark.classList.remove('is-pending', 'is-writing');
            void wordmark.offsetWidth;
            wordmark.classList.add('is-writing');
        });
    }

    function setupIntroVideo() {
        const introVideo = element('intro-video');
        if (!introVideo) return;
        const intro = element('intro-screen');
        let fallbackTimer = 0;
        introVideo.controls = false;
        introVideo.muted = true;
        introVideo.defaultMuted = true;
        introVideo.playsInline = true;
        const reveal = () => {
            window.clearTimeout(fallbackTimer);
            introVideo.classList.add('is-playing');
            intro?.classList.add('is-video-ready');
        };
        const conceal = () => {
            introVideo.classList.remove('is-playing');
            if (!intro?.classList.contains('is-video-ready')) {
                window.clearTimeout(fallbackTimer);
                fallbackTimer = window.setTimeout(() => intro?.classList.add('is-video-ready'), 1400);
            }
        };
        introVideo.addEventListener('playing', reveal);
        introVideo.addEventListener('error', conceal);
        introVideo.addEventListener('emptied', conceal);
        fallbackTimer = window.setTimeout(() => intro?.classList.add('is-video-ready'), 2200);
        if (!introVideo.paused && introVideo.readyState >= 3) reveal();
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            void introVideo.play().then(reveal).catch(conceal);
        }
    }

    function setScreen(screenId) {
        if (screenId !== 'band-screen') {
            element('member-phone')?.blur();
            document.body.classList.remove('cw-keyboard-open');
            element('band-screen')?.classList.remove('is-keyboard-open');
        }
        ['intro-screen', 'question-screen', 'mbti-screen', 'result-screen', 'band-screen'].forEach(id => {
            const screen = element(id);
            const active = id === screenId;
            screen.hidden = !active;
            screen.classList.toggle('is-active', active);
            if (active) {
                screen.classList.remove('is-entering');
                requestAnimationFrame(() => screen.classList.add('is-entering'));
                if (id === 'intro-screen') playWordmark();
            }
        });
        const introVideo = element('intro-video');
        if (introVideo) {
            const canPlay = screenId === 'intro-screen' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (canPlay) void introVideo.play().then(() => introVideo.classList.add('is-playing')).catch(() => introVideo.classList.remove('is-playing'));
            else introVideo.pause();
        }
        updatePersistentActions();
        syncThemeColor(screenId);
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function syncMemberKeyboardState(options = {}) {
        const input = element('member-phone');
        const screen = element('band-screen');
        const viewport = window.visualViewport;
        const viewportHeight = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight);
        const focused = Boolean(input && screen && !screen.hidden && document.activeElement === input);
        document.documentElement.style.setProperty('--cw-visual-viewport-height', `${viewportHeight}px`);
        document.body.classList.toggle('cw-keyboard-open', focused);
        screen?.classList.toggle('is-keyboard-open', focused);
        if (!focused || options.ensureVisible === false) return;
        if (memberKeyboardTimer) clearTimeout(memberKeyboardTimer);
        memberKeyboardTimer = setTimeout(() => {
            if (document.activeElement !== input || screen?.hidden) return;
            input.closest('.cw-member-form')?.scrollIntoView({
                block: 'center',
                behavior: options.immediate ? 'auto' : 'smooth'
            });
        }, options.immediate ? 20 : 90);
    }

    function createSessionId() {
        return window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    async function hashSessionId(value) {
        const source = new TextEncoder().encode(`crewart-session:${value}`);
        if (window.crypto?.subtle) {
            const digest = await window.crypto.subtle.digest('SHA-256', source);
            return Array.from(new Uint8Array(digest)).slice(0, 12).map(byte => byte.toString(16).padStart(2, '0')).join('');
        }
        let output = '';
        for (let round = 0; round < 3; round += 1) {
            let hash = (2166136261 ^ (round * 2654435761)) >>> 0;
            source.forEach(byte => {
                hash ^= byte + round;
                hash = Math.imul(hash, 16777619);
            });
            output += (hash >>> 0).toString(16).padStart(8, '0');
        }
        return output;
    }

    function applyManagedContent(raw) {
        if (!raw || questions.length) return;
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed?.version !== Core.SURVEY_VERSION) return;
            const items = Array.isArray(parsed) ? parsed : parsed?.questions;
            if (!Array.isArray(items)) return;
            items.forEach(item => {
                const target = Core.QUESTIONS.find(question => question.id === String(item?.id || '').toUpperCase());
                if (!target) return;
                if (String(item.label || '').trim()) target.label = String(item.label).trim();
                if (String(item.q || '').trim()) target.q = String(item.q).trim();
                if (Array.isArray(item.options) && item.options.length >= 4) {
                    const options = item.options.slice(0, 4).map(value => String(value || '').trim());
                    if (options.every(Boolean)) target.options = options;
                }
            });
        } catch (error) {
            console.warn('[Crewart managed questions]', error);
        }
    }

    async function loadConfig() {
        try {
            const response = await bandFetch('/api/crewart-survey/bootstrap', { cache: 'no-store' });
            if (!response.ok) throw new Error('CREWART survey bootstrap unavailable');
            const payload = await response.json();
            config = {
                [CONTENT_CONFIG_KEY]: payload.content || null,
                crewart_mbti_content_updated_at: payload.contentUpdatedAt || null
            };
            applyManagedContent(payload.content);
            cohortSummary = {
                houseCounts: Object.fromEntries(Core.HOUSE_KEYS.map(key => [
                    key,
                    Math.max(0, Number(payload.cohort?.houseCounts?.[key]) || 0)
                ])),
                timingMedians: (Array.isArray(payload.cohort?.timingMedians)
                    ? payload.cohort.timingMedians
                    : []).map(Number).filter(value => value >= 400 && value <= 30000),
                sampleSize: Math.max(0, Number(payload.cohort?.sampleSize) || 0)
            };
        } catch (error) {
            console.error('[Crewart config]', error);
            config = {};
            cohortSummary = {
                houseCounts: Object.fromEntries(Core.HOUSE_KEYS.map(key => [key, 0])),
                timingMedians: [],
                sampleSize: 0
            };
        }
    }

    function startTimer(index) {
        activeTimer = {
            index,
            elapsedMs: 0,
            visibleAt: document.visibilityState === 'visible' ? performance.now() : null
        };
    }

    function pauseTimer() {
        if (!activeTimer || activeTimer.visibleAt === null) return;
        activeTimer.elapsedMs += performance.now() - activeTimer.visibleAt;
        activeTimer.visibleAt = null;
    }

    function resumeTimer() {
        if (!activeTimer || activeTimer.visibleAt !== null || document.visibilityState !== 'visible') return;
        activeTimer.visibleAt = performance.now();
    }

    function captureTiming(index) {
        if (!activeTimer || activeTimer.index !== index) return;
        pauseTimer();
        const elapsedMs = Math.round(activeTimer.elapsedMs);
        responseTimings[index] = {
            questionId: questions[index].id,
            axis: questions[index].axis,
            elapsedMs,
            valid: elapsedMs >= 400 && elapsedMs <= 30000
        };
    }

    function startSurvey() {
        questions = Core.prepareQuestions();
        answers = [];
        displayedChoices = [];
        responseTimings = [];
        current = 0;
        selectedMbti = '';
        surveySessionId = createSessionId();
        sessionCreatedAt = new Date().toISOString();
        assignedHouseKey = '';
        result = null;
        resultSavedAt = '';
        timingStats = null;
        showingStoredResult = false;
        advancing = false;
        lastSavedSignature = '';
        setScreen('question-screen');
        renderQuestion();
    }

    function openMemberCheck(options = {}) {
        pendingResultReveal = Boolean(options.revealResult);
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        const submit = element('member-check-submit');
        const submitLabel = element('member-check-submit-label');
        if (status && !pendingMemberPhone) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-success', 'is-action');
        }
        if (joinLink) {
            joinLink.hidden = false;
            joinLink.classList.remove('is-recommended');
        }
        if (submit) {
            submit.disabled = false;
            submit.classList.remove('is-recheck');
        }
        if (submitLabel) submitLabel.textContent = '확인하기';
        if (!hasDetailedAccess()) editingMembership = false;
        updateBandState();
        setScreen('band-screen');
    }

    function editMembershipAccess() {
        if (!hasDetailedAccess()) return;
        editingMembership = true;
        const status = element('member-check-status');
        if (status) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-success', 'is-action');
        }
        updateBandState();
        requestAnimationFrame(() => {
            const input = element('member-phone');
            if (!input) return;
            try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
            syncMemberKeyboardState({ immediate: true });
        });
    }

    function clearMembershipAccess() {
        if (!hasDetailedAccess()) return;
        if (!window.confirm('이 기기의 BAND 회원 확인을 해제할까요?')) return;
        stopMembershipRecheck();
        bandAuthToken = '';
        bandAuthUser = null;
        bandAuthPhoneMask = '';
        editingMembership = false;
        try {
            sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
            sessionStorage.removeItem(MEMBERSHIP_PHONE_STORAGE_KEY);
        } catch (_) {}
        updateBandUi();
        toast('회원 확인을 해제했어요.');
    }

    function returnToIntro() {
        const stage = currentStage();
        if ((stage === 'questions' || stage === 'mbti')
            && !window.confirm('진행 중인 테스트를 닫고 처음 화면으로 갈까요?\n\nBAND 회원 확인 상태와 이전에 저장한 결과는 유지됩니다.')) return;
        pauseTimer();
        activeTimer = null;
        questions = [];
        answers = [];
        displayedChoices = [];
        responseTimings = [];
        current = 0;
        selectedMbti = '';
        surveySessionId = '';
        sessionCreatedAt = '';
        assignedHouseKey = '';
        result = null;
        timingStats = null;
        showingStoredResult = false;
        advancing = false;
        lastSavedSignature = '';
        element('result-content').replaceChildren();
        renderHome();
        setScreen('intro-screen');
    }

    function renderQuestion() {
        advancing = false;
        const card = element('question-card');
        element('choice-list').classList.remove('is-four-option');
        card.classList.toggle('is-guide', current === 0);
        element('q0-copyright').hidden = current !== 0;
        if (current === 0) {
            element('progress-text').textContent = `0 / ${questions.length}`;
            element('progress-axis').textContent = '안내사항';
            element('progress-bar').style.width = '0%';
            element('question-back').disabled = false;
            element('question-label').hidden = false;
            element('question-label').textContent = 'BEFORE YOU START';
            element('question-title').textContent = '시작 전, 이것만 확인해 주세요';
            element('choice-list').innerHTML = `
                <div class="cw-q0-card">
                    <ol class="cw-q0-list">
                        <li><b>01</b><span>재미를 위한 성향 콘텐츠이며, 과학적·의학적 진단이 아닙니다.</span></li>
                        <li><b>02</b><span>크레 앞에서는 평소 유형과 다른 결과가 나올 수 있습니다.</span></li>
                        <li><b>03</b><span>좋아 보이는 답보다 평소 내 모습에 가까운 쪽을 골라주세요.</span></li>
                        <li><b>04</b><span>오래 고민하지 말고 먼저 떠오른 답을 선택해주세요.</span></li>
                    </ol>
                    <button class="cw-primary-button cw-q0-start-button" type="button" data-q0-start>시작하기</button>
                </div>`;
            element('choice-list').querySelector('[data-q0-start]')?.addEventListener('click', () => {
                if (advancing) return;
                advancing = true;
                current = 1;
                renderQuestion();
            });
            card.classList.remove('is-changing');
            requestAnimationFrame(() => card.classList.add('is-changing'));
            return;
        }

        const qIndex = current - 1;
        const question = questions[qIndex];
        if (!question) return;
        const options = question.options;
        const isFourOption = Array.isArray(question.scorePairs);
        element('progress-text').textContent = `${current} / ${questions.length}`;
        element('progress-axis').textContent = '크레 앞의 나를 찾는 중';
        element('progress-bar').style.width = `${(current / questions.length) * 100}%`;
        element('question-back').disabled = false;
        // Scenario labels are useful for the question editor, but duplicate the actual
        // question for participants and cost valuable vertical space on mobile.
        element('question-label').hidden = true;
        element('question-label').textContent = '';
        element('question-title').textContent = question.q;
        element('choice-list').classList.toggle('is-four-option', isFourOption);
        element('choice-list').innerHTML = options.map((option, index) => `
            <button class="cw-choice-button${(isFourOption ? displayedChoices[qIndex] : answers[qIndex]) === index ? ' is-selected' : ''}" type="button" data-choice="${index}">
                <span>${escapeHtml(option)}</span>
            </button>`).join('');
        element('choice-list').querySelectorAll('[data-choice]').forEach(button => {
            button.addEventListener('click', () => chooseAnswer(Number(button.dataset.choice)));
        });
        card.classList.remove('is-changing');
        requestAnimationFrame(() => card.classList.add('is-changing'));
        startTimer(qIndex);
    }

    function chooseAnswer(choice) {
        if (advancing || current < 1) return;
        advancing = true;
        const qIndex = current - 1;
        const question = questions[qIndex];
        displayedChoices[qIndex] = choice;
        answers[qIndex] = choice;
        captureTiming(qIndex);
        element('choice-list').querySelectorAll('[data-choice]').forEach(button => {
            const selected = Number(button.dataset.choice) === choice;
            button.classList.toggle('is-selected', selected);
            button.disabled = true;
        });
        const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 260;
        setTimeout(() => {
            if (current < questions.length) {
                current += 1;
                renderQuestion();
            } else {
                finishQuestions();
            }
        }, delay);
    }

    function previousQuestion() {
        if (advancing) return;
        if (current === 0) {
            returnToIntro();
            return;
        }
        current -= 1;
        renderQuestion();
    }

    function finishQuestions() {
        activeTimer = null;
        const missing = questions.findIndex((_, index) => answers[index] === undefined);
        if (missing >= 0) {
            current = missing + 1;
            renderQuestion();
            toast('선택하지 않은 질문이 있어요.', true);
            return;
        }
        result = Core.scoreAnswers(questions, answers);
        timingStats = Core.buildTimingStats(responseTimings, questions);
        assignedHouseKey = Core.chooseTendencyHouse(result);
        renderMbtiOptions();
        setScreen('mbti-screen');
    }

    function renderMbtiOptions() {
        element('mbti-grid').innerHTML = Core.MBTI_TYPES.map(type => `
            <button class="cw-mbti-option${selectedMbti === type ? ' is-selected' : ''}" type="button" data-mbti="${type}">${type}</button>`).join('');
        element('mbti-grid').querySelectorAll('[data-mbti]').forEach(button => {
            button.addEventListener('click', () => {
                selectedMbti = button.dataset.mbti;
                renderMbtiOptions();
                element('show-result').disabled = false;
            });
        });
    }

    function showResult(skipMbti) {
        if (!result) return;
        if (!selectedMbti && !skipMbti) {
            toast('평소 유형을 고르거나 건너뛰기를 눌러주세요.', true);
            return;
        }
        completeResultReveal();
    }

    function completeResultReveal() {
        showingStoredResult = false;
        saveLastResult();
        renderResult({ animate: true });
        setScreen('result-screen');
        void submitSurvey();
    }

    function formatSeconds(milliseconds) {
        return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}초`;
    }

    function hasDetailedAccess() {
        return IS_LOCAL_QA || Boolean(bandAuthUser && bandAuthUser.isTargetMember === true);
    }

    function openBandTarget() {
        if (!BAND_INTEGRATION_ENABLED) return false;
        window.open(bandTargetUrl, '_blank', 'noopener,noreferrer');
        return true;
    }

    function renderReportSectionHead(index, english, korean, controls) {
        return `
            <header class="cw-report-section-head">
                <button class="cw-report-section-toggle" type="button" data-report-toggle data-report-label="${escapeHtml(korean)}" aria-label="${escapeHtml(`${korean} 자세히 보기`)}" aria-expanded="false" aria-controls="${escapeHtml(controls)}">
                    <span>${escapeHtml(index)}</span>
                    <span><small>${escapeHtml(english)}</small></span>
                    <span class="cw-report-section-action"><em data-report-action>자세히</em><i aria-hidden="true">＋</i></span>
                </button>
            </header>`;
    }

    function axisStrength(axisResult) {
        const first = axisResult.axis[0];
        const second = axisResult.axis[1];
        const difference = Math.abs((Number(result.letters[first]) || 0) - (Number(result.letters[second]) || 0));
        if (difference >= 5) return '매우 뚜렷';
        if (difference >= 3) return '비교적 뚜렷';
        return '균형에 가까움';
    }

    function resultSpeedPresentation() {
        if (!timingStats?.style) return null;
        const valid = timingStats.validCount > 0;
        const median = valid ? formatSeconds(timingStats.medianMs) : '-';
        const samples = cohortSummary.timingMedians.map(Number).filter(value => value >= 400 && value <= 30000);
        const averageMs = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : timingStats.medianMs;
        const relative = valid && averageMs > 0 ? Math.log2(timingStats.medianMs / averageMs) : 0;
        const position = Math.max(7, Math.min(93, 50 + relative * 25));
        const comparison = samples.length
            ? `평균 ${formatSeconds(averageMs)} · ${samples.length}명`
            : '평균 데이터 준비 중';
        return { median, position, comparison };
    }

    function timingEntryLabel(entry) {
        if (!entry) return '측정 정보 없음';
        const question = questions.find(item => item.id === entry.questionId)
            || Core.QUESTIONS.find(item => item.id === entry.questionId);
        const label = question?.label || AXIS_REPORT_COPY[entry.axis]?.title || '선택 문항';
        return `${label} · ${formatSeconds(entry.elapsedMs)}`;
    }

    function speedPositionCopy(position, hasBenchmark) {
        if (!hasBenchmark) return '아직 전체 참여자 기준이 충분하지 않아 이번 응답 안에서의 선택 리듬만 제시합니다.';
        if (position <= 35) return '전체 참여자보다 빠르게 첫 판단을 확정했습니다. 직감적인 선택 리듬이 비교적 선명합니다.';
        if (position >= 65) return '전체 참여자보다 한 번 더 비교한 뒤 선택했습니다. 숙고하는 리듬이 비교적 선명합니다.';
        return '전체 참여자 평균과 가까운 속도입니다. 직감과 확인 사이에서 비교적 균형 있게 선택했습니다.';
    }

    function renderSpeedCard() {
        const presentation = resultSpeedPresentation();
        if (!presentation) return '';
        const { median, position, comparison } = presentation;
        return `
            <section class="cw-result-section cw-speed-card">
                ${renderReportSectionHead('02', 'RESPONSE PACE', '선택 속도', 'speed-report-detail')}
                <div class="cw-speed-summary">
                    <header class="cw-speed-head">
                        <strong data-measure-speed data-final-text="문항당 ${escapeHtml(median)}">문항당 ${escapeHtml(median)}</strong>
                        <span>${escapeHtml(timingStats.style.label)}</span>
                    </header>
                    <div class="cw-position-scale cw-speed-scale" aria-label="빠름에서 신중함 사이 ${Math.round(position)}% 위치">
                        <span class="cw-scale-marker" data-final-position="${position}" style="--position:${position}%" aria-hidden="true"></span>
                        <div class="cw-scale-line"><i aria-hidden="true"></i></div>
                        <div class="cw-scale-labels"><span>빠름</span><span>평균</span><span>신중</span></div>
                    </div>
                </div>
                <div class="cw-report-disclosure cw-speed-disclosure" id="speed-report-detail" hidden>
                    <article class="cw-speed-reading">
                        <strong>${escapeHtml(timingStats.style.label)}</strong>
                        <p>${escapeHtml(speedPositionCopy(position, cohortSummary.timingMedians.length > 0))}</p>
                        <div class="cw-speed-scenes" aria-label="선택 속도가 달랐던 장면">
                            <div><small>바로 고른 장면</small><span>${escapeHtml(timingEntryLabel(timingStats.fastest))}</span></div>
                            <div><small>오래 본 장면</small><span>${escapeHtml(timingEntryLabel(timingStats.slowest))}</span></div>
                        </div>
                        <footer><span>${escapeHtml(comparison)}</span><span>속도는 점수가 아닙니다</span></footer>
                    </article>
                </div>
            </section>`;
    }

    function renderTypeReading() {
        const reading = TYPE_READINGS[result.code] || '';
        const comparison = currentTypeComparison();
        const comparisonMeta = comparison
            ? `<footer><span>평소 ${escapeHtml(comparison.knownType)}</span><strong>${escapeHtml(4 - comparison.changes.length)}/4 같은 방향</strong></footer>`
            : '';
        return `
            <article class="cw-type-reading" aria-label="${escapeHtml(`${result.typeName} 유형 이야기`)}">
                <p>${escapeHtml(reading)}</p>
                ${comparisonMeta}
            </article>`;
    }

    function renderAxisGraph(axisResult) {
        const copy = AXIS_REPORT_COPY[axisResult.axis];
        const first = axisResult.axis[0];
        const second = axisResult.axis[1];
        const secondCount = Number(result.letters[second]) || 0;
        const position = Math.max(0, Math.min(100, (secondCount / (Core.AXIS_SCORE_TOTAL || 5)) * 100));
        const firstSelected = axisResult.dominant === first;
        return `
                <article class="cw-axis-detail" data-axis-result data-final-pole="${firstSelected ? 'left' : 'right'}">
                    <header><h3>${escapeHtml(copy.title)}</h3></header>
                    <div class="cw-axis-poles">
                        <div class="cw-axis-pole is-left${firstSelected ? ' is-selected' : ''}" data-pole="left"><strong>${escapeHtml(first)}</strong></div>
                        <div class="cw-axis-pole is-right${firstSelected ? '' : ' is-selected'}" data-pole="right"><strong>${escapeHtml(second)}</strong></div>
                    </div>
                    <div class="cw-position-scale cw-axis-scale" aria-label="${escapeHtml(copy.title)}: ${escapeHtml(first)} ${escapeHtml(copy.left)}, ${escapeHtml(second)} ${escapeHtml(copy.right)} 중 ${escapeHtml(axisResult.dominant)} 쪽">
                        <span class="cw-scale-marker" data-final-position="${position}" style="--position:${position}%" aria-hidden="true"></span>
                        <div class="cw-scale-line"><i aria-hidden="true"></i></div>
                    </div>
                    <div class="cw-axis-meanings">
                        <span class="${firstSelected ? 'is-selected' : ''}" data-pole-copy="left">${escapeHtml(copy.left)}</span>
                        <span class="${firstSelected ? '' : 'is-selected'}" data-pole-copy="right">${escapeHtml(copy.right)}</span>
                    </div>
                </article>`;
    }

    function renderMemberDetail() {
        const axisCards = result.axes.map(axisResult => renderAxisGraph(axisResult)).join('');
        return `
            <section class="cw-result-section cw-member-detail">
                ${renderReportSectionHead('01', 'TRAIT AXES', '성향 지표', 'axes-report-detail')}
                <div class="cw-axis-detail-list">${axisCards}</div>
                <div class="cw-report-disclosure cw-type-reading-wrap" id="axes-report-detail" hidden>${renderTypeReading()}</div>
            </section>`;
    }

    function renderHouseCard() {
        const house = Core.HOUSE_META[assignedHouseKey];
        const snAxis = result.axes.find(axisResult => axisResult.axis === 'SN');
        const tfAxis = result.axes.find(axisResult => axisResult.axis === 'TF');
        const snCopy = snAxis?.dominant === 'S' ? AXIS_REPORT_COPY.SN.left : AXIS_REPORT_COPY.SN.right;
        const tfCopy = tfAxis?.dominant === 'T' ? AXIS_REPORT_COPY.TF.left : AXIS_REPORT_COPY.TF.right;
        return `
            <section class="cw-report-house" style="--house-accent:${escapeHtml(house.accent)}">
                ${renderReportSectionHead('03', 'HOUSE ASSIGNMENT', '기숙사', 'house-report-detail')}
                <div class="cw-house-assignment">
                    <b aria-hidden="true">${escapeHtml(house.seal)}</b>
                    <div><small>ASSIGNED HOUSE</small><strong aria-label="${escapeHtml(house.name)}"><span data-measure-house data-final-text="${escapeHtml(house.name)}">${escapeHtml(house.name)}</span></strong></div>
                </div>
                <div class="cw-report-disclosure cw-house-disclosure" id="house-report-detail" hidden>
                    <article class="cw-house-reading">
                        <strong>${escapeHtml(HOUSE_REPORT_COPY[assignedHouseKey] || '')}</strong>
                        <p>${escapeHtml(HOUSE_READINGS[assignedHouseKey] || '')}</p>
                        <footer>
                            <span>${escapeHtml(snAxis?.dominant || '')} · ${escapeHtml(snCopy)}</span>
                            <span>${escapeHtml(tfAxis?.dominant || '')} · ${escapeHtml(tfCopy)}</span>
                        </footer>
                    </article>
                </div>
            </section>`;
    }

    function renderLockedDetail() {
        const configured = BAND_INTEGRATION_ENABLED && bandAuthConfigured;
        const label = configured ? '회원 확인' : '확인 준비 중';
        const status = configured ? '확인 후 상세 결과가 열려요' : '회원 명단 연결을 준비하고 있어요';
        return `
            <section class="cw-detail-gate">
                <div class="cw-detail-preview" aria-hidden="true" inert>${renderMemberDetail()}${renderSpeedCard()}${renderHouseCard()}</div>
                <div class="cw-detail-shade" aria-hidden="true"></div>
                <div class="cw-detail-unlock">
                    <small>MEMBER ACCESS</small>
                    <h2>상세 결과 잠김</h2>
                    <button class="cw-band-cta" type="button" data-action="unlock-detail" ${configured ? '' : 'disabled'}><span>${escapeHtml(label)}</span><b aria-hidden="true">→</b></button>
                    <small class="cw-lock-status">${escapeHtml(status)}</small>
                </div>
            </section>`;
    }

    function playResultMeasurementAnimation(container) {
        if (!container) return;
        const characterReveal = container.querySelector('[data-character-reveal]');
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            characterReveal?.classList.remove('is-pending', 'is-resolving');
            characterReveal?.classList.add('is-revealed');
            return;
        }
        const codeSlots = [...container.querySelectorAll('[data-code-slot]')];
        const name = container.querySelector('[data-final-name]');
        const relation = container.querySelector('.cw-type-relation');
        const axisCards = [...container.querySelectorAll('[data-axis-result]')];
        const speedValues = [...container.querySelectorAll('[data-measure-speed]')];
        const houseNames = [...container.querySelectorAll('[data-measure-house]')];
        const letterPairs = [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']];
        const slotDelays = [0, 70, 145, 225];
        const settleDurations = [560, 730, 900, 1070];
        const tickDelays = [43, 55, 67, 79];

        container.classList.add('is-measuring');
        name?.classList.add('is-measure-pending');
        relation?.classList.add('is-measure-pending');
        axisCards.forEach(card => {
            card.classList.add('is-cycling');
            card.querySelectorAll('[data-pole], [data-pole-copy]').forEach(pole => pole.classList.remove('is-selected'));
        });
        speedValues.forEach(node => {
            node.textContent = '측정 중…';
            node.classList.add('is-measure-pending');
        });

        codeSlots.forEach((slot, index) => {
            let tick = 0;
            setTimeout(() => {
                const startedAt = performance.now();
                slot.classList.add('is-cycling');
                const axisCard = axisCards[index];
                const axisPoles = [...(axisCard?.querySelectorAll('[data-pole]') || [])];
                const axisCopies = [...(axisCard?.querySelectorAll('[data-pole-copy]') || [])];
                const cycleSlot = () => {
                    if (!container.isConnected) return;
                    if (performance.now() - startedAt >= settleDurations[index]) {
                        slot.textContent = slot.dataset.finalLetter;
                        slot.classList.remove('is-cycling');
                        slot.classList.add('is-settled');
                        axisPoles.forEach(pole => pole.classList.toggle('is-selected', pole.dataset.pole === axisCard?.dataset.finalPole));
                        axisCopies.forEach(copy => copy.classList.toggle('is-selected', copy.dataset.poleCopy === axisCard?.dataset.finalPole));
                        axisCard?.classList.remove('is-cycling');
                        axisCard?.classList.add('is-settled');
                        return;
                    }
                    const candidate = tick % 2;
                    slot.textContent = letterPairs[index][candidate];
                    axisPoles.forEach((pole, poleIndex) => pole.classList.toggle('is-selected', poleIndex === candidate));
                    axisCopies.forEach((copy, copyIndex) => copy.classList.toggle('is-selected', copyIndex === candidate));
                    tick += 1;
                    setTimeout(cycleSlot, tickDelays[index]);
                };
                cycleSlot();
            }, slotDelays[index]);
        });

        const markers = [...container.querySelectorAll('.cw-scale-marker[data-final-position]')];
        markers.forEach((marker, index) => {
            const finalPosition = Math.max(0, Math.min(100, Number(marker.dataset.finalPosition) || 0));
            if (typeof marker.animate !== 'function') return;
            const animation = marker.animate([
                { left: '50%' },
                { left: `${finalPosition}%` }
            ], {
                duration: 650 + index * 70,
                delay: 170 + index * 85,
                easing: 'cubic-bezier(.18,.78,.22,1)',
                fill: 'both'
            });
            animation.finished.then(() => {
                animation.cancel();
                marker.classList.add('is-settled');
            }).catch(() => {});
        });

        const houseOrder = Core.HOUSE_KEYS.map(key => Core.HOUSE_META[key]?.name).filter(Boolean);
        houseNames.forEach((node, nodeIndex) => {
            let step = nodeIndex;
            const rollHouse = () => {
                if (!container.isConnected) return;
                if (step >= 12 + nodeIndex) {
                    node.textContent = node.dataset.finalText;
                    node.classList.remove('is-house-rolling');
                    node.classList.add('is-settled');
                    return;
                }
                node.textContent = houseOrder[step % houseOrder.length];
                node.classList.remove('is-house-rolling');
                void node.offsetWidth;
                node.classList.add('is-house-rolling');
                step += 1;
                setTimeout(rollHouse, 92 + step * 5);
            };
            setTimeout(rollHouse, 180 + nodeIndex * 40);
        });

        setTimeout(() => {
            if (!container.isConnected) return;
            [name, relation].filter(Boolean).forEach(node => {
                node.classList.remove('is-measure-pending');
                node.classList.add('is-measure-revealed');
            });
        }, 1380);
        setTimeout(() => {
            if (!container.isConnected) return;
            speedValues.forEach(node => {
                node.textContent = node.dataset.finalText;
                node.classList.remove('is-measure-pending');
                node.classList.add('is-measure-revealed');
            });
        }, 1480);
        setTimeout(() => {
            if (!container.isConnected) return;
            characterReveal?.classList.add('is-resolving');
        }, 1050);
        setTimeout(() => {
            if (!container.isConnected) return;
            characterReveal?.classList.remove('is-pending', 'is-resolving');
            characterReveal?.classList.add('is-revealed');
        }, 1460);
        setTimeout(() => {
            if (container.isConnected) container.classList.remove('is-measuring');
        }, 2200);
    }

    function toggleReportDisclosure(event) {
        const button = event.currentTarget;
        const panel = element(button.getAttribute('aria-controls'));
        if (!panel) return;
        const opening = panel.hidden;
        panel.hidden = !opening;
        button.setAttribute('aria-expanded', String(opening));
        const icon = button.querySelector('i');
        if (icon) icon.textContent = opening ? '−' : '＋';
        const action = button.querySelector('[data-report-action]');
        if (action) action.textContent = opening ? '접기' : '자세히';
        button.setAttribute('aria-label', `${button.dataset.reportLabel || ''} ${opening ? '접기' : '자세히 보기'}`.trim());
        button.closest('.cw-result-section, .cw-report-house')?.classList.toggle('is-expanded', opening);
    }

    function currentTypeComparison() {
        if (!result || !Core.MBTI_TYPES.includes(selectedMbti)) return null;
        return Core.buildMbtiComparison(selectedMbti, result.code);
    }

    function renderResult(options = {}) {
        const detail = BAND_INTEGRATION_ENABLED && hasDetailedAccess()
            ? `${renderMemberDetail()}${renderSpeedCard()}${renderHouseCard()}`
            : renderLockedDetail();
        const resultCodeLetters = [...result.code];
        const renderResultCodeSlots = (letters, startIndex) => letters
            .map((letter, index) => `<span data-code-slot="${startIndex + index}" data-final-letter="${escapeHtml(letter)}">${escapeHtml(letter)}</span>`)
            .join('');
        const resultCodeBackSlots = renderResultCodeSlots(resultCodeLetters.slice(0, 2), 0);
        const resultCodeFrontSlots = renderResultCodeSlots(resultCodeLetters.slice(2), 2);
        const characterState = options.animate ? 'is-pending' : 'is-revealed';
        const characterPath = typeCharacterPath(result.code);
        element('result-content').innerHTML = `
            <div class="cw-result-wrap">
                <article class="cw-result-report">
                    <section class="cw-result-identity">
                        <div class="cw-type-poster" data-final-code="${escapeHtml(result.code)}">
                            <span class="cw-visually-hidden">${escapeHtml(result.code)}</span>
                            <strong class="cw-result-code cw-result-code-back" aria-hidden="true">${resultCodeBackSlots}</strong>
                            <figure class="cw-character-reveal ${characterState}" data-character-reveal>
                                <div class="cw-character-placeholder" aria-hidden="true"><span>?</span><small>TYPE CHARACTER</small></div>
                                <img src="${escapeHtml(characterPath)}" width="360" height="520" alt="${escapeHtml(`${result.code} ${result.typeName} 아기 크레 캐릭터`)}" loading="eager" decoding="async">
                            </figure>
                            <strong class="cw-result-code cw-result-code-front" aria-hidden="true">${resultCodeFrontSlots}</strong>
                        </div>
                        <h1 class="cw-result-type-name" data-final-name="${escapeHtml(result.typeName)}">${escapeHtml(result.typeName)}</h1>
                    </section>
                    ${detail}
                    <footer class="cw-report-footer">
                        <section class="cw-share-section" aria-label="결과 공유">
                            <button class="cw-share-action is-save" type="button" data-action="save-image">
                                <span class="cw-share-save-mark" aria-hidden="true">↓</span>
                                <strong data-action-label>결과 이미지 저장</strong>
                            </button>
                            <button class="cw-share-action is-kakao" type="button" data-action="share">
                                <img src="assets/kakaolink_btn_medium.png" width="24" height="24" alt="">
                                <strong data-action-label>카카오톡 공유</strong>
                            </button>
                        </section>
                    </footer>
                </article>
                <small class="cw-result-copyright cw-result-copyright-outside">© 2026 CREO. All rights reserved.</small>
            </div>`;
        element('result-content').querySelector('[data-action="unlock-detail"]')?.addEventListener('click', handleUnlockDetail);
        element('result-content').querySelector('[data-action="open-band"]')?.addEventListener('click', openBandTarget);
        element('result-content').querySelector('[data-action="share"]')?.addEventListener('click', shareResult);
        element('result-content').querySelector('[data-action="save-image"]')?.addEventListener('click', saveResultImage);
        element('result-content').querySelectorAll('[data-report-toggle]').forEach(button => {
            button.addEventListener('click', toggleReportDisclosure);
        });
        if (options.animate) playResultMeasurementAnimation(element('result-content').querySelector('.cw-result-wrap'));
    }

    function renderEmptyResult() {
        element('result-content').innerHTML = `
            <section class="cw-result-empty">
                <p>CREWARTS PERSONALITY TEST</p>
                <h1>아직 결과가 없어요</h1>
                <button class="cw-test-action cw-primary-button" type="button" data-action="start-empty">검사 시작</button>
            </section>`;
        element('result-content').querySelector('[data-action="start-empty"]')?.addEventListener('click', startSurvey);
    }

    function handleUnlockDetail() {
        if (!BAND_INTEGRATION_ENABLED) {
            toast('BAND 회원 확인은 현재 준비 중이에요.');
            return;
        }
        if (hasDetailedAccess()) {
            renderResult();
            return;
        }
        navigateToTab('band', { memberOptions: { revealResult: true } });
    }

    async function submitSurvey() {
        if (IS_QA_MODE || !result || !surveySessionId || saveInFlight || !hasDetailedAccess()) return;
        const signature = JSON.stringify({ session: surveySessionId, answers, selectedMbti, band: bandAuthUser?.id || '', member: bandAuthUser?.isTargetMember || false });
        if (signature === lastSavedSignature) return;
        saveInFlight = true;
        try {
            const participantKey = await hashSessionId(surveySessionId);
            const response = {
                participantKey,
                creMbti: result.code,
                crebtiType: result.code,
                knownMbti: selectedMbti || null,
                axisScores: result.letters,
                assignedHouseKey,
                houseId: assignedHouseKey,
                answers: answers.slice(),
                answerLabels: questions.map((question, index) => {
                    const scores = Core.answerLetters(question, answers[index]);
                    return {
                    questionId: question.id,
                    axis: question.axis,
                    secondaryAxis: question.secondaryAxis || '',
                    displayedPosition: answers[index] + 1,
                    score: scores[0],
                    secondaryScore: scores[1] || '',
                    responseMs: responseTimings[index]?.elapsedMs || null,
                    timingValid: Boolean(responseTimings[index]?.valid)
                    };
                }),
                responseTimes: responseTimings.slice(),
                timingStats: {
                    validCount: timingStats.validCount,
                    totalMs: timingStats.totalMs,
                    averageMs: timingStats.averageMs,
                    medianMs: timingStats.medianMs,
                    axisMedians: timingStats.axisMedians,
                    style: timingStats.style.key,
                    fastest: timingStats.fastest,
                    slowest: timingStats.slowest
                },
                questionVersion: Core.SURVEY_VERSION,
                questionContentUpdatedAt: config.crewart_mbti_content_updated_at || null,
                createdAt: sessionCreatedAt,
                syncedAt: new Date().toISOString()
            };
            const saved = await bandFetch('/api/crewart-survey/responses', {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${bandAuthToken}`
                },
                body: JSON.stringify({ response })
            });
            if (!saved.ok) {
                const payload = await saved.json().catch(() => ({}));
                throw new Error(payload.error || '설문 결과를 저장하지 못했습니다.');
            }
            lastSavedSignature = signature;
        } catch (error) {
            console.error('[Crewart survey save]', error);
        } finally {
            saveInFlight = false;
        }
    }

    function currentStage() {
        if (!element('band-screen').hidden) return 'band';
        if (!element('result-screen').hidden) return 'result';
        if (!element('mbti-screen').hidden) return 'mbti';
        if (!element('question-screen').hidden) return 'questions';
        return 'intro';
    }

    async function bandFetch(url, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        try {
            return await fetch(url, { ...(options || {}), signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function verifyBandSession(token) {
        const response = await bandFetch(`${BAND_MEMBER_API}/session`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        if (!response.ok) throw new Error('BAND membership session expired');
        return response.json();
    }

    function updateBandUi() {
        document.querySelectorAll('[data-band-join]').forEach(link => { link.href = bandTargetUrl; });
        updateBandState();
        updatePersistentActions();
        if (result && !element('result-screen').hidden) renderResult();
    }

    function updatePersistentActions() {
        const nav = element('app-nav');
        const home = element('persistent-home-button');
        const stage = currentStage();
        const focused = stage === 'questions' || stage === 'mbti';
        if (home) home.hidden = !focused;
        if (nav) nav.hidden = focused;
        const activeTab = stage === 'intro' ? 'home' : stage;
        document.querySelectorAll('[data-nav]').forEach(button => {
            const active = button.dataset.nav === activeTab;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    function navigationTabForStage(stage = currentStage()) {
        if (stage === 'intro') return 'home';
        return APP_TABS.includes(stage) ? stage : 'home';
    }

    function tabHistoryState(tab) {
        const previous = history.state && typeof history.state === 'object' ? history.state : {};
        return { ...previous, [APP_HISTORY_KEY]: tab };
    }

    function replaceTabHistory(tab) {
        try { history.replaceState(tabHistoryState(tab), document.title); } catch (_) {}
    }

    function pushTabHistory(tab) {
        try { history.pushState(tabHistoryState(tab), document.title); } catch (_) {}
    }

    function navigateToTab(tab, options = {}) {
        if (!APP_TABS.includes(tab)) return;
        const currentTab = navigationTabForStage();
        if (!options.fromHistory && currentTab !== tab) {
            replaceTabHistory(currentTab);
            pushTabHistory(tab);
        }
        if (tab === 'home') {
            returnToIntro();
            return;
        }
        if (tab === 'result') {
            if (result) {
                renderResult({ animate: true });
                setScreen('result-screen');
            } else restoreLastResult({ animate: true });
            return;
        }
        if (tab === 'band') openMemberCheck(options.memberOptions);
    }

    async function initBandMembership() {
        try {
            bandAuthToken = sessionStorage.getItem(MEMBERSHIP_STORAGE_KEY) || '';
            bandAuthPhoneMask = sessionStorage.getItem(MEMBERSHIP_PHONE_STORAGE_KEY) || '';
            if (bandAuthToken && !bandAuthPhoneMask) {
                bandAuthToken = '';
                sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
            }
        } catch (_) {
            bandAuthToken = '';
            bandAuthPhoneMask = '';
        }
        try {
            const response = await bandFetch(`${BAND_MEMBER_API}/config`, { cache: 'no-store' });
            if (!response.ok) throw new Error('BAND membership config unavailable');
            const memberConfig = await response.json();
            bandAuthConfigured = Boolean(memberConfig.configured);
            bandTargetUrl = memberConfig.targetBandUrl || DEFAULT_BAND_URL;
            if (bandAuthConfigured && bandAuthToken) {
                const session = await verifyBandSession(bandAuthToken);
                bandAuthUser = session.user || null;
                bandTargetUrl = session.targetBandUrl || bandTargetUrl;
            }
        } catch (error) {
            console.error('[Crewart BAND membership]', error);
            bandAuthUser = null;
            bandAuthToken = '';
            bandAuthPhoneMask = '';
            try {
                sessionStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
                sessionStorage.removeItem(MEMBERSHIP_PHONE_STORAGE_KEY);
            } catch (_) {}
        } finally {
            bandAuthReady = true;
            updateBandUi();
        }
    }

    function stopMembershipRecheck() {
        if (membershipRecheckTimer) clearTimeout(membershipRecheckTimer);
        membershipRecheckTimer = null;
        pendingMemberPhone = '';
        membershipRecheckStartedAt = 0;
        membershipCheckInFlight = false;
    }

    async function requestPhoneMembership(phone) {
        const response = await bandFetch(`${BAND_MEMBER_API}/verify`, {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const payload = await response.json().catch(() => ({}));
        bandTargetUrl = payload.targetBandUrl || bandTargetUrl;
        document.querySelectorAll('[data-band-join]').forEach(link => { link.href = bandTargetUrl; });
        if (!response.ok) throw new Error(payload.error || '가입 여부를 확인하지 못했어요.');
        return payload;
    }

    function completeMembershipAccess(payload, verifiedPhone) {
        const status = element('member-check-status');
        const phoneInput = element('member-phone');
        stopMembershipRecheck();
        bandAuthToken = payload.token || '';
        bandAuthUser = payload.user || { id: 'band_member', name: 'BAND 회원', isTargetMember: true };
        bandAuthPhoneMask = maskPhone(verifiedPhone) || bandAuthPhoneMask;
        editingMembership = false;
        if (bandAuthToken) {
            try {
                sessionStorage.setItem(MEMBERSHIP_STORAGE_KEY, bandAuthToken);
                if (bandAuthPhoneMask) sessionStorage.setItem(MEMBERSHIP_PHONE_STORAGE_KEY, bandAuthPhoneMask);
            } catch (_) {}
        }
        if (status) {
            status.hidden = true;
            status.textContent = '';
            status.classList.remove('is-error', 'is-action', 'is-success');
        }
        updateBandUi();
        const reveal = pendingResultReveal && Boolean(result);
        pendingResultReveal = false;
        setTimeout(() => {
            if (phoneInput) phoneInput.value = '';
            if (reveal) completeResultReveal();
            else toast('회원 확인이 완료됐어요.');
        }, 350);
    }

    function scheduleMembershipRecheck() {
        if (!pendingMemberPhone || membershipRecheckTimer) return;
        const delay = document.visibilityState === 'visible' && document.hasFocus()
            ? MEMBERSHIP_RECHECK_VISIBLE_MS
            : MEMBERSHIP_RECHECK_HIDDEN_MS;
        membershipRecheckTimer = setTimeout(() => {
            membershipRecheckTimer = null;
            void recheckPendingMembership();
        }, delay);
    }

    async function recheckPendingMembership(options = {}) {
        if (!pendingMemberPhone || membershipCheckInFlight || (hasDetailedAccess() && !editingMembership)) return;
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        if (Date.now() - membershipRecheckStartedAt > MEMBERSHIP_RECHECK_TIMEOUT_MS) {
            stopMembershipRecheck();
            updateBandState();
            if (status) {
                status.hidden = false;
                status.textContent = '가입 승인 확인 시간이 지났어요. 같은 번호로 다시 확인해주세요.';
                status.classList.add('is-error');
            }
            return;
        }
        if (options.visibleOnly && document.visibilityState !== 'visible') {
            scheduleMembershipRecheck();
            return;
        }
        membershipCheckInFlight = true;
        try {
            const payload = await requestPhoneMembership(pendingMemberPhone);
            if (payload.member) {
                const verifiedPhone = pendingMemberPhone;
                completeMembershipAccess(payload, verifiedPhone);
                return;
            }
            if (status) {
                status.hidden = false;
                status.textContent = '가입 후 돌아오면 같은 번호로 자동 확인해요.';
                status.classList.remove('is-error', 'is-success');
                status.classList.add('is-action');
            }
            if (joinLink) joinLink.hidden = false;
            if (joinLink) joinLink.classList.add('is-recommended');
        } catch (error) {
            if (status) {
                status.hidden = false;
                status.textContent = '가입 승인을 기다리고 있어요. 화면으로 돌아오면 다시 확인할게요.';
            }
        } finally {
            membershipCheckInFlight = false;
            if (pendingMemberPhone) scheduleMembershipRecheck();
        }
    }

    async function verifyMembershipPhone(event) {
        event.preventDefault();
        const phoneInput = element('member-phone');
        const submit = element('member-check-submit');
        const status = element('member-check-status');
        const joinLink = element('member-join-link');
        const submitLabel = element('member-check-submit-label');
        if (!phoneInput || !submit || !submitLabel || !status || !joinLink) return;
        status.hidden = false;
        status.classList.remove('is-error', 'is-success', 'is-action');
        joinLink.hidden = false;
        joinLink.classList.remove('is-recommended');
        submit.classList.remove('is-recheck');
        if (!bandAuthConfigured) {
            status.textContent = '회원 명단 연결을 준비하고 있어요. 잠시 후 다시 시도해주세요.';
            status.classList.add('is-error');
            submitLabel.textContent = '다시 시도';
            submit.classList.add('is-recheck');
            return;
        }
        const phoneDigits = String(phoneInput.value || '').replace(/\D/g, '');
        if (!/^010\d{8}$/.test(phoneDigits)) {
            status.textContent = '010으로 시작하는 휴대전화번호 11자리를 입력해주세요.';
            status.classList.add('is-error');
            return;
        }
        stopMembershipRecheck();
        submit.disabled = true;
        submitLabel.textContent = '확인 중…';
        status.textContent = '회원 명단을 확인하고 있어요…';
        phoneInput.blur();
        syncMemberKeyboardState({ ensureVisible: false });
        try {
            const payload = await requestPhoneMembership(phoneDigits);
            if (!payload.member) {
                status.textContent = '가입 후 돌아오면 같은 번호로 자동 확인해요.';
                status.classList.remove('is-error', 'is-success');
                status.classList.add('is-action');
                pendingMemberPhone = phoneDigits;
                membershipRecheckStartedAt = Date.now();
                updateBandState();
                joinLink.hidden = false;
                joinLink.classList.add('is-recommended');
                submitLabel.textContent = '다시 확인';
                submit.classList.add('is-recheck');
                scheduleMembershipRecheck();
                return;
            }
            completeMembershipAccess(payload, phoneDigits);
        } catch (error) {
            stopMembershipRecheck();
            updateBandState();
            status.textContent = error.message || '가입 여부를 확인하지 못했어요.';
            status.classList.add('is-error');
            submitLabel.textContent = '다시 확인';
            submit.classList.add('is-recheck');
        } finally {
            submit.disabled = false;
        }
    }

    function formatMemberPhone(event) {
        const input = event.currentTarget;
        const digits = String(input.value || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length > 7) input.value = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        else if (digits.length > 3) input.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
        else input.value = digits;
    }

    function handleMemberJoinReturn() {
        if (currentStage() === 'band') {
            const status = element('member-check-status');
            if (status) {
                status.hidden = false;
                status.textContent = pendingMemberPhone
                    ? '가입 승인 후 돌아오면 자동으로 다시 확인해요.'
                    : '가입 후 이 화면에서 회원 확인을 진행해주세요.';
                status.classList.remove('is-error', 'is-success');
                status.classList.add('is-action');
            }
        }
    }

    function drawRoundedRect(context, x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + safeRadius, y);
        context.arcTo(x + width, y, x + width, y + height, safeRadius);
        context.arcTo(x + width, y + height, x, y + height, safeRadius);
        context.arcTo(x, y + height, x, y, safeRadius);
        context.arcTo(x, y, x + width, y, safeRadius);
        context.closePath();
    }

    function loadShareImage(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = source;
        });
    }

    function drawShareImageContain(context, image, x, y, width, height) {
        const sourceWidth = Number(image.naturalWidth || image.width) || width;
        const sourceHeight = Number(image.naturalHeight || image.height) || height;
        const scale = Math.min(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const drawX = x + (width - drawWidth) / 2;
        const drawY = y + (height - drawHeight) / 2;
        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    }

    function canvasBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('공유 이미지를 만들 수 없습니다.')), 'image/png', .96);
        });
    }

    function drawShareScale(context, x, y, width, position, color = '#202421') {
        context.fillStyle = '#cfd2cd';
        context.fillRect(x, y, width, 4);
        context.fillStyle = '#8f948f';
        context.fillRect(x + width / 2 - 1, y - 6, 2, 16);
        const markerX = x + width * (Math.max(0, Math.min(100, position)) / 100);
        context.beginPath();
        context.moveTo(markerX, y - 13);
        context.lineTo(markerX - 8, y - 23);
        context.lineTo(markerX + 8, y - 23);
        context.closePath();
        context.fillStyle = color;
        context.fill();
    }

    function drawShareSectionLabel(context, number, english, korean, x, y, width, font, drawLine = true) {
        context.fillStyle = '#989d98';
        context.font = `700 15px ${font}`;
        context.fillText(number, x, y);
        context.fillStyle = '#707570';
        context.font = `700 13px ${font}`;
        context.fillText(english, x + 38, y);
        context.fillStyle = '#202421';
        context.font = `800 24px ${font}`;
        context.textAlign = 'right';
        context.fillText(korean, x + width, y);
        context.textAlign = 'left';
        if (drawLine) {
            context.fillStyle = '#565a56';
            context.fillRect(x, y + 14, width, 2);
        }
    }

    function shareFileName() {
        const typeName = String(result?.typeName || 'RESULT')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, '');
        return `CREWARTS_${result.code}_${typeName}.png`;
    }

    async function createResultShareFile() {
        if (!result) throw new Error('저장할 결과가 없습니다.');
        await document.fonts?.ready;

        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1440;
        const context = canvas.getContext('2d');
        const font = '"Pretendard Variable", Pretendard, sans-serif';
        const pageX = 48;
        const pageY = 38;
        const pageWidth = 984;
        const pageHeight = 1364;
        const contentX = 88;
        const contentWidth = 904;

        context.fillStyle = '#ecece8';
        context.fillRect(0, 0, canvas.width, canvas.height);
        drawRoundedRect(context, pageX, pageY, pageWidth, pageHeight, 12);
        context.fillStyle = '#ffffff';
        context.fill();
        context.strokeStyle = '#d2d3cd';
        context.lineWidth = 2;
        context.stroke();

        context.fillStyle = '#2b302c';
        context.font = `790 188px ${font}`;
        context.textBaseline = 'alphabetic';
        context.fillText(result.code.slice(0, 2), 145, 360);
        context.fillText(result.code.slice(2), 650, 360);

        try {
            const character = await loadShareImage(new URL(typeCharacterPath(result.code), document.baseURI).toString());
            drawShareImageContain(context, character, 362, 72, 356, 452);
        } catch (_) {
            context.fillStyle = '#f1f2ef';
            context.beginPath();
            context.arc(540, 286, 144, 0, Math.PI * 2);
            context.fill();
        }

        context.fillStyle = '#17617b';
        context.font = `800 42px ${font}`;
        context.textAlign = 'center';
        context.fillText(result.typeName, 540, 530);
        context.textAlign = 'left';
        context.fillStyle = '#d5d7d2';
        context.fillRect(contentX, 558, contentWidth, 2);

        if (hasDetailedAccess()) {
            drawShareSectionLabel(context, '01', 'TRAIT AXES', '성향 지표', contentX, 600, contentWidth, font, false);
            result.axes.forEach((axisResult, index) => {
                const copy = AXIS_REPORT_COPY[axisResult.axis];
                const first = axisResult.axis[0];
                const second = axisResult.axis[1];
                const secondCount = Number(result.letters[second]) || 0;
            const position = Math.max(0, Math.min(100, (secondCount / (Core.AXIS_SCORE_TOTAL || 5)) * 100));
                const firstSelected = axisResult.dominant === first;
                const x = contentX + (index % 2) * 458;
                const y = 636 + Math.floor(index / 2) * 151;
                const width = 446;
                const height = 136;

                drawRoundedRect(context, x, y, width, height, 12);
                context.fillStyle = '#f6f6f3';
                context.fill();
                context.strokeStyle = '#dfe1dc';
                context.lineWidth = 2;
                context.stroke();

                context.fillStyle = '#202421';
                context.font = `750 20px ${font}`;
                context.textAlign = 'center';
                context.fillText(copy.title, x + width / 2, y + 28);

                context.textAlign = 'left';
                context.fillStyle = firstSelected ? '#202421' : '#9a9e9a';
                context.font = `${firstSelected ? 800 : 550} 24px ${font}`;
                context.fillText(first, x + 24, y + 65);
                context.textAlign = 'right';
                context.fillStyle = firstSelected ? '#9a9e9a' : '#202421';
                context.font = `${firstSelected ? 550 : 800} 24px ${font}`;
                context.fillText(second, x + width - 24, y + 65);
                context.textAlign = 'left';
                drawShareScale(context, x + 24, y + 96, width - 48, position);
                context.fillStyle = firstSelected ? '#202421' : '#9a9e9a';
                context.font = `${firstSelected ? 800 : 550} 16px ${font}`;
                context.fillText(copy.left, x + 24, y + 126);
                context.textAlign = 'right';
                context.fillStyle = firstSelected ? '#9a9e9a' : '#202421';
                context.font = `${firstSelected ? 550 : 800} 16px ${font}`;
                context.fillText(copy.right, x + width - 24, y + 126);
                context.textAlign = 'left';
            });

            const speed = resultSpeedPresentation();
            drawShareSectionLabel(context, '02', 'RESPONSE PACE', '선택 속도', contentX, 974, contentWidth, font);
            drawRoundedRect(context, contentX, 1010, contentWidth, 104, 12);
            context.fillStyle = '#f6f6f3';
            context.fill();
            context.strokeStyle = '#dfe1dc';
            context.lineWidth = 2;
            context.stroke();
            context.fillStyle = '#202421';
            context.font = `800 26px ${font}`;
            context.fillText(speed ? `문항당 ${speed.median}` : '측정 정보 없음', contentX + 24, 1047);
            context.fillStyle = '#737873';
            context.font = `650 16px ${font}`;
            context.textAlign = 'right';
            context.fillText(speed?.comparison || '', contentX + contentWidth - 24, 1047);
            context.textAlign = 'left';
            drawShareScale(context, contentX + 24, 1084, contentWidth - 48, speed?.position ?? 50);
            context.fillStyle = '#737873';
            context.font = `700 14px ${font}`;
            context.fillText('빠름', contentX + 24, 1106);
            context.textAlign = 'center';
            context.fillText('평균', 540, 1106);
            context.textAlign = 'right';
            context.fillText('신중', contentX + contentWidth - 24, 1106);
            context.textAlign = 'left';

            const house = Core.HOUSE_META[assignedHouseKey];
            drawShareSectionLabel(context, '03', 'HOUSE ASSIGNMENT', '기숙사', contentX, 1184, contentWidth, font);
            drawRoundedRect(context, contentX, 1220, contentWidth, 84, 12);
            context.fillStyle = '#f6f6f3';
            context.fill();
            context.strokeStyle = '#dfe1dc';
            context.lineWidth = 2;
            context.stroke();
            context.beginPath();
            context.arc(contentX + 46, 1262, 25, 0, Math.PI * 2);
            context.strokeStyle = house?.accent || '#16814b';
            context.lineWidth = 3;
            context.stroke();
            context.fillStyle = house?.accent || '#16814b';
            context.font = `800 22px ${font}`;
            context.textAlign = 'center';
            context.fillText(house?.seal || assignedHouseKey[0], contentX + 46, 1270);
            context.textAlign = 'left';
            context.fillStyle = '#707570';
            context.font = `700 12px ${font}`;
            context.fillText('ASSIGNED HOUSE', contentX + 88, 1254);
            context.fillStyle = '#202421';
            context.font = `800 27px ${font}`;
            context.fillText(house?.name || assignedHouseKey, contentX + 88, 1282);
        } else {
            drawRoundedRect(context, contentX, 640, contentWidth, 636, 14);
            context.fillStyle = '#f3f4f1';
            context.fill();
            context.strokeStyle = '#dfe1dc';
            context.lineWidth = 2;
            context.stroke();
            context.fillStyle = '#202421';
            context.font = `800 31px ${font}`;
            context.textAlign = 'center';
            context.fillText('상세 결과 잠김', 540, 930);
            context.fillStyle = '#737873';
            context.font = `650 20px ${font}`;
            context.fillText('BAND 회원 확인 후 결과에서 볼 수 있어요', 540, 972);
            context.textAlign = 'left';
        }

        context.fillStyle = '#737873';
        context.font = `650 14px ${font}`;
        context.fillText('© 2026 CREO · ALL RIGHTS RESERVED', contentX, 1384);
        context.textAlign = 'right';
        context.fillText('creok.onrender.com', contentX + contentWidth, 1384);
        context.textAlign = 'left';

        const blob = await canvasBlob(canvas);
        return new File([blob], shareFileName(), { type: 'image/png' });
    }

    async function createKakaoShareFile() {
        if (!result) throw new Error('공유할 결과가 없습니다.');
        await document.fonts?.ready;

        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 800;
        const context = canvas.getContext('2d');
        const font = '"Pretendard Variable", Pretendard, sans-serif';
        const house = Core.HOUSE_META[assignedHouseKey];
        const accent = house?.accent || '#17617b';

        context.fillStyle = '#e9eae5';
        context.fillRect(0, 0, canvas.width, canvas.height);

        drawRoundedRect(context, 22, 22, 1156, 756, 28);
        context.fillStyle = '#f8f8f5';
        context.fill();
        context.strokeStyle = '#d8dad4';
        context.lineWidth = 2;
        context.stroke();

        context.save();
        context.globalAlpha = .1;
        context.strokeStyle = accent;
        context.lineWidth = 2;
        [112, 164, 216].forEach(radius => {
            context.beginPath();
            context.arc(1048, 74, radius, 0, Math.PI * 2);
            context.stroke();
        });
        context.restore();

        context.fillStyle = '#222724';
        context.font = `850 28px ${font}`;
        context.textAlign = 'left';
        context.fillText('CREWARTS', 70, 76);
        context.fillStyle = '#7b807b';
        context.font = `720 16px ${font}`;
        context.fillText('PERSONALITY TEST', 70, 102);
        const houseLabel = `HOUSE ${house?.seal || assignedHouseKey[0] || '—'} · ${house?.name || assignedHouseKey || 'CREWARTS'}`;
        context.font = `760 18px ${font}`;
        const housePillWidth = Math.ceil(context.measureText(houseLabel).width) + 44;
        const housePillX = 1130 - housePillWidth;
        drawRoundedRect(context, housePillX, 55, housePillWidth, 46, 23);
        context.save();
        context.globalAlpha = .13;
        context.fillStyle = accent;
        context.fill();
        context.restore();
        context.strokeStyle = accent;
        context.lineWidth = 1.5;
        context.stroke();
        context.fillStyle = '#2c312e';
        context.textAlign = 'center';
        context.fillText(houseLabel, housePillX + housePillWidth / 2, 85);

        context.fillStyle = '#242925';
        context.font = `850 238px ${font}`;
        context.textBaseline = 'alphabetic';
        context.fillText(result.code.slice(0, 2), 328, 532);
        context.fillText(result.code.slice(2), 872, 532);

        try {
            const character = await loadShareImage(new URL(typeCharacterPath(result.code), document.baseURI).toString());
            drawShareImageContain(context, character, 390, 70, 420, 620);
        } catch (_) {
            context.fillStyle = '#eceee8';
            context.beginPath();
            context.arc(600, 380, 180, 0, Math.PI * 2);
            context.fill();
        }

        context.font = `820 44px ${font}`;
        const typeNameWidth = Math.ceil(context.measureText(result.typeName).width) + 74;
        const typePillWidth = Math.max(254, typeNameWidth);
        const typePillX = (canvas.width - typePillWidth) / 2;
        drawRoundedRect(context, typePillX, 670, typePillWidth, 82, 41);
        context.fillStyle = '#ffffff';
        context.fill();
        context.strokeStyle = '#d7d9d3';
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = '#17617b';
        context.textAlign = 'center';
        context.fillText(result.typeName, 600, 726);
        context.textAlign = 'left';

        context.fillStyle = '#858a85';
        context.font = `650 12px ${font}`;
        context.fillText('© 2026 CREO · ALL RIGHTS RESERVED', 52, 766);
        context.textAlign = 'right';
        context.fillText('creok.onrender.com', 1148, 766);
        context.textAlign = 'left';

        const blob = await canvasBlob(canvas);
        return new File([blob], `CREWARTS_${result.code}_KAKAO.png`, { type: 'image/png' });
    }

    function downloadShareFile(file) {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function initializeKakaoSdk() {
        try {
            if (!window.Kakao) return false;
            if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
            return Boolean(window.Kakao.Share?.sendDefault && window.Kakao.Share?.uploadImage);
        } catch (error) {
            console.warn('[Crewart Kakao init]', error);
            return false;
        }
    }

    async function uploadKakaoShareImage(file) {
        if (!window.Kakao?.Share?.uploadImage || typeof DataTransfer === 'undefined') {
            throw new Error('Kakao image upload is unavailable');
        }
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const response = await window.Kakao.Share.uploadImage({ file: transfer.files });
        const imageUrl = response?.infos?.original?.url;
        if (!imageUrl) throw new Error('Kakao image URL is missing');
        return imageUrl;
    }

    function setShareButtonBusy(button, busy, busyLabel) {
        if (!button) return;
        const label = button.querySelector('[data-action-label]');
        if (busy) {
            button.dataset.idleLabel = label?.textContent || '';
            if (label && busyLabel) label.textContent = busyLabel;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            return;
        }
        if (label && button.dataset.idleLabel) label.textContent = button.dataset.idleLabel;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        delete button.dataset.idleLabel;
    }

    function isAppleMobileDevice() {
        return /iP(?:hone|ad|od)/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function normalizedShareFileName(value) {
        const fallback = result ? `CREWARTS_${result.code}_${result.typeName}` : 'CREWARTS_RESULT';
        const base = String(value || fallback)
            .trim()
            .replace(/\.png$/i, '')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 72) || 'CREWARTS_RESULT';
        return `${base}.png`;
    }

    function renameShareFile(file, name) {
        return new File([file], normalizedShareFileName(name), {
            type: 'image/png',
            lastModified: Date.now()
        });
    }

    function saveDestinationPresentation() {
        if (typeof window.showSaveFilePicker === 'function') {
            return {
                destination: '저장할 폴더 직접 선택',
                help: '저장 버튼을 누르면 기기의 폴더 선택 창이 열려요.',
                action: '저장 위치 선택'
            };
        }
        if (isAppleMobileDevice()
            && navigator.share
            && preparedSaveFile
            && navigator.canShare?.({ files: [preparedSaveFile] })) {
            return {
                destination: '사진 앱 또는 파일 앱',
                help: '공유 메뉴에서 ‘이미지 저장’ 또는 ‘파일에 저장’을 선택해요.',
                action: '저장 방법 선택'
            };
        }
        return {
            destination: '브라우저 다운로드 폴더',
            help: '기기에 설정된 Downloads 폴더에 저장돼요.',
            action: 'Downloads에 저장'
        };
    }

    function clearPreparedSaveImage() {
        if (preparedSaveUrl) URL.revokeObjectURL(preparedSaveUrl);
        preparedSaveUrl = '';
        preparedSaveFile = null;
        element('result-save-preview')?.removeAttribute('src');
    }

    function prepareSaveDialog(file) {
        clearPreparedSaveImage();
        preparedSaveFile = file;
        preparedSaveUrl = URL.createObjectURL(file);
        element('result-save-preview').src = preparedSaveUrl;
        element('result-save-name').value = file.name.replace(/\.png$/i, '');
        const presentation = saveDestinationPresentation();
        element('result-save-destination').textContent = presentation.destination;
        element('result-save-help').textContent = presentation.help;
        element('result-save-confirm').querySelector('span').textContent = presentation.action;
    }

    async function saveResultImage(event) {
        const button = event?.currentTarget;
        setShareButtonBusy(button, true, '이미지 만드는 중');
        try {
            const file = await createResultShareFile();
            prepareSaveDialog(file);
            const dialog = element('result-save-dialog');
            if (!dialog.open) dialog.showModal();
        } catch (error) {
            console.error('[Crewart image preview]', error);
            toast('저장할 이미지를 만들지 못했어요. 다시 시도해주세요.', true);
        } finally {
            setShareButtonBusy(button, false);
        }
    }

    async function savePreparedResultImage() {
        if (!preparedSaveFile) return;
        const button = element('result-save-confirm');
        const label = button.querySelector('span');
        const idleLabel = label.textContent;
        const file = renameShareFile(preparedSaveFile, element('result-save-name').value);
        button.disabled = true;
        label.textContent = '저장 중';
        try {
            if (typeof window.showSaveFilePicker === 'function') {
                const handle = await window.showSaveFilePicker({
                    suggestedName: file.name,
                    types: [{
                        description: 'PNG 이미지',
                        accept: { 'image/png': ['.png'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(file);
                await writable.close();
                toast(`${handle.name || file.name} 파일을 저장했어요.`);
            } else if (isAppleMobileDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
                toast('공유 메뉴에서 저장 위치를 선택해주세요.');
                await navigator.share({ files: [file], title: 'CREWARTS 성향 결과' });
            } else {
                downloadShareFile(file);
                toast('브라우저 다운로드 폴더에 저장했어요.');
            }
            element('result-save-dialog').close('saved');
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('[Crewart image save]', error);
                toast('이미지를 저장하지 못했어요. 다시 시도해주세요.', true);
            }
        } finally {
            button.disabled = false;
            label.textContent = idleLabel;
        }
    }

    async function openKakaoShareGuide(event, file = null) {
        const button = event?.currentTarget || null;
        setShareButtonBusy(button, true, '공유 준비 중');
        try {
            const nextFile = file || await createKakaoShareFile();
            clearPreparedKakaoShare();
            preparedKakaoShareFile = nextFile;
            preparedKakaoShareUrl = URL.createObjectURL(nextFile);
            element('kakao-share-preview').src = preparedKakaoShareUrl;
            const dialog = element('kakao-share-dialog');
            if (!dialog.open) dialog.showModal();
        } catch (error) {
            console.error('[Crewart Kakao preview]', error);
            toast('공유할 이미지를 만들지 못했어요. 다시 시도해주세요.', true);
        } finally {
            setShareButtonBusy(button, false);
        }
    }

    function clearPreparedKakaoShare() {
        if (preparedKakaoShareUrl) URL.revokeObjectURL(preparedKakaoShareUrl);
        preparedKakaoShareUrl = '';
        preparedKakaoShareFile = null;
        element('kakao-share-preview')?.removeAttribute('src');
    }

    async function sharePreparedNativeResult(event) {
        const button = event?.currentTarget;
        const title = `${result.code} · ${result.typeName}`;
        const text = `나는 크레 앞에서 어떤 유형일까?\n${Core.QUESTIONS.length}문항 약 2분`;
        setShareButtonBusy(button, true, '공유 준비 중');

        try {
            const shareFile = preparedKakaoShareFile || await createResultShareFile();
            element('kakao-share-dialog')?.close('share');
            if (navigator.share && navigator.canShare?.({ files: [shareFile] })) {
                await navigator.share({
                    files: [shareFile],
                    title,
                    text: `${text}\n${SURVEY_URL}`
                });
                return;
            }
            if (navigator.share) {
                downloadShareFile(shareFile);
                toast('이미지는 저장했어요. 공유 앱에서 카카오톡을 선택해주세요.');
                await navigator.share({ title, text, url: SURVEY_URL });
                return;
            }
            downloadShareFile(shareFile);
            await navigator.clipboard.writeText(`${text}\n${SURVEY_URL}`);
            toast('이미지 저장과 링크 복사를 완료했어요.');
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('[Crewart result share]', error);
            try {
                await navigator.clipboard.writeText(`${text}\n${SURVEY_URL}`);
                toast('공유 링크를 복사했어요.');
            } catch (_) {
                window.prompt('아래 내용을 복사해주세요.', `${text}\n${SURVEY_URL}`);
            }
        } finally {
            setShareButtonBusy(button, false);
        }
    }

    async function shareResult(event) {
        const button = event?.currentTarget;
        const title = `${result.code} · ${result.typeName}`;
        const text = `나는 크레 앞에서 어떤 유형일까?\n${Core.QUESTIONS.length}문항 약 2분`;
        let shareFile = null;
        setShareButtonBusy(button, true, '카카오톡 여는 중');

        try {
            shareFile = await createKakaoShareFile();
            if (!initializeKakaoSdk()) throw new Error('Kakao SDK is unavailable');
            const imageUrl = await uploadKakaoShareImage(shareFile);
            await window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title,
                    description: text,
                    imageUrl,
                    imageWidth: 1200,
                    imageHeight: 800,
                    link: { mobileWebUrl: SURVEY_URL, webUrl: SURVEY_URL }
                },
                buttons: [{
                    title: '나도 알아보기',
                    link: { mobileWebUrl: SURVEY_URL, webUrl: SURVEY_URL }
                }]
            });
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('[Crewart Kakao direct share]', error);
            await openKakaoShareGuide(null, shareFile);
            toast('카카오톡 직접 연결이 어려워 기기 공유로 전환했어요.');
        } finally {
            setShareButtonBusy(button, false);
        }
    }

    if (IS_LOCAL_QA) {
        window.CrewartShareQA = Object.freeze({
            createResultShareFile,
            createKakaoShareFile,
            shareFileName,
            isAppleMobileDevice,
            normalizedShareFileName,
            saveDestinationPresentation
        });
    }

    function syncThemeColor(screenId) {
        const color = screenId === 'intro-screen' ? '#111712' : '#f4f4f1';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    }

    function bindEvents() {
        element('start-button').addEventListener('click', startSurvey);
        element('home-retest')?.addEventListener('click', startSurvey);
        element('auth-phone-edit')?.addEventListener('click', editMembershipAccess);
        element('auth-phone-clear')?.addEventListener('click', clearMembershipAccess);
        element('member-check-form')?.addEventListener('submit', verifyMembershipPhone);
        element('member-phone')?.addEventListener('input', formatMemberPhone);
        element('member-phone')?.addEventListener('focus', () => syncMemberKeyboardState());
        element('member-phone')?.addEventListener('blur', () => {
            setTimeout(() => syncMemberKeyboardState({ ensureVisible: false }), 80);
        });
        element('member-join-link')?.addEventListener('click', handleMemberJoinReturn);
        element('question-back').addEventListener('click', previousQuestion);
        element('mbti-unknown').addEventListener('click', () => {
            selectedMbti = '';
            showResult(true);
        });
        element('show-result').addEventListener('click', () => showResult(false));
        element('persistent-home-button').addEventListener('click', returnToIntro);
        element('kakao-share-confirm')?.addEventListener('click', sharePreparedNativeResult);
        element('kakao-share-dialog')?.addEventListener('close', clearPreparedKakaoShare);
        element('kakao-share-dialog')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) event.currentTarget.close('cancel');
        });
        element('result-save-confirm')?.addEventListener('click', savePreparedResultImage);
        element('result-save-dialog')?.addEventListener('close', clearPreparedSaveImage);
        element('result-save-dialog')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) event.currentTarget.close('cancel');
        });
        document.querySelectorAll('[data-nav]').forEach(button => {
            button.addEventListener('click', () => navigateToTab(button.dataset.nav));
        });
        window.addEventListener('popstate', event => {
            const tab = event.state?.[APP_HISTORY_KEY];
            navigateToTab(APP_TABS.includes(tab) ? tab : 'home', { fromHistory: true });
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') pauseTimer();
            else {
                resumeTimer();
                void recheckPendingMembership({ visibleOnly: true });
            }
        });
        window.addEventListener('pageshow', () => void recheckPendingMembership({ visibleOnly: true }));
        window.addEventListener('focus', () => void recheckPendingMembership({ visibleOnly: true }));
        window.visualViewport?.addEventListener('resize', () => {
            syncMemberKeyboardState();
        });
        window.visualViewport?.addEventListener('scroll', () => syncMemberKeyboardState({ ensureVisible: false }));
        window.addEventListener('resize', () => {
            syncMemberKeyboardState({ ensureVisible: false });
        });
    }

    function initialize() {
        if (!Core || !Array.isArray(Core.QUESTIONS) || Core.QUESTIONS.length < 1) {
            toast('테스트 데이터를 불러오지 못했어요.', true);
            return;
        }
        setupIntroVideo();
        bindEvents();
        renderHome();
        updatePersistentActions();
        replaceTabHistory(navigationTabForStage());
        syncThemeColor('intro-screen');
        const start = element('start-button');
        start.disabled = true;
        start.querySelector('span').textContent = '문항 준비 중…';
        playWordmark();
        void loadConfig().finally(() => {
            start.disabled = false;
            start.querySelector('span').textContent = '검사 시작';
        });
        if (!BAND_INTEGRATION_ENABLED) {
            bandAuthReady = false;
            updateBandUi();
        } else {
            void initBandMembership();
        }
    }

    Promise.resolve(Core?.ready)
        .then(initialize)
        .catch(error => {
            console.error('[Crewart questionnaire]', error);
            toast('문항 파일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', true);
        });
}());

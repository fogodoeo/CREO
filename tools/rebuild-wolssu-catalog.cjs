'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = 'C:/Users/5600x/Desktop/전크자/output/promo-center/월쑤_경기전라충청_원고5종_20261016';

const p = (text, extra = {}) => ({ type: 'text', text, size: 16, bold: false, color: 'ink', align: 'center', ...extra });
const h = text => p(text, { size: 26, bold: true });
const sub = text => p(text, { size: 20, bold: true });
const gap = () => p('');
const image = (file, alt) => ({
  type: 'image',
  src: '/promo-assets/' + file,
  copySrc: 'https://creok.onrender.com/promo-assets/' + file,
  alt,
  width: 500
});
const footer = [
  gap(),
  p('전국크레자랑 밴드 바로가기', { size: 18, bold: true, color: 'green', href: 'https://band.us/n/a6a6beMe97Ucc' }),
  p('네이버 밴드에서 ‘전국크레자랑’ 검색')
];

const templates = [
  {
    id: 'wolssu26-joseon',
    name: '조선 풍류 · 월쑤 야간 장터형',
    title: '👑 매주 월·수엔 ‘월쑤!’｜10월 19일 월요일 경기 편 출두하옵니다',
    catalogOrder: 1,
    version: 1,
    bundleVersion: 10,
    active: true,
    blocks: [
      h('달 뜨는 월요일·수요일 밤\n팔도 크레 풍류가 펼쳐지옵니다'),
      gap(),
      p('안녕하십니까 파사모 회원님들!\n[업체명] 인사 올리옵니다 ^^\n\n선선한 가을밤, 정자에 앉아 가락을 즐기던 옛 선비들의 풍류처럼\n매주 월요일과 수요일 밤 여덟 시(戌時)마다\n크레 집사님들의 눈과 마음을 사로잡을 흥겨운 장터가 열리옵니다.'),
      image('wolssu-joseon-pavilion-v1.jpg', '달빛 아래 전통 정자 위 이끼 돌에 앉은 크레스티드게코와 청자 찻잔'),
      sub('이름하여 전국크레자랑 ‘월쑤!’'),
      p('팔도강산 30여 곳의 전문 브리더와 상단이 한 뜻으로 뭉쳐,\n고을마다 지극정성으로 길러낸 어여쁜 용(크레)들을\n네이버 밴드 라이브에서 차례로 선보이는 릴레이 장터이옵니다.\n\n안방 사랑방에 편히 앉으시어\n실시간으로 움직이는 아이들의 체형과 무늬를 살피고,\n브리더와 직접 문답을 나누며 경매의 손맛까지 즐기실 수 있사옵니다.'),
      gap(),
      h('10월 19일 월요일 밤 8시\n【경기 편】 장인들이 출두하옵니다!'),
      p('이번 주 월요일인 10월 19일 밤 8시에는\n경기 고을의 내로라하는 실력파 브리더들이 자존심을 걸고\n축양장 깊숙이 아껴두었던 명품 개체들을 대거 이끌고 등판하옵니다!\n\n그리고 여기서 끝이 아니옵니다.\n곧이어 10월 21일 수요일 밤 8시에는 【전라·충청 편】 장인들이 바통을 이어받아\n또 한 번 눈부신 라인업을 펼칠 예정이오니,\n월요일 경기 편부터 수요일 전라·충청 편까지 연이어 기대해 주시옵소서!'),
      image('wolssu-relay-roadmap-v1.png', '10월 19일 월요일 밤 8시 경기 편 LIVE 및 10월 21일 수요일 밤 8시 전라·충청 편 릴레이 일정'),
      sub('낙찰 후 손님들의 노고를 더는 방도'),
      p('파발의 신속함 : 낙찰 즉시 카카오톡 채널 알림톡이 자동으로 당도하옵니다.\n간편한 셈법 : 전용 서찰(페이지)에서 낙찰 내역과 결제 안내를 한눈에 살피실 수 있사옵니다.\n주소 자동 기억 : 처음 한 번 등록해 두신 배송 정보는 다음 낙찰에도 그대로 적용되옵니다.\n생물 전문 배송 : 전문 배송업체가 집 근처 객주(제휴 매장)까지 귀한 용을 안전히 모셔 오며,\n도착 후 아이의 상태를 직접 살피고 편안히 데려가시면 되옵니다.'),
      image('joseon-small-dragon-v1.jpg', '한복 소매 아래 손바닥 위에 앉은 작은 크레스티드게코'),
      p('꼭 입양 채비를 하지 않으셨어도 좋사옵니다.\n10월 19일 월요일 밤 8시 경기 편, 그리고 수요일 전라·충청 편까지!\n과연 어느 고을의 용이 가장 영롱한지 밴드로 구경 오시지요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-relay',
    name: '전국 릴레이 · 경기 & 전라·충청 예고형',
    title: '🔥 이번 주 월요일은 경기 편!｜10.19 밤 8시 & 수요일 전라·충청 편까지',
    catalogOrder: 2,
    version: 1,
    bundleVersion: 10,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시 ‘월쑤!’\n다음 바통은 경기 편입니다'),
      gap(),
      p('안녕하세요 파사모 회원님들!\n[업체명]입니다 ^^\n\n지역마다, 샵마다 꼭꼭 숨겨둔 보물 같은 크레들을\n한 밴드에서 릴레이로 만나는 네이버 밴드 라이브 경매 ‘전국크레자랑’!\n열기를 이어받아 이번 주에도 정말 탄탄한 지역 라인업이 기다리고 있습니다.'),
      image('wolssu-gyeonggi-stage-v1.jpg', '라이브 방송 카메라 앞에서 붉은 할리퀸 크레스티드게코를 소개하는 장갑 낀 손'),
      sub('30여 곳의 전문 브리더가 이어 달리는 전국 릴레이'),
      p('전국의 전문 브리더·업체 30여 곳이 권역별로 팀을 이루어,\n매주 월요일과 수요일 밤 8시마다 각 지역의 자존심을 걸고 라이브 무대에 오릅니다.\n\n사진 몇 장으로는 다 담기지 않던 아이들의 생생한 움직임과 발색을\n실시간 영상으로 직접 확인하고, 브리더의 설명도 바로 들어보세요.'),
      gap(),
      h('10월 19일 월요일 밤 8시 【경기 편】\n그리고 수요일 【전라·충청 편】까지!'),
      p('먼저 10월 19일 월요일 밤 8시에는 【경기 편】이 출격합니다!\n경기 지역의 베테랑 브리더들이 오랫동안 공들여 준비한 개체들을\n아낌없이 꺼내 놓을 예정이라 저희도 벌써부터 기대가 큽니다.\n\n게다가 이번 주는 월요일 경기 편에 이어,\n10월 21일 수요일 밤 8시 【전라·충청 편】까지 숨 가쁘게 이어집니다!\n두 지역 브리더들이 각기 다른 매력의 아이들을 준비하고 있으니\n월요일 경기 편부터 수요일 전라·충청 편까지 놓치지 말고 꼭 기대해 주세요!'),
      image('wolssu-schedule-gyeonggi-v1.png', '10월 19일 월요일 밤 8시 경기 편 및 10월 21일 수요일 밤 8시 전라·충청 편 일정 안내'),
      sub('낙찰 알림부터 근처 매장 픽업까지 깔끔하게'),
      p('낙찰받으시면 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n톡 안의 전용 페이지에서 낙찰 내역과 결제 안내를 바로 확인하시고,\n배송 정보도 최초 1회만 등록해 두시면 다음번 낙찰에 그대로 자동 적용됩니다.\n\n아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 안전하게 배송됩니다.\n도착 후 직접 상태를 눈으로 확인하고 픽업하시면 됩니다.'),
      image('after-bid-v5.png', '카카오톡 알림톡 → 전용 페이지 확인 → 집 근처 업체 픽업 안내'),
      p('당장 입양 계획이 없으셔도 전혀 괜찮습니다!\n10월 19일 월요일 밤 8시 경기 편, 그리고 수요일 전라·충청 편까지\n안방 1열에서 편하게 구경하시고 응원 댓글도 많이 남겨주세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-taste',
    name: '취향 탐색 · 모프 & 라인업 감상형',
    title: '🦎 내 취향 크레 어디 숨어있을까｜10.19 월요일 경기 편 & 수요일 전라·충청 편',
    catalogOrder: 3,
    version: 1,
    bundleVersion: 10,
    active: true,
    blocks: [
      h('볼 때마다 새로워지는 눈호강\n당신은 어떤 크레에 끌리시나요'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n묵직하게 올라오는 다크·레드 발색, 옆구리를 꽉 채운 화이트 월, 반듯한 핀 라인…\n크레를 키우다 보면 내 고정 취향인 아이도 반갑지만,\n생각지도 못했던 새로운 스타일의 아이에게 한눈에 반하는 순간이 찾아오곤 하죠 ㅎㅎ'),
      image('wolssu-taste-morphs-v1.jpg', '코르크 바크 위에 나란히 앉은 다크 레드 계열과 릴리 화이트 계열의 크레스티드게코 두 마리'),
      sub('지역이 바뀌면, 만나는 브리딩 스타일도 달라집니다'),
      p('전국의 전문 브리더·업체 30여 곳이 함께하는 ‘전국크레자랑’이 특별한 이유도 바로 여기에 있습니다.\n회차마다 출연하는 지역과 브리더가 달라지기 때문에,\n같은 밴드 안에서도 매주 전혀 다른 혈통과 개성 넘치는 라인업을 감상하실 수 있거든요.'),
      gap(),
      h('10월 19일(월) 경기 편에서 시작해\n수요일 전라·충청 편까지 이어지는 취향 찾기!'),
      p('다가오는 10월 19일 월요일 밤 8시에는 【경기 편】 브리더들이 나섭니다!\n탄탄한 기본기와 화려한 표현력을 갖춘 경기권 샵들의 개체들을\n실시간 라이브 영상으로 생생하게 비교하며 구경해 보세요.\n\n또한 월요일 경기 편의 여운이 가시기 전,\n10월 21일 수요일 밤 8시에는 【전라·충청 편】이 바통을 이어받습니다!\n전라·충청 브리더들이 아껴둔 비장의 라인업까지 연달아 펼쳐지니,\n월요일 경기 편과 수요일 전라·충청 편 모두 많은 기대 부탁드립니다.'),
      image('taste-color-whitewall-v1.jpg', '발색과 화이트 월이 다른 두 크레를 소개하는 손'),
      sub('마음에 쏙 드는 아이를 만나셨다면'),
      p('낙찰 즉시 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 한 번에 확인하실 수 있고,\n처음 등록한 배송 정보는 다음 낙찰에도 그대로 자동 적용됩니다.\n\n아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 배송됩니다.\n도착 후 직접 건강 상태를 확인하고 픽업하시면 됩니다.'),
      image('wolssu-relay-roadmap-v1.png', '10월 19일 월요일 밤 8시 경기 편 및 10월 21일 수요일 밤 8시 전라·충청 편 일정'),
      p('이번 주 월요일(10.19) 경기 편과 수요일 전라·충청 편에서는\n과연 어떤 아이가 회원님들의 심장을 뛰게 할까요?\n매주 월·수 밤 8시, 전국크레자랑 밴드에서 편하게 구경하며 취향을 발견해 보세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-afterwork',
    name: '퇴근 후 힐링 · 월쑤 저녁 루틴형',
    title: '📺 월·수 밤 8시엔 크레 구경｜10월 19일 월요일 경기 편부터 만나요',
    catalogOrder: 4,
    version: 1,
    bundleVersion: 10,
    active: true,
    blocks: [
      h('바쁜 하루 끝, 밤 8시\n편하게 크레 구경할 시간'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n퇴근하고 저녁 식사 마친 뒤, 소파에 편히 기대어 예쁜 크레들을 구경하는 시간.\n예전엔 이 밴드 저 밴드 방송 시간을 일일이 찾아다녀야 해서 아쉬우셨다면,\n이제는 매주 월요일과 수요일 밤 8시, 딱 한 곳만 기억해 주세요!'),
      image('wolssu-evening-lounge-v1.jpg', '따뜻한 저녁 조명 아래 비바리움 속 나뭇잎 위에 앉은 크레스티드게코와 찻잔'),
      sub('한 밴드에서 편안하게 즐기는 전국 30여 곳의 라이브'),
      p('전국의 전문 브리더·업체 30여 곳이 ‘전국크레자랑’ 밴드 한곳에 모였습니다.\n여기저기 알림을 켜두고 헤매실 필요 없이,\n매주 월·수 밤 8시(‘월쑤!’)마다 돌아가며 열리는 지역별 릴레이 방송을\n고정 프로그램 보듯 편안하게 즐기시면 됩니다.'),
      gap(),
      h('10월 19일 월요일 밤 8시 【경기 편】\n수요일 【전라·충청 편】까지 알찬 한 주!'),
      p('이번 주 월요일인 10월 19일 밤 8시에는 【경기 편】으로 기분 좋게 문을 엽니다!\n월요병이 싹 가실 만큼 예쁘고 건강한 경기권 브리더들의 크레들을\n실시간 라이브로 편하게 만나보세요.\n\n그리고 수요일(10월 21일) 밤 8시에는 곧바로 【전라·충청 편】이 찾아옵니다!\n월요일 경기 편에 이어 수요일 전라·충청 편까지,\n이번 주 내내 눈이 즐거운 저녁 시간이 준비되어 있으니 끝까지 기대해 주세요!'),
      image('wolssu-schedule-gyeonggi-v1.png', '10.19 월요일 경기 편 및 10.21 수요일 전라·충청 편 밤 8시 라이브 안내'),
      sub('구경하다 인연이 닿은 아이가 있다면'),
      p('낙찰되면 카카오톡 채널 알림톡이 자동으로 도착합니다.\n톡 안의 전용 페이지에서 낙찰 내역과 결제 안내를 확인해 주세요.\n처음 한 번 등록한 배송 정보는 다음 낙찰에도 그대로 자동 적용됩니다.\n\n아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 배송되며,\n도착 후 직접 상태를 확인하고 픽업하시면 됩니다.'),
      image('tour-nearby-pickup-v1.jpg', '집 근처 매장에서 작은 크레의 상태를 직접 확인하는 손'),
      p('입양 계획이 없으셔도 부담 없이 놀러 오세요.\n10월 19일 월요일 밤 8시 경기 편, 그리고 수요일 전라·충청 편에서\n반갑게 인사드리겠습니다. 편안한 저녁 보내세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-breeder',
    name: '브리더 준비 노트 · 출품 브리더의 진심형',
    title: '👀 방송에 데려갈 아이들 고르며 설렙니다｜10.19(월) 경기 편 & 수요일 전라·충청 편',
    catalogOrder: 5,
    version: 1,
    bundleVersion: 10,
    active: true,
    blocks: [
      h('“이번 방송엔 어떤 아이를\n자랑해 볼까요?”'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n라이브 방송 날이 다가오면 기다려 주시는 집사님들 못지않게\n축양장을 둘러보는 저희 브리더들의 마음도 바빠집니다.\n“이 아이는 카메라에서 옆구리 패턴을 꼭 보여드려야지”, “이 아이는 먹성 좋은 모습을 소개해야지” 하며\n출품할 아이들을 하나하나 살피는 시간이 참 설렙니다 ㅎㅎ'),
      image('wolssu-breeder-select-v1.jpg', '축양장 앞 따뜻한 조명 아래 코르크 바크 위의 크레스티드게코를 살피는 브리더의 손'),
      sub('사진 너머의 이야기까지 라이브에서 직접 물어보세요'),
      p('사진 한 장만으로는 아이의 실제 체형이나 활발한 움직임,\n부모 개체의 특징과 성장 과정을 다 전해드리기 어렵죠.\n\n전국의 전문 브리더·업체 30여 곳이 함께하는 ‘전국크레자랑’에서는\n실시간 영상으로 아이들을 요리조리 살펴보며\n궁금했던 점을 채팅으로 바로 물어보고 답변을 들으실 수 있습니다.'),
      gap(),
      h('10월 19일 월요일 밤 8시 【경기 편】 출격!\n수요일 【전라·충청 편】까지 기대해 주세요'),
      p('이번 10월 19일 월요일 밤 8시 【경기 편】을 위해\n경기 지역 브리더들이 자존심을 걸고 아끼던 개체들을 정성껏 준비했습니다!\n하나하나 브리더의 손길과 시간이 담긴 아이들이니 꼭 들어오셔서 함께 봐주세요.\n\n아울러 월요일 경기 편이 끝난 뒤,\n10월 21일 수요일 밤 8시에는 【전라·충청 편】 브리더들이 열기를 이어갑니다!\n전라·충청 샵들 역시 알찬 라인업으로 출격을 준비하고 있으니,\n월요일 경기 편부터 수요일 전라·충청 편까지 많은 관심과 기대 부탁드립니다!'),
      image('wolssu-relay-roadmap-v1.png', '10월 19일 월요일 밤 8시 경기 편 및 10월 21일 수요일 밤 8시 전라·충청 편 릴레이 안내'),
      sub('낙찰 후 안내와 수령도 안심할 수 있게'),
      p('낙찰 즉시 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 바로 확인하실 수 있고,\n배송 정보는 최초 1회 등록해 두시면 다음번에도 그대로 적용됩니다.\n\n아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 배송됩니다.\n도착 후 직접 상태를 확인하고 안전하게 픽업하시면 됩니다.'),
      image('live-question-v1.jpg', '작은 크레의 옆구리 무늬를 손으로 가리키며 설명하는 브리더'),
      p('단순한 경매를 넘어 크레를 좋아하는 분들이 함께 소통하는 축제 같은 시간!\n10월 19일 월요일 밤 8시 경기 편, 그리고 수요일 전라·충청 편까지\n전국크레자랑 밴드에서 반갑게 맞이할게요 ^^'),
      ...footer
    ]
  }
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function main() {
  const seedPath = path.join(root, 'promo-templates.json');
  const mediaPath = path.join(root, 'promo-media.json');
  const hooksPath = path.join(root, 'promo-copy-hooks.json');
  const migrationPath = path.join(root, 'promo-catalog-migration.json');

  // 1. Update promo-media.json
  const media = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
  const newAssets = [
    '/promo-assets/hero-wolssu-v1.png',
    '/promo-assets/wolssu-joseon-pavilion-v1.jpg',
    '/promo-assets/wolssu-gyeonggi-stage-v1.jpg',
    '/promo-assets/wolssu-taste-morphs-v1.jpg',
    '/promo-assets/wolssu-evening-lounge-v1.jpg',
    '/promo-assets/wolssu-breeder-select-v1.jpg',
    '/promo-assets/wolssu-schedule-gyeonggi-v1.png',
    '/promo-assets/wolssu-relay-roadmap-v1.png'
  ];
  for (const asset of newAssets) {
    const full = path.join(root, 'public', asset);
    if (!fs.existsSync(full)) throw new Error('Missing asset file: ' + full);
    media[asset] = 'https://creok.onrender.com' + asset;
  }
  fs.writeFileSync(mediaPath, JSON.stringify(media, null, 2) + '\n', 'utf8');

  // 2. Update promo-copy-hooks.json
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  for (const t of templates) {
    hooks[t.id] = { title: t.title, previous: [] };
  }
  fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + '\n', 'utf8');

  // 3. Update promo-templates.json with the 5 new manuscripts
  fs.writeFileSync(seedPath, JSON.stringify(templates, null, 2) + '\n', 'utf8');

  // 4. Update promo-catalog-migration.json to version 7, retiring all 10 previous templates
  const migration = {
    version: 7,
    id: '20261016-wolssu-gyeonggi-5pack',
    polishCopy: true,
    copyPolishVersion: 5,
    appendImages: true,
    replace: [],
    retire: {
      'launch26-editorial': 'wolssu26-taste',
      'launch26-episode': 'wolssu26-relay',
      'launch26-easy': 'wolssu26-afterwork',
      'launch26-partners': 'wolssu26-relay',
      'ep01-brief': 'wolssu26-taste',
      'launch26-collector': 'wolssu26-breeder',
      'launch26-joseon': 'wolssu26-joseon',
      'launch26-showtime': 'wolssu26-relay',
      'ep01-welcome': 'wolssu26-afterwork',
      'launch26-taste': 'wolssu26-taste',
      'launch26-tour': 'wolssu26-relay',
      'launch26-breeder': 'wolssu26-breeder',
      'launch26-series': 'wolssu26-relay',
      'launch26-questions': 'wolssu26-breeder',
      'launch26-afterwork': 'wolssu26-afterwork',
      'launch26-seoul-incheon-map': 'wolssu26-relay'
    }
  };
  fs.writeFileSync(migrationPath, JSON.stringify(migration, null, 2) + '\n', 'utf8');

  // 5. Export standalone HTML/TXT/JSON and images to Desktop output folder
  fs.mkdirSync(path.join(outDir, '이미지'), { recursive: true });
  fs.copyFileSync(path.join(root, 'public/promo-assets/hero-wolssu-v1.png'), path.join(outDir, '이미지/hero-wolssu-v1.png'));
  for (const [i, t] of templates.entries()) {
    const blocks = [
      image('hero-wolssu-v1.png', '전국크레자랑 월쑤! 매주 월·수 밤 8시 네이버 밴드 LIVE 경매'),
      ...t.blocks
    ];
    for (const b of blocks.filter(b => b.type === 'image')) {
      fs.copyFileSync(path.join(root, 'public', b.src), path.join(outDir, '이미지', path.basename(b.src)));
    }
    const name = String(i + 1).padStart(2, '0') + '_' + t.name.split(' · ')[0].replace(/\s+/g, '');
    const html = blocks.map(b => b.type === 'image'
      ? `<p align="center" style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`
      : `<p align="center" style="text-align:center;font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;font-size:${b.size}px;font-weight:${b.bold ? 700 : 400};line-height:1.75;margin:0;word-break:keep-all;overflow-wrap:anywhere">${b.href ? '<a href="' + esc(b.href) + '">' : ''}${esc(b.text).replace(/\n/g, '<br>') || '<br>'}${b.href ? '</a>' : ''}</p>`
    ).join('\n');
    fs.writeFileSync(
      path.join(outDir, name + '.html'),
      `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>:root{color-scheme:light dark}body{max-width:532px;padding:24px 16px;margin:auto;text-align:center;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif}h1{font-size:20px;line-height:1.5;margin-bottom:40px}</style><h1>${esc(t.title)}</h1><article>${html}</article></html>\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(outDir, name + '.txt'),
      t.title + '\n\n' + blocks.map(b => b.type === 'image' ? '[이미지: ' + b.alt + ']' : b.text + (b.href ? '\n' + b.href : '')).join('\n') + '\n',
      'utf8'
    );
  }
  fs.writeFileSync(path.join(outDir, '월쑤_원고5종.json'), JSON.stringify(templates, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(templates.map(t => ({
    id: t.id,
    name: t.name,
    title: t.title,
    characters: t.blocks.filter(b => b.type === 'text').map(b => b.text).join('').length,
    images: t.blocks.filter(b => b.type === 'image').length
  })), null, 2));
}

if (require.main === module) {
  main();
}
module.exports = { templates };

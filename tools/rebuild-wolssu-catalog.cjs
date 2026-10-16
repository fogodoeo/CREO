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
    bundleVersion: 12,
    active: true,
    blocks: [
      h('달 뜨는 월·수 밤 8시\n팔도 크레 풍류가 열리옵니다'),
      gap(),
      p('안녕하십니까 파사모 회원님들,\n[업체명] 문안 인사 올리옵니다 ^^\n\n선선한 가을밤, 팔도강산 30여 곳의 전문 브리더들이 한데 뭉쳐\n매주 월요일·수요일 밤 8시마다 어여쁜 용(크레)들을 선보이는\n네이버 밴드 라이브 ‘전국크레자랑 월쑤!’가 열리고 있사옵니다.'),
      image('wolssu-joseon-pavilion-v2.jpg', '보름달과 청사초롱 불빛 아래 전통 정자 위 소반과 청자 다기'),
      sub('10월 19일(월) 밤 8시 【경기 편】 출두!'),
      p('다가오는 10월 19일 월요일 밤 8시에는\n경기 고을의 내로라하는 장인들이 아껴둔 명품 개체들을 대거 이끌고 등판하옵니다!\n\n아울러 이틀 뒤인 10월 21일 수요일 밤 8시에는\n【전라·충청 편】 장인들이 바통을 이어받아 또 한 번 진귀한 라인업을 펼칠 예정이오니,\n월요일 경기 편부터 수요일 전라·충청 편까지 연이어 기대해 주시옵소서.'),
      image('wolssu-relay-roadmap-v1.png', '10월 19일 월요일 밤 8시 경기 편 LIVE 및 10월 21일 수요일 밤 8시 전라·충청 편 릴레이 일정'),
      sub('편안한 친견(픽업)과 통닭 하사품까지!'),
      p('낙찰 즉시 카카오톡 알림톡으로 내역과 결제 안내가 당도하며,\n아이들은 생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전히 모셔 오니\n도착 후 직접 상태를 살피고 편안히 데려가시면 되옵니다.\n\n🎁 이번 방송에는 크레준치 협찬으로 낙찰자 중 5분께\n‘가마치통닭 쿠폰’을 하사하는 특별 잔치도 열리오니,\n월요일 밤 8시 밴드로 편히 마실 오시지요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-relay',
    name: '전국 릴레이 · 경기 & 전라·충청 예고형',
    title: '🔥 이번 주 월요일은 경기 편!｜10.19 밤 8시 & 수요일 전라·충청 편까지',
    catalogOrder: 2,
    version: 1,
    bundleVersion: 12,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시 ‘월쑤!’\n이번 주 주인공은 경기 편입니다'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n전국의 전문 브리더·업체 30여 곳이 권역별로 바통을 이어받아\n매주 월요일·수요일 밤 8시에 만나는 네이버 밴드 라이브 경매 ‘전국크레자랑’!\n사진만으로는 아쉬웠던 아이들의 실제 움직임과 발색을 실시간 영상으로 생생하게 만나보세요.'),
      image('wolssu-gyeonggi-stage-v2.jpg', '라이브 방송 스튜디오 조명 아래 카메라와 마이크, 코르크 바크가 놓인 무대'),
      sub('10.19(월) 경기 편 & 10.21(수) 전라·충청 편 연달아 출격!'),
      p('먼저 10월 19일 월요일 밤 8시에는 【경기 편】이 문을 엽니다!\n경기권 브리더들이 자존심을 걸고 아껴둔 개체들을 대거 선보일 예정이라\n저희도 벌써부터 어떤 아이들이 나올지 기대가 됩니다 ㅎㅎ\n\n그리고 10월 21일 수요일 밤 8시에는 곧바로 【전라·충청 편】이 바통을 이어받으니,\n월요일 경기 편부터 수요일 전라·충청 편까지 놓치지 말고 꼭 함께해 주세요!'),
      image('wolssu-schedule-gyeonggi-v1.png', '10월 19일 월요일 밤 8시 경기 편 및 10월 21일 수요일 밤 8시 전라·충청 편 일정 안내'),
      sub('안심 픽업 시스템 + 가마치통닭 협찬 이벤트!'),
      p('낙찰 후에는 카카오톡 알림톡으로 내역 확인부터 배송지 입력까지 한 번에 안내되며,\n아이들은 생물 전문 배송업체를 통해 집 근처 제휴 업체로 배송되어\n직접 컨디션을 확인하고 안심 픽업하실 수 있습니다.\n\n🍗 특히 이번에는 크레준치 협찬으로 낙찰자 중 5명을 추첨해\n‘가마치통닭 쿠폰’도 증정하니, 구경 오셔서 눈호강도 하고 치킨 행운도 챙겨가세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-taste',
    name: '취향 탐색 · 모프 & 라인업 감상형',
    title: '🦎 내 취향 크레 어디 숨어있을까｜10.19 월요일 경기 편 & 수요일 전라·충청 편',
    catalogOrder: 3,
    version: 1,
    bundleVersion: 12,
    active: true,
    blocks: [
      h('볼 때마다 새로워지는 눈호강\n당신은 어떤 크레에 끌리시나요'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n진하게 올라오는 다크·레드 발색부터 옆구리를 꽉 채운 화이트 월까지,\n크레는 브리더마다 추구하는 스타일이 달라서 구경하는 재미가 끝이 없죠.\n전국의 전문 브리더 30여 곳이 함께하는 ‘전국크레자랑’에서는\n매주 월·수 밤 8시마다 지역별로 색다른 라인업을 한자리에서 비교해 보실 수 있습니다.'),
      image('wolssu-taste-morphs-v2.jpg', '갤러리 조명 아래 코르크 바크와 양치식물로 꾸며진 두 개의 유리 비바리움'),
      sub('월요일은 【경기 편】, 수요일은 【전라·충청 편】!'),
      p('다가오는 10월 19일 월요일 밤 8시에는 【경기 편】 브리더들이 출격합니다!\n탄탄한 체형과 화려한 표현력을 자랑하는 경기권 샵들의 개체들을\n라이브 화면으로 요리조리 살펴보며 내 취향 저격 아이를 찾아보세요.\n\n이어서 10월 21일 수요일 밤 8시에는 【전라·충청 편】의 비장의 라인업까지 기다리고 있으니,\n월요일 경기 편과 수요일 전라·충청 편 모두 많은 기대 부탁드립니다!'),
      image('wolssu-relay-roadmap-v1.png', '10월 19일 월요일 밤 8시 경기 편 및 10월 21일 수요일 밤 8시 전라·충청 편 일정'),
      sub('근처 제휴샵 픽업에 치킨 이벤트까지 든든하게'),
      p('마음에 드는 아이를 낙찰받으시면 카톡 알림톡으로 간편하게 안내해 드리고,\n생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 이동되어\n직접 건강 상태를 확인한 뒤 픽업하시면 됩니다.\n\n🎁 게다가 크레준치 협찬으로 낙찰자 중 5분께 ‘가마치통닭 쿠폰’을 드리는 이벤트도 진행되니,\n이번 주 월·수 밤 8시 부담 없이 밴드로 구경 오세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-afterwork',
    name: '퇴근 후 힐링 · 월쑤 저녁 루틴형',
    title: '📺 월·수 밤 8시엔 크레 구경｜10월 19일 월요일 경기 편부터 만나요',
    catalogOrder: 4,
    version: 1,
    bundleVersion: 12,
    active: true,
    blocks: [
      h('바쁜 하루 끝, 밤 8시\n편하게 크레 구경할 시간'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n퇴근하고 저녁 먹은 뒤 소파에 편히 기대어 예쁜 크레들 구경하는 시간만큼 힐링되는 게 없죠.\n이 밴드 저 밴드 방송 시간 찾아다닐 필요 없이,\n전국의 전문 브리더 30여 곳이 모인 ‘전국크레자랑’에서 매주 월·수 밤 8시 편하게 즐겨보세요.'),
      image('wolssu-evening-lounge-v2.jpg', '따뜻한 저녁 조명 아래 찻잔과 노트가 놓인 책상과 초록 식물 테라리움'),
      sub('10월 19일(월) 경기 편부터 수요일 전라·충청 편까지!'),
      p('이번 주 월요일인 10월 19일 밤 8시에는 【경기 편】으로 기분 좋게 출발합니다!\n월요병이 싹 가실 만큼 매력 넘치는 경기권 브리더들의 크레들을 실시간으로 만나보세요.\n\n그리고 수요일(10월 21일) 밤 8시에는 곧바로 【전라·충청 편】이 이어집니다!\n월요일 경기 편부터 수요일 전라·충청 편까지, 이번 주 저녁도 눈호강 제대로 하실 수 있도록\n열심히 준비하고 있으니 두 편 모두 기대해 주세요 ㅎㅎ'),
      image('wolssu-schedule-gyeonggi-v1.png', '10.19 월요일 경기 편 및 10.21 수요일 전라·충청 편 밤 8시 라이브 안내'),
      sub('편리한 안심 픽업 & 맛있는 통닭 이벤트'),
      p('구경하다 인연이 닿은 아이는 카톡 알림톡으로 편하게 낙찰 안내를 받아보실 수 있고,\n생물 전문 배송업체를 통해 집 근처 제휴 업체로 배송되어\n직접 상태를 확인하고 안전하게 픽업하시면 됩니다.\n\n🍗 크레준치 협찬으로 낙찰자 중 5분께 ‘가마치통닭 쿠폰’을 쏘는 이벤트도 준비되어 있으니,\n당장 입양 계획이 없으셔도 편하게 놀러 오세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-breeder',
    name: '브리더 준비 노트 · 출품 브리더의 진심형',
    title: '👀 방송에 데려갈 아이들 고르며 설렙니다｜10.19(월) 경기 편 & 수요일 전라·충청 편',
    catalogOrder: 5,
    version: 1,
    bundleVersion: 12,
    active: true,
    blocks: [
      h('“이번 방송엔 어떤 아이를\n자랑해 볼까요?”'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n방송 날이 다가오면 축양장을 둘러보는 저희 브리더들의 손길도 바빠집니다.\n전국의 전문 브리더 30여 곳이 함께하는 ‘전국크레자랑’ 라이브에서는\n사진 한 장에 다 담기지 않는 아이들의 체형과 먹성, 부모 정보까지\n실시간 채팅으로 직접 물어보고 확인하실 수 있습니다.'),
      image('wolssu-breeder-select-v2.jpg', '정돈된 브리딩 룸 조명 아래 카메라 렌즈와 코르크 바크, 노트가 놓인 준비 테이블'),
      sub('10월 19일 월요일 밤 8시 【경기 편】 출격 대기!'),
      p('다가오는 10월 19일 월요일 밤 8시 【경기 편】을 위해\n경기 지역 브리더들이 아껴두었던 개체들을 정성껏 선별해 두었습니다!\n오랫동안 공들여 키운 아이들이니 꼭 들어오셔서 함께 봐주시면 좋겠습니다.\n\n또한 월요일 경기 편에 이어, 10월 21일 수요일 밤 8시에는\n【전라·충청 편】 브리더들이 알찬 라인업으로 열기를 이어갈 예정이니\n수요일 전라·충청 편까지 많은 관심과 기대 부탁드립니다!'),
      image('wolssu-relay-roadmap-v1.png', '10월 19일 월요일 밤 8시 경기 편 및 10월 21일 수요일 밤 8시 전라·충청 편 릴레이 안내'),
      sub('집 근처 제휴샵 안심 픽업 & 통닭 쿠폰 이벤트!'),
      p('낙찰 후에는 카카오톡 알림톡으로 결제·배송 안내가 자동으로 발송되며,\n아이들은 생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 이동되어\n직접 상태를 확인하고 픽업하실 수 있습니다.\n\n🎁 여기에 크레준치 협찬으로 낙찰자 중 5분께 ‘가마치통닭 쿠폰’까지 증정하니,\n10월 19일 월요일 밤 8시 경기 편에서 반갑게 뵙겠습니다 ^^'),
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
    '/promo-assets/ticket-wolssu-gamachi-v1.png',
    '/promo-assets/wolssu-joseon-pavilion-v2.jpg',
    '/promo-assets/wolssu-gyeonggi-stage-v2.jpg',
    '/promo-assets/wolssu-taste-morphs-v2.jpg',
    '/promo-assets/wolssu-evening-lounge-v2.jpg',
    '/promo-assets/wolssu-breeder-select-v2.jpg',
    '/promo-assets/wolssu-schedule-gyeonggi-v1.png',
    '/promo-assets/wolssu-relay-roadmap-v1.png'
  ];
  const deprecatedGeckoAssets = [
    '/promo-assets/wolssu-joseon-pavilion-v1.jpg',
    '/promo-assets/wolssu-gyeonggi-stage-v1.jpg',
    '/promo-assets/wolssu-taste-morphs-v1.jpg',
    '/promo-assets/wolssu-evening-lounge-v1.jpg',
    '/promo-assets/wolssu-breeder-select-v1.jpg'
  ];
  for (const oldAsset of deprecatedGeckoAssets) {
    delete media[oldAsset];
  }
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

  // 3. Update promo-templates.json with the 5 manuscripts
  fs.writeFileSync(seedPath, JSON.stringify(templates, null, 2) + '\n', 'utf8');

  // 4. Update promo-catalog-migration.json to version 9, replacing the 5 wolssu26-* templates and retiring all 10 previous templates
  const migration = {
    version: 9,
    id: '20261016-wolssu-animal-free-v2',
    polishCopy: true,
    copyPolishVersion: 5,
    appendImages: true,
    replace: [
      'wolssu26-joseon',
      'wolssu26-relay',
      'wolssu26-taste',
      'wolssu26-afterwork',
      'wolssu26-breeder'
    ],
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
  fs.copyFileSync(path.join(root, 'public/promo-assets/ticket-wolssu-gamachi-v1.png'), path.join(outDir, '이미지/ticket-wolssu-gamachi-v1.png'));
  for (const [i, t] of templates.entries()) {
    const raw = [
      image('hero-wolssu-v1.png', '전국크레자랑 월쑤! 매주 월·수 밤 8시 네이버 밴드 LIVE 경매'),
      ...t.blocks
    ];
    const linkIdx = raw.findIndex(b => b.href && /band\.us/.test(b.href));
    raw.splice(linkIdx < 0 ? raw.length : linkIdx, 0, image('ticket-wolssu-gamachi-v1.png', '크레준치 협찬 이벤트 · 낙찰자 중 5명 가마치통닭 쿠폰 증정'));
    const blocks = raw;
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

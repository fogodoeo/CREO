'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = 'C:/Users/5600x/Desktop/전크자/output/promo-center/월쑤_전라충청_원고5종_20261020';

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
    name: '시그니처 · 월~쑤! 메인 안내형',
    title: '🌕 매주 월·수 밤 8시엔 ‘월~쑤!’｜10.21(수) 전라·충청 편 & 트로트가수 이찬성 출연',
    catalogOrder: 1,
    version: 1,
    bundleVersion: 15,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시엔 ‘월~쑤!’\n전국 브리더들의 크레 라이브'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n선선한 가을밤, 전국 30여 곳의 전문 브리더들이 한자리에 모여\n매주 월요일·수요일 밤 8시마다 실시간으로 크레를 소개하는\n네이버 밴드 라이브 경매 ‘전국크레자랑 월~쑤!’가 진행 중입니다.'),
      image('wolssu-joseon-pavilion-v2.jpg', '보름달과 은은한 등불 아래 다기가 놓인 고즈넉한 가을밤 정자 풍경'),
      sub('10월 21일(수) 밤 8시 【전라·충청 편】 · 스페셜 패널 이찬성 출연!'),
      p('다가오는 10월 21일 수요일 밤 8시 【전라·충청 편】에서는\n전라·충청 지역 브리더들이 아껴둔 대표 개체들을 대거 선보입니다!\n\n🎤 특히 이번 방송에는 스페셜 패널로 ‘트로트가수 이찬성’ 님이 함께 출연해\n더욱 유쾌하고 흥겨운 라이브로 꾸며질 예정이니 많은 기대 부탁드립니다.'),
      image('wolssu-jeolla-chungcheong-highlight-v1.png', '10월 21일 수요일 밤 8시 전라·충청 편 LIVE 및 스페셜 패널 트로트가수 이찬성 출연 안내'),
      sub('안심 픽업 시스템 & 공식 후원·파트너 안내'),
      p('낙찰 즉시 카카오톡 알림톡과 전용 페이지로 내역 확인·결제 안내가 발송되며,\n아이들은 생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 이동되어\n도착 후 직접 컨디션을 확인하고 편하게 픽업하실 수 있습니다.\n\n🤝 전국크레자랑 공식 후원 및 파트너로 ‘실크트리’, ‘파르게’가 함께합니다.\n수요일 밤 8시 가벼운 마음으로 밴드로 구경 오세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-relay',
    name: '스페셜 예고 · 전라·충청 편 & 이찬성 출연형',
    title: '🎤 월~쑤! 10.21(수) 전라·충청 편｜스페셜 패널 트로트가수 이찬성 출격!',
    catalogOrder: 2,
    version: 1,
    bundleVersion: 15,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시엔 ‘월~쑤!’\n이번 주인공은 전라·충청 편입니다'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n전국의 전문 브리더·업체 30여 곳이 권역별로 바통을 이어받아\n매주 월요일·수요일 밤 8시에 만나는 라이브 경매 ‘전국크레자랑 월~쑤!’\n사진만으로는 아쉬웠던 아이들의 실제 움직임과 발색을 실시간 영상으로 생생하게 만나보세요.'),
      image('wolssu-gyeonggi-stage-v2.jpg', '라이브 방송 스튜디오 조명 아래 카메라와 마이크, 코르크 바크가 놓인 무대'),
      sub('10.21(수) 밤 8시 【전라·충청 편】 + 트로트가수 이찬성 특별 출연!'),
      p('이번 10월 21일 수요일 밤 8시에는 【전라·충청 편】이 문을 엽니다!\n전라·충청권 브리더들이 정성껏 준비한 개체들을 다양하게 선보일 예정인데요,\n\n🎤 특히 이번 전라·충청 편에는 스페셜 패널로 ‘트로트가수 이찬성’ 님이 깜짝 출격해\n시원시원한 입담과 텐션으로 브리더들과 함께 방송을 달궈주실 예정입니다!'),
      image('wolssu-schedule-jeolla-chungcheong-v1.png', '10월 21일 수요일 밤 8시 전라·충청 편 및 스페셜 패널 트로트가수 이찬성 출연 안내'),
      sub('집 근처 안심 픽업 & 공식 후원·파트너 실크트리 · 파르게'),
      p('낙찰 후에는 카카오톡 알림톡과 전용 페이지를 통해 내역 확인부터 배송지 입력까지 한 번에 진행되며,\n아이들은 생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 배송되어\n직접 컨디션을 확인하고 안심 픽업하실 수 있습니다.\n\n✨ 전국크레자랑 공식 후원 및 파트너로 ‘실크트리’와 ‘파르게’가 함께합니다.\n10월 21일 수요일 밤 8시, 구경 오셔서 눈호강도 하고 즐거운 시간 보내세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-taste',
    name: '취향 탐색 · 모프 & 라인업 감상형',
    title: '🦎 월~쑤! 내 취향 크레 고르는 밤｜10.21(수) 전라·충청 편 & 이찬성 출연',
    catalogOrder: 3,
    version: 1,
    bundleVersion: 15,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시 ‘월~쑤!’\n당신은 어떤 크레에 끌리시나요'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n진하게 올라오는 다크·레드 발색부터 옆구리를 꽉 채운 화이트 월까지,\n크레는 브리더마다 추구하는 방향이 달라서 구경하는 재미가 남다르죠.\n전국 30여 곳의 브리더가 함께하는 ‘전국크레자랑 월~쑤!’에서는\n매주 월·수 밤 8시마다 지역별로 색다른 라인업을 한자리에서 비교해 보실 수 있습니다.'),
      image('wolssu-taste-morphs-v2.jpg', '갤러리 조명 아래 코르크 바크와 양치식물로 꾸며진 두 개의 유리 비바리움'),
      sub('10월 21일(수) 밤 8시 【전라·충청 편】 · 스페셜 패널 이찬성!'),
      p('다가오는 10월 21일 수요일 밤 8시에는 【전라·충청 편】 브리더들이 함께합니다!\n탄탄한 체형과 개성 뚜렷한 표현력을 자랑하는 전라·충청권 샵들의 개체들을\n라이브 화면으로 자세히 살펴보며 내 취향에 맞는 아이를 찾아보세요.\n\n🎤 게다가 이번 방송에는 스페셜 패널로 ‘트로트가수 이찬성’ 님이 함께 자리해\n한층 더 유쾌한 분위기 속에서 아이들을 만나보실 수 있습니다.'),
      image('wolssu-jeolla-chungcheong-highlight-v1.png', '10월 21일 수요일 밤 8시 전라·충청 편 LIVE 및 스페셜 패널 트로트가수 이찬성 출연 안내'),
      sub('근처 제휴샵 안심 픽업 & 공식 후원 실크트리 · 파르게'),
      p('마음에 드는 아이를 낙찰받으시면 카톡 알림톡으로 전용 페이지 링크를 안내해 드리고,\n생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 이동되어\n직접 건강 상태를 확인한 뒤 픽업하시면 됩니다.\n\n🤝 전국크레자랑 공식 후원 및 파트너 ‘실크트리’, ‘파르게’와 함께하는\n이번 수요일 밤 8시 방송에도 편하게 구경 오세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-afterwork',
    name: '퇴근 후 힐링 · 월~쑤! 저녁 루틴형',
    title: '📺 퇴근 후엔 월~쑤! 크레 구경｜10.21(수) 전라·충청 편 & 트로트가수 이찬성',
    catalogOrder: 4,
    version: 1,
    bundleVersion: 15,
    active: true,
    blocks: [
      h('바쁜 하루 끝, 밤 8시엔 ‘월~쑤!’\n편하게 크레 구경할 시간'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n퇴근하고 저녁 먹은 뒤 편하게 쉬면서 예쁜 크레들 구경하는 시간만큼 힐링되는 게 없죠.\n여기저기 방송 시간을 따로 찾아다닐 필요 없이,\n전국 전문 브리더 30여 곳이 모인 ‘전국크레자랑 월~쑤!’에서 매주 월·수 밤 8시 편하게 즐겨보세요.'),
      image('wolssu-evening-lounge-v2.jpg', '따뜻한 저녁 조명 아래 찻잔과 노트가 놓인 책상과 초록 식물 테라리움'),
      sub('10월 21일(수) 밤 8시 【전라·충청 편】 · 스페셜 패널 이찬성 출연!'),
      p('이번 주 수요일인 10월 21일 밤 8시에는 【전라·충청 편】 라이브가 찾아옵니다!\n전라·충청권 브리더들의 매력적인 크레들을 집에서 편안하게 실시간 영상으로 만나보세요.\n\n🎤 특히 이번 방송에는 스페셜 패널로 ‘트로트가수 이찬성’ 님이 출연해\n수요일 저녁을 더욱 신나고 즐겁게 채워주실 예정이니 편하게 들러서 눈호강하고 가세요!'),
      image('wolssu-schedule-jeolla-chungcheong-v1.png', '10.21 수요일 전라·충청 편 밤 8시 라이브 및 트로트가수 이찬성 출연 안내'),
      sub('알림톡 자동 안내 & 공식 후원·파트너 실크트리 · 파르게'),
      p('구경하다 인연이 닿은 아이는 카톡 알림톡과 전용 페이지를 통해 편하게 안내받으실 수 있고,\n생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 배송되어\n직접 상태를 확인하고 픽업하시면 됩니다.\n\n✨ 전국크레자랑 공식 후원 및 파트너로 ‘실크트리’, ‘파르게’가 함께하오니,\n10월 21일 수요일 밤 8시 가벼운 마음으로 놀러 오세요 ^^'),
      ...footer
    ]
  },
  {
    id: 'wolssu26-breeder',
    name: '브리더 노트 · 출품 라인업 소개형',
    title: '👀 월~쑤! 방송에 데려갈 아이들 준비했습니다｜10.21(수) 전라·충청 편 & 이찬성 출연',
    catalogOrder: 5,
    version: 1,
    bundleVersion: 15,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시 ‘월~쑤!’\n정성껏 키운 아이들을 소개합니다'),
      gap(),
      p('안녕하세요 파사모 회원님들,\n[업체명]입니다 ^^\n\n방송 날이 다가오면 출품할 개체들을 살피는 브리더들의 손길도 한층 분주해집니다.\n전국 전문 브리더 30여 곳이 함께하는 ‘전국크레자랑 월~쑤!’ 라이브에서는\n사진 한 장에 다 담기지 않는 체형과 발색, 먹성, 부모 정보까지\n실시간 채팅으로 직접 물어보고 확인하실 수 있습니다.'),
      image('wolssu-breeder-select-v2.jpg', '정돈된 브리딩 룸 조명 아래 카메라 렌즈와 코르크 바크, 노트가 놓인 준비 테이블'),
      sub('10월 21일(수) 밤 8시 【전라·충청 편】 + 스페셜 패널 이찬성!'),
      p('다가오는 10월 21일 수요일 밤 8시 【전라·충청 편】을 위해\n전라·충청 지역 브리더들이 아껴두었던 개체들을 꼼꼼히 선별해 두었습니다.\n\n🎤 아울러 이번 방송에는 스페셜 패널로 ‘트로트가수 이찬성’ 님이 함께 자리해\n브리더들과 호흡을 맞추며 더욱 풍성한 방송을 만들어 주실 예정이니 많은 관심 부탁드립니다!'),
      image('wolssu-jeolla-chungcheong-highlight-v1.png', '10월 21일 수요일 밤 8시 전라·충청 편 LIVE 및 스페셜 패널 트로트가수 이찬성 출연 안내'),
      sub('집 근처 제휴샵 픽업 & 공식 후원 실크트리 · 파르게'),
      p('낙찰 후에는 카카오톡 알림톡으로 전용 페이지와 결제·배송 안내가 자동으로 발송되며,\n아이들은 생물 전문 배송업체를 통해 집 근처 제휴 업체로 안전하게 이동되어\n직접 상태를 확인하고 픽업하실 수 있습니다.\n\n🤝 전국크레자랑 공식 후원 및 파트너 ‘실크트리’, ‘파르게’와 함께하는\n10월 21일 수요일 밤 8시 전라·충청 편에서 반갑게 뵙겠습니다 ^^'),
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
    '/promo-assets/ticket-wolssu-sponsors-v1.png',
    '/promo-assets/wolssu-joseon-pavilion-v2.jpg',
    '/promo-assets/wolssu-gyeonggi-stage-v2.jpg',
    '/promo-assets/wolssu-taste-morphs-v2.jpg',
    '/promo-assets/wolssu-evening-lounge-v2.jpg',
    '/promo-assets/wolssu-breeder-select-v2.jpg',
    '/promo-assets/wolssu-schedule-gyeonggi-v1.png',
    '/promo-assets/wolssu-relay-roadmap-v1.png',
    '/promo-assets/wolssu-schedule-jeolla-chungcheong-v1.png',
    '/promo-assets/wolssu-jeolla-chungcheong-highlight-v1.png'
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

  // 4. Update promo-catalog-migration.json to version 12, replacing the 5 wolssu26-* templates and retiring all previous templates
  const migration = {
    version: 12,
    id: '20261020-wolssu-jeolla-chungcheong-v2',
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
  fs.copyFileSync(path.join(root, 'public/promo-assets/ticket-wolssu-sponsors-v1.png'), path.join(outDir, '이미지/ticket-wolssu-sponsors-v1.png'));
  for (const [i, t] of templates.entries()) {
    const raw = [
      image('hero-wolssu-v1.png', '전국크레자랑 월쑤! 매주 월·수 밤 8시 네이버 밴드 LIVE 경매'),
      ...t.blocks
    ];
    const linkIdx = raw.findIndex(b => b.href && /band\.us/.test(b.href));
    raw.splice(linkIdx < 0 ? raw.length : linkIdx, 0, image('ticket-wolssu-sponsors-v1.png', '전국크레자랑 공식 후원 및 파트너 · 실크트리(SILKTREE) · 파르게(PARGE)'));
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

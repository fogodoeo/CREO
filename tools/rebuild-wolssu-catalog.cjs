'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = 'C:/Users/5600x/Desktop/전크자/output/promo-center/월쑤_전라충청_단일원고_20261020';

const p = (text, extra = {}) => ({ type: 'text', text, size: 16, bold: false, color: 'ink', align: 'center', ...extra });
const h = text => p(text, { size: 24, bold: true });
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
    id: 'wolssu26-relay',
    name: '전라·충청 편 · 공식 홍보 원고',
    title: '📺내일 수요일 밤 8시 【전라·충청 편】  전국크레자랑 월~쑤!',
    catalogOrder: 1,
    version: 1,
    bundleVersion: 16,
    active: true,
    blocks: [
      h('매주 월·수 밤 8시엔 ‘월~쑤!’\n이번 주인공은 전라·충청 편입니다'),
      gap(),
      p('찾아가는 라이브 경매 ‘전국크레자랑 월~쑤!’\n벌써 많은 분들이 큰 관심을 보내주고 계셔서 진심으로 감사합니다.'),
      sub('10.21(수) 밤 8시 【전라·충청 편】 + 트로트가수 이찬성 특별 출연!'),
      p('이번 10월 21일 수요일 밤 8시에는 【전라·충청 편】이 문을 엽니다!\n전라·충청권 브리더들이 정성껏 준비한 개체들을 다양하게 선보일 예정인데요,\n\n특히 이번 전라·충청 편에는 스페셜 패널로 전크자 인천 대표이자\nOK게코로 활동 중이신 ‘트로트가수 이찬성’ 님이 깜짝 출격해,\n시원시원한 입담과 텐션으로 함께 방송을 뜨겁게 달궈주실 예정입니다!\n\n낙찰 후에는 카카오톡 알림톡으로 안내부터 배송까지\n한 번에 진행되는 간편한 시스템을 제공하고 있습니다.'),
      image('ticket-wolssu-sponsors-v1.png', '전국크레자랑 공식 후원 및 파트너 · 실크트리(SILKTREE) · 파르게(PARGE)'),
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

  // 3. Update promo-templates.json with the single manuscript
  fs.writeFileSync(seedPath, JSON.stringify(templates, null, 2) + '\n', 'utf8');

  // 4. Update promo-catalog-migration.json to version 13, keeping only wolssu26-relay active and retiring all others
  const migration = {
    version: 13,
    id: '20261020-wolssu-single-jeolla-chungcheong-v1',
    polishCopy: true,
    copyPolishVersion: 5,
    appendImages: true,
    replace: [
      'wolssu26-relay'
    ],
    retire: {
      'wolssu26-joseon': 'wolssu26-relay',
      'wolssu26-taste': 'wolssu26-relay',
      'wolssu26-afterwork': 'wolssu26-relay',
      'wolssu26-breeder': 'wolssu26-relay',
      'launch26-editorial': 'wolssu26-relay',
      'launch26-episode': 'wolssu26-relay',
      'launch26-easy': 'wolssu26-relay',
      'launch26-partners': 'wolssu26-relay',
      'ep01-brief': 'wolssu26-relay',
      'launch26-collector': 'wolssu26-relay',
      'launch26-joseon': 'wolssu26-relay',
      'launch26-showtime': 'wolssu26-relay',
      'ep01-welcome': 'wolssu26-relay',
      'launch26-taste': 'wolssu26-relay',
      'launch26-tour': 'wolssu26-relay',
      'launch26-breeder': 'wolssu26-relay',
      'launch26-series': 'wolssu26-relay',
      'launch26-questions': 'wolssu26-relay',
      'launch26-afterwork': 'wolssu26-relay',
      'launch26-seoul-incheon-map': 'wolssu26-relay'
    }
  };
  fs.writeFileSync(migrationPath, JSON.stringify(migration, null, 2) + '\n', 'utf8');

  // 5. Export standalone HTML/TXT/JSON and images to Desktop output folder
  fs.mkdirSync(path.join(outDir, '이미지'), { recursive: true });
  fs.copyFileSync(path.join(root, 'public/promo-assets/hero-wolssu-v1.png'), path.join(outDir, '이미지/hero-wolssu-v1.png'));
  fs.copyFileSync(path.join(root, 'public/promo-assets/ticket-wolssu-sponsors-v1.png'), path.join(outDir, '이미지/ticket-wolssu-sponsors-v1.png'));
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
  fs.writeFileSync(path.join(outDir, '월쑤_단일원고.json'), JSON.stringify(templates, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify(templates.map(t => ({
    id: t.id,
    name: t.name,
    title: t.title,
    characters: t.blocks.filter(b => b.type === 'text').map(b => b.text).join('').length,
    images: t.blocks.filter(b => b.type === 'image').length
  })), null, 2));
}

main();

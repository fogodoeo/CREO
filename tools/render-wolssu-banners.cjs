'use strict';
const sharp = require('sharp');
const path = require('node:path');

const assets = path.resolve(__dirname, '../public/promo-assets');
const fontfile = path.join(assets, 'PretendardVariable.ttf');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderText(text, size, color = '#202632', weight = 700) {
  return sharp({
    text: {
      text: `<span foreground="${color}" weight="${weight}">${esc(text)}</span>`,
      font: `Pretendard Variable ${size}`,
      fontfile,
      rgba: true,
      dpi: 72
    }
  }).png().toBuffer({ resolveWithObject: true });
}

async function place(x, y, size, text, color = '#202632', weight = 700, align = 'left') {
  const { data, info } = await renderText(text, size, color, weight);
  const drawX = align === 'center' ? Math.round(x - info.width / 2) : align === 'right' ? Math.round(x - info.width) : x;
  const drawY = Math.round(y - info.height / 2);
  return `<image x="${drawX}" y="${drawY}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`;
}

async function main() {
  const svg1 = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="580">
    <rect width="1500" height="580" rx="28" fill="#f4f7f5"/>
    ${await place(96, 86, 36, '전국크레자랑 월~쑤! · 라이브 일정 안내', '#007443', 700)}
    <line x1="96" y1="136" x2="1404" y2="136" stroke="#d4dfd8" stroke-width="2"/>
    ${await place(96, 238, 88, '10.21 수요일 전라·충청 편', '#182026', 800)}
    ${await place(96, 352, 60, '매주 월·수 밤 8시 네이버 밴드 LIVE', '#007443', 700)}
    <circle cx="1278" cy="286" r="102" fill="#007443"/>
    ${await place(1278, 258, 46, '월·수', '#ffffff', 800, 'center')}
    ${await place(1278, 318, 44, '밤 8시', '#ffffff', 700, 'center')}
    <line x1="96" y1="436" x2="1404" y2="436" stroke="#d4dfd8" stroke-width="2"/>
    ${await place(96, 504, 38, '스페셜 패널 트로트가수 이찬성 출연 · 공식 후원 및 파트너 실크트리 · 파르게', '#4b5663', 700)}
  </svg>`;
  const out1 = path.join(assets, 'wolssu-schedule-jeolla-chungcheong-v1.png');
  await sharp(Buffer.from(svg1)).png().toFile(out1);
  await sharp(out1).resize(800, 450, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(out1.replace('.png', '.thumb.webp'));

  const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="580">
    <rect width="1500" height="580" rx="28" fill="#f7f6f2"/>
    ${await place(96, 86, 36, '전국크레자랑 월~쑤! · 수요일 밤 8시 본방 안내', '#b52b25', 700)}
    <line x1="96" y1="136" x2="1404" y2="136" stroke="#e2ddd3" stroke-width="2"/>
    <rect x="96" y="174" width="580" height="236" rx="22" fill="#ffffff" stroke="#b52b25" stroke-width="4"/>
    ${await place(386, 240, 38, '10월 21일 (수) 밤 8시', '#b52b25', 700, 'center')}
    ${await place(386, 326, 66, '전라·충청 편 LIVE', '#182026', 800, 'center')}
    <path d="M716 292h64m-20-20 20 20-20 20" fill="none" stroke="#8a8377" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="824" y="174" width="580" height="236" rx="22" fill="#ffffff" stroke="#007443" stroke-width="4"/>
    ${await place(1114, 240, 38, '스페셜 패널 특별 출연', '#007443', 700, 'center')}
    ${await place(1114, 326, 60, '트로트가수 이찬성', '#182026', 800, 'center')}
    <line x1="96" y1="450" x2="1404" y2="450" stroke="#e2ddd3" stroke-width="2"/>
    ${await place(750, 512, 38, '공식 후원 및 파트너 : 실크트리 (SILKTREE) · 파르게 (PARGE)', '#525b65', 700, 'center')}
  </svg>`;
  const out2 = path.join(assets, 'wolssu-jeolla-chungcheong-highlight-v1.png');
  await sharp(Buffer.from(svg2)).png().toFile(out2);
  await sharp(out2).resize(800, 450, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(out2.replace('.png', '.thumb.webp'));

  // 3. Official Sponsors & Partners Banner (Silktree & Parge)
  const silktreeBuf = await sharp(path.join(assets, 'sponsor-silktree.jpg'))
    .trim({ threshold: 12 })
    .resize(440, 210, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const pargeBuf = await sharp(path.join(assets, 'sponsor-parge.png'))
    .trim({ threshold: 12 })
    .resize(460, 170, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });

  const sX = Math.round(415 - silktreeBuf.info.width / 2);
  const sY = Math.round(295 - silktreeBuf.info.height / 2);
  const pX = Math.round(1085 - pargeBuf.info.width / 2);
  const pY = Math.round(295 - pargeBuf.info.height / 2);

  const svg3 = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="540">
    <rect width="1500" height="540" rx="28" fill="#f4f7f5"/>
    ${await place(750, 78, 38, '전국크레자랑 공식 후원 및 파트너', '#007443', 800, 'center')}
    <line x1="96" y1="128" x2="1404" y2="128" stroke="#d4dfd8" stroke-width="2"/>
    <rect x="110" y="160" width="610" height="270" rx="22" fill="#ffffff" stroke="#d4dfd8" stroke-width="3"/>
    <image x="${sX}" y="${sY}" width="${silktreeBuf.info.width}" height="${silktreeBuf.info.height}" href="data:image/png;base64,${silktreeBuf.data.toString('base64')}"/>
    <rect x="780" y="160" width="610" height="270" rx="22" fill="#ffffff" stroke="#d4dfd8" stroke-width="3"/>
    <image x="${pX}" y="${pY}" width="${pargeBuf.info.width}" height="${pargeBuf.info.height}" href="data:image/png;base64,${pargeBuf.data.toString('base64')}"/>
    ${await place(415, 480, 36, '실크트리 (SILKTREE)', '#182026', 700, 'center')}
    ${await place(1085, 480, 36, '파르게 (PARGE)', '#182026', 700, 'center')}
  </svg>`;
  const out3 = path.join(assets, 'ticket-wolssu-sponsors-v1.png');
  await sharp(Buffer.from(svg3)).png().toFile(out3);
  await sharp(out3).resize(800, 450, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(out3.replace('.png', '.thumb.webp'));
  console.log('Rendered wolssu Jeolla-Chungcheong schedule, highlight, and sponsor banners');
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

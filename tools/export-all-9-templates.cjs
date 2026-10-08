'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const templatesPath = path.join(root, 'promo-templates.json');
const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));

const outRenewal = 'C:/Users/5600x/Desktop/전크자/output/promo-center/원고_리뉴얼_20261008';
const outNew3 = 'C:/Users/5600x/Desktop/전크자/output/promo-center/신규원고3종_20261008';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function generateArticle(t) {
  const blocks = [...t.blocks];
  const html = blocks.map(b => b.type === 'image'
    ? `<p align="center" style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`
    : `<p align="${b.align || 'center'}" style="text-align:${b.align || 'center'};font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;font-size:${b.size || 16}px;font-weight:${b.bold ? 700 : 400};line-height:1.75;margin:0;word-break:keep-all;overflow-wrap:anywhere;color:${b.color === 'green' ? '#007443' : '#202632'}">${b.href ? '<a href="' + b.href + '">' : ''}${esc(b.text).replace(/\n/g, '<br>') || '<br>'}${b.href ? '</a>' : ''}</p>`
  ).join('');
  const txt = t.title + '\n\n' + blocks.map(b => b.type === 'image' ? '[이미지: ' + b.alt + ']' : b.text + (b.href ? '\n' + b.href : '')).join('\n');
  return { html, txt, blocks };
}

async function main() {
  [outRenewal, outNew3].forEach(dir => {
    fs.mkdirSync(path.join(dir, '이미지'), { recursive: true });
  });

  for (const [i, t] of templates.entries()) {
    const { html, txt, blocks } = generateArticle(t);
    const num = String(i + 1).padStart(2, '0');
    const safeName = `${num}_${t.name.split(' · ')[0].replace(/[\/\\?%*:|"<>]/g, '_')}`;

    const doc = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{max-width:532px;padding:24px 16px;margin:auto;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif;color:#202632;text-align:center}h1{font-size:20px;line-height:1.5;margin-bottom:40px;text-align:center}a{color:#007443}p{overflow-wrap:anywhere}</style><h1>${esc(t.title)}</h1><article>${html}</article></html>`;

    // Save to outRenewal (all 9)
    fs.writeFileSync(path.join(outRenewal, safeName + '.html'), doc);
    fs.writeFileSync(path.join(outRenewal, safeName + '.txt'), txt);

    // If among the 3 newest stories (index 6, 7, 8)
    if (i >= 6) {
      const newNum = String(i - 5).padStart(2, '0');
      const newSafeName = `${newNum}_${t.name.split(' · ')[0].replace(/[\/\\?%*:|"<>]/g, '_')}`;
      fs.writeFileSync(path.join(outNew3, newSafeName + '.html'), doc);
      fs.writeFileSync(path.join(outNew3, newSafeName + '.txt'), txt);
    }

    for (const b of blocks.filter(b => b.type === 'image')) {
      const src = path.join(root, 'public', b.src);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(outRenewal, '이미지', path.basename(b.src)));
        if (i >= 6) fs.copyFileSync(src, path.join(outNew3, '이미지', path.basename(b.src)));
      }
    }
  }

  console.log('Successfully exported all 9 polished templates to Desktop folders:');
  console.log('- ' + outRenewal);
  console.log('- ' + outNew3);
}

main().catch(e => { console.error(e); process.exitCode = 1; });

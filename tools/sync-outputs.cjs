'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const templates = JSON.parse(fs.readFileSync(path.join(root, 'promo-templates.json'), 'utf8'));

const outPack = 'C:/Users/5600x/Desktop/전크자/output/promo-center/원고5종';
const outExtra = 'C:/Users/5600x/Desktop/전크자/output/promo-center/추가원고2종';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const toHtml = t => t.blocks.map(b => {
  if (b.type === 'image') return `<p style="margin:24px 0;text-align:center"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="max-width:100%;height:auto"></p>`;
  return `<p style="margin:0;text-align:${b.align};font-size:${b.size}px;line-height:1.75;color:${b.color === 'green' ? '#007443' : '#202632'};font-weight:${b.bold ? 700 : 400}">${b.href ? '<a style="color:inherit" href="' + esc(b.href) + '">' : ''}${(esc(b.text).replace(/\n/g, '<br>') || '<br>')}${b.href ? '</a>' : ''}</p>`;
}).join('');

const toTxt = t => t.title + '\n\n' + t.blocks.map(b => b.type === 'image' ? '[이미지: ' + b.alt + ']' : b.text + (b.href ? '\n' + b.href : '')).join('\n') + '\n';

// 5 pack
const packMap = [
  { file: '01_조선시대', id: 'launch26-joseon' },
  { file: '02_집사공감', id: 'launch26-collector' },
  { file: '03_매거진', id: 'launch26-editorial' },
  { file: '04_방송예고', id: 'launch26-episode' },
  { file: '05_간편안내', id: 'launch26-easy' }
];

packMap.forEach(({ file, id }) => {
  const t = templates.find(x => x.id === id);
  if (!t) return;
  fs.writeFileSync(path.join(outPack, file + '.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(t.title)}</title><style>body{max-width:500px;margin:24px auto;padding:24px;font-family:'NanumSquare Neo',sans-serif;}</style><article>${toHtml(t)}</article></html>`, 'utf8');
  fs.writeFileSync(path.join(outPack, file + '.txt'), toTxt(t), 'utf8');
});

// extra 2
const extraMap = [
  { file: '01_전국노래자랑감성', id: 'launch26-showtime' },
  { file: '02_참여업체로고', id: 'launch26-partners' }
];

extraMap.forEach(({ file, id }) => {
  const t = templates.find(x => x.id === id);
  if (!t) return;
  fs.writeFileSync(path.join(outExtra, file + '.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(t.title)}</title><style>body{max-width:500px;margin:24px auto;padding:24px;font-family:'NanumSquare Neo',sans-serif;}</style><article>${toHtml(t)}</article></html>`, 'utf8');
  fs.writeFileSync(path.join(outExtra, file + '.txt'), toTxt(t), 'utf8');
});

console.log('Successfully synced static HTML/TXT exports in Desktop/전크자/output/promo-center!');

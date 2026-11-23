'use strict';
// Rebuild the existing code-composed sponsor card with its remaining partner.
const sharp = require('sharp');
const path = require('node:path');
const assets = path.resolve(__dirname, '../public/promo-assets');
async function label(text, y, size, color) {
 const {data, info} = await sharp({text:{text:`<span foreground="${color}" weight="700">${text}</span>`,font:`Pretendard Variable ${size}`,fontfile:path.join(assets,'PretendardVariable.ttf'),rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 return `<image x="${Math.round(750-info.width/2)}" y="${Math.round(y-info.height/2)}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`;
}
(async()=>{
 const {data,info}=await sharp(path.join(assets,'sponsor-silktree.jpg')).trim({threshold:12}).resize(440,210,{fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="540"><rect width="1500" height="540" rx="28" fill="#f4f7f5"/>${await label('전국크레자랑 공식 후원 및 파트너',78,38,'#007443')}<line x1="96" y1="128" x2="1404" y2="128" stroke="#d4dfd8" stroke-width="2"/><rect x="445" y="160" width="610" height="270" rx="22" fill="#fff" stroke="#d4dfd8" stroke-width="3"/><image x="${Math.round(750-info.width/2)}" y="${Math.round(295-info.height/2)}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>${await label('실크트리 (SILKTREE)',480,36,'#182026')}</svg>`;
 const out=path.join(assets,'ticket-wolssu-sponsors-v2.png');
 await sharp(Buffer.from(svg)).png().toFile(out);
 await sharp(out).resize(800,450,{fit:'inside'}).webp({quality:88}).toFile(out.replace('.png','.thumb.webp'));
})();

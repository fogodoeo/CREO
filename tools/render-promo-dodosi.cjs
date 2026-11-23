'use strict';
// Logos are rendered from supplied originals, never redrawn or generated.
const sharp=require('sharp'),path=require('node:path');
const assets=path.resolve(__dirname,'../public/promo-assets');
async function label(text,x,y,size,color){
 const {data,info}=await sharp({text:{text:`<span foreground="${color}" weight="700">${text}</span>`,font:`Pretendard Variable ${size}`,fontfile:path.join(assets,'PretendardVariable.ttf'),rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 return `<image x="${Math.round(x-info.width/2)}" y="${Math.round(y-info.height/2)}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`;
}
(async()=>{
 let cards='';
 for(const [file,x,name] of [['sponsor-silktree.jpg',415,'실크트리 (SILKTREE)'],['sponsor-dodosi-original.png',1085,'도도시 (DoDoSi)']]){
  const {data,info}=await sharp(path.join(assets,file)).trim({threshold:12}).resize(440,210,{fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
  cards+=`<rect x="${x-305}" y="160" width="610" height="270" rx="22" fill="#fff" stroke="#d4dfd8" stroke-width="3"/><image x="${Math.round(x-info.width/2)}" y="${Math.round(295-info.height/2)}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>${await label(name,x,480,36,'#182026')}`;
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="540"><rect width="1500" height="540" rx="28" fill="#f4f7f5"/>${await label('전국크레자랑 공식 후원 및 파트너',750,78,38,'#007443')}<line x1="96" y1="128" x2="1404" y2="128" stroke="#d4dfd8" stroke-width="2"/>${cards}</svg>`;
 const out=path.join(assets,'ticket-wolssu-sponsors-v3.png');
 await sharp(Buffer.from(svg)).png().toFile(out);
 await sharp(out).resize(800,450,{fit:'inside'}).webp({quality:88}).toFile(out.replace('.png','.thumb.webp'));
})();

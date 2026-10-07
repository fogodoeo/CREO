'use strict';
// Editorial logo gallery: original artwork, optical sizing, quiet type, no label badges.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const fontfile=path.join(root,'public/roulette/PretendardVariable.be37ba89.woff2');
const ink='#202632',secondary='#626d7b',green='#007443';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
async function type(text,x,y,size,weight=500,color=ink,align='left'){
 const {data,info}=await sharp({text:{text:`<span foreground="${color}" weight="${weight}">${escape(text)}</span>`,font:`Pretendard Variable ${size}`,fontfile,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 return `<image x="${x-(align==='center'?info.width/2:0)}" y="${y}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`;
}
function mark(item,cx,top,size,key){
 const v=item.vendor,crop=v.crop||[0,0,item.width,item.height];
 const clip=v.circle?`<circle cx="${v.circle[0]}" cy="${v.circle[1]}" r="${v.circle[2]}"/>`:`<rect x="${crop[0]}" y="${crop[1]}" width="${crop[2]}" height="${crop[3]}"/>`;
 const square=v.squareBackground?`<rect x="${cx-size/2}" y="${top}" width="${size}" height="${size}" fill="${v.squareBackground}"/>`:'';
 return `${square}<svg x="${cx-size/2}" y="${top}" width="${size}" height="${size}" viewBox="${crop.join(' ')}" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="${key}">${clip}</clipPath></defs><image width="${item.width}" height="${item.height}" clip-path="url(#${key})" href="${item.uri}"/></svg>`;
}
const label=v=>({'제트크레스티드게코':'제트크레','REPSODY 렙소디':'렙소디','더숲(크레숲)':'더숲 · 크레숲','크레용 대구본점':'크레용 대구'})[v.name]||v.name;
async function renderPartnerBoard(vendors,assets){
 const items=[];
 for(const v of vendors){const file=path.join(assets,'partner-logos',v.file);const meta=await sharp(file).metadata();items.push({vendor:v,width:meta.width,height:meta.height,uri:'data:image/png;base64,'+fs.readFileSync(file).toString('base64')});}
 const width=1500,gridY=540,rowStep=350,height=gridY+Math.ceil(items.length/3)*rowStep+130;
 let body=await type('전국크레자랑',90,86,34,600,green);
 body+=await type('다양한 취향.',90,182,112,700);
 body+=await type('하나의 밴드.',90,309,112,700);
 for(let i=0;i<items.length;i++){
  const cx=280+(i%3)*470,y=gridY+Math.floor(i/3)*rowStep;
  const v=items[i].vendor;
  // Solid backgrounds carry more visual weight than a cutout mark at equal dimensions.
  const solid=['01.png','03.png','06.png','07.png','11.png','14.png','15.png','18.png','19.png','22.png'];
  const size=solid.includes(v.file)?228:252;
  body+=mark(items[i],cx,y+(252-size)/2,size,'logo-'+i);
  body+=await type(label(v),cx,y+268,38,500,secondary,'center');
 }
 body+=await type('업체별 일정에 따라 순차적으로 출연합니다',width/2,height-81,34,400,secondary,'center');
 const title=escape('전국크레자랑 참여업체: '+vendors.map(v=>v.name).join(', '));
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${title}</title><rect width="${width}" height="${height}" fill="white"/>${body}</svg>`;
 fs.writeFileSync(path.join(assets,'partners-20261007.svg'),svg);
 await sharp(Buffer.from(svg)).png().toFile(path.join(assets,'partners-20261007.png'));
 // The cover previews the complete logo wall; no arbitrary set of eight featured brands.
 let thumb=await type('다양한 취향.',88,240,76,700);
 thumb+=await type('하나의 밴드.',88,331,76,700);
 thumb+=await type('전국크레자랑',88,169,30,600,green);
 thumb+=await type('함께하는 브리더들',88,463,34,400,secondary);
 for(let i=0;i<items.length;i++){thumb+=mark(items[i],792+(i%5)*133,76+Math.floor(i/5)*118,91,'cover-'+i);}
 const thumbSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="844"><rect width="1500" height="844" fill="white"/>${thumb}</svg>`;
 await sharp(Buffer.from(thumbSvg)).resize(800).webp({quality:88}).toFile(path.join(assets,'partners-20261007.thumb.webp'));
 return {height,width,brands:items.length};
}
module.exports={renderPartnerBoard};

'use strict';
// Generated clean key art; all lettering and the original BAND mark stay separate.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public/promo-assets'),w=1600,h=2400;
const fonts=path.join(process.env.LOCALAPPDATA,'Microsoft/Windows/Fonts');
async function main(){
 const source=process.argv[2];if(!source)throw Error('Pass the clean generated key art path');
 const layers=[];
 async function text(value,size,top,{font='Gmarket Sans TTF Bold',file='GmarketSansBold.ttf',color='#fffaf0',max=1380,center=800}={}){
  let r;for(let n=size;n>12;n--){r=await sharp({text:{text:`<span foreground="${color}">${value}</span>`,font:`${font} ${n}`,fontfile:path.join(fonts,file),rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});if(r.info.width<=max)break;}
  layers.push({input:r.data,left:Math.round(center-r.info.width/2),top});
 }
 layers.push({input:Buffer.from(`<svg width="1600" height="2400"><defs><linearGradient id="b" x2="0" y2="1"><stop offset="0" stop-color="#073a46" stop-opacity="0"/><stop offset="1" stop-color="#073a46" stop-opacity=".7"/></linearGradient></defs><rect y="1960" width="1600" height="440" fill="url(#b)"/></svg>`),left:0,top:0});
 await text('서울·인천편',62,120);
 await text('전국크레자랑',186,250);
 await text('전하, 이번엔 서울·인천이옵니다!',69,535,{font:'MapoFlowerIsland',file:'MapoFlowerIsland.ttf',color:'#ffe3a6'});
 await text('크레스티드게코 라이브 경매',43,2040,{font:'Gmarket Sans TTF Medium',file:'GmarketSansMedium.ttf'});
 await text('11월 25일 수요일 밤 8시',85,2125);
 layers.push({input:Buffer.from('<svg width="980" height="108"><rect x="1" y="1" width="978" height="106" rx="53" fill="#082f37" fill-opacity=".55" stroke="#fffaf0" stroke-opacity=".7" stroke-width="2"/><circle cx="895" cy="46" r="18" fill="none" stroke="#fffaf0" stroke-width="4"/><path d="M908 59L933 84" stroke="#fffaf0" stroke-width="4"/></svg>'),left:310,top:2260});
 layers.push({input:await sharp(path.join(root,'public/assets/band-app-icon-official.png')).resize(78,78).png().toBuffer(),left:332,top:2275});
 await text('전국크레자랑',51,2287,{center:787,max:650});
 const result=await sharp(source).resize(w,h,{fit:'cover'}).composite(layers).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
 const filename='jeoncre-seoul-incheon-20261125-v1.jpg';fs.writeFileSync(path.join(out,filename),result);
 await sharp(result).resize(400).webp({quality:85}).toFile(path.join(out,filename.replace('.jpg','.thumb.webp')));
 console.log(path.join(out,filename));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

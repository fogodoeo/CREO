'use strict';
// Deterministic type repair: preserve the poster, replace only the episode label.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'public/promo-assets');
async function main(){
 const source=path.join(assets,'hero-seoul-incheon-v2.png');
 const {data,info}=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true});
 if(info.width!==1337||info.height!==1176||info.channels!==3)throw Error('Unexpected hero source dimensions');
 // This area contains only the faulty label on a dark background. Interpolate
 // the clean rows immediately above/below it; all pixels outside stay intact.
 const area={left:949,top:429,width:301,height:51};
 const patch=Buffer.alloc(area.width*area.height*3);
 for(let y=0;y<area.height;y++)for(let x=0;x<area.width;x++)for(let c=0;c<3;c++){
  const upper=((area.top-1)*info.width+area.left+x)*3+c;
  const lower=((area.top+area.height)*info.width+area.left+x)*3+c;
  const mix=(y+1)/(area.height+1);
  patch[(y*area.width+x)*3+c]=Math.round(data[upper]*(1-mix)+data[lower]*mix);
 }
 const clean=await sharp(source).composite([{input:patch,raw:{width:area.width,height:area.height,channels:3},left:area.left,top:area.top}]).png().toBuffer();
 const fontfile=path.join(process.env.PROMO_FONT_DIR||path.join(process.env.LOCALAPPDATA,'Microsoft/Windows/Fonts'),'GmarketSansBold.ttf');
 if(!fs.existsSync(fontfile))throw Error('Gmarket Sans Bold font is required');
 let label;
 for(let size=36;size>=26;size--){
  label=await sharp({text:{text:'<span foreground="#ffffff">EP 01. 서울, 인천</span>',font:`Gmarket Sans TTF Bold ${size}`,fontfile,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
  if(label.info.width<=314)break;
 }
 const left=1245-label.info.width,top=436;
 await sharp(clean).composite([{input:label.data,left,top}]).png().toFile(path.join(assets,'hero-seoul-incheon-v3.png'));
 console.log(JSON.stringify({text:'EP 01. 서울, 인천',font:'Gmarket Sans TTF Bold',label:{left,top,width:label.info.width,height:label.info.height}}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

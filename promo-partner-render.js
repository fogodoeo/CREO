'use strict';
const path=require('node:path');
// FreeType/Pango on the Linux host needs an actual sfnt font, not a browser WOFF2.
const fontfile=path.join(__dirname,'public/promo-assets/PretendardVariable.ttf');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const shortName=s=>({'제트크레스티드게코':'제트크레','REPSODY 렙소디':'렙소디','더숲(크레숲)':'더숲 · 크레숲','크레용 대구본점':'크레용 대구'})[s]||s;
async function render(group,{logoBytes}){
 const sharp=require('sharp'),width=1500,columns=group.columns,cell=(width-120)/columns,row=310,gridY=48,height=gridY+Math.ceil(group.items.length/columns)*row+16;
 const layers=[];
 async function text(value,cx,top,size,color='#202632',weight=500,max=1380){
  let out;
  do{out=await sharp({text:{text:`<span foreground="${color}" weight="${weight}">${escape(value)}</span>`,font:`Pretendard Variable ${size}`,fontfile,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});if(out.info.width<=max)break;size-=2;}while(size>24);
  if(out.info.width>max)out=await sharp(out.data).resize({width:Math.floor(max)}).png().toBuffer({resolveWithObject:true});
  layers.push({input:out.data,left:Math.round(cx-out.info.width/2),top});
 }
 for(let i=0;i<group.items.length;i++){
  const item=group.items[i],cx=60+cell*(i%columns+.5),top=gridY+Math.floor(i/columns)*row,size=columns===4?194:218;
  const input=await logoBytes(item.logo);
  if(input){
   let logo=sharp(input,{limitInputPixels:16000000}).rotate();
   if(item.logo.crop){const [left,top,width,height]=item.logo.crop;logo=logo.extract({left,top,width,height});}
   logo=logo.resize(size,size,{fit:'contain',background:item.logo.squareBackground||'#ffffff'});
   let bytes=await logo.png().toBuffer();
   if(item.logo.circle){const mask=Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);bytes=await sharp(bytes).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();}
   layers.push({input:bytes,left:Math.round(cx-size/2),top:top+(218-size)/2});
  }else{
   await text(shortName(item.name),cx,top+88,48,'#202632',600,cell-36);
  }
  if(input)await text(shortName(item.name),cx,top+238,40,'#202632',500,cell-30);
 }
 return sharp({create:{width,height,channels:3,background:'#ffffff'}}).composite(layers).png().toBuffer();
}
module.exports={render};

'use strict';
// Native artwork refresh: retain the supplied KakaoTalk symbol, render exact Korean type.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'public/promo-assets');
const fontdir=process.env.PROMO_FONT_DIR||path.join(process.env.LOCALAPPDATA,'Microsoft/Windows/Fonts');
async function type(text,x,y,size,weight=700,color='#101719'){
 const bold=weight>=700,fontfile=path.join(fontdir,bold?'GmarketSansBold.ttf':'GmarketSansMedium.ttf');
 const {data,info}=await sharp({text:{text:`<span foreground="${color}">${text}</span>`,font:`Gmarket Sans TTF ${bold?'Bold':'Medium'} ${size}`,fontfile,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 return `<image x="${x}" y="${y}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`;
}
async function main(){
 const logo=fs.readFileSync(path.join(assets,'kakaotalk-symbol.png')).toString('base64');
 let body=await type('전국크레자랑',90,56,34,700,'#007443');
 body+=`<image x="108" y="167" width="216" height="216" href="data:image/png;base64,${logo}"/>`;
 body+=await type('낙찰 알림은',420,137,96,800);
 body+=await type('카카오톡으로',420,249,96,800);
 body+=await type('알림톡 자동 발송 · 전용 페이지 확인',420,391,37,500,'#485153');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="510" viewBox="0 0 1200 510" role="img"><title>낙찰 알림은 카카오톡으로. 알림톡 자동 발송과 전용 페이지 확인.</title><rect width="1200" height="510" fill="#fff"/>${body}</svg>`;
 fs.writeFileSync(path.join(assets,'easy-v2.svg'),svg);
 await sharp(Buffer.from(svg)).png().toFile(path.join(assets,'easy-v2.png'));
 await sharp(Buffer.from(svg)).resize(800).webp({quality:90}).toFile(path.join(assets,'easy-v2.thumb.webp'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

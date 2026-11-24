'use strict';
// AI lettering stays in the key art. The official BAND icon/search UI is a separate layer.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
async function main(){
 const root=path.resolve(__dirname,'..'),source=process.argv[2];if(!source)throw Error('Pass generated subway poster');
 const layers=[{input:Buffer.from('<svg width="680" height="76"><rect x="1" y="1" width="678" height="74" rx="37" fill="#1e1917" fill-opacity=".7" stroke="#fff4d8" stroke-opacity=".8" stroke-width="1.5"/><circle cx="625" cy="31" r="13" fill="none" stroke="#fff4d8" stroke-width="2.5"/><path d="M635 41L652 58" stroke="#fff4d8" stroke-width="2.5"/></svg>'),left:172,top:1432}];
 layers.push({input:await sharp(path.join(root,'public/assets/band-app-icon-official.png')).resize(56,56).png().toBuffer(),left:186,top:1442});
 const label=await sharp({text:{text:'<span foreground="#fff4d8">전국크레자랑</span>',font:'Gmarket Sans TTF Bold 34',fontfile:path.join(process.env.LOCALAPPDATA,'Microsoft/Windows/Fonts/GmarketSansBold.ttf'),rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 layers.push({input:label.data,left:Math.round(512-label.info.width/2),top:1453});
 const result=await sharp(source).resize(1024,1536).composite(layers).jpeg({quality:96,chromaSubsampling:'4:4:4'}).toBuffer();
 const target=path.join(root,'public/promo-assets/jeoncre-seoul-incheon-20261125-v2.jpg');fs.writeFileSync(target,result);
 await sharp(result).resize(400).webp({quality:88}).toFile(target.replace('.jpg','.thumb.webp'));console.log(target);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

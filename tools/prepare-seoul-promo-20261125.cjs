'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs/seoul-promo-20261125');
fs.mkdirSync(out,{recursive:true});
const previous=JSON.parse(fs.readFileSync(path.join(root,'outputs/promo-library-current.json'),'utf8')).templates[0];
const replace=s=>s.replaceAll('11.23','11.25').replaceAll('11월 23일','11월 25일').replaceAll('월요일','수요일').replaceAll('부산·울산·경남','서울·인천').replaceAll('부울경','서울·인천').replaceAll('jeoncre-busan-20261123-v3','jeoncre-seoul-incheon-20261125-v1');
const next=JSON.parse(replace(JSON.stringify(previous)));
fs.writeFileSync(path.join(out,'template.json'),JSON.stringify(next,null,2));
const copy=[next.title,...next.blocks.filter(b=>b.type==='text').map(b=>b.text+(b.href?'\n'+b.href:''))].join('\n\n');
fs.writeFileSync(path.join(out,'홍보원고.txt'),copy);
const source=fs.readFileSync(path.join(root,'public/promo-center.js'),'utf8'),ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
let html=ctx.bodyHTML(next,false);
for(const b of next.blocks.filter(b=>b.type==='image')){const bytes=fs.readFileSync(path.join(root,'public',b.src));html=html.replaceAll('https://creok.onrender.com'+b.src,`data:image/${b.src.endsWith('.png')?'png':'jpeg'};base64,${bytes.toString('base64')}`);}
fs.writeFileSync(path.join(out,'preview.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#fff;color:#222;font-family:Arial,sans-serif}article{max-width:500px;margin:auto}img{max-width:100%;height:auto}</style><article>${html}</article>`);
async function main(){const browser=await require('puppeteer').launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{const page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.goto('file:///'+path.join(out,'preview.html').replaceAll('\\','/'));await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});console.log({width:await page.evaluate(()=>document.documentElement.scrollWidth),viewport:390,template:next.name});}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});

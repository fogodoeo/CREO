'use strict';
const fs=require('fs'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {server,payload}=require('./preview-departure.cjs');
const out='C:/Users/5600x/Desktop/씨랩/11월17일용/송출/검수';
const saved=JSON.parse(fs.readFileSync(out+'/clab-1117-layout.json','utf8'));
const engines=[['current','C:/Program Files/Google/Chrome/Application/chrome.exe'],['115','C:/Users/5600x/.cache/codex-runtimes/browser-compat/chrome/win64-115.0.5790.170/chrome-win64/chrome.exe']];
(async()=>{await new Promise(r=>server.listen(4423,'127.0.0.1',r));const results=[];
try{for(const [engine,executablePath]of engines){const browser=await puppeteer.launch({executablePath,headless:true});
try{const p=await browser.newPage();
for(const [width,height]of [[1920,1080],[1280,720],[800,600]])for(const page of [1,2]){
 await p.setViewport({width,height});await p.goto('http://127.0.0.1:4423/auction-live.html?channel=preview-clab&page='+page,{waitUntil:'networkidle0'});
 for(const long of [false,true]){
 const d=payload('preview-clab');d.channel={...saved.channel,id:'preview-clab'};d.state={...saved.state,mode:'live',activeItemId:'sample-1',page1BannerOn:false,page2PhotoOn:false,page2ParentsOn:false,page2BannerOn:false};
 if(long){d.state=structuredClone(d.state);d.state.hostName1='크레용 김동욱';d.state.hostRole1='크레용 대구본점 대표 / 스페셜 게스트';d.state.layoutPlacements['p1-host-1'].fontScale=1.9;d.items[0].note='부모 확인 완료 · 릴리화이트 형질 확인 · 먹이 반응 좋음 · 입찰 전에 사진과 설명을 꼭 확인해 주세요';}
 await p.evaluate(d=>{latestData=d;render(d)},d);await p.evaluate(()=>document.fonts.ready);await new Promise(r=>setTimeout(r,500));
 const metrics=await p.evaluate(()=>{const failures=[],rows=[];
 for(const el of document.querySelectorAll('.host-name,.host-role,.item-inline-identity,.item-inline-traits,.broadcast-item-note')){
 if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
 const panel=el.closest('.host-card')||el,r=panel.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);
 const clipped=[...range.getClientRects()].some(t=>t.left<r.left-2||t.right>r.right+2||t.top<r.top-2||t.bottom>r.bottom+2||t.right>innerWidth+1||t.bottom>innerHeight+1);
 const m={text:el.textContent,selector:el.className,font:parseFloat(getComputedStyle(el).fontSize),clipped};rows.push(m);if(clipped)failures.push(m);
 }return {failures,rows};});
 results.push({engine,width,height,page,long,...metrics});
 if(engine==='current'&&width===1920&&!long)await p.screenshot({path:out+'/실버태그_P'+page+'.png'});
 }
}
}finally{await browser.close();}}
fs.writeFileSync(out+'/프리즘호환_검증.json',JSON.stringify(results,null,2));
const failed=results.filter(r=>r.failures.length);console.log(JSON.stringify({cases:results.length,failed},null,2));
if(!process.argv.includes('--baseline'))assert.equal(failed.length,0);
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

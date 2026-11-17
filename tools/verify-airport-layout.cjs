'use strict';
const fs=require('fs'),assert=require('assert/strict'),puppeteer=require('puppeteer');
const {server,payload}=require('./preview-departure.cjs');
const out='C:/Users/5600x/Desktop/씨랩/11월17일용/송출/검수';
const saved=process.argv.includes('--saved')?JSON.parse(fs.readFileSync(out+'/channel-layout.json','utf8')):null;
(async()=>{await new Promise(r=>server.listen(4418,'127.0.0.1',r));const b=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const results=[],errors=[];
try{const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
for(const width of [1920,1280,676])for(const number of [1,2,3]){
 await p.setViewport({width,height:Math.round(width*9/16)});await p.goto(`http://127.0.0.1:4418/auction-live.html?channel=preview-departure&page=${number}`,{waitUntil:'networkidle0'});await p.evaluate(()=>document.fonts.ready);
 for(const scale of [1,1.9])for(const kind of ['normal','long','empty','sold','waiting']){
 const d=payload('preview-departure');if(saved){d.state.layoutPlacements=structuredClone(saved.placements);d.channel.broadcastProfile=saved.profile;}for(const v of Object.values(d.state.layoutPlacements))v.fontScale*=scale;
 if(kind==='long'){d.state.hostName1='크레용 과천점 김동욱 진행자';d.state.hostRole1='스페셜 게스트 및 진행';d.state.page1Ticker='11월 17일 화요일 밤 8시 · 크레용 과천점 고별전 · 함께해 주신 모든 분들께 감사드립니다';d.state.page2Ticker=d.state.page1Ticker;d.items[0].name='A123 고퀄리티 개체';d.items[0].vendorName='크레용 과천점 스페셜 브리딩 스튜디오';d.items[0].note='부모 확인 완료 · 릴리화이트 형질 확인 · 먹이 반응 좋음 · 입찰 전 사진과 설명을 반드시 확인해 주세요. 직접 픽업 가능하며 개별 협의가 필요합니다.';d.items[0].bidLog=[{name:'긴입찰자이름테스트서울강남',amount:12345},{name:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',amount:9876}];d.items.slice(1).forEach((it,i)=>{it.winnerAlias='낙찰자 이름이 긴 경우 '+i;it.soldPrice=1234567890;});}
 if(kind==='empty'){d.items[0].note='';d.items[0].bidLog=[];d.items=d.items.slice(0,1);}
 if(kind==='sold'){d.state.mode='sold';d.state.page2PriceOn=true;d.items[0].status='sold';d.items[0].soldPrice=1234567890;d.items[0].name='A123 고퀄리티 개체';}
 if(kind==='waiting'){d.state.mode='standby';d.state.activeItemId='';d.items=[];}
 await p.evaluate(d=>{render(d);CreoAirportLayout.apply(document.querySelector('#stage'));},d);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const m=await p.evaluate(()=>[...document.querySelectorAll('[data-airport-fit]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return{class:e.className,fit:+e.style.getPropertyValue('--airport-fit'),overflow:e.dataset.airportOverflow,rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},scroll:e.scrollWidth,client:e.clientWidth};}));
 results.push({width,page:number,scale,kind,m});assert.ok(m.every(e=>e.overflow==='false'),'overflow '+JSON.stringify(results.at(-1)));
 if(width===1920&&scale===1&&kind==='long'){await new Promise(r=>setTimeout(r,500));await p.screenshot({path:out+'/airport-long-P'+number+'.png'});}
 }
}
assert.deepEqual(errors,[]);fs.writeFileSync(out+(saved?'/airport-saved-layout-check.json':'/airport-layout-check.json'),JSON.stringify({passed:results.length,errors,results},null,2));console.log(JSON.stringify({passed:results.length,saved:!!saved,errors}));
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});

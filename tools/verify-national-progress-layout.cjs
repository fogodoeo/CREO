'use strict';
// Render isolated P1 fixtures only; never changes live auction records.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'public/auction-live.html'),'utf8');
const ctx=vm.createContext({esc:String,banner:()=>'',showBanner:()=>false,pageTicker:()=>''});
for(const name of ['hostCaptionRole','pageOneProgress','pageOne']){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),ctx);}
const css=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+[...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].filter(m=>!m[1].startsWith('http')).map(m=>fs.readFileSync(path.join(root,'public',m[1]),'utf8')).join('\n');
async function main(){
 const executablePath=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
 const browser=await puppeteer.launch({headless:true,executablePath}),page=await browser.newPage();
 const out=path.resolve(root,'../Desktop/전크자/output/p1-progress');fs.mkdirSync(out,{recursive:true});const results=[];
 try{
  for(const width of [1920,1280,676])for(const fontScale of [1,1.5])for(const kind of ['empty','ready','middle','last','done']){
   const total=kind==='empty'?0:34,current=kind==='ready'?1:kind==='middle'?18:34,completed=kind==='middle'?17:kind==='last'?33:kind==='done'?34:0;
   const mode=['ready','empty'].includes(kind)?'standby':kind==='done'?'sold':'live';
   await page.setViewport({width,height:Math.round(width*9/16)});
   const markup=ctx.pageOne({broadcastTheme:'national-stage'},{mode,hostName1:'진행자',hostName2:'참가 업체'},[],{current,total,completed});
   await page.setContent(`<style>${css}\nbody{background:#363941}#stage{width:100vw;height:100vh}</style><body data-page="1" data-broadcast-theme="national-stage"><main id="stage">${markup}</main></body>`);
   await page.evaluate(fontScale=>{const el=document.querySelector('.auction-progress');el.dataset.layoutSlot='p1-progress';el.style.setProperty('--layout-font-scale',String(fontScale));},fontScale);
   const m=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scroll:e.scrollWidth,client:e.clientWidth}};
    return{card:rect(document.querySelector('.auction-progress')),heading:rect(document.querySelector('.auction-progress-heading')),detail:rect(document.querySelector('.auction-progress-detail')),hosts:[...document.querySelectorAll('.host-card')].map(rect),progress:document.querySelector('progress').value,max:document.querySelector('progress').max};
   });
   assert.ok(m.card.x>=width*.65,'default object stays in right corner');assert.ok(m.card.right<=width*.97,'safe right edge');
   assert.ok(m.heading.scroll<=m.heading.client+1,'heading fits');assert.ok(m.detail.scroll<=m.detail.client+1,'footer fits');
   for(const host of m.hosts)assert.ok(m.card.bottom<host.y,'does not obscure presenter captions');
   assert.equal(m.progress,completed);assert.equal(m.max,total||1);
   if(kind==='last')assert.ok(m.progress<m.max,'last live lot is not a completed bar');
   results.push({width,fontScale,kind,...m});
   if(width===1920&&fontScale===1&&['middle','done'].includes(kind)){
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished)));
    await page.screenshot({path:path.join(out,`${kind}.png`)});
   }
  }
  await page.evaluate(()=>{const el=document.querySelector('.auction-progress');el.dataset.layoutCustom='1';el.dataset.layoutHidden='1';});
  assert.equal(await page.$eval('.auction-progress',e=>getComputedStyle(e).visibility),'hidden','saved hide works');
  await page.evaluate(()=>{document.body.dataset.layoutEditor='1';});
  assert.equal(await page.$eval('.auction-progress',e=>getComputedStyle(e).pointerEvents),'auto','hidden object remains selectable in editor');
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,out,verified:true}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

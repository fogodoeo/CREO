'use strict';
// Synthetic browser regression: no production auction reads or writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'public/auction-live.html'),'utf8');
const ctx=vm.createContext({esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),CreoAuctionContract:require('../public/auction-contract'),CreoBroadcastItemNotes:require('../public/broadcast-item-notes')});
for(const name of ['bidSortValue','pageTwoBidRows','bidAmountLabel','pageTwoBidders','pageTwoInfoTraits','pageTwoInlineInfo']){
 const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),ctx);
}
const css=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+[...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].filter(m=>!m[1].startsWith('http')).map(m=>fs.readFileSync(path.join(root,'public',m[1]),'utf8')).join('\n');
async function main(){
 const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
 const browser=await puppeteer.launch({headless:true,...(executablePath?{executablePath}:{})});
 const page=await browser.newPage(),out=path.resolve(root,'../Desktop/전크자/output/caption-layout');fs.mkdirSync(out,{recursive:true});
 const results=[];
 try{
 for(const width of [1920,1280,676])for(const auto of ['1','0'])for(const amounts of [[310,300],[100,99],[1,.9],[12345,9]]){
  const scale=width/1920,height=Math.round(width*9/16);await page.setViewport({width,height});
  const info=ctx.pageTwoInlineInfo({name:'B13',note:'슈달',attributes:{checklist:'gender:U|weight:3|birth:2026-07-06'}},'<span class="vendor-tag">[가상업체]</span>',true,true);
  const bids=ctx.pageTwoBidders({bidLog:[{name:amounts[0]===12345?'가상 크레스티드게코 연구소 긴 이름':'가상집사/서울',amount:amounts[0]},{name:'가상집사/경기',amount:amounts[1]}]},{});
  await page.setContent(`<style>${css}\nbody{background:#363941}#stage{width:100vw;height:100vh}.item-copy{top:3%!important;right:3%!important}.live-bidders{left:42%!important;top:73%!important}</style><body data-page="2" data-broadcast-theme="national-stage"><main id="stage">${info}${bids}</main></body>`);
  await page.evaluate(({auto,scale})=>{
   for(const selector of ['.item-copy','.live-bidders']){const el=document.querySelector(selector);el.dataset.textAutoWidth=auto;el.style.setProperty('--layout-font-scale',String(scale));}
   const el=document.querySelector('.live-bidders');if(auto==='0')el.style.width='34%';
  },{auto,scale});
  const measured=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
   return{rows:[...document.querySelectorAll('.live-bid-row')].map(rect),amounts:[...document.querySelectorAll('.live-bid-amount')].map(rect),names:[...document.querySelectorAll('.live-bid-name')].map(rect),identity:rect(document.querySelector('.item-inline-identity')),main:rect(document.querySelector('.item-inline-main')),detail:rect(document.querySelector('.national-item-detail')),note:rect(document.querySelector('.broadcast-item-note'))};
  });
  results.push({width,auto,amounts,...measured});
  if(width===1920&&auto==='1'&&amounts[0]===100)await page.screenshot({path:path.join(out,'caption-'+(process.env.CAPTION_BEFORE?'before':'after')+'.png')});
  if(!process.env.CAPTION_BEFORE){
   assert.ok(Math.abs(measured.rows[0].height-measured.rows[1].height)<1,'equal row heights '+JSON.stringify(results.at(-1)));
   assert.ok(Math.abs(measured.amounts[0].x-measured.amounts[1].x)<1,'shared amount boundary');
   assert.ok(measured.note.x>=measured.identity.right-1,'note stays in right-hand information column');
   assert.ok(Math.abs(measured.identity.height-measured.main.height)<1,'white identity spans full caption height');
   for(let i=0;i<2;i++)assert.ok(measured.names[i].bottom<=measured.rows[i].bottom+1,'name fits row');
  }
 }
 fs.writeFileSync(path.join(out,'measurements-'+(process.env.CAPTION_BEFORE?'before':'after')+'.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,out,verified:!process.env.CAPTION_BEFORE}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

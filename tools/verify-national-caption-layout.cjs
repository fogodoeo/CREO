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
  await page.addScriptTag({path:path.join(root,'public/broadcast-text-layout.js')});
  await page.addScriptTag({path:path.join(root,'public/broadcast-item-notes.js')});
  await page.evaluate(()=>{CreoBroadcastTextLayout.fitInfoRows(document.querySelector('.item-copy'));CreoBroadcastItemNotes.hydrate(document.querySelector('#stage'));});
  const measured=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
   return{rows:[...document.querySelectorAll('.live-bid-row')].map(rect),amounts:[...document.querySelectorAll('.live-bid-amount')].map(rect),names:[...document.querySelectorAll('.live-bid-name')].map(rect),identity:rect(document.querySelector('.item-inline-identity')),main:rect(document.querySelector('.item-inline-main')),detail:rect(document.querySelector('.national-item-detail')),note:rect(document.querySelector('.broadcast-item-note'))};
  });
  results.push({width,auto,amounts,...measured});
  if(width===1920&&auto==='1'&&amounts[0]===100)await page.screenshot({path:path.join(out,'caption-'+(process.env.CAPTION_BEFORE?'before':'after')+'.png')});
  if(!process.env.CAPTION_BEFORE){
   assert.ok(Math.abs(measured.rows[0].height-measured.rows[1].height)<1,'equal row heights '+JSON.stringify(results.at(-1)));
   assert.ok(Math.abs(measured.amounts[0].x-measured.amounts[1].x)<1,'shared amount boundary');
   assert.ok(measured.detail.y>=measured.identity.bottom-1,'details sit below the identity header');
   assert.ok(measured.note.y>=measured.detail.y&&measured.note.bottom<=measured.detail.bottom+1,'note shares the detail row');
   assert.ok(measured.identity.height<measured.main.height,'identity occupies only the first row');
   if(auto==='1')assert.ok(measured.main.width<=width*.46,'automatic caption preserves the camera centre');
   for(let i=0;i<2;i++)assert.ok(measured.names[i].bottom<=measured.rows[i].bottom+1,'name fits row');
  }
 }
 if(!process.env.CAPTION_BEFORE){
  for(const width of [1920,1280,676])for(const fontScale of [1,1.9,2.5])for(const kind of ['normal','long','hidden','empty']){
   await page.setViewport({width,height:Math.round(width*9/16)});
   const vendor=kind==='long'?'가상 크레스티드게코 연구소 대구본점':'가상업체',note=kind==='long'?'긴 비고를 모두 확인할 수 있어야 합니다. '.repeat(12):'SPT';
   const info=ctx.pageTwoInlineInfo({name:'A01',note:kind==='empty'?'':note,attributes:{checklist:kind==='empty'?'':'gender:F|weight:10|birth:26.03.20'}},kind==='empty'?'':`<span class="vendor-tag">[${vendor}]</span>`,kind!=='hidden',true);
   await page.setContent(`<style>${css}\nbody{background:#363941}#stage{width:100vw;height:100vh}.item-copy{top:0!important;bottom:auto!important}</style><body data-page="2" data-broadcast-theme="national-stage"><main id="stage">${info}</main></body>`);
   await page.addScriptTag({path:path.join(root,'public/broadcast-text-layout.js')});
   await page.addScriptTag({path:path.join(root,'public/broadcast-item-notes.js')});
   await page.evaluate(({fontScale,width})=>{
    const el=document.querySelector('.item-copy');el.dataset.layoutCustom='1';el.style.setProperty('--layout-font-scale',String(fontScale*width/1920));
    CreoBroadcastTextLayout.apply(el,'national-stage','p2-info',{y:0});CreoBroadcastItemNotes.hydrate(document.querySelector('#stage'));
   },{fontScale,width});
   const m=await page.evaluate(()=>{
    const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,client:el.clientWidth,scroll:el.scrollWidth,font:parseFloat(getComputedStyle(el).fontSize)}};
    return{card:box(document.querySelector('.item-copy')),title:box(document.querySelector('h1')),vendor:box(document.querySelector('.vendor-tag')),traits:box(document.querySelector('.item-inline-traits')),note:box(document.querySelector('.broadcast-item-note')),detail:box(document.querySelector('.national-item-detail')),pan:document.querySelector('.broadcast-item-note')?.dataset.overflow};
   });
   assert.ok(m.card.width<=width*.46+1,'bounded automatic width');
   assert.ok(m.card.x>=width*.52-1,'centre remains clear');
   assert.ok(m.title.height<=m.title.font*1.14+1,'lot number stays on one line even beside a long vendor');
   if(m.vendor){assert.ok(m.vendor.x>=m.title.right,'vendor follows lot');assert.ok(m.vendor.scroll<=m.vendor.client+1,'whole vendor fits');}
   if(m.traits){assert.ok(m.traits.scroll<=m.traits.client+1,'whole traits fit');if(m.note)assert.ok(m.note.x>=m.traits.right,'note never overlaps traits');}
   if(kind==='normal')assert.ok(Math.abs(m.title.font-46*fontScale*width/1920)<.1,'lot font scale preserved');
   if(kind==='long')assert.equal(m.pan,'1','long note remains readable by panning');
   if(kind==='hidden')assert.equal(m.note,null);
   if(kind==='empty')assert.equal(m.detail.height,0,'no empty detail strip');
   results.push({width,fontScale,kind,...m});
   if(width===1920&&fontScale===1.9&&['normal','long'].includes(kind))await page.screenshot({path:path.join(out,`compact-${kind}-190.png`)});
  }
 }
 fs.writeFileSync(path.join(out,'measurements-'+(process.env.CAPTION_BEFORE?'before':'after')+'.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,out,verified:!process.env.CAPTION_BEFORE}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});

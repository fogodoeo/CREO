'use strict';
// Synthetic rendering only. Never modifies production auction records.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'public/auction-live.html'),'utf8');
const ctx=vm.createContext({esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),CreoAuctionContract:require('../public/auction-contract'),CreoBroadcastItemNotes:require('../public/broadcast-item-notes')});
for(const name of ['pageTwoInfoTraits','pageTwoInlineInfo']){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),ctx);}
const css=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+[...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].filter(m=>!m[1].startsWith('http')).map(m=>fs.readFileSync(path.join(root,'public',m[1]),'utf8')).join('\n');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const out=path.resolve(root,'../Desktop/씨랩/11월17일용/송출/검수');fs.mkdirSync(out,{recursive:true});const results=[];
 try{
 const page=await browser.newPage();
 // Airport now has its own real-font, full-scene verifier: verify-airport-layout.cjs.
 for(const theme of ['national-stage','clab-gallery'])for(const width of [1920,1280,676])for(const fontScale of [1,1.9])for(const auto of ['1','0'])for(const motion of ['no-preference','reduce']){
  await page.setViewport({width,height:Math.round(width*9/16)});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:motion}]);
  for(const [kind,note] of [['short','암'],['long','부모 확인 완료 · 릴리화이트 형질 확인 · 먹이 반응 좋음 · 입찰 전에 사진과 설명을 꼭 확인해 주세요'],['unbroken','가나다라마바사아자차카타파하'.repeat(4)],['empty','']]){
   const info=ctx.pageTwoInlineInfo({name:'A01',note,attributes:{checklist:'gender:F|weight:28|birth:2026-04-02'}},'<span class="vendor-tag">가상출품업체</span>',true,true);
   await page.setContent(`<style>${css}\nbody{background:#42474c}#stage{width:100vw;height:100vh}</style><body data-page="2" data-broadcast-theme="${theme}"><main id="stage">${info}</main></body>`);
   await page.addScriptTag({path:path.join(root,'public/broadcast-text-layout.js')});await page.addScriptTag({path:path.join(root,'public/broadcast-item-notes.js')});
   await page.evaluate(({fontScale,auto,width,theme})=>{const el=document.querySelector('.item-copy');el.dataset.layoutCustom='1';el.style.setProperty('--layout-font-scale',fontScale*width/1920);el.style.setProperty('--layout-width','46%');el.style.setProperty('--layout-content-width','46vw');el.style.setProperty('--layout-x','52%');el.style.setProperty('--layout-y','2%');el.style.setProperty('--layout-height','10%');el.style.top='2%';CreoBroadcastTextLayout.apply(el,theme,'p2-info',{y:2,rightEdge:98,autoWidth:auto==='1'});CreoBroadcastItemNotes.hydrate(document.querySelector('#stage'));},{fontScale,auto,width,theme});
   const m=await page.evaluate(()=>{
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,background:s.backgroundImage+'/'+s.backgroundColor,font:parseFloat(s.fontSize),scroll:e.scrollWidth,client:e.clientWidth}};
    const card=document.querySelector('.item-copy'),note=document.querySelector('.broadcast-item-note'),span=note?.firstElementChild;
    const range=document.createRange();if(span)range.selectNodeContents(span);
    return{card:rect(card),main:rect(document.querySelector('.item-inline-main')),detail:rect(document.querySelector('.national-item-detail')),traits:rect(document.querySelector('.item-inline-traits')),note:rect(note),span:rect(span),lines:span?[...range.getClientRects()].map(r=>({x:r.x,right:r.right,width:r.width,y:r.y})):[],text:span?.textContent,align:note&&getComputedStyle(note).textAlign,decoration:span&&getComputedStyle(span).boxDecorationBreak,animation:span&&getComputedStyle(span).animationName};
   });
   assert.ok(m.card.width<=width*.46+1,'caption stays within 46% '+JSON.stringify({width,fontScale,auto,kind,m}));
   assert.equal(m.card.background,'none/rgba(0, 0, 0, 0)','outer card transparent');
   if(note){
    assert.equal(m.text,note);assert.equal(m.animation,'none');assert.equal(m.decoration,'clone');
    assert.ok(Math.abs(m.note.font-28*fontScale*width/1920)<.1,'readable note size preserved '+JSON.stringify({theme,width,fontScale,auto,kind,note:m.note}));
    assert.ok(m.note.y>=m.traits.bottom,'note gets independent row');
    assert.ok(m.note.scroll<=m.note.client+1,'no horizontal clipping');
    // Inline range bounds can include hanging whitespace; check alignment and actual clipping separately.
    assert.equal(m.align,'right');
    assert.ok(m.lines.every(r=>r.x>=m.note.x-1&&r.right<=m.note.right+1),'all text fragments stay inside the note');
    if(kind==='short')assert.ok(m.note.width<m.card.width*.45,'short note cannot fill parent');
    if(kind==='long'&&fontScale===1.9)assert.ok(m.lines.length>1,'long note wraps');
   }else assert.equal(m.note,null,'empty note leaves no surface');
   results.push({theme,width,fontScale,auto,motion,kind,...m});
   if(width===1920&&fontScale===1.9&&auto==='1'&&motion==='no-preference'&&['short','long'].includes(kind))await page.screenshot({path:path.join(out,theme+'-'+kind+'.png')});
  }
 }
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

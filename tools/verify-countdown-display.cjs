'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage();let cases=0;
 try{for(const width of [1920,1280,676]){
  await page.setViewport({width,height:Math.round(width*9/16)});
  await page.setContent(`<style>body{margin:0;background:#514e50;font-family:Arial,sans-serif}#stage{position:relative;width:100vw;height:100vh}.live-bidders{position:absolute;right:32%;top:76%;background:linear-gradient(90deg,#fff 60%,#8b2f64 60%);border-radius:20px;font-size:${width/40}px;padding:8px;color:#172232} ${fs.readFileSync('public/broadcast-countdown.css','utf8')}</style><main id="stage"><div class="live-bidders">가상 입찰자　　100만</div></main>`);
  await page.addScriptTag({path:path.resolve('public/broadcast-countdown.js')});
  const r=await page.evaluate(()=>{
   const host=document.querySelector('#stage'),item={id:'a',status:'live'},state={mode:'live',countdownDisplay:{running:true,itemId:'a',remainingMs:15000}};
   CreoBroadcastCountdown.sync(host,state,item);const badge=document.querySelector('.auction-countdown'),r=badge.getBoundingClientRect(),a=document.querySelector('.live-bidders').getBoundingClientRect();
   return {text:badge.textContent,left:r.left,right:r.right,bottom:r.bottom,anchorTop:a.top,dot:!!badge.querySelector('.auction-countdown-light')};
  });
  assert.equal(r.text,'낙찰 카운트 중');assert.ok(r.dot&&r.left>=0&&r.right<=width&&r.bottom<r.anchorTop);cases++;
  if(width===1920)await page.screenshot({path:'C:/Users/5600x/Desktop/전크자/output/countdown-display.png'});
  await page.evaluate(()=>{window.shortLease={mode:'live',countdownDisplay:{running:true,itemId:'a',remainingMs:20}};CreoBroadcastCountdown.sync(document.querySelector('#stage'),shortLease,{id:'a',status:'live'});});
  await page.waitForFunction(()=>document.querySelector('.auction-countdown')?.hidden===true);
  assert.equal(await page.evaluate(()=>{CreoBroadcastCountdown.sync(document.querySelector('#stage'),shortLease,{id:'a',status:'live'});return document.querySelector('.auction-countdown').hidden;}),true);cases++;
  for(const mode of ['sold','standby']){
   assert.equal(await page.evaluate(mode=>{CreoBroadcastCountdown.sync(document.querySelector('#stage'),{mode,countdownDisplay:{running:true,itemId:'a',remainingMs:15000}},{id:'a',status:'live'});return !!document.querySelector('.auction-countdown');},mode),false);cases++;
  }
 }
 console.log({browserCases:cases});}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

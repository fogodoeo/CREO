'use strict';
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {normalizeChannel}=require('../platform-core');
(async()=>{
 const channel=normalizeChannel({id:'fixture',name:'가상 방송',status:'active',broadcastTheme:'national-stage',dataAdapter:'platform'});
 let revision=1;
 const state={mode:'live',page:2,activeItemId:'a',page2TickerOn:false,page2ProgressOn:false,page2PhotoOn:false,page2ParentsOn:false,countdownDisplay:{itemId:'a',running:true,remainingMs:15000}};
 const item={id:'a',channelId:'fixture',name:'A01',status:'live',vendorName:'가상업체',bidLog:[{name:'가상집사',amount:100},{name:'가상손님',amount:99}],attributes:{checklist:'gender:U|weight:3'},note:'가상 개체'};
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(pathname.endsWith('broadcast-pulse')?{revision}: {revision,broadcastEpoch:'fixture',channel,state,items:[item],assets:[],itemProgress:{current:1,total:1}}));return;}
  const file=path.join(__dirname,'../public',pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1280,height:720});
 await page.goto(`http://127.0.0.1:${server.address().port}/auction-live.html?channel=fixture&page=2&live=1`,{waitUntil:'networkidle2'});
 await page.waitForSelector('.auction-countdown');assert.equal(await page.$eval('.auction-countdown',e=>e.textContent),'낙찰 카운트 중');
 await page.screenshot({path:'C:/Users/5600x/Desktop/전크자/output/countdown-real-page.png'});
 state.countdownDisplay=null;revision++;
 await page.waitForFunction(()=>!document.querySelector('.auction-countdown'));
 state.countdownDisplay={itemId:'a',running:true,remainingMs:15000};revision++;
 await page.waitForSelector('.auction-countdown');
 state.mode='sold';item.status='sold';revision++;
 await page.waitForFunction(()=>!document.querySelector('.auction-countdown'));
 assert.deepEqual(errors,[]);console.log('Actual live HTML: start, cancel, restart, sold; no browser errors');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});

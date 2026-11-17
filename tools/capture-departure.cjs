'use strict';
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer');
const {server}=require('./preview-departure.cjs');
const out=path.resolve(__dirname,'../../Desktop/씨랩/11월17일용/송출/검수');
(async()=>{await new Promise(r=>server.listen(4418,'127.0.0.1',r));const port=server.address().port;
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});fs.mkdirSync(out,{recursive:true});const results=[];
 try{const page=await browser.newPage();await page.setViewport({width:1920,height:1080});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [channel,number] of [['preview-departure',1],['preview-departure',2],['preview-departure',3],['preview-clab',2]]){await page.goto(`http://127.0.0.1:${port}/auction-live.html?channel=${channel}&page=${number}`,{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,`${channel}-P${number}.png`)});results.push({channel,number,...await page.evaluate(()=>({error:document.querySelector('#error')?.hidden===false?document.querySelector('#error').textContent:null,stageText:document.querySelector('#stage').innerText,stageBackground:getComputedStyle(document.querySelector('#stage')).backgroundColor,rects:[...document.querySelectorAll('[data-layout-slot],.studio-masthead')].map(e=>({slot:e.dataset.layoutSlot||'masthead',x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,scroll:e.scrollWidth,client:e.clientWidth}))}))});}
 fs.writeFileSync(path.join(out,'full-screen-check.json'),JSON.stringify({errors,results},null,2));console.log(JSON.stringify({errors,results}));if(errors.length||results.some(r=>r.error))process.exitCode=1;
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

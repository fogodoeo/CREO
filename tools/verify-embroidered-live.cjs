'use strict';
const assert=require('node:assert/strict'),puppeteer=require('puppeteer'),sharp=require('sharp');
const {server,payload}=require('./preview-departure.cjs');
(async()=>{await new Promise(r=>server.listen(4418,'127.0.0.1',r));const b=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{const p=await b.newPage();await p.setViewport({width:1920,height:1080});await p.goto('http://127.0.0.1:4418/auction-live.html?channel=preview-departure&page=2',{waitUntil:'networkidle0'});
 const title=await p.$('.item-inline-identity h1'),before=await title.screenshot();await title.evaluate(e=>e.style.setProperty('filter','none','important'));const plain=await title.screenshot();
 const aa=await sharp(before).raw().toBuffer(),bb=await sharp(plain).raw().toBuffer();assert.ok(aa.some((v,i)=>v!==bb[i]),'recessed text filter must affect actual rendered pixels');
 const data=payload('preview-departure');data.items[0].name='B12';data.items[0].note='새 개체 비고';data.items[0].attributes.checklist='gender:M|weight:36|birth:2026-05-01';data.items[0].bidLog=[{name:'새 입찰자',amount:85}];
 await p.evaluate(d=>render(d),data);
 const live=await p.evaluate(()=>{const q=s=>document.querySelector(s),text=s=>q(s)?.textContent||'';return{title:text('.item-inline-identity h1'),traits:text('.item-inline-traits'),note:text('.broadcast-item-note'),bids:text('.live-bidders'),frame:getComputedStyle(q('.item-inline-identity')).borderImageSource,filter:getComputedStyle(q('.item-inline-identity h1')).filter,stage:getComputedStyle(q('#stage')).backgroundColor};});
 assert.equal(live.title,'B12');assert.match(live.traits,/36g/);assert.match(live.note,/새 개체 비고/);assert.match(live.bids,/85만/);assert.doesNotMatch(live.note,/먹이 반응/);assert.match(live.frame,/embroidered-frame/);assert.match(live.filter,/intaglio/);assert.equal(live.stage,'rgba(0, 0, 0, 0)');
 console.log(JSON.stringify({dynamicUpdate:true,intaglioPixelsChanged:true,transparentStage:true,productionWrites:0}));
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

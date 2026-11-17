'use strict';
const assert=require('node:assert/strict'),puppeteer=require('puppeteer'),{server}=require('./preview-departure.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{const page=await browser.newPage();await page.setViewport({width:1600,height:1000});
 await page.goto(`http://127.0.0.1:${port}/platform-layout-editor.html?channel=preview-clab&page=2`,{waitUntil:'networkidle0'});
 await page.waitForSelector('#slot option[value="p2-info"]');await page.select('#slot','p2-info');
 const state=()=>page.evaluate(()=>{const doc=document.querySelector('#frame').contentDocument,el=doc.querySelector('[data-layout-slot="p2-info"]'),r=el.getBoundingClientRect();return {right:100*r.right/doc.documentElement.clientWidth,field:document.querySelector('#x').value,auto:document.querySelector('#auto-width').checked};});
 const before=await state();assert.ok(Math.abs(before.right-96)<.1);assert.equal(Number(before.field),96);
 const set=async(id,value)=>page.evaluate(({id,value})=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},{id,value});
 await set('font-number','150');assert.ok(Math.abs((await state()).right-before.right)<.1,'font edit keeps legacy saved edge');
 await page.click('#auto-width');assert.equal((await state()).auto,false);assert.ok(Math.abs((await state()).right-before.right)<.1,'manual toggle keeps edge');
 await set('width','30');assert.ok(Math.abs((await state()).right-before.right)<.1,'manual width keeps edge');
 await set('x','91');assert.ok(Math.abs((await state()).right-91)<.1,'right position remains editable');
 console.log(JSON.stringify({passed:5,before,after:await state(),productionWrites:0}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

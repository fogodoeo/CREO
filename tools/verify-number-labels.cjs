'use strict';
const puppeteer=require('puppeteer'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve(__dirname,'../../../outputs/number-labels');fs.mkdirSync(out,{recursive:true});
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1280,height:900});
  page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:4448/number-labels.html?channel=label-fixture-a');await page.waitForFunction(()=>!document.querySelector('#editor').hidden||!document.querySelector('#result').hidden);await page.click('#new-plan');
  const fill=async(sel,value)=>page.$eval(sel,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await page.select('#config-mode','parts');
  await fill('[data-part="0"] [data-default]','3');
  for(const [j,name]of ['크레오','크레빠','마이리틀드래곤'].entries()){await page.click('[data-part="0"] [data-action="add-vendor"]');await fill(`[data-part="0"] [data-vendor="${j}"] [data-field="company"]`,name);}
  assert.equal(await page.$eval('[data-part="0"] [data-vendor="2"] [data-field="count"]',el=>el.value),'3');
  await fill('[data-part="0"] [data-vendor="0"] [data-field="count"]','2');await fill('[data-part="0"] [data-vendor="2"] [data-field="count"]','2');
  await page.click('[data-part="1"] [data-action="copy"]');await page.click('[data-part="1"] [data-action="reverse"]');
  await fill('[data-part="1"] [data-vendor="0"] [data-field="company"]','마리드');await page.click('#add-panel');await fill('#title','검증 번호표');await page.click('#preview');
  assert.equal(await page.$eval('#total',e=>e.textContent),'총 16장');
  await page.screenshot({path:path.join(out,'setup-desktop.png'),fullPage:true});
  await page.click('#save');await page.waitForFunction(()=>document.querySelector('#editor').hidden&&document.querySelector('#status').textContent.includes('저장했어요'));
  await page.click('#select-all');await page.screenshot({path:path.join(out,'saved-desktop.png'),fullPage:true});
  // Intercept the loopback bridge: no real hardware is contacted.
  let posts=0;await page.setRequestInterception(true);page.on('request',async req=>{
   if(!req.url().startsWith('http://127.0.0.1:17876'))return req.continue();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'};
   if(req.method()==='OPTIONS')return req.respond({status:204,headers});
   if(req.url().endsWith('/v1/status'))return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({ready:true,identificationLabelFormats:['numbering']})});
   posts++;const body=JSON.parse(req.postData());assert.equal(body.labels.length,16);assert.equal(body.labels[0].format,'numbering');await new Promise(r=>setTimeout(r,100));return req.respond({status:202,headers,contentType:'application/json',body:JSON.stringify({ok:true,accepted:16})});
  });
  await page.evaluate(()=>{document.querySelector('#print-b1').click();document.querySelector('#print-b1').click();});await page.waitForFunction(()=>document.querySelector('#print-status').textContent.includes('대기열에 추가'));assert.equal(posts,1);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#result').hidden);assert.equal(await page.$eval('#total',e=>e.textContent),'총 16장');
  await page.select('#round','1');await page.waitForFunction(()=>!document.querySelector('#editor').hidden);assert.equal(await page.$$eval('.number-row',els=>els.length),16);assert.equal(await page.$eval('#result',el=>el.hidden),true);
  await page.select('#round','0');await page.waitForFunction(()=>!document.querySelector('#result').hidden);
  await page.setViewport({width:320,height:800});await page.screenshot({path:path.join(out,'saved-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.click('#edit-plan');await page.screenshot({path:path.join(out,'setup-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#result').hidden);await page.click('#select-all');await page.evaluate(()=>window.print=()=>{});await page.click('#print-browser');await page.waitForFunction(()=>document.querySelectorAll('#print-pages .number-sheet').length===16);await page.emulateMediaType('print');await page.pdf({path:path.join(out,'number-labels.pdf'),preferCSSPageSize:true,printBackground:true});
  await page.emulateMediaType('screen');await page.setViewport({width:1360,height:1000});await page.click('#new-plan');
  for(const [j,name]of ['크레오','크레빠','마리드'].entries()){await page.click('[data-part="0"] [data-action="add-vendor"]');await fill(`[data-part="0"] [data-vendor="${j}"] [data-field="company"]`,name);}
  await page.click('#preview');assert.equal(await page.$eval('#total',e=>e.textContent),'총 12장');
  assert.deepEqual(await page.$$eval('.number-row',els=>els.slice(6,9).map(el=>el.textContent)),['B01마리드','B02크레빠','B03크레오']);await page.screenshot({path:path.join(out,'simple-setup.png'),fullPage:true});
  await fill('#title','자동 분할 번호표');await page.click('#save');await page.waitForFunction(()=>document.querySelector('#editor').hidden);
  await page.goto('http://127.0.0.1:4448/index.html?channel=label-fixture-a&view=numberLabels');await page.waitForSelector('#operator-frame');
  const frame=await (await page.$('#operator-frame')).contentFrame();await frame.waitForSelector('#result:not([hidden])');assert.equal(await frame.evaluate(()=>document.documentElement.classList.contains('operator-embedded')),true);await page.screenshot({path:path.join(out,'admin-menu.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,labels:16,duplicatePrintPosts:posts,mobileWidth:320,adminMenu:true,artifacts:out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer'),W=require('../dodosi-booking-workflow');
const root=path.resolve(__dirname,'../public'),out=path.resolve('outputs/dodosi-workflow');fs.mkdirSync(out,{recursive:true});
const groups=Array.from({length:17},(_,i)=>({id:'g'+i,bookingKey:'k'+i,name:'가상 낙찰자 '+(i+1),phone:'010'+String(i).padStart(8,'0'),shop:'[서울/강동] 테스트 정거샵',destinationId:'dest'+i,quantity:i===0?6:1,paid:i!==2,items:[{lot:'A'+i}],schedule:{status:'estimated',dropoffDate:'2026-11-24',dispatchDate:'2026-11-25',arrivalDate:'2026-11-28'}}));
for(const g of groups)g.cachedQuote={status:'ready',checkedAt:new Date().toISOString(),quote:{base:28000,zoneSurcharge:0,petSurcharge:g.quantity===6?21000:0,total:g.quantity===6?49000:28000}};
let data,requests=[];const reset=()=>{data={revision:0,sender:{name:'가상 발송인',phone:'01000000000'},groups,excluded:[],prepared:[],batches:[],checks:[],originName:'크레용(대구)',originId:'origin',checkedAt:new Date().toISOString(),fresh:true,discountBp:5000};requests=[];};reset();
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');if(req.method==='POST'){let raw='';for await(const x of req)raw+=x;const b=JSON.parse(raw);requests.push(b);try{assert.equal(b.expectedRevision,data.revision);const r=W.command(data,b,groups,{originId:'origin',originName:data.originName,channelId:'fixture',sender:data.sender,fresh:true});data=r.next;return res.end(JSON.stringify({...data,batch:r.batch}));}catch(e){res.statusCode=e.statusCode||409;return res.end(JSON.stringify({error:e.message}));}}return res.end(JSON.stringify(u.pathname.endsWith('admin-check')?{authenticated:true}:u.pathname.endsWith('dodosi-dispatch')?data:{channels:[]}));}
 const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;try{
 browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());
 await page.evaluateOnNewDocument(()=>{window.fakeReceipts=[];window.helperCalls=[];window.addEventListener('message',e=>{const m=e.data;if(m?.type!=='creo-dodosi-command')return;window.helperCalls.push(m);const result=m.action==='ping'?{version:'1.2.1'}:m.action==='receipts'?{source:'https://www.dodosi.co.kr/deliveries',complete:true,checkedAt:new Date().toISOString(),records:window.fakeReceipts,...(m.plan?.scope?{scope:m.plan.scope.map(s=>Object.fromEntries(Object.entries(s).reverse()))}:{})}:{filled:true,stage:'review',count:m.plan.plans.length,forms:[{groupIds:m.plan.plans.map(p=>p.groupId)}]};setTimeout(()=>window.postMessage({type:'creo-dodosi-result',requestId:m.requestId,result},location.origin),20);});});
 for(const width of [1440,390,320]){reset();await page.setViewport({width,height:900});await page.goto(base+'/dodosi-dispatch.html?channel=fixture');await page.waitForSelector('[data-select]');
  // Unchecked receipt history must not block drafting a selection.
  assert.equal(await page.$eval('#next-ten',e=>e.disabled),false);
  assert.equal(await page.$$eval('[data-quote]',els=>els.length),0);assert.match(await page.$eval('[data-row="g0"] .quote-cell',e=>e.textContent),/24,500원/);
  assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),0);
  await page.click('[data-row="g0"] td:nth-child(2)');assert.equal(await page.$eval('[data-select="g0"]',e=>e.checked),true);
  await page.focus('[data-select="g0"]');await page.keyboard.press('Space');assert.equal(await page.$eval('[data-select="g0"]',e=>e.checked),false);
  assert.equal(await page.$eval('[data-select="g0"]',e=>e===document.activeElement),true);
  await page.click('#next-ten');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),10);assert.equal(await page.$eval('[data-select="g2"]',e=>e.checked),false);
  await page.click('[data-select="g2"]');assert.equal(await page.$eval('[data-select="g2"]',e=>e.checked),false);
  await page.click('[data-select="g1"]');await page.click('[data-select="g2"]');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),10);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'selected-'+width+'.png'),fullPage:true});
  await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('10명 입력 완료'));
  await page.waitForFunction(()=>!document.getElementById('next-ten').disabled);
  assert.equal(data.batches.length,1);assert.equal(data.batches[0].status,'review');assert.ok(data.batches[0].plans.some(p=>p.groupId==='g2'&&!p.paid));
  assert.equal(await page.evaluate(()=>window.helperCalls.find(c=>c.action==='receipts').plan.scope.length),10);
  await page.reload();await page.waitForSelector('[data-resume]');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),0);
  // An open first batch does not disable selecting the next unattempted recipients.
  await page.click('#next-ten');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),7);
  const receipts=data.batches[0].plans.map(p=>({id:'r'+p.groupId,status:'paid',originId:p.originId,destinationId:p.destinationId,name:p.name,phone:p.phone,quantity:p.quantity,dropoffDate:p.schedule.dropoffDate,arrivalDate:p.schedule.arrivalDate}));await page.evaluate(r=>window.fakeReceipts=r,receipts);
  await page.click('#verify');await page.waitForFunction(()=>document.getElementById('count').textContent.includes('완료 10명'));assert.equal(data.batches[0].status,'confirmed');
  assert.equal(await page.$$('tr.is-confirmed').then(r=>r.length),10);
  assert.equal(await page.$eval('tr.is-confirmed',e=>getComputedStyle(e.cells[0]).backgroundColor),'rgb(232, 245, 236)');
  await page.click('#next-ten');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),7);await page.screenshot({path:path.join(out,'confirmed-'+width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Actually complete the second batch, checking receipt reconciliation precedes input.
  await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('7명 입력 완료'));
  assert.equal(data.batches.length,2);assert.equal(data.batches[1].plans.length,7);
  assert.ok(!data.batches[1].plans.some(p=>data.batches[0].plans.some(a=>a.groupId===p.groupId)));
  await page.waitForFunction(()=>!document.getElementById('verify').disabled);
 }
 // A receipt discovered between choosing a row and submitting must be skipped.
 reset();await page.setViewport({width:1440,height:900});await page.goto(base+'/dodosi-dispatch.html?channel=fixture');await page.waitForSelector('[data-select]');
 await page.click('#next-ten');const g=groups[0];const known={id:'already',status:'paid',originId:'origin',destinationId:g.destinationId,name:g.name,phone:g.phone,quantity:g.quantity,dropoffDate:g.schedule.dropoffDate,arrivalDate:g.schedule.arrivalDate};
 await page.evaluate(r=>window.fakeReceipts=[r],known);await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('9명 입력 완료'));
 assert.equal(data.batches[0].plans.length,9);assert.ok(data.batches[0].plans.every(p=>p.groupId!=='g0'));await page.waitForFunction(()=>!document.getElementById('verify').disabled);
 // Incomplete readback must fail closed, without any fill request.
 reset();await page.goto(base+'/dodosi-dispatch.html?channel=fixture');await page.waitForSelector('[data-select]');await page.click('#next-ten');
 await page.evaluate(()=>window.fakeReceipts=[{id:'invalid'}]);await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('error').textContent.length>0);
 assert.equal(data.batches.length,0);assert.equal(await page.evaluate(()=>window.helperCalls.filter(c=>c.action==='fill-many').length),0);
 await page.waitForFunction(()=>!document.getElementById('verify').disabled);
 // Different dropoff dates remain individually selectable, then become separate durable batches.
 for(const failSecond of [false,true]){
  reset();const original={...groups[16].schedule};groups[16].schedule={...original,dropoffDate:'2026-11-28',dispatchDate:'2026-11-29',arrivalDate:'2026-12-01'};
  await page.goto(base+'/dodosi-dispatch.html?channel=fixture');await page.waitForSelector('[data-select]');
  if(failSecond)await page.evaluate(()=>{window.addEventListener('message',e=>{const m=e.data;if(m?.type==='creo-dodosi-command'&&m.action==='fill-many'&&m.plan.plans[0].schedule.dropoffDate==='2026-11-28')window.postMessage({type:'creo-dodosi-result',requestId:m.requestId,result:{error:'가상 두 번째 입력 실패'}},location.origin);});});
  await page.click('[data-select="g0"]');await page.click('[data-select="g16"]');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),2);
  assert.match(await page.$eval('#selection-count',e=>e.textContent),/날짜별 2묶음/);await page.screenshot({path:path.join(out,'mixed-dates.png'),fullPage:true});
  await page.click('#fill-many');await page.waitForFunction(()=>!document.getElementById('verify').disabled);
  assert.equal(data.batches.length,2);assert.deepEqual(data.batches.map(b=>b.plans.length),[1,1]);assert.deepEqual(data.batches.map(b=>b.status),['review',failSecond?'prepared':'review']);
  assert.deepEqual(data.batches.map(b=>b.plans[0].schedule.dropoffDate),['2026-11-24','2026-11-28']);
  assert.match(await page.$eval('#progress',e=>e.textContent),/11\/24 맡김 · 1명 입력 완료/);
  if(failSecond)assert.match(await page.$eval('#error',e=>e.textContent),/두 번째 입력 실패/);
  else assert.match(await page.$eval('#progress',e=>e.textContent),/11\/28 맡김 · 1명 입력 완료 · 12\/1 도착 예정/);
  await page.reload();await page.waitForSelector('[data-resume]');assert.equal(await page.$eval('[data-select="g16"]',e=>e.disabled),true);assert.equal(data.batches.length,2);
  groups[16].schedule=original;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,widths:[1440,390,320],batchSize:10,unpaidManual:true,receiptDoubleCheck:true,reloadPreserved:true,mixedDates:true,partialFailurePreserved:true}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});

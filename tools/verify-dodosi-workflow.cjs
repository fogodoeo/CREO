'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer'),W=require('../dodosi-booking-workflow');
const root=path.resolve(__dirname,'../public'),out=path.resolve('outputs/dodosi-workflow');fs.mkdirSync(out,{recursive:true});
const groups=Array.from({length:17},(_,i)=>({id:'g'+i,bookingKey:'k'+i,name:'가상 낙찰자 '+(i+1),phone:'010'+String(i).padStart(8,'0'),shop:'[서울/강동] 테스트 정거샵',destinationId:'dest'+i,quantity:i===0?6:1,paid:i!==2,items:[{lot:'A'+i}],schedule:{status:'estimated',dropoffDate:'2026-11-24',dispatchDate:'2026-11-25',arrivalDate:'2026-11-28'}}));
let data,requests=[];const reset=()=>{data={revision:0,sender:{name:'가상 발송인',phone:'01000000000'},groups,excluded:[],prepared:[],batches:[],checks:[],originName:'크레용(대구)',originId:'origin',checkedAt:new Date().toISOString(),fresh:true,discountBp:5000};requests=[];};reset();
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');if(req.method==='POST'){let raw='';for await(const x of req)raw+=x;const b=JSON.parse(raw);requests.push(b);try{assert.equal(b.expectedRevision,data.revision);const r=W.command(data,b,groups,{originId:'origin',originName:data.originName,channelId:'fixture',sender:data.sender,fresh:true});data=r.next;return res.end(JSON.stringify({...data,batch:r.batch}));}catch(e){res.statusCode=e.statusCode||409;return res.end(JSON.stringify({error:e.message}));}}return res.end(JSON.stringify(u.pathname.endsWith('admin-check')?{authenticated:true}:u.pathname.endsWith('dodosi-dispatch')?data:{channels:[]}));}
 const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;try{
 browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());
 await page.evaluateOnNewDocument(()=>{window.fakeReceipts=[];window.helperCalls=[];window.addEventListener('message',e=>{const m=e.data;if(m?.type!=='creo-dodosi-command')return;window.helperCalls.push(m);const result=m.action==='ping'?{version:'1.2.0'}:m.action==='receipts'?{source:'https://www.dodosi.co.kr/deliveries',complete:true,checkedAt:new Date().toISOString(),records:window.fakeReceipts}:{filled:true,stage:'review',count:m.plan.plans.length,forms:[{groupIds:m.plan.plans.map(p=>p.groupId)}]};setTimeout(()=>window.postMessage({type:'creo-dodosi-result',requestId:m.requestId,result},location.origin),20);});});
 for(const width of [1440,390,320]){reset();await page.setViewport({width,height:900});await page.goto(base+'/dodosi-dispatch.html?channel=fixture');await page.waitForSelector('[data-select]');
  assert.equal(await page.$eval('#next-ten',e=>e.disabled),true);await page.click('#verify');await page.waitForFunction(()=>!document.getElementById('next-ten').disabled);
  assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),0);await page.click('#next-ten');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),10);assert.equal(await page.$eval('[data-select="g2"]',e=>e.checked),false);
  await page.click('[data-select="g2"]');assert.equal(await page.$eval('[data-select="g2"]',e=>e.checked),false);
  await page.click('[data-select="g1"]');await page.click('[data-select="g2"]');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),10);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'selected-'+width+'.png'),fullPage:true});
  await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('10명 입력 완료'));
  assert.equal(data.batches.length,1);assert.equal(data.batches[0].status,'review');assert.ok(data.batches[0].plans.some(p=>p.groupId==='g2'&&!p.paid));
  await page.reload();await page.waitForSelector('[data-resume]');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),0);
  const receipts=data.batches[0].plans.map(p=>({id:'r'+p.groupId,status:'paid',originId:p.originId,destinationId:p.destinationId,name:p.name,phone:p.phone,quantity:p.quantity,dropoffDate:p.schedule.dropoffDate,arrivalDate:p.schedule.arrivalDate}));await page.evaluate(r=>window.fakeReceipts=r,receipts);
  await page.click('#verify');await page.waitForFunction(()=>document.getElementById('count').textContent.includes('완료 10명'));assert.equal(data.batches[0].status,'confirmed');
  await page.click('#next-ten');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),7);await page.screenshot({path:path.join(out,'confirmed-'+width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,widths:[1440,390,320],batchSize:10,unpaidManual:true,receiptDoubleCheck:true,reloadPreserved:true}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});

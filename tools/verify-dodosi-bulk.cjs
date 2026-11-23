'use strict';
// Isolated fixtures: selection, retry grouping, no external booking or data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../public'),out=path.resolve('outputs/dodosi-bulk');fs.mkdirSync(out,{recursive:true});
const groups=Array.from({length:4},(_,i)=>({id:'g'+i,name:'가상 낙찰자 '+(i+1),phone:'01000000000',shop:'[서울/강동] 테스트 정거샵',quantity:i===0?2:1,paid:i!==2,items:[{lot:'A0'+(i+1)}],schedule:{status:'estimated',dropoffDate:'2026-11-24',dispatchDate:'2026-11-25',arrivalDate:'2026-11-28'},basePrice:28000}));
let data,requests=[];
const reset=()=>{data={revision:0,sender:{name:'가상 발송인',phone:'01000000000'},groups,excluded:[],prepared:[{groupId:'g3',at:'2026-11-23T00:00:00Z'}],originName:'크레용(대구)',checkedAt:new Date(Date.now()-90000000).toISOString(),fresh:true,discountBp:5000};requests=[];};reset();
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://local');
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;const b=JSON.parse(body);requests.push(b);
   assert.equal(b.action,'prepare-many');assert.equal(b.expectedRevision,data.revision);data.revision++;
   if(!b.resume){assert.deepEqual(b.groupIds,['g0','g1']);data.prepared.push(...b.groupIds.map(groupId=>({groupId,at:'2026-11-24T00:00:00Z'})));}
   return res.end(JSON.stringify({plans:b.groupIds.map(groupId=>({groupId})),revision:data.revision}));
  }
  return res.end(JSON.stringify(u.pathname.endsWith('admin-check')?{authenticated:true}:u.pathname.endsWith('dodosi-dispatch')?data:{channels:[]}));
 }
 const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());
  await page.evaluateOnNewDocument(()=>{window.helperActions=[];window.addEventListener('message',e=>{
   if(e.data?.type!=='creo-dodosi-command')return;const m=e.data;window.helperActions.push(m);
   setTimeout(()=>window.postMessage({type:'creo-dodosi-result',requestId:m.requestId,result:m.action==='ping'?{version:'1.1.1'}:{filled:true,count:m.plan.plans.length,forms:[{}]}},location.origin),m.action==='ping'?0:100);
  });});
  for(const width of [1440,390,320]){
   reset();await page.setViewport({width,height:900});await page.goto(base+'/dodosi-dispatch.html?channel=fixture');await page.waitForSelector('[data-select="g0"]');
   assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),2);
   assert.equal(await page.$eval('[data-select="g2"]',e=>e.disabled),true);
   assert.equal(await page.$eval('[data-select="g3"]',e=>e.disabled),false);
   await page.click('[data-select="g3"]');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),3);await page.click('[data-select="g3"]');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(out,'ready-'+width+'.png'),fullPage:true});
   await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('sender-status').textContent.includes('입력 완료'));
   assert.equal(requests.length,1);assert.equal(await page.$eval('#fill-many',e=>e.disabled),true);
   await page.reload();await page.waitForSelector('[data-select="g0"]');
   assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),0);assert.equal(await page.$eval('#select-all',e=>e.disabled),false);
   assert.deepEqual(await page.evaluate(()=>window.helperActions),[]); // No background sync blocking input.
   await page.click('#select-all');assert.equal(await page.$$eval('[data-select]:checked',els=>els.length),3);
   await page.click('#fill-many');await page.waitForFunction(()=>document.getElementById('sender-status').textContent.includes('3명 입력 완료'));
   assert.deepEqual(requests.slice(1).map(r=>({ids:r.groupIds,resume:r.resume})),[{ids:['g0','g1'],resume:true},{ids:['g3'],resume:true}]);
   assert.deepEqual(await page.evaluate(()=>window.helperActions.filter(m=>m.action==='fill-many').map(m=>m.plan.resume)),[true,true]);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,widths:[1440,390,320],attemptedSelectable:true,originalBatchReused:true,noAutoSync:true,reloadNoReplay:true,screenshots:out}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

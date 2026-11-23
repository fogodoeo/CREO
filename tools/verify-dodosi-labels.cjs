'use strict';
// Synthetic browser + mocked loopback. Never reaches a real printer or production data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../public'),out=path.resolve(process.argv[2]||'outputs/dodosi-labels');fs.mkdirSync(out,{recursive:true});
const item={name:'A01',status:'낙찰',winner:'가상낙찰자',winner_phone:'01000000002',_winner:{name:'가상낙찰자',phone:'01000000002'},shipping_type:'배송',shipping_company:'도도시',shipping_region:'[서울/강동] 티그리스게코',payment_status:'paid',_platformItemId:'fixture-1',soldPrice:10};
const state={fresh:true,broadcastDate:'2026-11-23',originName:'크레용(대구)',sender:{name:'전크자',phone:'01049287600'},groups:[{name:'가상 수령인',phone:'01020202020',shop:'[서울/강동] 티그리스게코',quantity:3,items:[{id:'fixture-1',lot:'A01'},{id:'fixture-2',lot:'B02'},{id:'fixture-3',lot:'C03'}],schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}}]};
let supported=true,posts=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(u.pathname.endsWith('dodosi-dispatch')?state:{}));}
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
 let content=fs.readFileSync(file);if(file.endsWith('print.html'))content=content.toString().replace('        initializePrint();','        /* isolated fixture starts below */');res.end(content);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.setRequestInterception(true);page.on('request',async req=>{
   if(req.url().startsWith('http://127.0.0.1:17876')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Private-Network':'true'};
    if(req.method()==='OPTIONS')return req.respond({status:204,headers});
    if(req.url().endsWith('/v1/status'))return req.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({shippingLabelDetails:true,shippingLabelVersion:2,dodosiTicketVersion:supported?2:1})});
    const body=JSON.parse(req.postData());posts.push(body);await new Promise(r=>setTimeout(r,80));return req.respond({status:202,headers,contentType:'application/json',body:JSON.stringify({ok:true,accepted:body.labels.reduce((n,l)=>n+(l.kind==='dodosi_ticket'?2:1),0)})});
   }
   if(req.url().startsWith(base)||req.url().startsWith('data:'))return req.continue();return req.abort();
  });
  await page.setViewport({width:1280,height:1000});await page.goto(base+'/print.html?channel=fixture');
  await page.evaluate((item,state)=>{window._dodosiLabelState=state;document.getElementById('print-login').hidden=true;renderShippingLabels([item]);showTab('labels');},item,state);
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  assert.equal(await page.$eval('#label-selection-summary',e=>e.textContent),'1개체 선택 · 총 2장 / 1개체');
  await page.evaluate(()=>{printSelectedShippingLabels();printSelectedShippingLabels();});await page.waitForFunction(()=>!window._shippingPrintBusy);
  assert.equal(posts.length,1);assert.equal(posts[0].labels[0].kind,'dodosi_ticket');assert.equal(posts[0].labels[0].winner_name,'가상 수령인');
  for(const width of [390,320]){await page.setViewport({width,height:1000});await page.evaluate(()=>fitShippingLabelPreview());await page.screenshot({path:path.join(out,'mobile-'+width+'.png'),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const overflow=await page.$$eval('[data-ticket-size]',nodes=>nodes.filter(n=>n.firstElementChild.scrollWidth>n.clientWidth+1||n.firstElementChild.getBoundingClientRect().height>n.clientHeight+1).map(n=>n.textContent));assert.deepEqual(overflow,[]);
  }
  supported=false;await page.evaluate(()=>printSelectedShippingLabels());assert.equal(posts.length,1);assert.ok(dialogs.at(-1).includes('업데이트'));
  supported=true;await page.evaluate(()=>{document.getElementById('dodosi-label-phone').value='';saveDodosiLabelSender();});await page.evaluate(()=>printSelectedShippingLabels());assert.equal(posts.length,1);assert.ok(dialogs.at(-1).includes('보내는 분'));
  await page.screenshot({path:path.join(out,'incomplete.png'),fullPage:true});
  await page.evaluate(()=>{document.getElementById('dodosi-label-phone').value='01049287600';document.getElementById('dodosi-label-name').value='수정 이름';saveDodosiLabelSender();});
  await page.reload();await page.evaluate((item,state)=>{window._dodosiLabelState=state;renderShippingLabels([item]);showTab('labels');},item,state);
  assert.equal(await page.$eval('#dodosi-label-name',e=>e.value),'수정 이름');assert.equal(await page.$eval('#dodosi-label-phone',e=>e.value),'01049287600');
  await page.evaluate((item,state)=>{PRINT_CHANNEL_ID='fixture-other';window._dodosiLabelState=state;renderShippingLabels([item]);},item,state);
  assert.equal(await page.$eval('#dodosi-label-name',e=>e.value),'전크자');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,posts:posts.length,widths:[1280,390,320],guarded:['duplicate click','old bridge','missing sender'],out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

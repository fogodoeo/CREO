'use strict';
// Isolated browser evidence. Synthetic lots and local SQLite, no production writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('./vendor-portal-preview.cjs'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../public'),out=path.resolve(__dirname,'../../Desktop/전크자/output/order-sibling-1116');
const roster=['좀비렙타일','아르카젠','채채파파','펠리체게코','아기공룡&라이카','제트크레','쭌이네','디게코','모프포레스트'];
async function main(){
 fs.mkdirSync(out,{recursive:true});const origin='http://127.0.0.1:4451',f=await createFixture({origin});f.advance(9*86400000);
 const admin={'x-creo-admin':f.secret};await f.call(f.client(),'PUT','/api/platform/channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'},admin);
 const owner=await f.login('01000000001'),company=(await f.post(owner,'register',{name:'검증 업체',region:'서울',phone:'01000000001'})).json();
 const vendor=await f.repository.getRecord('national-cre','vendor',company.id);await f.repository.upsertRecord('national-cre','vendor',{...vendor,bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'});
 const token=(await f.post(owner,'select',{id:company.id})).json().token;
 const reserved=await f.call(owner,'POST','/api/platform/vendor-bookings',{requestId:randomUUID(),token,event:'national-cre',type:'reserve',date:'2026-10-14',quantity:4});assert.equal(reserved.status,200,reserved.body);
 const state={id:'state',page3On:true,page3Content:'vendor-order',page3VendorOrder:roster.join('\n'),page3VendorOrderSecond:[...roster].reverse().join('\n'),mode:'live',activeItemId:'test-lot',page2InfoOn:false,page2ParentsOn:true,page2PhotoOn:false,page2SoldOn:false,page2PriceOn:false,page2TickerOn:false,page2BannerOn:false,layoutPlacements:{'p3-board':{x:8,y:6,width:84,height:88,fontScale:1,visible:true,opacity:100},'p2-parents':{x:78,y:58,width:21,height:37,fontScale:1,visible:true,opacity:100}}};
 await f.repository.upsertRecord('national-cre','broadcast',state);
 let active='B04';const data=()=>({channel:{id:'national-cre',name:'전국크레자랑',dataAdapter:'platform',broadcastProfile:'standard',broadcastTheme:'national-stage'},state,assets:[],revision:1,items:[{id:'test-lot',channelId:'national-cre',name:active,vendorName:'제트크레',status:'live',attributes:{parents:['sire','dam','sibling'].map((role,i)=>({role,name:i===0?'부 이름 예시':i===1?'모 이름 예시':'',media:[{url:'/__photo.svg?'+i}]}))}}]});
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/platform/channels/national-cre/broadcast'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data()));return}
  if(url.pathname==='/api/platform/channels/national-cre/broadcast-pulse'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"revision":1}');return}
  if(url.pathname==='/__photo.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#6a777b"/><circle cx="300" cy="180" r="90" fill="#b7c6ad"/><text x="300" y="325" text-anchor="middle" font-size="30" fill="white">REFERENCE PHOTO</text></svg>');return}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  let content=fs.readFileSync(file);if(url.pathname==='/auction-live.html')content=Buffer.from(content.toString('utf8').replace(/\s*<link[^>]+broadcast-prime\.css[^>]+>/g,'')); // unrelated local experiment is not deployed
  res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(content);
 }catch(e){res.writeHead(500);res.end(e.message)}});await new Promise(resolve=>server.listen(4451,'127.0.0.1',resolve));
 const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[];
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1920,1280]){
   await page.setViewport({width,height:Math.round(width*9/16)});await page.goto(origin+'/auction-live.html?channel=national-cre&page=3',{waitUntil:'networkidle0'});await page.waitForSelector('.vendor-order-part li');
   const m=await page.evaluate(()=>({rows:document.querySelectorAll('.vendor-order-part li').length,current:[...document.querySelectorAll('[aria-current]')].map(e=>e.textContent),overflow:[...document.querySelectorAll('.vendor-order-part li strong')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({text:e.textContent,w:e.clientWidth,s:e.scrollWidth})),font:getComputedStyle(document.querySelector('.vendor-order-part li')).fontSize}));
   assert.equal(m.rows,18);assert.equal(m.current.length,1);assert.equal(m.overflow.length,0,JSON.stringify(m));results.push({page:'P3',width,...m});await page.screenshot({path:path.join(out,'p3-'+width+'.png')});
  }
  await page.setViewport({width:1920,height:1080});await page.goto(origin+'/auction-live.html?channel=national-cre&page=2',{waitUntil:'networkidle0'});await page.waitForSelector('.parent-photos.has-parent-photo');
  assert.equal(await page.$$eval('.parent-photos figure',els=>els.length),3);await page.screenshot({path:path.join(out,'p2-reference.png')});
  await page.waitForFunction(()=>[...document.querySelectorAll('.parent-photos figure')].some(e=>!e.hidden&&e.textContent==='동배'),{timeout:12000});await page.screenshot({path:path.join(out,'p2-sibling.png')});
  const captions=await page.$$eval('.parent-photos figcaption',els=>els.map(e=>e.textContent));results.push({page:'P2',captions});
  await page.setCookie(...Object.entries(owner.jar).map(([name,value])=>({name,value,url:origin})));
  for(const width of [390,320]){
   await page.setViewport({width,height:900});await page.goto(origin+'/vendor-entries.html?'+new URLSearchParams({event:'national-cre',token,section:'entries'}),{waitUntil:'networkidle0'});
   await page.waitForSelector('[data-date="2026-10-14"]');await page.click('[data-date="2026-10-14"]');await page.waitForSelector('#bulk-entry-form');
   await page.evaluate(()=>{const d=document.querySelector('.bulk-details');if(d)d.open=true});
   await page.waitForSelector('[data-bulk-photo="sibling"]');
   const m=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,siblingInputs:document.querySelectorAll('[data-bulk-photo="sibling"]').length,gridColumns:getComputedStyle(document.querySelector('.bulk-photo-grid')).gridTemplateColumns}));
   assert.ok(m.scroll<=width+1,JSON.stringify(m));assert.equal(m.siblingInputs,4);results.push({page:'Vendor',width,...m});await page.screenshot({path:path.join(out,'vendor-'+width+'.png')});
  }
  await page.evaluate(()=>document.documentElement.style.zoom='2');assert.equal(await page.$eval('input[name="sibling-name-0"]',e=>getComputedStyle(e).fontSize),'16px');await page.screenshot({path:path.join(out,'vendor-320-zoom2.png')});
  const operator=f.client();await f.call(operator,'POST','/api/platform/auth/login',{password:f.secret});await page.setCookie(...Object.entries(operator.jar).map(([name,value])=>({name,value,url:origin})));
  await page.setViewport({width:390,height:900});await page.goto(origin+'/auction-control.html?channel=national-cre&page=3&embedded=1&compact=1',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelector('[name="page3VendorOrder"]')?.value.includes('좀비렙타일'));
  assert.equal(await page.$eval('#page3-order-settings',e=>e.hidden),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'settings-390.png')});
  await page.select('[name="page3Content"]','summary');assert.equal(await page.$eval('#page3-order-settings',e=>e.hidden),true);await page.select('[name="page3Content"]','vendor-order');assert.equal(await page.$eval('[name="page3VendorOrder"]',e=>e.value),roster.join('\n'));
  const navigationWarnings=errors.filter(e=>e.includes('ViewTransition opt-in disabled'));assert.deepEqual(errors.filter(e=>!e.includes('ViewTransition opt-in disabled')),[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({results,navigationWarnings},null,2));console.log(JSON.stringify({out,results,navigationWarnings}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));f.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

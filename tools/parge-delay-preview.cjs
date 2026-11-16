'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),puppeteer=require('puppeteer');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core');
const {createDeliveryScheduleService,KEY}=require('../delivery-schedule-service');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-delay-visual-')),repo=new SQLitePlatformRepository({dbPath:path.join(dir,'test.sqlite'),startWorker:false,adminSecret:'fixture'}),date=Date.parse('2026-11-17T00:00:00Z');
 const from='national-cre-20261116',to='national-cre-20261118';
 await repo.saveCatalog([from,to].map((id,i)=>normalizeChannel({id,name:'전국크레자랑',status:'active',nationalRound:{parentId:'national-cre',date:i?'2026-11-18':'2026-11-16'},shippingDefaults:{enabledCarriers:['parge'],pickupLocations:['현장']}})));
 await repo.upsertRows([{key:KEY,value:JSON.stringify({version:1,sources:{parge:{checkedAt:new Date(date).toISOString(),revision:'fixture',partners:[{name:'크레오 대구본점',region:'경상권'},{name:'테스트 거점',region:'강원도'}],schedules:[{partnerName:'크레오 대구본점',collectDayLabel:'금요일'}],regionDays:{gangwon:[0]}}}})},{key:'shipping_rate_parge',value:JSON.stringify({data:{강원도:[{shop:'테스트 거점',cost:40000}]}})}]);
 await repo.upsertRecord(from,'vendor',{id:'v',name:'가상 업체',phone:'01000000001',paymentMethods:['bank_transfer'],bankName:'가상은행',bankAccount:'000',bankHolder:'가상'});
 await repo.upsertRecord(from,'item',{id:'a',vendorId:'v',name:'A01',status:'sold',soldPrice:100000,winnerName:'가상구매자',winnerPhone:'01000000002'});
 await repo.upsertRecord(from,'shipment',{id:'s',itemId:'a',vendorId:'v',recipientName:'가상구매자',recipientPhone:'01000000002',destinationType:'parge',destinationId:'parge',method:'delivery',carrier:'파르게',pargeRegion:'강원도',pargeShop:'테스트 거점',address:'강원도 테스트 거점',paymentMethod:'bank_transfer',paymentStatus:'pending',cost:40000,buyerSubmittedAt:'2026-11-16T14:00:00Z'});
 const service=createDeliveryScheduleService({repository:repo,now:()=>date,logger:{warn(){}}});
 const api=createPlatformApi({repository:repo,deliverySchedules:service,bookingNow:()=>date,adminSessionSecret:'fixture'});
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(await api.handle(req,res,url))return;const filename=path.join(__dirname,'../public',url.pathname);try{const content=fs.readFileSync(filename);res.setHeader('Content-Type',filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.js')?'text/javascript; charset=utf-8':filename.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream');res.end(content);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const link=await fetch(origin+'/api/platform/channels/'+from+'/buyer-shipping-link',{method:'POST',headers:{'x-creo-admin':'fixture','Content-Type':'application/json'},body:JSON.stringify({itemId:'a'})}).then(r=>r.json());
 const browser=await puppeteer.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const out=path.resolve(process.argv[2]||path.join(os.tmpdir(),'creo-delay-preview'));fs.mkdirSync(out,{recursive:true});
 try{
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.goto(origin+'/buyer-shipping.html?code='+link.code);await page.waitForSelector('dialog[open]');
  for(const width of [390,320,1024]){await page.setViewport({width,height:844});await page.screenshot({path:path.join(out,'notice-'+width+'.png'),fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('horizontal overflow '+width);}
  await page.click('.delivery-notice-confirm');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await page.reload();await page.waitForSelector('#app:not([hidden])');if(await page.$('dialog[open]'))throw Error('Acknowledged dialog replayed');
  await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'acknowledged-390.png'),fullPage:true});
  const persistent=await page.$eval('.buyer-delivery-notice',el=>!el.hidden);if(!persistent)throw Error('Persistent notice missing');
  console.log(JSON.stringify({out,errors,persistent,acknowledged:true}));if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();server.close();await service.stop();repo.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
// Local fixtures only: no production records, booking, payment, or messages.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../public'),out=path.resolve('outputs/dodosi-navigation');fs.mkdirSync(out,{recursive:true});
const channel={id:'national-cre-20261123',name:'11월 23일 부울경',status:'active',dataAdapter:'platform',features:{shipping:true,auction:true},nationalRound:{parentId:'national-cre',date:'2026-11-23'},shippingDefaults:{enabledCarriers:['dodosi']}};
const catalog={channels:[channel],activeChannelId:channel.id,rounds:[{channelId:channel.id,name:channel.name,date:'2026-11-23',familyId:'national-cre',phase:'finished',status:'active'}]};
const dispatch={sender:{name:'테스트 발송인',phone:'01000000000'},groups:[],excluded:[],prepared:[],originName:'크레용(대구)',checkedAt:new Date().toISOString(),fresh:true,discountBp:5000};
const mutations=[];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){if(req.method!=='GET'){mutations.push(req.url);res.writeHead(405);return res.end();}res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(u.pathname.endsWith('admin-check')?{authenticated:true}:u.pathname.endsWith('operation-rounds')?catalog:u.pathname.endsWith('dodosi-dispatch')?dispatch:{channels:[channel]}));}
 const file=path.resolve(root,'.'+(u.pathname==='/main'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');let content=fs.readFileSync(file,'utf8');
 if(file.endsWith('shipping.html')){
  // Render the real toolbar and page styles, without unrelated shipping editor startup.
  const head=content.slice(0,content.indexOf('<body')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const start=content.indexOf('<div id="current-company-bar"'),end=content.indexOf('<section id="closing-tools"',start);
  content=head+'<body><main style="padding:16px">'+content.slice(start,end)+'</main><script>document.getElementById("current-company-name").textContent="전체 업체";const a=document.getElementById("shipping-dodosi-link");a.hidden=false;a.href="/dodosi-dispatch.html?channel='+channel.id+'";document.getElementById("shipping-parge-link").style.display="none";</script></body></html>';
 }
 res.end(content);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());
  for(const width of [1440,390,320]){
   await page.setViewport({width,height:900});await page.goto(base+'/main?channel='+channel.id);
   await page.waitForSelector('#quick-dodosi:not([hidden])');
   assert.equal(await page.$eval('#quick-dodosi',a=>a.getAttribute('href')),'/dodosi-dispatch.html?channel='+channel.id);
   assert.equal(await page.$eval('#quick-dodosi strong',a=>a.textContent),'도도시 배송 입력');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(out,'home-'+width+'.png'),fullPage:true});
   await Promise.all([page.waitForNavigation(),page.click('#quick-dodosi')]);
   assert.equal(page.url(),base+'/dodosi-dispatch.html?channel='+channel.id);
   await page.setViewport({width,height:900});await page.goto(base+'/main?channel='+channel.id+'&view=shipping');await page.waitForSelector('[data-work-key="dodosi"]');
   const iframe=await page.waitForSelector('#operator-frame'),frame=await iframe.contentFrame();await frame.waitForSelector('#shipping-dodosi-link');await frame.waitForSelector('.operator-embedded');
   assert.equal(await frame.$eval('#shipping-dodosi-link',a=>a.getBoundingClientRect().height>=44),true);
   assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(out,'shipping-'+width+'.png'),fullPage:true});
   await Promise.all([page.waitForNavigation(),frame.click('#shipping-dodosi-link')]);
   await page.waitForFunction(()=>location.pathname==='/dodosi-dispatch.html');
   assert.equal(page.url(),base+'/dodosi-dispatch.html?channel='+channel.id);try{await page.waitForFunction(()=>document.getElementById('app').hidden===false&&document.getElementById('count').textContent.includes('0건'),{timeout:5000});}catch(e){console.log(await page.evaluate(()=>({error:document.getElementById('error')?.textContent,login:document.getElementById('login')?.hidden,count:document.getElementById('count')?.textContent})),errors);throw e;}
   assert.equal(await page.evaluate(()=>window===window.top),true);await page.screenshot({path:path.join(out,'dispatch-'+width+'.png'),fullPage:true});
   await page.goto(base+'/main?channel='+channel.id+'&view=shipping');await page.waitForSelector('[data-work-key="dodosi"]');
   if(width<760)await Promise.all([page.waitForNavigation(),page.select('#operator-task-select','dodosi')]);else await Promise.all([page.waitForNavigation(),page.click('[data-work-key="dodosi"]')]);
   await page.waitForFunction(()=>location.pathname==='/dodosi-dispatch.html');
   assert.equal(page.url(),base+'/dodosi-dispatch.html?channel='+channel.id);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);console.log(JSON.stringify({passed:true,widths:[1440,390,320],checks:['toolbar and menu','round preserved','top-level extension page','no overflow','no mutations'],screenshots:out}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

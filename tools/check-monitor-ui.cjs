'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const release={schema:1,version:'1.0.0',platform:'windows-x64',dataSchema:1,fileId:'11111111-1111-4111-8111-111111111111',size:96000000,sha256:'a'.repeat(64),notes:'설치와 설정 이전\n프린터 연결 확인'};
async function main(){
 let authorized=true,empty=false,failed=false;let browser;
 const output=path.resolve(__dirname,'../outputs/monitor-release-review');fs.mkdirSync(output,{recursive:true});
 const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://local.invalid').pathname;
  const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(route==='/api/platform/auth/login'){authorized=true;return json(200,{authenticated:true});}
  if(route.startsWith('/api/desktop-releases/')||route==='/api/operator-drive/entries'){
   if(!authorized)return json(401,{error:'관리자 로그인이 필요합니다.'});
   if(failed)return json(503,{error:'버전을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'});
   if(route==='/api/desktop-releases/stable')return json(200,{release:empty?null:release});
   if(route==='/api/operator-drive/entries')return json(200,{entries:[]});
  }
  const root=path.resolve(__dirname,'../public'),file=path.resolve(root,'.'+route);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  browser=await require('puppeteer').launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,720,390,320]){
   await page.setViewport({width,height:1000});await page.goto(base+'/monitor-download.html');await page.waitForSelector('#release:not([hidden])');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
   await page.screenshot({path:path.join(output,`width-${width}.png`),fullPage:true});
  }
  await page.focus('#download');assert.equal(await page.$eval('#download',e=>getComputedStyle(e).outlineStyle),'solid');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  empty=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('아직 등록된'));assert.ok(await page.$eval('#publisher',e=>!e.hidden));
  await page.screenshot({path:path.join(output,'empty.png'),fullPage:true});
  empty=false;failed=true;await page.reload();await page.waitForSelector('#error:not([hidden])');await page.screenshot({path:path.join(output,'error.png'),fullPage:true});
  failed=false;authorized=false;await page.reload();await page.waitForSelector('#login:not([hidden])');await page.type('#password','fixture-only');await page.click('#login button');await page.waitForSelector('#release:not([hidden])');
  assert.deepEqual(errors,[]);
  const ratios=await page.evaluate(()=>{
   function luminance(hex){const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
   return [['475467','f7f8fa'],['1f2937','ffffff'],['ffffff','173e8f'],['9b1c1c','fff0ef']].map(([a,b])=>{const l1=luminance(a),l2=luminance(b);return {colors:[a,b],ratio:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)};});
  });assert.ok(ratios.every(v=>v.ratio>=4.5));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({widths:[1440,720,390,320],states:['stable','empty','error','login'],keyboard:true,pageErrors:errors,contrast:ratios},null,2));
  console.log(JSON.stringify({ok:true,widths:4,states:4,pageErrors:0,contrast:ratios}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

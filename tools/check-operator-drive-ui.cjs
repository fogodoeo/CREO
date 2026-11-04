'use strict';
// Isolated local data and simulated object storage; never calls production.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{OperatorDrive}=require('../operator-drive'),{createDriveApi}=require('../operator-drive-api');
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'creo-drive-ui-')),repo=new SQLitePlatformRepository({dataDir:temp,startWorker:false});
 const uploads=new Map(),objects=new Map();let base;
 const storage={async begin(id){uploads.set(id,new Map());return id;},async part(id,u,n,b){uploads.get(id).set(n,Buffer.from(b));},async head(id){return objects.get(id)?.length??null;},async complete(id){objects.set(id,Buffer.concat([...uploads.get(id)].sort((a,b)=>a[0]-b[0]).map(p=>p[1])));},async abort(id){uploads.delete(id);},async remove(id){objects.delete(id);},async url(e){return base+'/__object/'+e.id;}};
 const drive=new OperatorDrive({repository:repo,storage});let handler;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,base);if(await handler(req,res,url))return;
  if(url.pathname==='/api/platform/admin-check'){res.setHeader('Content-Type','application/json');res.end('{"authenticated":true}');return;}
  if(url.pathname.startsWith('/__object/')){res.end(objects.get(url.pathname.split('/').pop()));return;}
  const root=path.resolve(__dirname,'../public'),file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500);res.end('fixture failure');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;handler=createDriveApi({drive,isAdmin:()=>true,origin:base});
 const output=path.resolve(__dirname,'../outputs/operator-drive');fs.mkdirSync(output,{recursive:true});
 let browser;
 try{
  browser=await require('puppeteer').launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto(base+'/operator-drive.html');await page.waitForSelector('#drive:not([hidden]) #empty:not([hidden])');
  async function click(selector){await page.waitForSelector(selector);await page.click(selector);}
  await click('#new-folder');await page.type('#entry-name','쭌이네 방송 자료');await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open&&document.querySelectorAll('.file-row').length===1);
  await click('[data-open]');await page.waitForFunction(()=>document.querySelector('#empty').hidden===false);
  const file=path.join(temp,'샘플_영상자료.txt');fs.writeFileSync(file,Buffer.alloc(9*1024*1024,65));
  await (await page.$('#file-input')).uploadFile(file);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('1개 파일을 저장'),{timeout:30000});
  assert.equal(objects.size,1);assert.equal([...objects.values()][0].length,9*1024*1024);
  await click('[data-select]');await click('#rename');await page.$eval('#entry-name',e=>{e.value='';});await page.type('#entry-name','방송 자료_최종.txt');await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open&&document.querySelector('.name-button').textContent==='방송 자료_최종.txt');
  await click('[data-select]');await click('#move');await page.select('#destination','');await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open&&document.querySelectorAll('.file-row').length===0);
  await click('[data-folder=""]');await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===2);
  const item=(await drive.list()).entries.find(e=>e.kind==='file');
  const href=await page.$eval('a[download].row-action',a=>a.href);assert.equal((await(await fetch(href)).arrayBuffer()).byteLength,9*1024*1024);
  await click(`[data-select="${item.id}"]`);await click('#delete');await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open&&document.querySelectorAll('.file-row').length===1);
  await click('#trash');await click(`[data-select="${item.id}"]`);await click('#restore');await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open&&document.querySelectorAll('.file-row').length===0);
  await click('#all');await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.file-row').length===2);assert.equal((await drive.list()).entries.find(e=>e.id===item.id).parent,null);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  for(const width of [720,390,320]){await page.setViewport({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);await page.screenshot({path:path.join(output,`width-${width}.png`),fullPage:true});}
  await click(`[data-select="${item.id}"]`);await click('#delete');await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open);await click('#trash');await click(`[data-select="${item.id}"]`);await click('#purge');await page.screenshot({path:path.join(output,'delete-confirmation.png'),fullPage:true});await click('#dialog-submit');await page.waitForFunction(()=>!document.querySelector('#edit-dialog').open&&document.querySelectorAll('.file-row').length===0);assert.equal(objects.size,0);
  await click('#all');await click('#new-folder');await page.keyboard.press('Escape');assert.equal(await page.$eval('#edit-dialog',e=>e.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'new-folder');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['create folder','9MB chunked upload','download byte count','rename','move','trash','restore','reload','permanent deletion','Escape and focus return','no horizontal overflow at 1440/720/390/320','no browser errors'],screenshots:output}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));repo.db.close();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

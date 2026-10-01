'use strict';
// Local-only real API preview. All numbers and bank records are synthetic; SMS stays in memory.
const {createFixture}=require('./vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
async function main(){
 const f=await createFixture({origin:'http://127.0.0.1:4336'});
 const channels=['creyon-demo','another-demo'].map((id,i)=>normalizeChannel({id,name:i?'다른 방송':'크레용 1001',status:'active',dataAdapter:'platform',createdAt:i?'2026-09-01':'2026-10-01'}));
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,...channels]);
 for(const c of channels){await f.repository.upsertRecord(c.id,'vendor',{id:'demo-vendor',name:'테스트 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'000000',bankHolder:'가상업체',paymentMethods:['bank_transfer','card'],active:true});await f.repository.upsertRecord(c.id,'setting',{id:'entry-policy',open:true,revision:1});}
 const owner=await f.login('01000000001'),empty=await f.login('01000000009');f.advance(61000);
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,f.origin);
  if(['/__preview/owner','/__preview/empty'].includes(url.pathname)){const c=url.pathname.endsWith('owner')?owner:empty;res.writeHead(303,{Location:'/vendor-access.html','Set-Cookie':Object.entries(c.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname==='/__preview/sms'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:f.sms.at(-1)?.fallbackText.match(/\d{6}/)?.[0]}));return;}
  if(url.pathname==='/api/platform/vendor-access/session'){const end=res.end.bind(res);res.end=body=>{const data=JSON.parse(body);data.kakaoAvailable=true;end(JSON.stringify(data));};}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(4336,'127.0.0.1',()=>console.log('Local channel login preview: '+f.origin+'/vendor-access.html'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

'use strict';
// Loopback-only, temporary SQLite and in-memory images. No production data or SMS.
const {createFixture}=require('./vendor-portal-preview.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
async function main(){
 const logos=new Map(),origin='http://127.0.0.1:4357';
 const f=await createFixture({origin,apiOptions:{vendorLogoStorage:{put:async(_scope,name,bytes)=>{logos.set(name,bytes);return {url:'/__preview/logo/'+name};}}}});
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 await f.repository.upsertRecord('national-cre','vendor',{id:'preview-vendor',name:'로고 테스트 업체',active:true,region:'서울',phone:'01000000001',bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트',paymentMethods:['bank_transfer','card']});
 const link=await f.call(f.client(),'POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:'preview-vendor'},{'x-creo-admin':f.secret});
 const code=new URL(link.json().url,origin).pathname.split('/').pop(),root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/__preview/logo/')){const bytes=logos.get(url.pathname.split('/').pop());res.writeHead(bytes?200:404,{'Content-Type':'image/webp'});res.end(bytes||'');return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
 server.listen(4357,'127.0.0.1',()=>console.log(origin+'/vendor-entries.html?event=national-cre&section=profile&code='+code));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

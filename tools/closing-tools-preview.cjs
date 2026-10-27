'use strict';
// Isolated synthetic data; no production credentials or real message transport.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture,item}=require('./national-settlement-fixture.cjs');
async function main(){
 const origin='http://127.0.0.1:4376',f=await fixture({origin});f.advance(40*86400000);
 f.provider.status=()=>({smsConfigured:true,testMode:false});
 await f.request('POST','/buyer-shipping',f.saveBody,false);
 await f.repository.upsertRecord('national-cre','item',item('c04','v2',{winnerName:'수령지 미입력 테스트',winnerPhone:'01000000004'}));
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/'){res.writeHead(302,{Location:'/shipping.html?channel=national-cre'});res.end();return;}
  if(url.pathname.startsWith('/api/')){req.headers['x-creo-admin']=f.secret;if(await f.api.handle(req,res,url))return;}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(4376,'127.0.0.1',()=>console.log(origin));
 const close=()=>server.close(()=>{f.close();process.exit(0);});process.once('SIGINT',close);process.once('SIGTERM',close);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture,ROOT,DATE,TARGET}=require('./national-intake-fixture.cjs');
async function main(){
 const port=Number(process.env.INTAKE_PREVIEW_PORT||4401),origin='http://127.0.0.1:'+port,f=await fixture({origin});
 await f.repository.upsertRecord(ROOT,'vendor',{id:'eligible',name:'가상 접수 전 업체',broadcastRegion:'전라·충청'});
 const prepared=await f.prepare();if(prepared.status!==200)throw Error(prepared.body);
 await f.request('POST','/national-rounds',{action:'activate',date:DATE,expectedActiveChannelId:ROOT});
 const link=(await f.request('POST','/channels/'+TARGET+'/vendor-checkout-link',{vendorId:f.vendorId})).json();
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname==='/__audit'){
   const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320));
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><title>격리 출품 검증</title><style>body{margin:0;background:#e7ebf0}iframe{display:block;width:'+width+'px;height:900px;border:0;margin:16px auto;background:white}</style><iframe title="출품 검토" src="/main?channel='+TARGET+'&view=intake"></iframe></html>');return;
  }
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({workspace:origin+'/channel-workspace.html?channel='+TARGET,review:origin+'/vendor-entry-review.html?channel='+TARGET,vendor:origin+'/vendor-checkout.html?'+new URLSearchParams({code:link.code,event:TARGET})})));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

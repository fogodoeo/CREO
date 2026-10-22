'use strict';
// Synthetic local records only. All notification delivery stays inside the fixture.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture,item}=require('./national-settlement-fixture.cjs');
(async()=>{
 const origin='http://127.0.0.1:4371',f=await fixture({origin});
 const archive=(await f.request('POST','/channels/national-cre/archives',{title:'10/14 서울·인천'})).json().archive.id;
 await f.request('POST','/channels/national-cre/archives/'+archive+'/close-round');
 for(const id of ['v1','v2'])await f.repository.upsertRecord('national-cre','item',item('new-'+id,id,{attributes:{broadcastDate:'2026-10-19'}}));
 await f.repository.upsertRows([{key:'creo_organizer_shipping_ledger::national-cre',value:JSON.stringify([
  {id:'sample-confirmed',vendorId:'v1',amount:10000,status:'confirmed',paidOn:'2026-10-15',memo:'가상 기존 입금'},
  {id:'sample-pending',vendorId:'v2',amount:20000,status:'pending',reportedAt:'2026-10-20T03:00:00Z'}
 ])},{key:'creo_organizer_shipping_bank::national-cre',value:JSON.stringify({bankName:'가상은행',bankHolder:'가상 주관사',bankAccount:'000-000-000',notificationPhone:'01000000009'})}]);
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(4371,'127.0.0.1',()=>console.log(origin+'/organizer-shipping.html?channel=national-cre'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
// Loopback-only fake ledger and fake notification provider; no production access.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./national-settlement-fixture.cjs');
async function main(){
 const port=8183,origin='http://127.0.0.1:'+port,f=await fixture({origin});f.advance(30*86400000);
 for(const row of (await f.repository.listRecords('national-cre','item')).filter(i=>i.vendorId==='v1'))await f.repository.upsertRecord('national-cre','shipment',{id:'fake-'+row.id,itemId:row.id,vendorId:'v1',method:'pickup',address:'가상 직수령',paymentStatus:'paid'});
 const route='/channels/national-cre/organizer-shipping',saved=await f.request('PUT',route,{bankName:'가상은행',bankAccount:'000-000',bankHolder:'가상 주관사',notificationPhone:'01000000009'});
 const vendor=(await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:'v1'})).json();
 const sent=await f.request('POST','/vendor-checkout/report-shipping',{code:vendor.code,requestId:'preview-report',expectedAmount:40000,expectedBankUpdatedAt:saved.json().bank.updatedAt},false);if(sent.status!==200)throw Error(sent.body);
 const notification=(await f.repository.listRecords('national-cre','notification'))[0],url=new URL(notification.fallbackText.split('\n')[1]),destination=url.pathname+url.hash;
 const root=path.resolve(__dirname,'../public'),json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,origin);
  if(u.pathname==='/'){res.writeHead(303,{Location:destination});res.end();return;}
  if(u.pathname==='/__audit'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<html lang="ko"><title>입금신고 링크 320px</title><body style="margin:0;background:#ddd"><iframe title="입금 확인" src="/" style="width:320px;height:100dvh;border:0;display:block"></iframe></body></html>');return;}
  if(u.pathname==='/__ledger')return json(res,200,JSON.parse((await f.repository.getRowsByKeys(['creo_organizer_shipping_ledger::national-cre']))[0].value).map(r=>({id:r.id,status:r.status,amount:r.amount})));
  if(u.pathname.startsWith('/api/')&&await f.api.handle(req,res,u))return;
  const requested=/^\/o\/[A-Za-z0-9_-]{24}$/.test(u.pathname)?'/organizer-shipping.html':u.pathname,file=path.resolve(root,'.'+requested);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{});
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,500,{error:e.message})}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({preview:origin+'/',narrow:origin+'/__audit',notification:notification.fallbackText.replace(url.origin,origin)})));
 process.once('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});

'use strict';
// Isolated synthetic records and fake messages. No production data or network provider.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./national-settlement-fixture.cjs');
async function main(){
 const port=Number(process.env.CHECKOUT_CHANGE_PREVIEW_PORT)||4423,origin='http://127.0.0.1:'+port,f=await fixture({origin});
 f.advance(30*86400000);
 for(const id of ['v1','v2']){const vendor=await f.repository.getRecord('national-cre','vendor',id);await f.repository.upsertRecord('national-cre','vendor',{...vendor,paymentMethods:['bank_transfer','card']});}
 const saved=await f.request('POST','/buyer-shipping',f.saveBody,false);if(saved.status!==200)throw Error(saved.body);
 const requested=await f.request('POST','/buyer-shipping/change-request',{...f.saveBody,requestId:'preview-change',destinationId:'pickup-1',pargeRegion:'',pargeShop:'',payments:[{vendorKey:'v1',method:'card'},{vendorKey:'v2',method:'bank_transfer'}]},false);if(requested.status!==200)throw Error(requested.body);
 const original=(await f.repository.listRecords('national-cre','checkoutchange'))[0];
 await f.repository.upsertRecord('national-cre','checkoutchange',{...original,id:'completed-example',state:'rejected',buyerName:'가상 처리완료',reason:'기존 수령 방법으로 진행해 주세요.',reviewedAt:new Date().toISOString()});
 const root=path.resolve(__dirname,'../public'),calls=[];let loseReview=0,failRead=0;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__control'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const c=JSON.parse(body);loseReview=Math.min(2,Math.max(0,Number(c.loseReview)||0));failRead=Math.min(2,Math.max(0,Number(c.failRead)||0));res.writeHead(200);res.end('{}');return;}
  if(url.pathname==='/__state'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({calls,records:(await f.repository.listRecords('national-cre','checkoutchange')).map(r=>({id:r.id,state:r.state})),notifications:(await f.repository.listRecords('national-cre','notification')).map(n=>n.templateKey)}));return;}
  if(url.pathname==='/__audit'){const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<html lang="ko"><title>변경 승인 ${width}px 검증</title><body style="margin:0"><iframe title="변경 승인 검증" style="width:${width}px;height:900px;border:0" src="/checkout-changes.html?channel=national-cre"></iframe></body></html>`);return;}
  req.headers['x-creo-admin']=f.secret;
  if(url.pathname.startsWith('/api/')){
   if(url.pathname.includes('/checkout-changes'))calls.push({method:req.method,path:url.pathname});
   if(failRead&&req.method==='GET'&&url.pathname.endsWith('/checkout-changes')){failRead--;res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"가상 읽기 오류"}');return;}
   if(loseReview&&req.method==='POST'&&url.pathname.includes('/checkout-changes/')){loseReview--;const capture={writeHead(status){this.status=status},end(body){this.body=body}};await f.api.handle(req,capture,url);res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"가상 응답 유실"}');return;}
   if(await f.api.handle(req,res,url))return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/checkout-changes.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview failure');console.error(e.message)}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({admin:origin+'/checkout-changes.html?channel=national-cre',buyer:origin+'/buyer-shipping.html?code='+f.code})));
 const close=()=>server.close(()=>{f.close();process.exit(0)});process.once('SIGINT',close);process.once('SIGTERM',close);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

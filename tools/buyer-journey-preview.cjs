'use strict';
// Isolated SQLite and fake notifications. All contacts, shops, and balances are synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture,day}=require('./national-settlement-fixture.cjs');
async function main(){
 const port=Number(process.env.BUYER_PREVIEW_PORT)||4398,origin='http://127.0.0.1:'+port,f=await fixture({origin});f.advance(30*86400000);
 const second=await f.repository.getRecord('national-cre','vendor','v2');
 await f.repository.upsertRecord('national-cre','vendor',{...second,paymentMethods:['bank_transfer','card']});
 const channels=await f.repository.getCatalog();
 await f.repository.saveCatalog(channels.channels.map(c=>c.id==='national-cre'?{...c,shippingSupport:{enabled:false},shippingDefaults:{...c.shippingDefaults,deliverySchedule:{enabled:true,auctionDate:day}}}:c));
 await f.repository.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{수도권:[{shop:'가상 정거샵',cost:19000}],경기:[{shop:'가상 경기점',cost:15000}]}})}]);
 await f.repository.upsertRows([{key:'shipping_rate_dodosi',value:JSON.stringify({items:[{route:'전북',region:'전북',shop:'가상 전주점',price:27000}]})}]);
 const root=path.resolve(__dirname,'../public');let failSave=0,failOperatorSave=false;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/'){res.writeHead(302,{Location:'/buyer-shipping.html?code='+f.code});res.end();return;}
  if(url.pathname==='/__preview/fail-save'){failSave=Math.max(1,Math.min(3,Number(url.searchParams.get('count'))||3));res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end('Isolated buyer save outage: '+failSave+' attempts.');return;}
  if(url.pathname==='/__preview/fail-operator-save'){failOperatorSave=true;res.writeHead(200);res.end('Next isolated operator save fails once.');return;}
  if(url.pathname==='/__preview/state'){
   const result=await f.read();res.writeHead(result.status,{'Content-Type':'application/json'});res.end(result.body);return;
  }
  if(url.pathname==='/__audit'){
   const width=Math.max(320,Math.min(1600,Number(url.searchParams.get('width'))||390)),page=url.searchParams.get('page')||'/buyer-shipping.html?code='+f.code;
   if(!page.startsWith('/')||page.startsWith('//')){res.writeHead(400);res.end();return;}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<html lang="ko"><title>${width}px buyer audit</title><body style="margin:0"><iframe title="${width}px buyer audit" style="width:${width}px;height:844px;border:0" src="${page.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"></iframe></body></html>`);return;
  }
  if(failSave>0&&req.method==='POST'&&url.pathname==='/api/platform/buyer-shipping'){failSave--;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'연결을 확인한 뒤 다시 저장해 주세요.'}));return;}
  if(failOperatorSave&&req.method==='POST'&&url.pathname.endsWith('/buyer-shipping-editor')){failOperatorSave=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'테스트용 저장 실패입니다. 입력은 유지됩니다. 다시 저장해 주세요.'}));return;}
  req.headers['x-creo-admin']=f.secret;
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':/^\/w\/(?:op|ds)_[A-Za-z0-9_-]{16}$/.test(url.pathname)?'/checkout-changes.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500,{'Content-Type':'text/plain'});res.end('Isolated preview error');console.error(error.message)}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({buyer:origin+'/buyer-shipping.html?code='+f.code,admin:origin+'/main?channel=national-cre&view=shipping'})));
 const close=()=>server.close(()=>{f.close();process.exit(0)});process.once('SIGINT',close);process.once('SIGTERM',close);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});

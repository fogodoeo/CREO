'use strict';
// Synthetic accounts, isolated SQLite, fake notifications. Never proxies production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{fixture,day}=require('./national-settlement-fixture.cjs');
async function main(){
 const port=Number(process.env.VENDOR_PAYMENT_PREVIEW_PORT||4421),origin='http://127.0.0.1:'+port,f=await fixture({origin});f.advance(30*86400000);
 const vendor=await f.repository.getRecord('national-cre','vendor','v2');await f.repository.upsertRecord('national-cre','vendor',{...vendor,paymentMethods:['bank_transfer','card']});
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>c.id==='national-cre'?{...c,shippingSupport:{enabled:false},shippingDefaults:{...c.shippingDefaults,deliverySchedule:{enabled:true,auctionDate:day}}}:c));
 const selection={...f.saveBody,payments:[{vendorKey:'v1',method:'bank_transfer'},{vendorKey:'v2',method:'card'}]};const saved=await f.request('POST','/buyer-shipping',selection,false);if(saved.status!==200)throw Error(saved.body);
 const links={};for(const id of ['v1','v2']){const result=await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:id});if(result.status!==200)throw Error(result.body);links[id]=result.json().code;}
 const root=path.resolve(__dirname,'../public'),controls={failCard:0,loseCard:0,failConfirm:0,loseConfirm:0},calls=[];
 const read=req=>new Promise((resolve,reject)=>{let body='';req.on('data',bytes=>body+=bytes);req.on('end',()=>{try{resolve(JSON.parse(body||'{}'))}catch(e){reject(e)}});req.on('error',reject);});
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname==='/__control'&&req.method==='POST'){const body=await read(req);for(const key of Object.keys(controls))if(key in body)controls[key]=Math.max(0,Math.min(5,Number(body[key])||0));return json(res,200,controls);}
  if(url.pathname==='/__state'){const result=await f.read();return json(res,200,{calls,notifications:f.sms.length,buyer:result.json(),controls});}
  if(url.pathname==='/__audit'){const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320)),page=url.searchParams.get('page')||'/vendor-checkout.html?code='+links.v2;if(!page.startsWith('/')||page.startsWith('//'))return json(res,400,{});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<html lang="ko"><title>결제 흐름 ${width}px</title><body style="margin:0;background:#ddd"><iframe title="결제 흐름" style="width:${width}px;height:760px;border:0" src="${page.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"></iframe></body></html>`);return;}
  if(req.method==='POST'&&['/api/platform/vendor-checkout/card-link','/api/platform/vendor-checkout/confirm-payment'].includes(url.pathname)){const body=await read(req),kind=url.pathname.endsWith('card-link')?'Card':'Confirm';calls.push({path:url.pathname,body});if(controls['fail'+kind]>0){controls['fail'+kind]--;return json(res,503,{error:'격리 검증: 연결을 확인한 뒤 다시 시도해 주세요.'});}const response=await f.request('POST',url.pathname.replace('/api/platform',''),body,false);if(controls['lose'+kind]>0&&response.status===200){controls['lose'+kind]--;return json(res,503,{error:'격리 검증: 응답을 받지 못했어요.'});}res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(response.body);return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{});res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,500,{error:'Isolated preview error: '+e.message})}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({buyer:origin+'/buyer-shipping.html?code='+f.code,vendorA:origin+'/vendor-checkout.html?code='+links.v1,vendorB:origin+'/vendor-checkout.html?code='+links.v2,narrow:origin+'/__audit?width=320'})));process.once('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

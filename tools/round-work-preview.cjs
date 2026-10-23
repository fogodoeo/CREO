'use strict';
// Isolated fake people, accounts and notifications. Loopback only; no production access.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs'),{createVendorDirectory}=require('../vendor-directory'),{normalizeChannel}=require('../platform-core');
async function main(){
 const origin='http://127.0.0.1:8181',f=await createFixture({origin});f.advance(30*86400000);
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const owner=await f.login('01000000001'),id=(await f.post(owner,'register',{name:'가상 전라 업체',region:'전라·충청',phone:'01000000001'})).json().id;
 const directory=createVendorDirectory(f.repository),vendor=await directory.find('national-cre',id);
 await directory.update('national-cre',{...vendor,bankName:'가상은행',bankAccount:'000-000',bankHolder:'가상 업체'},vendor.directoryRevision);
 const profile=await directory.profileFor('national-cre',id),past='national-cre-20261021',future='national-cre-20261026';
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,...[[past,'2026-10-21','전라·충청','active'],[future,'2026-10-26','대구·경북','draft']].map(([id,date,name,status])=>normalizeChannel({id,name:'전국크레자랑 '+name+'편',status,dataAdapter:'platform',nationalRound:{parentId:'national-cre',date},shippingDefaults:{pickupLocations:['가상 직수령']},vendorSettlement:{enabled:true,entryFee:10000,ratePercent:10}}))]);
 await f.repository.setActiveChannel(past);const member=await directory.attach(profile.id,past);
 for(let n=1;n<=2;n++){
  await f.repository.upsertRecord(past,'item',{id:'item-'+n,name:'A0'+n,lotNumber:n,status:'sold',vendorId:member.vendorId,soldPrice:100000,winnerName:'가상 낙찰자 '+n,winnerPhone:'0100000000'+(n+2),attributes:{broadcastDate:'2026-10-21'}});
  const link=await f.call(f.client(),'POST','/api/platform/channels/'+past+'/buyer-shipping-link',{itemId:'item-'+n},{'x-creo-admin':f.secret});if(link.status!==200)throw Error(link.body);
  const saved=await f.call(f.client(),'POST','/api/platform/buyer-shipping',{code:link.json().code,requestId:'fake-buyer-'+n,destinationId:'pickup-1',payments:[{vendorKey:member.vendorId,method:'bank_transfer'}]});if(saved.status!==200)throw Error(saved.body);
  const row=(await f.repository.listRecords(past,'shipment')).find(s=>s.itemId==='item-'+n);await f.repository.upsertRecord(past,'shipment',{...row,paymentStatus:n===1?'paid':'bank_transfer_reported',paymentConfirmedAmount:n===1?100000:0});
 }
 await f.repository.upsertRows([{key:'creo_organizer_shipping_bank::'+past,value:JSON.stringify({bankName:'가상은행',bankAccount:'000-000-000',bankHolder:'가상 주관사',notificationPhone:'01000000009',updatedAt:'2026-10-23T00:00:00Z'})}]);
 const root=path.resolve(__dirname,'../public');let failures=0;
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname==='/__owner'){res.writeHead(303,{Location:'/vendor-access.html?company='+id,'Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname==='/__fail'&&req.method==='POST'){failures=2;return json(res,200,{ok:true});}
  if(url.pathname==='/__complete'&&req.method==='POST'){const row=(await f.repository.listRecords(past,'shipment')).find(s=>s.itemId==='item-2');await f.repository.upsertRecord(past,'shipment',{...row,paymentStatus:'paid',paymentConfirmedAmount:100000});return json(res,200,{ok:true});}
  if(url.pathname==='/__audit'){const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320)),page=url.searchParams.get('page')||'/__owner';if(!page.startsWith('/')||page.startsWith('//'))return json(res,400,{});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<html lang="ko"><title>회차 업무 ${width}px</title><body style="margin:0;background:#ddd"><iframe title="회차 업무" style="width:${width}px;height:100dvh;border:0;display:block" src="${page.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"></iframe></body></html>`);return;}
  if(failures&&/work-summary|vendor-access\/tasks/.test(url.pathname)){failures--;return json(res,503,{error:'격리된 연결 오류'});}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{});
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,500,{error:'Isolated preview: '+e.message});}});
 server.listen(8181,'127.0.0.1',()=>console.log(JSON.stringify({operator:origin+'/main?channel='+past,vendor:origin+'/__owner',narrow:origin+'/__audit'})));
 process.once('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});

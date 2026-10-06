'use strict';
// Synthetic, isolated checkout data only. No production storage or message provider.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const {createLegacyShippingHistory}=require('../shipping-destination-history');

async function main(){
 const origin='http://127.0.0.1:4361',legacyRepository={
  request:async()=>[],
  getRowsByKeys:async keys=>keys[0]==='auction_archive_index'?[{key:keys[0],value:'[{"id":"preview-september"}]'}]:[{key:keys[0],value:JSON.stringify({createdAt:'2026-09-10T12:00:00Z',items:[{id:'old-gecko',status:'낙찰',winner_phone:'01000000003',shipping_company:'파르게',shipping_type:'배송',shipping_region:'서울 (테스트 수령점)',sold_price:999999,updated_at:'2026-09-10T10:00:00Z'}]})}]
 };
 const f=await createFixture({origin,apiOptions:{legacyShippingHistory:createLegacyShippingHistory({repository:legacyRepository})}}),repo=f.repository;
 await repo.saveCatalog([normalizeChannel({id:'preview-auction',name:'배송지 테스트 경매',status:'active',dataAdapter:'platform',shippingDefaults:{pickupLocations:['방송장'],enabledCarriers:['parge','dodosi']}}),normalizeChannel({id:'preview-past',name:'지난 경매',status:'archived',dataAdapter:'platform'})]);
 await repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{서울:[{shop:'테스트 수령점',cost:20000}],경기:[{shop:'다른 테스트점',cost:15000}]}})},{key:'shipping_rate_dodosi',value:JSON.stringify({data:{서울:[{shop:'테스트 정거샵',cost:18000}]}})}]);
 await repo.upsertRecord('preview-auction','vendor',{id:'preview-vendor',name:'테스트 업체',phone:'01000000001',paymentMethods:['bank_transfer','card'],bankName:'테스트은행',bankAccount:'000000000',bankHolder:'테스트'});
 await repo.upsertRecord('preview-auction','item',{id:'preview-item',name:'테스트 개체',lotNumber:1,status:'sold',soldPrice:100000,winnerName:'테스트 구매자',winnerPhone:'01000000003',vendorId:'preview-vendor',vendorName:'테스트 업체'});
 await repo.upsertRecord('preview-past','shipment',{id:'past',itemId:'past-item',recipientPhone:'01000000003',carrier:'파르게',method:'delivery',address:'경기 (다른 테스트점)',buyerSubmittedAt:'2026-08-01T10:00:00Z',status:'complete'});
 const response=await f.call(f.client(),'POST','/api/platform/channels/preview-auction/buyer-shipping-link',{itemId:'preview-item'},{'x-creo-admin':f.secret});
 if(response.status!==200)throw Error(response.body);
 const code=response.json().code,root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/'){res.writeHead(302,{Location:'/buyer-shipping.html?code='+code});res.end();return;}
  if(url.pathname==='/__preview/state'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({shipments:(await repo.listRecords('preview-auction','shipment')).length,notifications:(await repo.listRecords('preview-auction','notification')).length}));return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(4361,'127.0.0.1',()=>console.log('Synthetic shipping history preview: '+origin));
 const close=()=>server.close(()=>{f.close();process.exit(0);});process.once('SIGINT',close);process.once('SIGTERM',close);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

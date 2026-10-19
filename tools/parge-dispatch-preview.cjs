'use strict';
// Isolated fixture only: no production data, credentials, booking calls or messages.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./national-settlement-fixture.cjs'),Core=require('../public/parge-dispatch-core');
(async()=>{
 const f=await fixture(),root=path.resolve(__dirname,'../public');
 for(const [id,name,phone,shop,price]of [['p01','가상 낙찰자 A','01000000011','가상 서울샵',100000],['p02','가상 낙찰자 A','01000000011','가상 서울샵',250000],['p03','가상 낙찰자 B','01000000022','가상 경기샵',200000]]){
  await f.repository.upsertRecord('national-cre','item',{id,name:id.toUpperCase(),status:'sold',winnerName:name,winnerPhone:phone,soldPrice:price,attributes:{broadcastDate:'2026-10-14'}});
  await f.repository.upsertRecord('national-cre','shipment',{id:'s-'+id,itemId:id,method:'delivery',destinationType:'parge',recipientName:name,recipientPhone:phone,pargeShop:shop,paymentStatus:'paid'});
 }
 const demoItems=await f.repository.listRecords('national-cre','item'),demoShipments=await f.repository.listRecords('national-cre','shipment');
 const demoPlan=Core.manifest(Core.build({items:demoItems.filter(i=>['p01','p02'].includes(i.id)),shipments:demoShipments},{channelId:'national-cre'}).groups,{channelId:'national-cre',date:'2099-10-24'});
 const prepared=await f.request('POST','/channels/national-cre/parge-dispatch',{action:'prepare',requestId:'parge-preview-00001',plan:demoPlan});
 if(prepared.status!==200)throw Error(prepared.body);
 await f.request('POST','/channels/national-cre/parge-dispatch',{action:'confirm-cart',id:prepared.json().record.id,confirmed:true});
 await f.repository.upsertRecord('national-cre','item',{id:'p04',name:'P04',status:'sold',winnerName:'가상 낙찰자 A',winnerPhone:'01000000011',soldPrice:50000,attributes:{broadcastDate:'2026-10-14'}});
 await f.repository.upsertRecord('national-cre','shipment',{id:'s-p04',itemId:'p04',method:'delivery',destinationType:'parge',recipientName:'가상 낙찰자 A',recipientPhone:'01000000011',pargeShop:'가상 서울샵',paymentStatus:'paid'});
 const port=Number(process.env.PARGE_PREVIEW_PORT)||4374,origin='http://127.0.0.1:'+port;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){req.headers['x-creo-admin']=f.secret;if(await f.api.handle(req,res,url))return;}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
 server.listen(port,'127.0.0.1',()=>console.log('Isolated preview '+origin+'/parge-dispatch.html?channel=national-cre'));
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
// Local-only synthetic data. Does not read or write production records.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {fixture,item}=require('./national-settlement-fixture.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {normalizeChannel}=require('../platform-core');
async function main(){
 const origin='http://127.0.0.1:4369',f=await fixture({origin});
 for(const row of await f.repository.listRecords('national-cre','item'))await f.repository.upsertRecord('national-cre','item',{...row,attributes:{...row.attributes,broadcastDate:'2026-10-19'}});
 await createVendorDirectory(f.repository).enroll('national-cre','v1');
 await f.repository.upsertRecord('national-cre','archive',{id:'preview-old-round',title:'10/14 서울·인천',closedAt:'2026-10-19T00:00:00Z'});
 await f.repository.upsertRecord('national-cre','item',item('old01','v1',{auctionArchiveId:'preview-old-round',winnerName:'가상 이전 구매자',winnerPhone:'01000000003'}));
 await f.repository.upsertRecord('national-cre','shipment',{id:'old-shipment',itemId:'old01',vendorId:'v1',method:'pickup',address:'현장 수령',destinationType:'pickup',destinationId:'pickup-1',cost:0,paymentStatus:'bank_transfer_reported',paymentMethod:'bank_transfer',paymentRequestedAmount:100000,buyerSubmittedAt:'2026-10-19T00:00:00Z'});
 const oldBuyer=(await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'old01'})).json();
 const vendor=(await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:'v1'})).json();
 const key='buyer_shipping_short_v2_'+f.code,stored=JSON.parse((await f.repository.getRowsByKeys([key]))[0].value),payload=JSON.parse(Buffer.from(stored.token.split('.')[1],'base64url'));delete payload.itemId;delete payload.roundScope;
 const unsigned='bs2.'+Buffer.from(JSON.stringify(payload)).toString('base64url');
 await f.repository.upsertRows([{key,value:JSON.stringify({...stored,token:unsigned+'.'+crypto.createHmac('sha256',f.secret).update(unsigned).digest('base64url')})}]);
 await f.repository.upsertRecord('national-cre','item',item('new01','v1',{name:'A01',status:'waiting',soldPrice:0,winnerName:'',winnerPhone:'',attributes:{broadcastDate:'2026-10-21'}}));
 await f.request('POST','/national-rounds',{action:'prepare',date:'2026-10-21'});
 for(const [id,date] of [['creyon-1001','2026-10-01'],['clab-1015','2026-10-15']]){
  const catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id,name:'씨랩 · '+date,status:'active',broadcastProfile:'creyon-metal',shippingDefaults:{deliverySchedule:{enabled:true,auctionDate:date}}})]);
  await f.repository.upsertRecord(id,'vendor',{id:'v1',name:'가상 씨랩 업체'});
  await f.repository.upsertRecord(id,'item',item('clab-sold','v1',{name:id==='clab-1015'?'씨랩 이번 회차 개체':'씨랩 이전 회차 개체',attributes:{broadcastDate:date}}));
 }
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  if(url.pathname==='/__narrow'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<html lang="ko"><title>320px 운영 홈 검증</title><body style="margin:0"><iframe title="320px 운영 홈" style="width:320px;height:1100px;border:0" src="/main?channel=clab-1015"></iframe></body></html>');return;}
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':url.pathname==='/roulette/'?'/roulette/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error')}});
 server.listen(4369,'127.0.0.1',()=>console.log(JSON.stringify({home:origin+'/main',vendor:origin+'/vendor-checkout.html?code='+vendor.code,buyer:origin+'/buyer-shipping.html?code='+f.code,oldBuyer:origin+'/buyer-shipping.html?code='+oldBuyer.code})));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

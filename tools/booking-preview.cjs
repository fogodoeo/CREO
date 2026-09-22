'use strict';
// Isolated real API preview. No production credentials, data or message provider.
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream'),{randomUUID}=require('node:crypto');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel}=require('../platform-core');
const {CheckoutNotificationService}=require('../checkout-notifications');
const {createBroadcastBooking}=require('../broadcast-booking');
async function createFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-booking-preview-'));
 const repository=new SQLitePlatformRepository({dataDir:dir,adminSecret:'booking-preview-only',durable:true,startWorker:false});
 const clock=()=>Date.parse('2026-09-21T09:00:00+09:00');
 const channel=normalizeChannel({id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'});
 const other=normalizeChannel({id:'other-auction',name:'다른 경매',status:'active',dataAdapter:'platform'});
 await repository.saveCatalog([channel,other]);
 const names=['서울 게코하우스','부산 크레팜','경기 크레숲','인천 도마뱀 연구소','충청 크레마을'];
 const vendors=names.map((name,i)=>({id:'preview-vendor-'+i,name,phone:'01000000000',active:true,bankName:'예시은행',bankAccount:'000000',bankHolder:name}));
 for(const v of vendors)await repository.upsertRecord(channel.id,'vendor',v);
 await repository.upsertRecord(other.id,'vendor',{...vendors[0]});
 const notificationService=new CheckoutNotificationService({repository,provider:{readiness:()=>({ready:false,missing:['template:broadcast_booking_updated']}),status:()=>({}),send:async()=>{throw Error('Preview never sends messages');}},now:clock});
 const service=createBroadcastBooking(repository,{now:clock,notificationService}),command=(type,fields)=>({type,requestId:randomUUID(),...fields});
 for(let i=0;i<vendors.length;i++)await service.command({channel,vendors},command('region',{expectedVersion:i,vendorId:vendors[i].id,region:[0,7,3,1,4][i]}),{operator:true});
 const ctx=i=>({channel,vendor:vendors[i]});
 const first=await service.command(ctx(0),command('reserve',{date:'2026-09-28',quantity:8}));
 await service.command(ctx(1),command('reserve',{date:'2026-09-28',quantity:8}));
 await service.command(ctx(2),command('reserve',{date:'2026-09-30',quantity:8}));
 await service.command({channel,vendors},command('propose',{id:first.result,expectedVersion:1,date:'2026-09-28',quantity:6,expiresAt:'2026-09-24T18:00:00+09:00'}),{operator:true});
 const api=createPlatformApi({repository,notificationService,bookingNow:clock,adminSessionSecret:'booking-preview-session',logger:{error:console.error,warn:console.warn}});
 async function call(method,url,body,admin='booking-preview-only',headers={}){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'127.0.0.1:4319',...(admin?{'x-creo-admin':admin}:{}),...headers};
  const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL(url,'http://127.0.0.1:4319'));return res;
 }
 const link=(await call('POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:vendors[0].id})).json();
 const emptyLink=(await call('POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:vendors[3].id})).json();
 const otherLink=(await call('POST','/api/platform/channels/other-auction/vendor-checkout-link',{vendorId:vendors[0].id})).json();
 const organizer=(await call('POST','/api/platform/channels/national-cre/organizer-link',{})).json();
 const organizerCode=new URL(organizer.url).pathname.split('/').pop();
 const close=()=>{repository.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-booking-preview-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});};
 return {repository,api,service,call,close,channel,vendors,code:link.code,emptyCode:emptyLink.code,otherCode:otherLink.code,organizerCode,first:first.result};
}
async function main(){
 const f=await createFixture(),root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4319');
  try{
   if(url.pathname.startsWith('/api/')){if(await f.api.handle(req,res,url))return;}
   const requested=/^\/r\/[A-Za-z0-9_-]{24}$/.test(url.pathname)?'/vendor-bookings.html':/^\/o\//.test(url.pathname)?'/organizer-shipping.html':url.pathname;
   const file=path.resolve(root,'.'+requested);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
   res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });
 server.listen(4319,'127.0.0.1',()=>console.log(JSON.stringify({vendor:`http://127.0.0.1:4319/vendor-bookings.html?event=national-cre&code=${f.code}`,empty:`http://127.0.0.1:4319/vendor-bookings.html?event=national-cre&code=${f.emptyCode}`,operator:`http://127.0.0.1:4319/organizer-bookings.html?channel=national-cre&code=${f.organizerCode}`,other:`http://127.0.0.1:4319/vendor-entries.html?event=other-auction&code=${f.otherCode}`})));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={createFixture};

'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs'),{normalizeChannel}=require('../platform-core'),{createVendorDirectory}=require('../vendor-directory');
async function landingFixture(origin='http://127.0.0.1:4425'){
 const f=await createFixture({origin}),child='national-cre-20261021';f.advance(30*86400000);
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id:child,name:'전국크레자랑 · 10/21 전라·충청',status:'active',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:'2026-10-21'},vendorSettlement:{enabled:true,entryFee:10000,ratePercent:10}})]);
 await f.repository.upsertRecord('national-cre','vendor',{id:'empty-parent-vendor',name:'가상 단일 회차 업체',phone:'01000000001',bankName:'테스트은행',bankAccount:'000-000',bankHolder:'가상 업체',paymentMethods:['bank_transfer']});
 const directory=createVendorDirectory(f.repository),profile=await directory.enroll('national-cre','empty-parent-vendor'),member=await directory.attach(profile.id,child);
 await f.repository.upsertRecord(child,'item',{id:'landing-a01',name:'가상 A01',vendorId:member.vendorId,status:'sold',soldPrice:100000,winnerName:'가상 구매자',winnerPhone:'01000000003',attributes:{broadcastDate:'2026-10-21'}});
 const link=await f.call(f.client(),'POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:'empty-parent-vendor'},{'x-creo-admin':f.secret});if(link.status!==200)throw Error(link.body);
 f.code=link.json().code;f.child=child;return f;
}
async function main(){
 const f=await landingFixture(),root=path.resolve(__dirname,'../public');
 if(process.argv.includes('--populated')){
  await f.repository.upsertRecord('national-cre','item',{id:'past-paid',name:'지난 회차 완료 개체',vendorId:'empty-parent-vendor',status:'sold',soldPrice:100000,winnerName:'가상 구매자',winnerPhone:'01000000003',attributes:{broadcastDate:'2026-10-19'}});
  await f.repository.upsertRecord('national-cre','shipment',{id:'past-paid',itemId:'past-paid',paymentStatus:'paid'});
 }
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,f.origin);
  if(url.pathname==='/'){res.writeHead(302,{Location:'/vendor-checkout.html?code='+f.code+'&event=national-cre'});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Isolated preview error')}});
 server.listen(4425,'127.0.0.1',()=>console.log('Isolated settlement landing: '+f.origin));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={landingFixture};

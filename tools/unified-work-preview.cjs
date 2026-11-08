'use strict';
// Isolated synthetic data and fake SMS. Never mount in production.
const {createFixture}=require('./vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
async function main(){
 const origin='http://127.0.0.1:4388',f=await createFixture({origin});f.advance(46*86400000);
 const owner=await f.login('01000000001');
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const registered=await f.post(owner,'register',{name:'가상 참여 업체',region:'서울·인천',phone:'01000000001'});if(registered.status!==200)throw Error(registered.body);
 const vendorId=registered.json().id,v=await f.repository.getRecord('national-cre','vendor',vendorId);
 const directory=require('../vendor-directory').createVendorDirectory(f.repository);await directory.enroll('national-cre',vendorId);const linked=await directory.find('national-cre',vendorId);await directory.update('national-cre',{...linked,bankName:'가상은행',bankAccount:'0000',bankHolder:'가상'},linked.directoryRevision);
 const admin=(method,route,body)=>f.call(owner,method,'/api/platform/'+route,body,{'x-creo-admin':f.secret});
 await admin('POST','national-rounds',{action:'prepare',date:'2026-11-09'});await admin('POST','national-rounds',{action:'prepare',date:'2026-11-11'});
 for(const [id,date,name]of [['clab-preview','2026-11-10','씨랩 · 11월 10일'],['jjun-preview','2026-11-05','쭌이네 · 11월 5일']]){
  await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,normalizeChannel({id,name,status:'active',dataAdapter:'platform',shippingDefaults:{deliverySchedule:{enabled:true,auctionDate:date}}})]);
  await f.repository.upsertRecord(id,'vendor',{...v,id:'preview',name:'가상 참여 업체',phone:'01000000001',bankName:'가상은행',bankAccount:'0000',bankHolder:'가상'});
  await f.repository.upsertRecord(id,'setting',{id:'entry-policy',open:id==='clab-preview',revision:1});
 }
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname==='/__preview/work'){res.writeHead(303,{Location:'/vendor-access.html','Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname==='/__narrow'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<html><body style="margin:0"><iframe title="모바일 검수" style="border:0;width:320px;height:950px" src="/vendor-access.html"></iframe></body></html>');return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error: '+e.message);}});
 server.listen(4388,'127.0.0.1',()=>console.log(origin+'/__preview/work'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

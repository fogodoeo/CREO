'use strict';
// Isolated data and fake SMS only. Never mount this helper on the production server.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
async function main(){
 const origin='http://127.0.0.1:4396',f=await createFixture({origin}),owner=await f.login('01000000001');
 for(const [id,name,phone]of [['existing','연락처 등록 업체','01000000001'],['missing','번호 미등록 업체','']])await f.repository.upsertRecord('national-cre','vendor',{id,name,phone,active:true,broadcastRegion:'대구·경북'});
 const root=path.resolve(__dirname,'../public');
 http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__preview/owner'){
   const company=['existing','missing'].includes(url.searchParams.get('company'))?url.searchParams.get('company'):'';
   res.writeHead(303,{Location:'/vendor-access.html'+(company?'?company='+company:''),'Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;
  }
  if(url.pathname.startsWith('/api/')){if(url.pathname==='/api/platform/national-vendor-directory')req.headers['x-creo-admin']=f.secret;if(await f.api.handle(req,res,url))return;}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error');}}).listen(4396,'127.0.0.1',()=>console.log(origin+'/__preview/owner'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

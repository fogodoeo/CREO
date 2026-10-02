'use strict';
// Isolated fixture only. Fake phone numbers; no outgoing messages or production records.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs'),{channelKey}=require('../platform-core');
async function main(){
 const origin='http://127.0.0.1:4347',f=await createFixture({origin});f.advance(9*86400000);
 await f.repository.deleteRow(channelKey('national-cre','setting','vendor-access-policy'));
 const admin=f.client();
 const login=await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});if(login.status!==200)throw Error(login.body);
 await f.call(admin,'PUT','/api/platform/channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'});
 const seeded=await f.call(admin,'POST','/api/platform/national-vendor-directory',{id:'preview-seoul',name:'서울 테스트',region:'서울',loginPhone:'01000000001'});if(seeded.status!==200)throw Error(seeded.body);
 const owner=await f.login('01000000001'),staff=await f.login('01000000002'),newcomer=await f.login('01000000003'),root=path.resolve(__dirname,'../public');
 http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(['/owner','/staff','/admin','/newcomer'].includes(url.pathname)){
   const c=url.pathname==='/admin'?admin:url.pathname==='/owner'?owner:url.pathname==='/newcomer'?newcomer:staff;
   res.writeHead(303,{Location:url.pathname==='/admin'?'/national-vendors.html':'/vendor-access.html','Set-Cookie':Object.entries(c.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;
  }
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error');}}).listen(4347,'127.0.0.1',()=>console.log('Isolated preregistration: '+origin+'/owner'));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

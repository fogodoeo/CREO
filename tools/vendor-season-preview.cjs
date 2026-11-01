'use strict';
// Local-only real API fixture. Never contacts production or sends real SMS.
const {createFixture}=require('./vendor-portal-preview.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{
 const f=await createFixture({origin:'http://127.0.0.1:4338'});f.advance(Date.parse('2026-11-01T09:00:00+09:00')-Date.parse('2026-09-23T09:00:00+09:00'));
 const owner=await f.login('01000000001'),id=(await f.post(owner,'register',{name:'시즌 참가 테스트',region:'서울·인천',phone:'01000000001'})).json().id;
 const root=path.resolve(__dirname,'../public');
 http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,f.origin);
  if(url.pathname==='/__preview/owner'){res.writeHead(303,{Location:'/vendor-access.html?section=profile&company='+id,'Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Isolated preview failure');}}).listen(4338,'127.0.0.1',()=>console.log('http://127.0.0.1:4338/__preview/owner'));
})().catch(e=>{console.error(e);process.exitCode=1;});

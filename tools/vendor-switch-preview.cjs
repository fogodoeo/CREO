'use strict';
// Synthetic accounts, isolated temporary SQLite and in-memory SMS only.
const {createFixture}=require('./vendor-portal-preview.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
async function main(){
 const port=Number(process.env.VENDOR_SWITCH_PREVIEW_PORT)||4364,origin='http://127.0.0.1:'+port;
 const f=await createFixture({origin});f.advance(22*86400000);
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 for(const [id,name]of [['doremi','도레미'],['celeb','셀렙']]){
  const saved=await f.call(f.client(),'POST','/api/platform/national-vendor-directory',{id,name,region:'부산·울산·경남',loginPhone:'01000000001'},{'x-creo-admin':f.secret});if(saved.status!==200)throw Error(saved.body);
  const v=await f.repository.getRecord('national-cre','vendor',id);await f.repository.upsertRecord('national-cre','vendor',{...v,bankName:'테스트 은행',bankAccount:'000000',bankHolder:'테스트',address:'부산광역시 해운대구 테스트로 1'});
 }
 const owner=await f.login('01000000001'),calls=[],root=path.resolve(__dirname,'../public');
 const short=(await f.call(f.client(),'POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:'doremi'},{'x-creo-admin':f.secret})).json().code;
 let paused='',release,gate;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__preview/owner'){res.writeHead(303,{Location:'/vendor-access.html','Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname==='/__preview/short'){res.writeHead(303,{Location:'/w/'+short});res.end();return;}
  if(url.pathname==='/__preview/pause'){paused='/api/platform/'+url.searchParams.get('route');gate=new Promise(resolve=>{release=resolve;});res.end('paused');return;}
  if(url.pathname==='/__preview/resume'){paused='';release?.();res.end('resumed');return;}
  if(url.pathname==='/__preview/calls'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(calls));return;}
  if(url.pathname.startsWith('/api/')){calls.push({method:req.method,path:url.pathname});if(url.pathname===paused)await gate;if(await f.api.handle(req,res,url))return;}
  const match=/^\/w\/([A-Za-z0-9_-]{8,24})$/.exec(url.pathname);if(match)url.pathname=await f.api.vendorEntryPage({code:match[1],event:url.searchParams.get('event')||'',section:url.searchParams.get('section')||''});
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error');console.error(e.message);}});
 server.listen(port,'127.0.0.1',()=>console.log('Isolated company switch preview: '+origin+'/__preview/owner'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

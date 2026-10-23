'use strict';
// Fake accounts, SMS and isolated SQLite only. No production records or providers.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {seedLegacyOwnerRequest}=require('./vendor-owner-legacy-fixture.cjs');
async function main(){
 const f=await createFixture({origin:'http://127.0.0.1:8182'}),clients={};f.directory=createVendorDirectory(f.repository);
 for(const [i,id]of ['first','different','pending'].entries()){
  clients[id]=await f.login('0100000000'+(i+1));
  await f.repository.upsertRecord('national-cre','vendor',{id,name:{first:'테스트 처음 연결',different:'테스트 다른 연락처',pending:'테스트 이전 신청'}[id],broadcastRegion:'대구·경북',phone:id==='different'?'01000000009':'',active:true});
  await f.directory.enroll('national-cre',id);
 }
 await seedLegacyOwnerRequest(f,{companyId:'pending',phone:'01000000003'});
 const root=path.resolve(__dirname,'../public');let failNext=false;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,f.origin);
  if(url.pathname.startsWith('/__preview/')){
   const id=url.pathname.slice('/__preview/'.length),c=clients[id];if(!c){res.writeHead(404);res.end();return;}
   failNext=url.searchParams.has('fail');
   res.writeHead(303,{Location:'/__audit?company='+id,'Set-Cookie':Object.entries(c.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;
  }
  if(url.pathname==='/__audit'){
   const id=url.searchParams.get('company');if(!clients[id]){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html lang="ko"><title>첫 대표 연결 · 격리 테스트</title><style>body{margin:0;background:#e9edf2}iframe{display:block;width:320px;height:100dvh;margin:auto;border:0;background:white}</style><iframe title="320px 업체 페이지" src="/vendor-access.html?company=${id}"></iframe></html>`);return;
  }
  if(failNext&&req.method==='POST'&&url.pathname==='/api/platform/vendor-access/owner-setup'){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'연결을 저장하지 못했어요. 다시 시도해 주세요.'}));return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(8182,'127.0.0.1',()=>console.log('Isolated preview: '+f.origin+'/__preview/first?fail=1'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

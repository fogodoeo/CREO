'use strict';
// Disposable SQLite fixture: synthetic entrants only, no production services.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
async function main(){
 const origin='http://127.0.0.1:4368',f=await createFixture({origin});
 await f.repository.setActiveChannel('national-cre');
 const admin=f.client();const login=await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});if(login.status!==200)throw Error(login.body);
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/preview'){
   res.writeHead(303,{Location:'/roulette/?channel=national-cre&theme=clean&title=Isolated%20sync%20check&entries=TestA%0ATestB','Set-Cookie':Object.entries(admin.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;
  }
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const relative=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
 server.listen(4368,'127.0.0.1',()=>console.log(origin+'/preview'));
 function close(){server.close();f.close();process.exit();}process.on('SIGTERM',close);process.on('SIGINT',close);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

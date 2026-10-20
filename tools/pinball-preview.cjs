'use strict';
// Disposable SQLite fixture: synthetic entrants only, no production services.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
async function main(){
 const port=Number(process.env.PINBALL_PREVIEW_PORT)||4368;
 const origin=`http://127.0.0.1:${port}`,f=await createFixture({origin});
 await f.repository.setActiveChannel('national-cre');
 const admin=f.client();const login=await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});if(login.status!==200)throw Error(login.body);
 await f.call(admin,'GET','/api/platform/channels');
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/preview'){
   const params=new URLSearchParams({channel:'national-cre',theme:'national',title:'가마치통닭 쿠폰 추첨',channelName:'전국크레자랑 전라·충청편',entries:'테스트하늘\n테스트바다\n테스트초록\n테스트별빛\n테스트노랑\n테스트구름\n테스트달빛\n테스트봄날\n테스트여름\n테스트가을\n테스트겨울\n테스트햇살'});
   res.writeHead(303,{Location:'/roulette/?'+params,'Set-Cookie':Object.entries(admin.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;
  }
  if(url.pathname==='/screen'){
   const width=url.searchParams.get('size')==='mobile'?360:1920, height=width===360?800:1080;
   const source=url.searchParams.get('mode')==='admin'?'/preview':'/roulette/?channel=national-cre&theme=national&broadcast=1&title='+encodeURIComponent('가마치통닭 쿠폰 추첨')+'&channelName='+encodeURIComponent('전국크레자랑 전라·충청편');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>전크자 핀볼 격리 검증</title><style>body{margin:0;background:#152237}iframe{width:${width}px;height:${height}px;border:0}</style><iframe title="핀볼 검증 화면" src="${source.replaceAll('&','&amp;')}"></iframe></html>`);return;
  }
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const relative=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.webm':'video/webm','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});
 server.listen(port,'127.0.0.1',()=>console.log(origin+'/preview'));
 function close(){server.close();f.close();process.exit();}process.on('SIGTERM',close);process.on('SIGINT',close);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

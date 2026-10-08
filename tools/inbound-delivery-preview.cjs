'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
async function main(){
 const port=Number(process.env.INBOUND_PREVIEW_PORT)||4359,origin='http://127.0.0.1:'+port,f=await createFixture({origin});f.advance(12*86400000);
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const demos=[['seoul','서울·인천','서울 테스트',''],['daegu','대구·경북','대구 테스트',''],['daegu-local','대구·경북','대구 소재지 테스트','대구광역시 달서구 월배로 1'],['incheon','서울·인천','크레리즘','인천광역시 서구 청라에메랄드로 79'],['gyeonggi','경기','경기 테스트','경기도 부천시 원미구'],['chungcheong','전라·충청','충청 테스트',''],['own','경기','크레다이브','경기도 부천시 원미구'],['duplicate','서울','다이노마켓','']];
 const links={};for(const [id,region,name,address] of demos){await f.repository.upsertRecord('national-cre','vendor',{id,name,address,active:true,broadcastRegion:region,phone:'01000000001',bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'});const r=await f.call(f.client(),'POST','/api/platform/channels/national-cre/vendor-checkout-link',{vendorId:id},{'x-creo-admin':f.secret});links[id]=new URL(r.json().url,origin).pathname.split('/').pop();}
 const root=path.resolve(__dirname,'../public');const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);if(url.pathname==='/'){const key=Object.hasOwn(links,url.searchParams.get('vendor'))?url.searchParams.get('vendor'):'gyeonggi';res.writeHead(303,{Location:'/vendor-broadcast.html?'+new URLSearchParams({event:'national-cre',code:links[key]})});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Local preview error');}}).listen(port,'127.0.0.1',()=>console.log(origin+'/?vendor=gyeonggi'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

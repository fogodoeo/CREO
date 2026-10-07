'use strict';
// Local-only integration preview. Fake vendor accounts; no production data or SMS.
const {createFixture}=require('./vendor-portal-preview.cjs');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
async function main(){
 const origin='http://127.0.0.1:4338',f=await createFixture({origin});f.advance(14*86400000);
 const owner=await f.login('01000000001'),admin=f.client();
 const registered=await f.post(owner,'register',{name:'미리보기 업체',region:'서울·인천',phone:'01000000001'}),company=registered.json().id;
 await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});
 const sent=await f.call(admin,'POST','/api/platform/promo-center',{action:'assign',requestId:randomUUID(),revision:0,date:'2026-10-08',slot:'afternoon',vendorId:company,templateId:'ep01-welcome'});if(sent.status!==200)throw Error(sent.body);
 const today=await f.call(admin,'POST','/api/platform/promo-center',{action:'assign',requestId:randomUUID(),revision:1,date:'2026-10-07',slot:'afternoon',vendorId:company,templateId:'ep01-brief'});if(today.status!==200)throw Error(today.body);
 f.advance(5*3600000);
 const root=path.resolve(__dirname,'../public');
 http.createServer(async(req,res)=>{try{const url=new URL(req.url,origin);
  if(['/__preview/vendor','/__preview/admin'].includes(url.pathname)){const c=url.pathname.endsWith('admin')?admin:owner;const names=new Set([...Object.keys(owner.jar),...Object.keys(admin.jar)]);res.writeHead(303,{Location:'/promo-center.html?'+(c===admin?'admin=1':'company='+company),'Set-Cookie':[...names].map(k=>`${k}=${c.jar[k]||''}; Path=/; HttpOnly; SameSite=Lax${c.jar[k]?'':'; Max-Age=0'}`)});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Preview error');}}).listen(4338,'127.0.0.1',()=>console.log('Local preview: '+origin+'/__preview/vendor'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

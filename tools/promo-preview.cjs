'use strict';
// Local-only integration preview. Fake vendor accounts; no production data or SMS.
const {createFixture}=require('./vendor-portal-preview.cjs');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
async function main(){
 const origin='http://127.0.0.1:4338',images=new Map(),f=await createFixture({origin,apiOptions:{vendorLogoStorage:{put:async(_channel,name,bytes)=>{images.set(name,bytes);return {url:'/__preview/promo-image/'+name};}}}});f.advance(14*86400000);
 const owner=await f.login('01000000001'),admin=f.client();
 const registered=await f.post(owner,'register',{name:'미리보기 업체',region:'서울·인천',phone:'01000000001'}),company=registered.json().id;
 await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});
 const sent=await f.call(admin,'POST','/api/platform/promo-center',{action:'assign',requestId:randomUUID(),revision:0,date:'2026-10-08',slot:'afternoon',vendorId:company,templateId:'ep01-welcome'});if(sent.status!==200)throw Error(sent.body);
 const today=await f.call(admin,'POST','/api/platform/promo-center',{action:'assign',requestId:randomUUID(),revision:1,date:'2026-10-07',slot:'afternoon',vendorId:company,templateId:'ep01-brief'});if(today.status!==200)throw Error(today.body);
 f.advance(5*3600000);
 const regionNames=require('../national-broadcast').REGIONS,regionGroups=[['크레버디','더숲(크레숲)','REPSODY 렙소디','오케이게코','카민','베누스게코','스텔라게코','크레리즘','더블디게코'],['크레젠또','오늘도마뱀','오야지크레','크레준치','니코게코','말랑젤리','마브렙타일'],['제트크레스티드게코','펠리체게코','아기공룡','쭌이네','좀비렙타일'],['도즈게코','룸메이트','크레용 대구본점'],['크레앤코','H_ARTS','도레미','셀렙']];
 for(const vendor of require('./promo-partners.json')){const id=require('../promo-partners').curatedId(vendor),region=regionGroups.findIndex(g=>g.includes(vendor.name));await f.repository.upsertRecord('national-cre','vendor',{id,name:vendor.name,active:true,broadcastRegion:regionNames[region<0?1:region],logoUrl:vendor.url});}
 const root=path.resolve(__dirname,'../public');
 http.createServer(async(req,res)=>{try{const url=new URL(req.url,origin);
  if(['/__preview/vendor','/__preview/admin'].includes(url.pathname)){const c=url.pathname.endsWith('admin')?admin:owner;const names=new Set([...Object.keys(owner.jar),...Object.keys(admin.jar)]);res.writeHead(303,{Location:'/promo-center.html?'+(c===admin?'admin=1':'company='+company),'Set-Cookie':[...names].map(k=>`${k}=${c.jar[k]||''}; Path=/; HttpOnly; SameSite=Lax${c.jar[k]?'':'; Max-Age=0'}`)});res.end();return;}
  if(url.pathname.startsWith('/__preview/promo-image/')){const image=images.get(url.pathname.split('/').pop());res.writeHead(image?200:404,{'Content-Type':'image/png'});res.end(image);return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Preview error');}}).listen(4338,'127.0.0.1',()=>console.log('Local preview: '+origin+'/__preview/vendor'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
// Isolated database, fake SMS and private temporary photo storage. No production data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {EntryPhotoStorage}=require('../entry-photo-storage');
async function main(){
 const origin='http://127.0.0.1:4346',photos=fs.mkdtempSync(path.join(os.tmpdir(),'creo-national-photos-'));
 const f=await createFixture({origin,apiOptions:{entryPhotoStorage:new EntryPhotoStorage({localDir:photos})}});f.advance(9*86400000);
 await f.call(f.client(),'PUT','/api/platform/channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'},{'x-creo-admin':f.secret});
 const owner=await f.login('01000000001'),company=(await f.post(owner,'register',{name:'서울 테스트',region:'서울',phone:'01000000001'})).json();
 const v=await f.repository.getRecord('national-cre','vendor',company.id);await f.repository.upsertRecord('national-cre','vendor',{...v,bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'});
 const token=(await f.post(owner,'select',{id:company.id})).json().token,root=path.resolve(__dirname,'../public');
 if(process.env.NATIONAL_PREVIEW_PANEL){
  const route='/api/platform/channels/national-cre/broadcast-bookings',headers={'x-creo-admin':f.secret};
  const state=(await f.call(owner,'GET',route,null,headers)).json();
  const result=await f.call(owner,'POST',route,{type:'panel-assignment',date:'2026-10-26',vendorId:company.id,quantity:1,expectedVersion:state.version,requestId:crypto.randomUUID()},headers);
  if(result.status!==200)throw Error(result.body);
 }
 if(process.env.NATIONAL_PREVIEW_TEAM_COUNT){
  const old=await f.call(owner,'POST','/api/platform/vendor-bookings',{type:'reserve',date:'2026-10-14',quantity:4,requestId:crypto.randomUUID(),token,event:'national-cre'});
  if(old.status!==200)throw Error(old.body);
  for(let i=1;i<Number(process.env.NATIONAL_PREVIEW_TEAM_COUNT);i++)await f.call(owner,'POST','/api/platform/national-vendor-directory',{id:'preview-company-'+i,name:'미리보기 '+i,region:'서울·인천',loginPhone:'0101000'+String(i).padStart(4,'0'),revision:0},{'x-creo-admin':f.secret});
 }
 http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__audit'){
   const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320));
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><title>격리 패널 등록 검증</title><style>body{margin:0;background:#e7ebf0}iframe{display:block;width:'+width+'px;height:900px;border:0;margin:16px auto;background:white}</style><iframe title="업체 출품 관리" src="/"></iframe></html>');return;
  }
  if(url.pathname==='/'){res.writeHead(303,{Location:'/vendor-broadcast.html?'+new URLSearchParams({event:'national-cre',token}),'Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Isolated preview error');}}).listen(4346,'127.0.0.1',()=>console.log('Isolated national preview: '+origin));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

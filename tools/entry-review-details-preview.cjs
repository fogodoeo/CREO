'use strict';
// Real APIs over isolated SQLite. Names, numbers, media and notifications are synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{randomUUID}=require('node:crypto');
const {fixture,ROOT,DATE,TARGET}=require('./national-intake-fixture.cjs'),{createVendorDirectory}=require('../vendor-directory'),{createVendorEntries}=require('../vendor-entries'),{normalizeChannel}=require('../platform-core');
async function main(){
 const port=Number(process.env.INTAKE_PREVIEW_PORT||4402),origin='http://127.0.0.1:'+port,f=await fixture({origin});
 const directory=createVendorDirectory(f.repository),entries=createVendorEntries(f.repository),profile=await directory.profileFor(ROOT,f.vendorId),rootVendor=await directory.find(ROOT,f.vendorId);
 await directory.update(ROOT,{...rootVendor,bankName:'가상은행',bankAccount:'000-000',bankHolder:'가상 업체'},profile.revision);
 const photo=randomUUID();await entries.addMedia({profile,channel:{id:ROOT},vendor:{id:f.vendorId}},{id:photo,url:'/__test/sire.svg',thumbnailUrl:'/__test/sire.svg',size:100,thumbnailSize:100});
 const reservation=(await f.booking()).json().reservations[0];
 const saved=await f.booking({type:'save-entries',id:reservation.id,submit:true,entries:reservation.entries.map((e,slot)=>({slot,expectedVersion:e.version,replaceSubmitted:true,entry:{sex:slot?'female':'unknown',weight:slot?'20':'3',hatchDate:'2026-08-23',morph:['릴리화이트','트라이컬러 익스트림 할리퀸','헷 아잔틱','노멀'][slot],note:'개체별로 기록한 비고입니다.\n추가 메모는 상세에서만 확인합니다.'},parents:slot?{sire:{name:'가상 부개체 페인트',photoId:photo},dam:{name:'가상 모개체 세레비'}}:{}}))});
 if(saved.status!==200)throw Error(saved.body);
 if((await f.prepare()).status!==200)throw Error('prepare failed');
 const clab=normalizeChannel({id:'clab-preview',name:'씨랩 · 10/29',status:'active',dataAdapter:'platform',shippingDefaults:{deliverySchedule:{enabled:true,auctionDate:'2026-10-29'}}});
 await f.repository.saveCatalog([...(await f.repository.getCatalog()).channels,clab]);
 const member=await directory.attach(profile.id,clab.id);await f.repository.upsertRecord(clab.id,'setting',{id:'entry-policy',open:true,revision:1});
 const context={channel:clab,vendor:await directory.find(clab.id,member.vendorId),profile:await directory.profileFor(clab.id,member.vendorId),catalog:await f.repository.getCatalog()};
 await entries.command(context,{type:'submit',requestId:randomUUID(),entry:{id:randomUUID(),morph:'씨랩 릴리화이트',sex:'female',weight:'22',hatchDate:'2026-01-10',note:'씨랩에서 등록한 비고'}});
 const link=(await f.request('POST','/channels/'+clab.id+'/vendor-checkout-link',{vendorId:member.vendorId})).json();
 const root=path.resolve(__dirname,'../public');let failures=0,vendorFailures=0;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname==='/__test/fail-review'&&req.method==='POST'){failures=3;res.writeHead(200);res.end('armed');return;}
  if(url.pathname==='/__test/fail-vendor'&&req.method==='POST'){vendorFailures=1;res.writeHead(200);res.end('armed');return;}
  if(url.pathname==='/__test/sire.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="#d9e4d5"/><circle cx="120" cy="105" r="55" fill="#718b67"/><text x="120" y="202" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#24372b">TEST SIRE</text></svg>');return;}
  if(url.pathname==='/__vendor'){res.writeHead(303,{Location:'/vendor-entries.html?'+new URLSearchParams({code:link.code,event:clab.id})});res.end();return;}
  if(url.pathname==='/__audit'){
   const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320)),channel=url.searchParams.get('clab')==='1'?clab.id:TARGET;
   const page=url.searchParams.get('vendor')==='1'?'/__vendor':'/main?channel='+channel+'&view=intake';
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><title>출품 상세 격리 검증</title><style>body{margin:0;background:#e7ebf0}iframe{display:block;width:'+width+'px;height:660px;border:0;margin:16px auto;background:white}</style><iframe title="출품 검토" src="'+page+'"></iframe></html>');return;
  }
  if(req.method==='POST'&&url.pathname.endsWith('/entries/review')&&failures){failures--;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'저장하지 못했어요. 입력은 유지됩니다. 다시 등록해 주세요.'}));return;}
  if(req.method==='POST'&&url.pathname==='/api/platform/vendor-entries'&&vendorFailures){vendorFailures--;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'저장하지 못했어요. 입력은 유지됩니다. 다시 저장해 주세요.'}));return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({review:origin+'/__audit?width=320',clabReview:origin+'/__audit?width=320&clab=1',vendor:origin+'/__vendor'})));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});

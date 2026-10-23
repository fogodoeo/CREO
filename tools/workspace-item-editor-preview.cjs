'use strict';
// Isolated loopback fixture; no production credentials, records or notifications.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./national-settlement-fixture.cjs');
async function main(){
 const port=Number(process.env.ITEM_EDITOR_PREVIEW_PORT||4416),origin='http://127.0.0.1:'+port,f=await fixture({origin});
 f.advance(30*86400000);await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const vendor=await f.repository.getRecord('national-cre','vendor','v1');await f.repository.upsertRecord('national-cre','vendor',{...vendor,broadcastRegion:'전라·충청'});
 for(const date of ['2026-10-21','2026-10-26']){const r=await f.request('POST','/national-rounds',{action:'prepare',date});if(r.status!==200)throw Error(r.body);}
 await f.repository.upsertRecord('national-cre-20261021','vendor',{...vendor,id:'v1'});
 await f.repository.upsertRecord('national-cre-20261021','item',{id:'fixture-a01',name:'A01',lotNumber:1,vendorId:'v1',status:'cancelled',category:'릴리화이트',note:'기존 비고',attributes:{broadcastDate:'2026-10-21',checklist:'gender:U|weight:3',parents:[{side:'father',name:'가상 부개체'}]}});
 let controls={failWrites:0,loseResponse:0,failReads:0,delayMs:0},writes=0;
 const read=req=>new Promise((resolve,reject)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch(e){reject(e);}});req.on('error',reject);});
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);req.headers['x-creo-admin']=f.secret;
  if(url.pathname==='/__control'&&req.method==='POST'){const values=await read(req);for(const key of Object.keys(controls))if(key in values)controls[key]=Math.max(0,Math.min(15000,Number(values[key])||0));return json(res,200,controls);}
  if(url.pathname==='/__state')return json(res,200,{writes,items:await f.repository.listRecords('national-cre-20261021','item'),controls});
  if(req.method==='GET'&&url.pathname.endsWith('/workspace')&&controls.failReads>0){controls.failReads--;return json(res,503,{error:'격리 검증: 목록 응답 지연'});}
  if(['POST','PUT'].includes(req.method)&&/\/api\/platform\/channels\/[^/]+\/items(?:\/[^/]+)?$/.test(url.pathname)){
   const body=await read(req);writes++;if(controls.delayMs)await new Promise(resolve=>setTimeout(resolve,controls.delayMs));
   if(controls.failWrites>0){controls.failWrites--;return json(res,503,{error:'격리 검증: 저장 응답 지연'});}
   const response=await f.request(req.method,url.pathname.replace('/api/platform',''),body);
   if(controls.loseResponse>0){controls.loseResponse--;return json(res,503,{error:'격리 검증: 저장 후 응답 유실'});}
   res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(response.body);
  }
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  if(url.pathname==='/__audit'){const page=url.searchParams.get('page')||'/main?channel=national-cre-20261021&view=items',width=Number(url.searchParams.get('width'))||320;if(!page.startsWith('/')||page.startsWith('//'))return json(res,400,{error:'Local page only'});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<html lang="ko"><title>개체 편집 격리 검증</title><body style="margin:0;background:#ddd"><iframe title="${width}px preview" style="width:${Math.max(320,Math.min(1600,width))}px;height:700px;border:0" src="${page.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"></iframe></body></html>`);}
  const file=path.resolve(root,'.'+(url.pathname==='/main'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'Not found'});
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,500,{error:'Isolated preview error: '+e.message});}});
 server.listen(port,'127.0.0.1',()=>console.log(origin+'/main?channel=national-cre-20261021&view=items'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

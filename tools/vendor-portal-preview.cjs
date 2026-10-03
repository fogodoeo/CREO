'use strict';
// Isolated SQLite + fake SMS provider. This file is never served by production.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core'),{CheckoutNotificationService}=require('../checkout-notifications');
async function createFixture({origin='http://127.0.0.1:4331',apiOptions={}}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-portal-test-')),secret='isolated-vendor-portal-test-secret-0001';
 const repository=new SQLitePlatformRepository({dataDir:dir,startWorker:false,adminSecret:secret}),sms=[];
 let clock=Date.parse('2026-09-23T09:00:00+09:00');
 await repository.saveCatalog([normalizeChannel({id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'})]);
 await repository.upsertRecord('national-cre','setting',{id:'entry-policy',open:true,revision:1});
 // Legacy onboarding fixtures explicitly opt in; production defaults to preregistration.
 await repository.upsertRecord('national-cre','setting',{id:'vendor-access-policy',mode:'self-registration-v1'});
 const provider={readiness:(_key,transport)=>({ready:transport==='sms',missing:transport==='sms'?[]:['template']}),status:()=>({}),sendSms:async n=>{sms.push(n);return {id:'isolated'};}};
 const notifications=new CheckoutNotificationService({repository,provider,now:()=>clock});
 const options={repository,notificationService:notifications,adminSessionSecret:secret,vendorAccessOrigin:origin,vendorAccessNow:()=>clock,bookingNow:()=>clock,logger:{error(){},warn(){}},...apiOptions};
 let api=createPlatformApi(options);
 function client(){return {jar:{},csrf:''};}
 async function call(c,method,route,body,headers={}){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.socket={remoteAddress:'127.0.0.1'};req.headers={host:'127.0.0.1:4331',origin,cookie:Object.entries(c.jar).map(([k,v])=>k+'='+v).join('; '),'x-vendor-csrf':c.csrf,...headers};
  const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await api.handle(req,res,new URL(route,origin));
  for(const raw of [].concat(res.headers?.['Set-Cookie']||[])){const [k,v]=raw.split(';')[0].split('=');c.jar[k]=v;}
  if(route.endsWith('/session')&&res.status===200)c.csrf=res.json().csrfToken;
  return res;
 }
 const post=(c,route,body)=>call(c,'POST','/api/platform/vendor-access/'+route,body);
 const refresh=c=>call(c,'GET','/api/platform/vendor-access/session');
 async function login(number){const c=client();await refresh(c);const sent=await post(c,'otp',{phone:number});if(sent.status!==200)throw Error(sent.body);const code=sms.at(-1).fallbackText.match(/\d{6}/)[0];const verified=await post(c,'verify',{challenge:sent.json().challenge,code,remember:true});if(verified.status!==200)throw Error(verified.body);await refresh(c);return c;}
 function close(){repository.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-portal-test-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});}
 return {get api(){return api},repository,sms,provider,client,call,post,refresh,login,close,origin,secret,advance:ms=>clock+=ms,restart:()=>api=createPlatformApi(options)};
}
async function main(){
 const logos=new Map(),f=await createFixture({apiOptions:{vendorLogoStorage:{put:async(_channel,name,bytes)=>{logos.set(name,bytes);return {url:'/__preview/logo/'+name};}}}}),owner=await f.login('01000000001'),staff=await f.login('01000000002');
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});f.advance(11*86400000);
 const company=(await f.post(owner,'register',{name:'테스트',region:'대구·경북',phone:'01000000001'})).json();
 await f.post(staff,'join',{companyId:company.id,name:'테스트 직원',sharingConsent:true});
 const root=path.resolve(__dirname,'../public');
 http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,f.origin);
  if(url.pathname.startsWith('/__preview/logo/')){const bytes=logos.get(url.pathname.split('/').pop());res.writeHead(bytes?200:404,{'Content-Type':'image/webp'});res.end(bytes||'');return;}
  if(['/__preview/owner','/__preview/staff'].includes(url.pathname)){const c=url.pathname.endsWith('owner')?owner:staff;res.writeHead(303,{Location:'/vendor-access.html?section=profile&company='+company.id,'Set-Cookie':Object.entries(c.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error');}}).listen(4331,'127.0.0.1',()=>console.log('Isolated preview: '+f.origin+'/__preview/owner'));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={createFixture};

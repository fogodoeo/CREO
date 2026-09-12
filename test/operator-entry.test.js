'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core');
const {createOperatorEntry}=require('../operator-entry'),{createGateway}=require('../gateway-server'),{hashPassword,createOperatorPassword}=require('../operator-password');
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'operator-entry-')),options={dbPath:path.join(dir,'isolated.sqlite'),durable:true,startWorker:false,adminSecret:'existing-app-key'};
 let repository=new SQLitePlatformRepository(options),api,entry;
 const password='local-browser-password',encoded=await hashPassword(password),sessionSecret='unchanged-checkout-signing-key';
 function boot(hash=encoded){api=createPlatformApi({repository,adminSessionSecret:sessionSecret,operatorPasswordHash:hash,logger:{error(){},warn(){}}});entry=createOperatorEntry({isAuthenticated:api.hasAdminSession});}
 await repository.saveCatalog([normalizeChannel({id:'alpha',name:'로컬 예시 경매',status:'active'})]);
 await repository.upsertRecord('alpha','vendor',{id:'v',name:'예시업체',phone:'01000000001'});
 await repository.upsertRecord('alpha','item',{id:'i',name:'A01',status:'sold',soldPrice:30000,winnerName:'예시구매자',winnerPhone:'01000000002',vendorId:'v'});
 boot();
 const core=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');if(await api.handle(req,res,url))return;if(await entry(req,res,url))return;res.writeHead(404);res.end();}catch(e){res.writeHead(500);res.end('Local error');}});
 const origin=await listen(core),gateway=createGateway({backendUrl:origin,publicOrigin:'https://creo.test'}),gatewayOrigin=await listen(gateway);
 t.after(async()=>{await new Promise(r=>gateway.close(r));await new Promise(r=>core.close(r));repository.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep));assert.ok(path.basename(target).startsWith('operator-entry-'));fs.rmSync(target,{recursive:true,force:true});});
 async function call(route,{method='GET',body,headers={},base=origin,...rest}={}){return fetch(base+route,{method,redirect:'manual',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),...rest});}
 async function login(p=password,headers={}){return call('/api/platform/auth/login',{method:'POST',body:{password:p},headers});}
 return {origin,gatewayOrigin,password,encoded,call,login,boot,get api(){return api},get repo(){return repository},async restart(hash=encoded){repository.close();repository=new SQLitePlatformRepository(options);boot(hash)}};
}
test('main HTML requires a server session and encoded or legacy aliases cannot bypass it',async t=>{
 const f=await fixture(t);
 for(const base of [f.origin,f.gatewayOrigin]){
  for(const route of ['/','/%2f','/%5c/']){const r=await f.call(route,{base});const body=await r.text();assert.match(body,/받으신 전용 링크/);assert.doesNotMatch(body,/quick-workspace|operator-login|channel-manager/);}
  for(const route of ['/main','/main/','/index.html','/%69ndex.html','/%2findex.html','/%5cINDEX.html']){
   const r=await f.call(route,{base,headers:{'X-Creo-Admin':'existing-app-key','If-None-Match':'anything',Range:'bytes=0-100'}});const body=await r.text();
   assert.notEqual(r.status,304);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(body,/quick-workspace/);
   if(r.status===302)assert.equal(r.headers.get('location'),'/main');else assert.match(body,/operator-login/);
  }
 }
});
test('new browser password signs an HttpOnly session, while the app credential remains separate',async t=>{
 const f=await fixture(t);assert.equal((await f.login('existing-app-key')).status,401);assert.equal((await f.login('wrong')).status,401);
 const login=await f.login(undefined,{'x-forwarded-proto':'https'});assert.equal(login.status,200);const set=login.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/SameSite=Strict/);assert.match(set,/Secure/);
 const cookie=set.split(';')[0];const main=await f.call('/main?channel=alpha',{headers:{cookie}});assert.match(await main.text(),/quick-workspace/);
 assert.equal((await f.call('/api/platform/channels',{headers:{'X-Creo-Admin':'existing-app-key'}})).status,200);
 assert.equal((await f.api.isAdmin({headers:{'x-creo-admin':f.password}})),false);
 const signed=await f.call('/main',{method:'HEAD',headers:{cookie}});assert.equal((await signed.text()),'');assert.ok(Number(signed.headers.get('content-length'))>1000);
 assert.equal((await f.call('/main',{method:'POST',body:{}})).status,405);
 await f.call('/api/platform/auth/logout',{method:'POST',body:{},headers:{cookie}});assert.match(await (await f.call('/main',{headers:{cookie}})).text(),/operator-login/);
});
test('restart preserves browser access, password rotation revokes it and all existing customer links survive',async t=>{
 const f=await fixture(t),admin={'X-Creo-Admin':'existing-app-key'};
 const buyer=await (await f.call('/api/platform/channels/alpha/buyer-shipping-link',{method:'POST',body:{itemId:'i'},headers:admin})).json();
 const vendor=await (await f.call('/api/platform/channels/alpha/vendor-checkout-link',{method:'POST',body:{vendorId:'v'},headers:admin})).json();
 const organizer=await (await f.call('/api/platform/channels/alpha/organizer-link',{method:'POST',body:{},headers:admin})).json();
 const cookie=(await f.login()).headers.get('set-cookie').split(';')[0];
 await f.restart();assert.match(await (await f.call('/main',{headers:{cookie}})).text(),/quick-workspace/);
 await f.restart(await hashPassword('replacement-browser-password'));assert.match(await (await f.call('/main',{headers:{cookie}})).text(),/operator-login/);assert.equal((await f.login()).status,401);
 assert.equal((await f.login('replacement-browser-password')).status,200);
 assert.equal((await f.call('/api/platform/buyer-shipping?code='+buyer.code)).status,200);
 assert.equal((await f.call('/api/platform/vendor-checkout?code='+vendor.code)).status,200);
 assert.equal((await f.call('/api/platform/organizer-access',{method:'POST',body:{code:new URL(organizer.url).pathname.split('/').at(-1)}})).status,200);
});
test('parallel incorrect logins consume the attempt limit before expensive password verification',async t=>{
 const f=await fixture(t),headers={'x-forwarded-for':'203.0.113.211'};
 const results=await Promise.all(Array.from({length:12},()=>f.login('wrong',headers)));
 assert.ok(results.every(r=>[401,429].includes(r.status)));assert.ok(results.filter(r=>r.status===401).length<=6);
 assert.equal((await f.login(undefined,headers)).status,429);
 assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
});
test('password hashes are salted, reject malformed configuration and cannot verify an API credential',async()=>{
 const first=await hashPassword('example-only-password'),second=await hashPassword('example-only-password');assert.notEqual(first,second);assert.doesNotMatch(first,/example-only-password/);
 const auth=createOperatorPassword(first);assert.equal(await auth.verify('example-only-password'),true);assert.equal(await auth.verify('existing-app-key'),false);assert.equal(await auth.verify({}),false);
 for(const bad of ['plaintext','scrypt-v1::','scrypt-v1:a:b'])assert.throws(()=>createOperatorPassword(bad),/Invalid/);
 assert.equal(await createOperatorPassword('').verify('legacy',p=>p==='legacy'),true);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const {createBuyerAccountAuth}=require('../buyer-account-auth'),{SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createBuyerAuthMaintenance}=require('../buyer-auth-maintenance');
const ROOT='creo_v2::buyer-auth::',origin='https://buyer.test';
async function fixture(t,overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-auth-lifecycle-')),options={dbPath:path.join(dir,'isolated.sqlite'),durable:true,startWorker:false};
 let repository,auth,time=Date.now(),fail=false;const upstream=[],requests=[];
 const config={enabled:true,origin,clientId:'fake-client',clientSecret:'fake-secret',appId:'7',secret:'local-lifecycle-secret-never-production',...overrides};
 const fetchImpl=async(url,options)=>{upstream.push(url);requests.push({url,options});if(fail)throw Error('PRIVATE provider failure');return new Response(JSON.stringify(url.endsWith('/token')?{access_token:'fake-token',token_type:'bearer'}:url.endsWith('access_token_info')?{app_id:7,expires_in:3600}:{sub:'123',phone_number_verified:true,phone_number:'+821000000002'}),{headers:{'Content-Type':'application/json'}})};
 function start(){repository=new SQLitePlatformRepository(options);auth=createBuyerAccountAuth({repository,config,fetchImpl,now:()=>time,hashPhone:value=>crypto.createHash('sha256').update(value).digest('base64url')});}start();
 t.after(()=>{repository.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-auth-lifecycle-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});});
 async function call(method,route,{jar={},body='',navigation=false,peer='127.0.0.1',headers={}}={}){
  const req=Readable.from(method==='POST'?[Buffer.from(body)]:[]);req.method=method;req.socket={remoteAddress:peer};req.headers={origin,'sec-fetch-site':'same-origin',...(navigation?{'sec-fetch-mode':'navigate'}:{}),cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';'),...headers};
  const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};
  await auth.handle(req,res,new URL(origin+'/api/platform/buyer-account/'+route));
  for(const line of [res.headers?.['Set-Cookie']||[]].flat()){const [key,value]=line.split(';')[0].split('=');if(value)jar[key]=value;else delete jar[key];}return res;
 }
 async function login(jar={}){const started=await call('POST','start',{jar}),state=new URL(started.headers.Location).searchParams.get('state');const completed=await call('GET','callback?state='+state+'&code=fake',{jar});assert.equal(completed.status,303,completed.body);return jar;}
 return {call,login,upstream,requests,config,get auth(){return auth},get repository(){return repository},advance:ms=>time+=ms,now:()=>time,setFailure:v=>fail=v,restart(){repository.close();start()}};
}

test('expired, cancelled and failed document logins return to a retryable page with only the bound trade link',async t=>{
 const f=await fixture(t),jar={},link='local-trade-link';
 const begin=async()=>new URL((await f.call('POST','start',{jar,body:'link='+link})).headers.Location).searchParams.get('state');
 let state=await begin();f.advance(300001);
 let response=await f.call('GET','callback?state='+state+'&code=fake',{jar,navigation:true});assert.equal(response.status,303);assert.match(response.headers.Location,/error=login_expired/);assert.match(response.headers.Location,/link=local-trade-link/);assert.equal(f.upstream.length,0);
 response=await f.call('GET','callback?state='+state+'&code=fake&link=stolen-link',{navigation:true});assert.match(response.headers.Location,/login_expired/);assert.doesNotMatch(response.headers.Location,/link=/);
 state=await begin();response=await f.call('GET','callback?state='+state+'&error=access_denied&error_description=PRIVATE',{jar,navigation:true});assert.match(response.headers.Location,/login_cancelled/);assert.match(response.headers.Location,/link=local-trade-link/);assert.doesNotMatch(response.headers.Location,/PRIVATE/);assert.equal(f.upstream.length,0);
 state=await begin();f.setFailure(true);response=await f.call('GET','callback?state='+state+'&code=fake',{jar,navigation:true});assert.match(response.headers.Location,/login_failed/);assert.match(response.headers.Location,/link=local-trade-link/);assert.doesNotMatch(response.body,/PRIVATE/);
 f.setFailure(false);await f.login(jar);assert.equal((await f.call('GET','session',{jar})).json().authenticated,true);
});

test('parallel tabs keep independent one-use states without clearing each other browser binding',async t=>{
 const f=await fixture(t),jar={};const begin=async()=>new URL((await f.call('POST','start',{jar})).headers.Location).searchParams.get('state');
 const first=await begin(),second=await begin(),cookie=JSON.stringify(jar);
 const wrong=await f.call('GET','callback?state='+first+'&code=fake',{jar:{},navigation:true});assert.match(wrong.headers.Location,/login_expired/);assert.equal(JSON.stringify(jar),cookie);
 for(const state of [first,second]){const response=await f.call('GET','callback?state='+state+'&code=fake',{jar,navigation:true});assert.equal(response.headers.Location,'/buyer-library.html');}
 const replay=await f.call('GET','callback?state='+first+'&code=fake',{jar,navigation:true});assert.match(replay.headers.Location,/login_expired/);assert.equal(f.upstream.filter(u=>u.endsWith('/token')).length,2);
});

test('browser rate limits do not group ordinary buyers behind one proxy or trust forwarded headers',async t=>{
 const f=await fixture(t),jar={};
 for(let i=0;i<20;i++)assert.equal((await f.call('POST','start',{jar})).status,303);
 assert.equal((await f.call('POST','start',{jar,headers:{'x-forwarded-for':'198.51.100.4'}})).status,429);
 const limited=await f.call('POST','start',{jar,body:'link=local-trade-link',navigation:true});assert.match(limited.headers.Location,/login_limited.*link=local-trade-link/);
 for(let i=0;i<30;i++)assert.equal((await f.call('POST','start',{jar:{}})).status,303,'different browser behind same peer');
 const victimJar={},victimStart=await f.call('POST','start',{jar:victimJar}),forged={...victimJar};for(const key of Object.keys(forged))if(key.endsWith('_browser'))forged[key]=forged[key].slice(0,-1)+'!';
 const forgedCallback=await f.call('GET','callback?state='+new URL(victimStart.headers.Location).searchParams.get('state')+'&code=fake',{jar:forged});assert.equal(forgedCallback.status,401);
 const appended={...victimJar};for(const key of Object.keys(appended))if(key.endsWith('_browser'))appended[key]+='.extra';
 const reset=await f.call('GET','session',{jar:appended});assert.equal(reset.status,200);assert.ok(reset.headers['Set-Cookie'],'malformed signed cookie must be replaced');assert.equal(Object.values(appended).some(value=>value.endsWith('.extra')),false);
 f.advance(600001);assert.equal((await f.call('POST','start',{jar})).status,303);assert.equal(f.upstream.length,0);
});

test('the coarse peer budget bounds repeated new-cookie starts',async t=>{
 const f=await fixture(t);for(let i=0;i<600;i++)assert.equal((await f.call('POST','start',{jar:{}})).status,303);
 assert.equal((await f.call('POST','start',{jar:{},headers:{'x-forwarded-for':'203.0.113.9'}})).status,429);assert.equal(f.upstream.length,0);
});

test('Talk preparation exposes only public settings and exchanges with the server REST credentials',async t=>{
 const f=await fixture(t,{javascriptKey:'a'.repeat(32)}),jar={};
 const available=(await f.call('GET','session',{jar})).json();assert.equal(available.kakao.javascriptKey,f.config.javascriptKey);assert.equal(available.authenticated,false);
 const response=await f.call('POST','prepare',{jar,body:'link=local-trade-link&redirectUri=https://attacker.test&scope=friends&transport=web'});assert.equal(response.status,200);
 const payload=response.json();assert.deepEqual(Object.keys(payload).sort(),['authorize','expiresIn']);assert.equal(payload.expiresIn,300);assert.equal(payload.authorize.redirectUri,origin+'/api/platform/buyer-account/callback');assert.equal(payload.authorize.throughTalk,true);assert.equal(payload.authorize.scope,'openid,phone_number');
 assert.doesNotMatch(JSON.stringify({...available,...payload}),/fake-secret|local-lifecycle-secret|code_verifier|access_token|fake-client/);
 const stored=await f.auth.read(ROOT+'state::'+f.auth.digest(payload.authorize.state));assert.equal(stored.transport,'talk');assert.equal(stored.verifier,undefined);
 const result=await f.call('GET','callback?state='+payload.authorize.state+'&code=fake',{jar});assert.equal(result.headers.Location,'/buyer-library.html#link=local-trade-link');
 const token=new URLSearchParams(f.requests[0].options.body);assert.equal(token.get('client_id'),'fake-client');assert.equal(token.get('client_secret'),'fake-secret');assert.equal(token.has('code_verifier'),false);assert.equal((await f.call('GET','session',{jar})).json().authenticated,true);
});

test('Talk and REST states coexist, survive restart, reject replay and retain REST PKCE',async t=>{
 const f=await fixture(t,{javascriptKey:'a'.repeat(32)}),jar={};
 const web=new URL((await f.call('POST','start',{jar})).headers.Location),talk=(await f.call('POST','prepare',{jar})).json().authorize;
 f.restart();const first=await f.call('GET','callback?state='+talk.state+'&code=fake',{jar});assert.equal(first.headers.Location,'/buyer-library.html');
 const oldJar={...jar};const responses=await Promise.all([f.call('GET','callback?state='+web.searchParams.get('state')+'&code=fake',{jar}),f.call('GET','callback?state='+web.searchParams.get('state')+'&code=fake',{jar})]);
 assert.equal(responses.filter(r=>r.status===303).length,1);assert.equal(responses.filter(r=>r.status===401).length,1);assert.equal(f.upstream.filter(u=>u.endsWith('/token')).length,2);
 const token=new URLSearchParams(f.requests.findLast(r=>r.url.endsWith('/token')).options.body),verifier=token.get('code_verifier');assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'),web.searchParams.get('code_challenge'));
 assert.equal((await f.call('GET','session',{jar:oldJar})).json().authenticated,false);assert.equal((await f.call('GET','session',{jar})).json().authenticated,true);
 assert.equal((await f.call('GET','callback?state='+talk.state+'&code=fake',{jar})).status,401);
});

test('Talk preparation shares origin, rate, expiry and browser boundaries with REST login',async t=>{
 const f=await fixture(t,{javascriptKey:'a'.repeat(32)}),jar={};
 assert.equal((await f.call('POST','prepare',{jar,headers:{origin:'https://attacker.test'}})).status,403);
 assert.equal((await f.call('POST','prepare',{jar,body:'link=bad'})).status,400);
 const response=await f.call('POST','prepare',{jar,body:'link=local-trade-link'}),state=response.json().authorize.state;
 assert.equal((await f.call('GET','callback?state='+state+'&code=fake',{jar:{}})).status,401);
 for(let i=1;i<20;i++)assert.equal((await f.call('POST',i%2?'start':'prepare',{jar})).status,i%2?303:200);
 assert.equal((await f.call('POST','prepare',{jar})).status,429);assert.equal((await f.call('POST','start',{jar})).status,429);
 f.advance(300001);const expired=await f.call('GET','callback?state='+state+'&code=fake',{jar,navigation:true});assert.match(expired.headers.Location,/login_expired.*link=local-trade-link/);assert.equal(f.upstream.length,0);
});

test('Talk is unavailable without an enabled valid key and rejects app mismatch or failed state storage',async t=>{
 for(const config of [{enabled:false,javascriptKey:'a'.repeat(32)},{javascriptKey:'wrong'},{javascriptKey:undefined}]){const f=await fixture(t,config);assert.equal((await f.call('GET','session')).json().kakao,undefined);assert.equal((await f.call('POST','prepare')).status,503);assert.equal(f.upstream.length,0);}
 const f=await fixture(t,{javascriptKey:'a'.repeat(32),appId:'8'}),jar={},upsert=f.repository.upsertRows.bind(f.repository);
 f.repository.upsertRows=async()=>{throw Error('PRIVATE storage detail')};const failed=await f.call('POST','prepare',{jar});assert.equal(failed.status,503);assert.doesNotMatch(failed.body,/PRIVATE/);f.repository.upsertRows=upsert;
 const state=(await f.call('POST','prepare',{jar})).json().authorize.state;const result=await f.call('GET','callback?state='+state+'&code=fake',{jar});assert.match(result.headers.Location,/login_failed/);assert.equal((await f.call('GET','session',{jar})).json().authenticated,false);assert.equal(f.upstream.some(u=>u.endsWith('userinfo')),false);
});

test('expired encrypted auth values are swept in bounded pages while live logins and collections remain',async t=>{
 const f=await fixture(t),jar=await f.login(),liveKeys=f.repository.db.prepare('SELECT key FROM platform_kv').all().map(row=>row.key);
 const keyFor=i=>ROOT+(i%2?'session':'state')+'::'+crypto.createHash('sha256').update('expired-'+i).digest('base64url');
 const rows=Array.from({length:61},(_,i)=>f.auth.row(keyFor(i),{expiresAt:f.now()-2*86400000,used:true}));
 const collectionKey='creo_v2::buyer-collection::record::retained',otherAuth=ROOT+'account::retained';
 const invalidKey=keyFor(1000);rows.push({key:invalidKey,value:'corrupt'},f.auth.row(collectionKey,{expiresAt:0,photos:['retained-photo']}),f.auth.row(otherAuth,{expiresAt:0}));await f.repository.upsertRows(rows);
 let total=0;for(let i=0;i<8;i++){const result=await f.auth.cleanupExpired();assert.ok(result.removed<=25);assert.ok(result.scanned<=100);total+=result.removed;if(!result.more)break;}
 assert.equal(total,61);assert.equal((await f.repository.getRowsByKeys([collectionKey,otherAuth,invalidKey,...liveKeys])).length,3+liveKeys.length);assert.equal((await f.call('GET','session',{jar})).json().authenticated,true);
 f.restart();assert.equal((await f.call('GET','session',{jar})).json().authenticated,true);
 f.advance(9*86400000);await f.auth.cleanupExpired();assert.equal((await f.call('GET','session',{jar})).json().authenticated,false);assert.equal((await f.repository.getRowsByKeys([collectionKey])).length,1);
});

test('cleanup coalesces concurrent scans, retains changed rows, and retries storage failures without deleting valid records',async t=>{
 const f=await fixture(t),key=ROOT+'state::'+crypto.randomBytes(32).toString('base64url');await f.repository.upsertRows([f.auth.row(key,{expiresAt:f.now()-2*86400000})]);
 const scan=f.repository.scanRowsByPrefix.bind(f.repository);let scans=0,release;const gate=new Promise(r=>release=r);
 f.repository.scanRowsByPrefix=async(...args)=>{scans++;const page=await scan(...args);await gate;return page;};
 const one=f.auth.cleanupExpired(),two=f.auth.cleanupExpired();await new Promise(r=>setImmediate(r));await f.repository.upsertRows([f.auth.row(key,{expiresAt:f.now()+60000})]);release();const results=await Promise.all([one,two]);assert.equal(scans,1);assert.equal(results[0].removed,0);assert.equal((await f.repository.getRowsByKeys([key])).length,1);
 f.repository.scanRowsByPrefix=async()=>{throw Error('isolated scan offline')};await assert.rejects(f.auth.cleanupExpired(),/offline/);assert.equal((await f.repository.getRowsByKeys([key])).length,1);
 f.repository.scanRowsByPrefix=scan;f.advance(2*86400000);const remove=f.repository.deleteRow.bind(f.repository);f.repository.deleteRow=async()=>{throw Error('isolated delete failure')};await assert.rejects(f.auth.cleanupExpired(),/delete failure/);
 f.repository.deleteRow=remove;assert.equal((await f.auth.cleanupExpired()).removed,1);
});

test('auth maintenance never overlaps, recovers after failure and drains before repository shutdown',async()=>{
 let callback,release,calls=0,cancelled=false,warnings=0;const gate=new Promise(r=>release=r);
 const worker=createBuyerAuthMaintenance({cleanup:async()=>{calls++;if(calls===1)await gate;else throw Error('isolated failure')},schedule:fn=>{callback=fn;return {unref(){}}},cancel:()=>{cancelled=true},logger:{warn(){warnings++}}});
 worker.start();const inProgress=worker.run();await Promise.resolve();void callback();assert.equal(calls,1);release();await inProgress;await worker.run();assert.equal(warnings,1);
 await worker.stop();void callback();await worker.run();assert.equal(calls,2);assert.equal(cancelled,true);
 let finish,closed=false;const active=createBuyerAuthMaintenance({cleanup:()=>new Promise(r=>finish=r),schedule:()=>({unref(){}}),cancel(){}});active.start();await Promise.resolve();const stopped=active.stop().then(()=>{closed=true});await Promise.resolve();assert.equal(closed,false);finish();await stopped;assert.equal(closed,true);
});

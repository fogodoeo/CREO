'use strict';
const crypto=require('node:crypto');
const PREFIX='/api/platform/buyer-account',ROOT='creo_v2::buyer-auth::';
const locks=new WeakMap();
function error(message,status=400){return Object.assign(new Error(message),{status});}
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function koreaPhone(value){const digits=String(value||'').replace(/[ -]/g,'');return /^\+8210\d{8}$/.test(digits)?'0'+digits.slice(3):/^010\d{8}$/.test(digits)?digits:'';}
function configFromEnv(env=process.env){return {enabled:env.CREO_BUYER_ACCOUNT_ENABLED==='true',origin:env.CREO_BUYER_ACCOUNT_ORIGIN,clientId:env.KAKAO_BUYER_CLIENT_ID,clientSecret:env.KAKAO_BUYER_CLIENT_SECRET,javascriptKey:env.KAKAO_BUYER_JAVASCRIPT_KEY,appId:env.KAKAO_BUYER_APP_ID,secret:env.CREO_BUYER_ACCOUNT_SECRET};}
function createBuyerAccountAuth({repository,config=configFromEnv(),fetchImpl=globalThis.fetch,now=Date.now,hashPhone}={}){
 const cfg={...config};let origin='';try{const url=new URL(cfg.origin);if(url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))origin=url.origin;}catch{}
 const enabled=cfg.enabled===true&&Boolean(origin&&cfg.clientId&&cfg.clientSecret&&/^\d+$/.test(String(cfg.appId))&&String(cfg.secret||'').length>=32&&hashPhone);
 const javascriptKey=enabled&&/^[a-f0-9]{32}$/i.test(String(cfg.javascriptKey||''))?cfg.javascriptKey:'';
 const secure=origin.startsWith('https:'),cookieName=secure?'__Host-ongdong_buyer':'ongdong_buyer_local',stateCookie=cookieName+'_flow',browserCookie=cookieName+'_browser';
 const key=crypto.createHash('sha256').update(String(cfg.secret||'unconfigured')).digest(),digest=value=>crypto.createHmac('sha256',key).update(String(value)).digest('base64url');
 const random=()=>crypto.randomBytes(32).toString('base64url'),validToken=value=>typeof value==='string'&&/^[\w-]{43}$/.test(value);
 const seal=(storageKey,value)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(storageKey));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),data:bytes.toString('base64url')});};
 const unseal=(storageKey,value)=>{try{const x=JSON.parse(value);if(x.v!==1)throw Error();const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(x.iv,'base64url'));decipher.setAAD(Buffer.from(storageKey));decipher.setAuthTag(Buffer.from(x.tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(x.data,'base64url')),decipher.final()]).toString('utf8'));}catch{throw error('로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.',503);}};
 const readMany=async keys=>{const values=new Map();for(let i=0;i<keys.length;i+=100){const wanted=new Set(keys.slice(i,i+100));for(const row of await repository.getRowsByKeys([...wanted]))if(wanted.has(row.key))values.set(row.key,unseal(row.key,row.value));}return values;};
 const read=async key=>(await readMany([key])).get(key)||null;
 const row=(key,value)=>({key,value:seal(key,value)});
 const lock=async(name,action)=>{if(!locks.has(repository))locks.set(repository,new Map());const map=locks.get(repository),previous=map.get(name)||Promise.resolve();let done;const current=new Promise(resolve=>done=resolve);map.set(name,current);await previous;try{return await action()}finally{done();if(map.get(name)===current)map.delete(name)}};
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
 const readCookie=(req,name)=>{const value=String(req.headers.cookie||'').split(';').find(p=>p.trim().startsWith(name+'='));return value?.trim().slice(name.length+1)||'';};
 const browserBinding=req=>{const value=readCookie(req,browserCookie),parts=value.split('.'),[token,signature]=parts;return parts.length===2&&validToken(token)&&validToken(signature)&&equal(signature,digest('browser:'+token))?value:'';};
 const newBrowserBinding=()=>{const token=random();return token+'.'+digest('browser:'+token);};
 const csrf=token=>digest('csrf:'+token);
 function sameOrigin(req){
  // A no-referrer document can send Origin: null for a form POST. Browser
  // Fetch Metadata still proves that it originated on this same site origin.
  const source=req.headers.origin,site=req.headers['sec-fetch-site'];
  if(site==='cross-site'||!(source===origin||((!source||source==='null')&&site==='same-origin')))throw error('이 페이지에서 다시 시도해 주세요.',403);
 }
 async function session(req){
  if(!enabled)return null;const token=readCookie(req,cookieName);if(!validToken(token))return null;
  const record=await read(ROOT+'session::'+digest(token));
  if(!record||record.revoked||!Number.isFinite(record.expiresAt)||record.expiresAt<=now()||!validToken(record.accountId))return null;
  return {...record,csrfToken:csrf(token)};
 }
 async function requireSession(req,{write=false,fresh=false}={}){
  const account=await session(req);if(!account)throw error('로그인해 주세요.',401);
  if(write){sameOrigin(req);if(!equal(req.headers['x-buyer-csrf'],account.csrfToken))throw error('페이지를 새로고침해 주세요.',403);}
  if(fresh&&(!Number.isFinite(account.authenticatedAt)||now()-account.authenticatedAt>15*60*1000))throw error('다시 로그인한 뒤 내역을 연결해 주세요.',401);
  return account;
 }
 async function requestJson(url,options={}){
  const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw error('카카오 로그인을 완료하지 못했어요.',502);
  if(Number(response.headers.get('content-length'))>128000)throw error('로그인 응답을 확인할 수 없어요.',502);
  const reader=response.body.getReader();let total=0;const parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>128000)throw error('로그인 응답을 확인할 수 없어요.',502);parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw error('로그인 응답을 확인할 수 없어요.',502);}
 }
 async function exchange(code,flow){
  // Kakao JS 2.8.3 has no PKCE option. Its documented server exchange uses
  // the REST key and client secret; only our REST flow sends a verifier.
  const talk=flow.transport==='talk';
  if(talk?!javascriptKey:!validToken(flow.verifier))throw error('로그인 요청을 확인할 수 없어요.',401);
  const token=await requestJson('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:origin+PREFIX+'/callback',code,...(!talk?{code_verifier:flow.verifier}:{})}).toString()});
  if(typeof token.access_token!=='string'||token.access_token.length>8192||token.token_type?.toLowerCase()!=='bearer')throw error('로그인 응답을 확인할 수 없어요.',502);
  const headers={Authorization:'Bearer '+token.access_token};
  const info=await requestJson('https://kapi.kakao.com/v1/user/access_token_info',{headers});
  if(String(info.app_id)!==String(cfg.appId)||!Number.isFinite(info.expires_in)||info.expires_in<=0)throw error('로그인 앱을 확인할 수 없어요.',502);
  const user=await requestJson('https://kapi.kakao.com/v1/oidc/userinfo',{headers});
  if(typeof user.sub!=='string'||!/^\d{1,32}$/.test(user.sub))throw error('로그인 계정을 확인할 수 없어요.',502);
  const phone=user.phone_number_verified===true?koreaPhone(user.phone_number):'';
  return {accountId:digest(`kakao:${cfg.clientId}:${user.sub}`),phoneHash:phone?hashPhone(phone):'',phoneLast4:phone.slice(-4)};
 }
 const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 const json=(res,status,body,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(body));};
 const redirect=(res,to,cookies=[])=>{res.writeHead(303,{...headers,Location:to,...(cookies.length?{'Set-Cookie':cookies}:{})});res.end();};
 const attempts=new Map();
 function rate(req,binding){
  const time=now();for(const [id,value]of attempts)if(time-value.since>=600000)attempts.delete(id);
  // Never trust a caller-provided forwarding header. A coarse peer budget bounds
  // cookie-reset abuse; signed browser identities avoid grouping ordinary buyers.
  for(const [id,limit]of [['peer:'+digest(String(req.socket?.remoteAddress||'unknown')),600],['browser:'+digest(binding),20]]){
   const old=attempts.get(id);if(!old&&attempts.size>=2200)throw error('잠시 후 다시 로그인해 주세요.',429);
   const next=old?{since:old.since,count:old.count+1}:{since:time,count:1};attempts.set(id,next);
   if(next.count>limit)throw error('잠시 후 다시 로그인해 주세요.',429);
  }
 }
 const validLink=value=>typeof value==='string'&&/^[\w-]{8,24}$/.test(value)?value:'';
 const loginFailure=(res,reason,link='')=>redirect(res,'/buyer-library.html?reauth=1#'+new URLSearchParams({error:reason,...(validLink(link)?{link}: {})}).toString());
 let cleanupCursor='',cleanupPending=null;
 async function cleanupExpired(){
  if(!enabled)return {enabled:false,scanned:0,removed:0,invalid:0};
  if(cleanupPending)return cleanupPending;
  cleanupPending=(async()=>{
   const page=await repository.scanRowsByPrefix(ROOT,{after:cleanupCursor,limit:100}),cutoff=now()-86400000;
   let scanned=0,removed=0,invalid=0,lastKey='';
   for(const candidate of page.rows){
    if(removed>=25)break;
    scanned++;lastKey=candidate.key;
    if(!new RegExp('^'+ROOT+'(?:state|session)::[A-Za-z0-9_-]{43}$').test(candidate.key))continue;
    let value;try{value=unseal(candidate.key,candidate.value)}catch{invalid++;continue;}
    if(!Number.isFinite(value.expiresAt)||value.expiresAt>cutoff)continue;
    await lock(candidate.key,async()=>{
     const current=(await repository.getRowsByKeys([candidate.key]))[0];
     if(!current||current.value!==candidate.value)return;
     await repository.deleteRow(candidate.key);removed++;
    });
    await new Promise(resolve=>setImmediate(resolve));
   }
   cleanupCursor=scanned<page.rows.length?lastKey:page.nextCursor||'';
   return {enabled:true,scanned,removed,invalid,more:Boolean(cleanupCursor)};
  })();
  try{return await cleanupPending}finally{cleanupPending=null;}
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith(PREFIX+'/'))return false;
  const route=url.pathname.slice(PREFIX.length),method=req.method;
  const navigation=req.headers['sec-fetch-mode']==='navigate'||String(req.headers.accept||'').includes('text/html');
  let resumeLink='';
  try{
   if(route==='/session'&&method==='GET'){
    const user=await session(req);json(res,200,{available:enabled,authenticated:Boolean(user),...(javascriptKey?{kakao:{javascriptKey}}:{}),...(user?{phoneLast4:user.phoneLast4,canLink:Boolean(user.phoneHash),csrfToken:user.csrfToken}:{})},enabled&&!browserBinding(req)?{'Set-Cookie':[cookie(browserCookie,newBrowserBinding(),86400)]}:{});return true;
   }
   if(!enabled){if(navigation&&['/start','/callback'].includes(route))loginFailure(res,'login_unavailable');else json(res,503,{error:'보관함 로그인을 준비하고 있어요.'});return true;}
   if(['/start','/prepare'].includes(route)&&method==='POST'){
    const talk=route==='/prepare';if(talk&&!javascriptKey)throw error('카카오계정으로 로그인해 주세요.',503);
    sameOrigin(req);const binding=browserBinding(req)||newBrowserBinding();let bytes='';for await(const chunk of req){bytes+=chunk.toString();if(Buffer.byteLength(bytes)>2048)throw error('요청이 너무 커요.',413);}
    const code=new URLSearchParams(bytes).get('link')||'';if(code&&!/^[\w-]{8,24}$/.test(code))throw error('낙찰 링크를 확인해 주세요.');
    resumeLink=code;rate(req,binding);
    const state=random(),verifier=talk?'':random(),stateKey=ROOT+'state::'+digest(state);
    await repository.upsertRows([row(stateKey,{binding:digest('flow:'+binding),...(talk?{transport:'talk'}:{verifier}),link:code,expiresAt:now()+5*60*1000,used:false})]);
    if(talk){json(res,200,{authorize:{redirectUri:origin+PREFIX+'/callback',state,scope:'openid,phone_number',throughTalk:true},expiresIn:300},{'Set-Cookie':[cookie(browserCookie,binding,86400)]});return true;}
    const authorize=new URL('https://kauth.kakao.com/oauth/authorize');authorize.search=new URLSearchParams({client_id:cfg.clientId,redirect_uri:origin+PREFIX+'/callback',response_type:'code',scope:'openid,phone_number',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
    redirect(res,authorize.toString(),[cookie(browserCookie,binding,86400)]);return true;
   }
   if(route==='/callback'&&method==='GET'){
    const state=url.searchParams.get('state'),binding=browserBinding(req),legacyBinding=readCookie(req,stateCookie);
    if(!validToken(state)||(!binding&&!validToken(legacyBinding)))throw error('로그인 요청이 만료됐어요.',401);
    const stateKey=ROOT+'state::'+digest(state);
    const flow=await lock(stateKey,async()=>{
     const record=await read(stateKey),bound=record&&(binding&&equal(record.binding,digest('flow:'+binding))||validToken(legacyBinding)&&equal(record.binding,digest(legacyBinding)));
     if(!bound)throw error('로그인 요청이 만료됐어요.',401);
     resumeLink=validLink(record.link);
     if(record.used||!Number.isFinite(record.expiresAt)||record.expiresAt<=now())throw error('로그인 요청이 만료됐어요.',401);
     await repository.upsertRows([row(stateKey,{used:true,binding:record.binding,link:resumeLink,expiresAt:now()})]);return record;
    });
    try{
     const code=url.searchParams.get('code');if(url.searchParams.get('error')==='access_denied'){loginFailure(res,'login_cancelled',resumeLink);return true;}
     if(url.searchParams.has('error')||!code||code.length>2048)throw error('로그인을 완료하지 못했어요.',401);
     const account=await exchange(code,flow),token=random(),stamp=now();
     const old=readCookie(req,cookieName),rows=[row(ROOT+'session::'+digest(token),{...account,authenticatedAt:stamp,expiresAt:stamp+7*86400000,revoked:false})];
     if(validToken(old))rows.push(row(ROOT+'session::'+digest(old),{revoked:true,expiresAt:stamp}));
     await repository.upsertRows(rows);
     redirect(res,'/buyer-library.html'+(flow.link?'#link='+flow.link:''),[cookie(cookieName,token,7*86400),cookie(stateCookie,'',0)]);
    }catch{loginFailure(res,'login_failed',resumeLink);}
    return true;
   }
   if(route==='/logout'&&method==='POST'){
    await requireSession(req,{write:true});const token=readCookie(req,cookieName);
    await repository.upsertRows([row(ROOT+'session::'+digest(token),{revoked:true,expiresAt:now()})]);json(res,200,{authenticated:false},{'Set-Cookie':[cookie(cookieName,'',0)]});return true;
   }
   json(res,404,{error:'페이지를 찾을 수 없어요.'});return true;
  }catch(err){
   if(navigation&&['/start','/callback'].includes(route))loginFailure(res,err.status===429?'login_limited':route==='/callback'&&err.status===401?'login_expired':'login_failed',resumeLink);
   else json(res,err.status||503,{error:err.status?err.message:'로그인을 잠시 후 다시 시도해 주세요.'});return true;
  }
 }
 return {enabled,origin,handle,session,requireSession,digest,read,readMany,row,lock,cleanupExpired,decodeRow:row=>unseal(row.key,row.value)};
}
module.exports={createBuyerAccountAuth,configFromEnv,koreaPhone};

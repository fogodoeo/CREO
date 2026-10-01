'use strict';
const crypto=require('node:crypto');
const {channelKey}=require('./platform-core');
const {REGIONS}=require('./broadcast-booking');
const PREFIX='/api/platform/vendor-access',ROOT='creo_vendor_access_v1::',STATE=ROOT+'directory';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const phone=value=>{const p=String(value||'').replace(/[\s-]/g,'').replace(/^(?:\+82|0082)0?/,'0');return /^010\d{8}$/.test(p)?p:'';};
const equal=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
function createVendorAccess({repository,secret,origin='https://creok.onrender.com',now=Date.now,smsProvider,buyerAccount,channelFor,vendorsFor,profileFor,saveProfile,notificationService,existingVendorsFor}={}){
 const configured=String(secret||'').length>=32&&typeof repository.compareAndSwapRows==='function';
 const key=crypto.createHash('sha256').update('vendor-access:'+String(secret||'unconfigured')).digest();
 const digest=v=>crypto.createHmac('sha256',key).update(String(v)).digest('base64url');
 const random=()=>crypto.randomBytes(32).toString('base64url'),valid=v=>/^[\w-]{43}$/.test(String(v||''));
 function signAccess(payload){const data=Buffer.from(JSON.stringify({...payload,v:1,expiresAt:now()+30*86400000})).toString('base64url');return 'va1.'+data+'.'+digest('access:'+data);}
 function verifyToken(token){try{const [prefix,data,signature,extra]=String(token||'').split('.');if(!configured||prefix!=='va1'||extra||!data||data.length>2000||!equal(signature,digest('access:'+data)))return null;const payload=JSON.parse(Buffer.from(data,'base64url').toString());const allowed=payload.accessKind==='phone'?typeof existingVendorsFor==='function'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(payload.channelId)&&typeof payload.vendorKey==='string'&&payload.vendorKey.length<=80:payload.channelId==='national-cre';return payload.v===1&&allowed&&payload.expiresAt>now()&&valid(payload.accessActor)&&valid(payload.accessSession)?payload:null;}catch{return null;}}
 const secure=origin.startsWith('https:'),cookieName=secure?'__Host-creo_vendor':'creo_vendor_local',flowName=cookieName+'_flow';
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax${age===null?'':'; Max-Age='+age}${secure?'; Secure':''}`;
 const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));
 function seal(k,value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(k));const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return JSON.stringify({iv:iv.toString('base64url'),tag:c.getAuthTag().toString('base64url'),data:data.toString('base64url')});}
 function unseal(k,value){try{const x=JSON.parse(value),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(x.iv,'base64url'));d.setAAD(Buffer.from(k));d.setAuthTag(Buffer.from(x.tag,'base64url'));return JSON.parse(Buffer.concat([d.update(Buffer.from(x.data,'base64url')),d.final()]).toString());}catch{throw fail('접속 정보를 읽지 못했어요. 잠시 후 다시 시도해 주세요.',503);}}
 const row=(k,value)=>({key:k,value:seal(k,value)});
 async function read(k){const r=(await repository.getRowsByKeys([k])).find(r=>r.key===k);if(!r&&repository.mirror&&repository.lastMirrorError)throw fail('접속 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',503);return {raw:r?.value??null,value:r?unseal(k,r.value):null};}
 const fresh=()=>({version:0,actors:[],companies:[],requests:[],rates:[]});
 async function mutate(work){
  if(!configured)throw fail('업체 접속 설정을 확인 중이에요.',503);
  for(let retry=0;retry<8;retry++){
   const {raw,value}=await read(STATE),state=value||fresh(),extra=[];
   const result=await work(state,extra);state.version++;
   if(await repository.compareAndSwapRows(STATE,raw,[row(STATE,state),...extra]))return result;
  }
  throw fail('다른 요청을 처리 중이에요. 다시 시도해 주세요.',409);
 }
 async function session(req){if(!configured)return null;const token=cookies(req)[cookieName];if(!valid(token))return null;const id=digest(token),s=(await read(ROOT+'session:'+id)).value;return s&&!s.revoked&&s.expiresAt>now()?{...s,id,csrfToken:digest('csrf:'+token)}:null;}
 async function requireSession(req){const s=await session(req);if(!s)throw fail('다시 로그인해 주세요.',401);return s;}
 function guard(req,csrf){if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'||!equal(req.headers['x-vendor-csrf'],csrf))throw fail('페이지를 새로고침한 뒤 다시 시도해 주세요.',403);}
 const actorOf=(state,s)=>state.actors.find(a=>a.id===s.actorId);
 const member=(state,actorId,companyId)=>state.companies.find(c=>c.id===companyId&&c.members.some(m=>m.actorId===actorId));
 async function actorFor(identity,verifiedPhone){
  return mutate(state=>{
   let actor=state.actors.find(a=>a.identities.includes(identity));
   if(!actor&&verifiedPhone)actor=state.actors.find(a=>a.phone===verifiedPhone);
   if(!actor){actor={id:random(),identities:[],phone:verifiedPhone||'',createdAt:now()};state.actors.push(actor);}
   if(!actor.identities.includes(identity))actor.identities.push(identity);
   // A changed Kakao phone never silently transfers another account's ownership.
   if(verifiedPhone&&!actor.phone&&!state.actors.some(a=>a.id!==actor.id&&a.phone===verifiedPhone))actor.phone=verifiedPhone;
   return actor;
  });
 }
 async function issueSession(req,res,actor,remember,verifiedPhone=''){
  const token=random(),stamp=now(),id=digest(token),previous=await session(req),rows=[row(ROOT+'session:'+id,{actorId:actor.id,verifiedPhone:phone(verifiedPhone),createdAt:stamp,expiresAt:stamp+(remember?30:1)*86400000,revoked:false})];
  if(previous)rows.push(row(ROOT+'session:'+previous.id,{...previous,revoked:true}));
  await repository.upsertRows(rows);
  json(res,200,{authenticated:true},{'Set-Cookie':[cookie(cookieName,token,remember?30*86400:null)]});
 }
 async function authorize(token){
  if(!token?.accessSession||!valid(token.accessSession))return null;
  const s=(await read(ROOT+'session:'+token.accessSession)).value;
  if(!s||s.revoked||s.expiresAt<=now()||s.actorId!==token.accessActor)return null;
  if(token.accessKind==='phone'){
   if(!phone(s.verifiedPhone)||!existingVendorsFor)return null;
   const matches=await existingVendorsFor(phone(s.verifiedPhone));
   return matches.some(m=>m.channelId===token.channelId&&m.vendorId===token.vendorKey)?{role:'owner',kind:'phone',actorId:s.actorId}:null;
  }
  if(token.channelId!=='national-cre')return null;
  const state=(await read(STATE)).value||fresh(),company=member(state,s.actorId,token.vendorKey);
  if(!company)return null;
  return {role:company.ownerId===s.actorId?'owner':'staff',actorId:s.actorId,companyId:company.id};
 }
 async function view(req){
  const s=await session(req),state=(await read(STATE)).value||fresh(),actor=s&&actorOf(state,s);
  const ready=Boolean(configured&&(existingVendorsFor||await channelFor()));
  const base={available:ready,channelLogin:!!existingVendorsFor,smsAvailable:ready&&smsProvider?.readiness('vendor_otp','sms').ready===true&&!smsProvider.testMode,kakaoAvailable:ready&&buyerAccount?.enabled===true,regions:REGIONS};
  if(!actor)return {...base,authenticated:false};
  const records=await vendorsFor(),companies=state.companies.filter(c=>member(state,s.actorId,c.id)).map(c=>{const v=records.find(v=>v.id===c.id);return v?{id:c.id,name:v.name,region:REGIONS[v.bookingRegion]||'',role:c.ownerId===actor.id?'owner':'staff'}:null;}).filter(Boolean);
  const requests=state.requests.filter(r=>r.actorId===actor.id&&r.status==='pending').map(r=>({id:r.id,companyId:r.companyId,name:records.find(v=>v.id===r.companyId)?.name||'업체',status:r.status}));
  const participations=existingVendorsFor&&phone(s.verifiedPhone)?await existingVendorsFor(phone(s.verifiedPhone)):[];
  return {...base,authenticated:true,phone:s.verifiedPhone||actor.phone,phoneVerificationRequired:!!existingVendorsFor&&!phone(s.verifiedPhone),participations,csrfToken:s.csrfToken,companies,requests};
 }
 async function proofFor(token,s,target,purpose){
  if(!valid(token))throw fail('연락처를 인증해 주세요.',422);
  const proof=(await read(ROOT+'proof:'+digest(token))).value;
  if(!proof||proof.expiresAt<=now()||proof.actorId!==s.actorId||proof.phone!==target||proof.purpose!==purpose)throw fail('연락처를 다시 인증해 주세요.',422);
  return proof;
 }
 async function beginOtp(req,body,s){
  const target=phone(body.phone),purpose=body.purpose||'login';
  if(!target||!['login','register','contact'].includes(purpose))throw fail('010으로 시작하는 휴대전화 번호를 입력해 주세요.',422);
  if(purpose!=='login'&&!s)throw fail('다시 로그인해 주세요.',401);
  if(!smsProvider?.readiness('vendor_otp','sms').ready||smsProvider.testMode)throw fail('문자 인증 설정을 확인 중이에요.',503);
  const flow=cookies(req)[flowName];if(!valid(flow))throw fail('페이지를 새로고침해 주세요.',403);
  const id=random(),code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),stamp=now();
  await mutate((state,extra)=>{
   state.rates=state.rates.filter(r=>r.until>stamp);
   const budgets=[[digest('phone:'+target),5,3600000],[digest('peer:'+String(req.socket?.remoteAddress||'')),60,3600000],[digest('global'),500,86400000]];
   for(const [key,limit,duration]of budgets){let r=state.rates.find(r=>r.key===key);if(r&&(r.count>=limit||key===budgets[0][0]&&stamp-r.last<60000))throw fail('인증번호를 이미 요청했어요. 잠시 후 다시 받아 주세요.',429);if(!r){r={key,count:0,last:0,until:stamp+duration};state.rates.push(r);}r.count++;r.last=stamp;}
   extra.push(row(ROOT+'otp:'+digest(id),{phone:target,purpose,actorId:s?.actorId||'',binding:digest(flow),hash:digest(id+':'+code),expiresAt:stamp+180000,attempts:0,status:'sending'}));
  });
  try{
   await smsProvider.sendSms({id:'vendor-otp-'+digest(id),recipientPhone:target,fallbackText:`[옹동2] 인증번호 ${code} (3분 내 입력)`});
   const k=ROOT+'otp:'+digest(id),old=await read(k);await repository.compareAndSwapRows(k,old.raw,[row(k,{...old.value,status:'sent'})]);
  }catch{throw fail('인증 문자를 보내지 못했어요. 잠시 후 다시 요청해 주세요.',502);}
  return {challenge:id,expiresIn:180,retryAfter:60};
 }
 async function verifyOtp(req,body,s){
  if(!valid(body.challenge)||!/^\d{6}$/.test(String(body.code||'')))throw fail('6자리 인증번호를 입력해 주세요.',422);
  const k=ROOT+'otp:'+digest(body.challenge),{raw,value:p}=await read(k),flow=cookies(req)[flowName];
  if(!p||p.binding!==digest(flow)||p.expiresAt<=now()||p.attempts>=5||p.status!=='sent'||p.actorId!==(s?.actorId||''))throw fail('인증번호가 만료됐어요. 다시 받아 주세요.',422);
  const correct=equal(p.hash,digest(body.challenge+':'+body.code));
  if(!await repository.compareAndSwapRows(k,raw,[row(k,{...p,attempts:p.attempts+1,status:correct?'used':'sent'})]))throw fail('인증 요청을 처리 중이에요. 다시 시도해 주세요.',409);
  if(!correct)throw fail('인증번호를 확인해 주세요.',422);
  return p;
 }
 const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 function json(res,status,body,extra={}){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(body));}
 async function bodyOf(req){let data='';for await(const b of req){data+=b.toString();if(Buffer.byteLength(data)>12000)throw fail('입력 내용이 너무 길어요.',413);}try{return JSON.parse(data||'{}');}catch{throw fail('입력을 확인해 주세요.');}}
 async function handle(req,res,url){
  if(!url.pathname.startsWith(PREFIX+'/'))return false;
  const route=url.pathname.slice(PREFIX.length),method=req.method;
  try{
   if(!configured)throw fail('업체 접속 설정을 확인 중이에요.',503);
   if(route==='/session'&&method==='GET'){
    const flow=valid(cookies(req)[flowName])?cookies(req)[flowName]:random(),data=await view(req);
    json(res,200,{...data,...(!data.authenticated?{csrfToken:digest('flow:'+flow)}:{})},{'Set-Cookie':[cookie(flowName,flow,86400)]});return true;
   }
   const s=await session(req);
   if(route==='/search'&&method==='GET'){
    if(!s)throw fail('먼저 로그인해 주세요.',401);
    const query=String(url.searchParams.get('q')||'').trim().slice(0,40),state=(await read(STATE)).value||fresh();
    const list=query?(await vendorsFor()).filter(v=>v.active!==false&&state.companies.some(c=>c.id===v.id)&&v.name.includes(query)).slice(0,20).map(v=>({id:v.id,name:v.name,region:REGIONS[v.bookingRegion]||''})):[];
    json(res,200,{companies:list});return true;
   }
   if(method!=='POST')throw fail('요청을 찾을 수 없어요.',404);
   guard(req,s?.csrfToken||digest('flow:'+cookies(req)[flowName]));
   const body=await bodyOf(req);
   if(!existingVendorsFor&&!await channelFor())throw fail('접속을 준비 중이에요. 잠시 후 다시 시도해 주세요.',503);
   if(route==='/otp'){json(res,200,await beginOtp(req,body,s));return true;}
   if(route==='/verify'){
    const proof=await verifyOtp(req,body,s);
    if(proof.purpose==='login'){const actor=await actorFor('phone:'+digest(proof.phone),proof.phone);await issueSession(req,res,actor,body.remember===true,proof.phone);}
    else{const token=random();await repository.upsertRows([row(ROOT+'proof:'+digest(token),{phone:proof.phone,purpose:proof.purpose,actorId:s.actorId,expiresAt:now()+300000})]);json(res,200,{proof:token});}
    return true;
   }
   if(route==='/kakao'){
    const account=await buyerAccount?.session(req);if(!account)throw fail('카카오 로그인을 완료해 주세요.',401);
    const actor=await actorFor('kakao:'+account.accountId,phone(account.verifiedPhone));await issueSession(req,res,actor,body.remember===true,account.verifiedPhone);return true;
   }
   if(!s)throw fail('다시 로그인해 주세요.',401);
   if(route==='/logout'){await repository.upsertRows([row(ROOT+'session:'+s.id,{...s,revoked:true})]);json(res,200,{authenticated:false},{'Set-Cookie':[cookie(cookieName,'',0)]});return true;}
   if(route==='/register'){
    const name=String(body.name||'').trim(),region=REGIONS.indexOf(body.region),contact=phone(body.phone);
    if(!name||name.length>40||region<0||!contact)throw fail('업체명·지역·연락처를 확인해 주세요.',422);
    const state=(await read(STATE)).value||fresh(),actor=actorOf(state,s);if(!actor)throw fail('다시 로그인해 주세요.',401);
    if(actor.phone!==contact)await proofFor(body.proof,s,contact,'register');
    const result=await mutate((next,extra)=>{
     const existing=next.companies.find(c=>c.ownerId===s.actorId);if(existing)return {id:existing.id,duplicate:true};
     if(next.companies.some(c=>c.name.normalize('NFKC').replace(/\s/g,'')===name.normalize('NFKC').replace(/\s/g,'')&&c.region===region))throw fail('같은 이름의 업체가 있어요. 직원으로 참여하기에서 찾아 주세요.',409);
     const id='va-'+crypto.randomUUID().replaceAll('-',''),company={id,name,region,ownerId:s.actorId,members:[{actorId:s.actorId,name:'대표'}],createdAt:now()};next.companies.push(company);
     extra.push({key:channelKey('national-cre','vendor',id),value:JSON.stringify({id,name,phone:contact,inquiryPhone:contact,inquiryPhoneMode:'shared',active:true,bookingRegion:region,createdAt:new Date(now()).toISOString()})});return {id};
    });json(res,200,result);return true;
   }
   if(route==='/select'){
    if(body.channelId){
     if(!existingVendorsFor||!phone(s.verifiedPhone))throw fail('업체에 등록된 번호로 다시 로그인해 주세요.',403);
     const matches=await existingVendorsFor(phone(s.verifiedPhone));
     const selected=matches.find(m=>m.channelId===body.channelId&&m.vendorId===body.vendorId);
     if(!selected)throw fail('연결된 채널을 다시 선택해 주세요.',403);
     const token=signAccess({channelId:selected.channelId,vendorKey:selected.vendorId,accessKind:'phone',accessActor:s.actorId,accessSession:s.id});
     json(res,200,{token,channelId:selected.channelId,vendorId:selected.vendorId});return true;
    }
    const state=(await read(STATE)).value||fresh(),company=member(state,s.actorId,body.id);if(!company)throw fail('연결된 업체를 선택해 주세요.',403);
    const token=signAccess({channelId:'national-cre',vendorKey:company.id,accessActor:s.actorId,accessSession:s.id});json(res,200,{token,companyId:company.id});return true;
   }
   if(route==='/join'){
    const name=String(body.name||'').trim();if(!name||name.length>40)throw fail('대표가 알아볼 수 있는 이름을 입력해 주세요.',422);
    if(body.sharingConsent!==true)throw fail('업체 대표에게 이름·전화번호를 제공하는 데 동의해 주세요.',422);
    const result=await mutate(async(state,extra)=>{
     const company=state.companies.find(c=>c.id===body.companyId);if(!company)throw fail('업체를 다시 찾아 주세요.',404);
     if(member(state,s.actorId,company.id))return {connected:true};
     const old=state.requests.find(r=>r.actorId===s.actorId&&r.status==='pending');if(old)return {id:old.id,duplicate:true};
     const item={id:crypto.randomUUID(),companyId:company.id,actorId:s.actorId,name,status:'pending',createdAt:now(),sharingConsent:{version:'2026-09-23',acceptedAt:now()}};state.requests.push(item);
     const owner=state.actors.find(a=>a.id===company.ownerId);
     if(owner?.phone&&notificationService?.prepare){const prepared=await notificationService.prepare('national-cre',{templateKey:'vendor_join_requested',eventKey:'vendor-join:'+item.id,recipientRole:'vendor',recipientPhone:owner.phone,allowSmsFallback:false,failureSmsFallback:false,variables:{업체명:company.name,직원명:name,참여요청ID:item.id,접속주소:origin+'/vendor-access.html?section=profile&company='+company.id}});if(!prepared.duplicate)extra.push({key:channelKey('national-cre','notification',prepared.record.id),value:JSON.stringify(prepared.record)});}
     return {id:item.id};
    });json(res,200,result);return true;
   }
   if(route==='/join-response'){
    const result=await mutate(state=>{
     const item=state.requests.find(r=>r.id===body.id),company=state.companies.find(c=>c.id===item?.companyId);
     if(!item||!company)throw fail('참여 요청을 찾을 수 없어요.',404);
     const cancel=body.action==='cancel';if(cancel?item.actorId!==s.actorId:company.ownerId!==s.actorId)throw fail('이 요청을 처리할 권한이 없어요.',403);
     if(!['cancel','approve','reject'].includes(body.action))throw fail('응답을 확인해 주세요.',422);
     const status={cancel:'cancelled',approve:'approved',reject:'rejected'}[body.action];if(item.status!=='pending'){if(item.status===status)return {duplicate:true};throw fail('이미 처리된 요청이에요.',409);}
     if(status==='approved'&&!member(state,item.actorId,company.id))company.members.push({actorId:item.actorId,name:item.name});item.status=status;item.updatedAt=now();return {status};
    });json(res,200,result);return true;
   }
   if(route==='/profile'){
    const state=(await read(STATE)).value||fresh(),company=member(state,s.actorId,body.companyId);if(!company)throw fail('연결된 업체를 확인해 주세요.',403);
    const owner=company.ownerId===s.actorId,vendor=await profileFor(company.id);if(!vendor)throw fail('업체 정보를 찾을 수 없어요.',404);
    if(body.action){
     if(!owner)throw fail('업체 대표만 변경할 수 있어요.',403);
     const changes={};
     if(body.action==='contact'){const target=phone(body.phone);if(!target)throw fail('연락처를 확인해 주세요.',422);await proofFor(body.proof,s,target,'contact');changes.phone=target;}
     else if(body.action==='bank'){for(const key of ['bankName','bankAccount','bankHolder'])changes[key]=String(body[key]||'').trim();if(!changes.bankName||changes.bankName.length>60||!changes.bankHolder||changes.bankHolder.length>40||!/^\d[\d -]{3,38}\d$/.test(changes.bankAccount))throw fail('은행·계좌번호·예금주를 확인해 주세요.',422);}
     else throw fail('변경할 항목을 확인해 주세요.',422);
     await saveProfile(company.id,changes,body.revision);json(res,200,{saved:true});return true;
    }
    json(res,200,{id:vendor.id,name:vendor.name,region:REGIONS[vendor.bookingRegion]||REGIONS[company.region],phone:vendor.phone,revision:vendor.directoryRevision||0,role:owner?'owner':'staff',...(owner?{bankName:vendor.bankName||'',bankAccount:vendor.bankAccount||'',bankHolder:vendor.bankHolder||'',members:company.members.map(m=>({name:m.name,owner:m.actorId===company.ownerId})),requests:state.requests.filter(r=>r.companyId===company.id&&r.status==='pending').map(r=>({id:r.id,name:r.name,phone:state.actors.find(a=>a.id===r.actorId)?.phone||''}))}:{})});return true;
   }
   throw fail('요청을 찾을 수 없어요.',404);
  }catch(e){json(res,e.status||503,{error:e.status?e.message:'처리하지 못했어요. 잠시 후 다시 시도해 주세요.'});return true;}
 }
 async function assertNotification(notice){const state=(await read(STATE)).value||fresh(),id=notice.variables?.참여요청ID||notice.variables?.['#{참여요청ID}'],request=state.requests.find(r=>r.id===id),company=state.companies.find(c=>c.id===request?.companyId),owner=state.actors.find(a=>a.id===company?.ownerId);if(request?.status!=='pending'||owner?.phone!==notice.recipientPhone)throw Object.assign(fail('이미 처리된 참여 요청이에요.'),{code:'BUYER_LINK_INACTIVE'});}
 let cleanupCursor='',cleanupPending=null;
 async function cleanupExpired(){
  if(!configured||!repository.scanRowsByPrefix||!repository.deleteRow)return {enabled:false,scanned:0,removed:0};
  if(cleanupPending)return cleanupPending;
  cleanupPending=(async()=>{
   const page=await repository.scanRowsByPrefix(ROOT,{after:cleanupCursor,limit:100}),cutoff=now()-86400000;
   let scanned=0,removed=0,invalid=0,lastKey='';
   for(const candidate of page.rows){
    if(removed>=25)break;
    scanned++;lastKey=candidate.key;
    if(!/^creo_vendor_access_v1::(?:otp|proof|session):[A-Za-z0-9_-]{43}$/.test(candidate.key))continue;
    let value;try{value=unseal(candidate.key,candidate.value);}catch{invalid++;continue;}
    if(!Number.isFinite(value.expiresAt)||value.expiresAt>cutoff)continue;
    const current=(await repository.getRowsByKeys([candidate.key]))[0];
    // Tokens are random and never renewed in place. Concurrent logout/OTP writes
    // can only preserve the original expiry; skip any record changed since the scan.
    if(!current||current.value!==candidate.value)continue;
    await repository.deleteRow(candidate.key);removed++;
    await new Promise(resolve=>setImmediate(resolve));
   }
   cleanupCursor=scanned<page.rows.length?lastKey:page.nextCursor||'';
   return {enabled:true,scanned,removed,invalid,more:Boolean(cleanupCursor)};
  })().finally(()=>{cleanupPending=null;});
  return cleanupPending;
 }
 return {handle,authorize,assertNotification,view,verifyToken,cleanupExpired};
}
module.exports={createVendorAccess,phone};

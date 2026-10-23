'use strict';
// Local-only SQLite and simulated identity provider. Never uses real credentials or sends messages.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./national-settlement-fixture.cjs');
const {normalizeChannel}=require('../platform-core');
async function main(){
 const port=Number(process.env.BUYER_LIBRARY_PREVIEW_PORT||4422),origin='http://127.0.0.1:'+port;
 const config={enabled:true,origin,clientId:'isolated-client',clientSecret:'isolated-secret',appId:'7',secret:'isolated-library-preview-secret-not-production'};
 const provider=async(url,options)=>{
  let value;
  if(url==='https://kauth.kakao.com/oauth/token')value={access_token:'isolated-'+new URLSearchParams(options.body).get('code'),token_type:'bearer'};
  else if(url==='https://kapi.kakao.com/v1/user/access_token_info')value={app_id:7,expires_in:3600};
  else if(url==='https://kapi.kakao.com/v1/oidc/userinfo')value=options.headers.Authorization==='Bearer isolated-no-phone'?{sub:'222'}:{sub:'111',phone_number_verified:true,phone_number:'+821000000003'};
  else throw Error('Unexpected simulated provider endpoint');
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 };
 const f=await fixture({origin,apiOptions:{buyerAccountConfig:config,buyerAccountFetch:provider}});f.advance(30*86400000);
 const links={};
 for(const id of ['a01','a02','b03']){const item=await f.repository.getRecord('national-cre','item',id);await f.repository.upsertRecord('national-cre','item',{...item,attributes:{...item.attributes,broadcastDate:id==='b03'?'2026-10-21':'2026-10-19',morph:'릴리화이트',weight:'12g'}});}
 const child='national-cre-20261021',catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id:child,name:'전국크레자랑 · 전라·충청편',status:'active',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:'2026-10-21'}})]);
 await f.repository.upsertRecord(child,'vendor',await f.repository.getRecord('national-cre','vendor','v2'));
 await f.repository.upsertRecord(child,'item',await f.repository.getRecord('national-cre','item','b03'));await f.repository.deleteRecord('national-cre','item','b03');
 for(const id of ['a01','b03']){const result=await f.request('POST','/channels/'+(id==='b03'?child:'national-cre')+'/buyer-shipping-link',{itemId:id});if(result.status!==200)throw Error(result.body);links[id]=result.json().code;}
 const root=path.resolve(__dirname,'../public'),controls={failList:0,failDetail:0,loseConnect:0},calls=[];
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const read=req=>new Promise((resolve,reject)=>{let body='';req.on('data',bytes=>body+=bytes);req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch(error){reject(error);}});req.on('error',reject);});
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/'){res.writeHead(302,{Location:'/buyer-library.html#link='+links.a01});res.end();return;}
  if(url.pathname==='/__control'&&req.method==='POST'){const body=await read(req);for(const key of Object.keys(controls))if(key in body)controls[key]=Math.max(0,Math.min(3,Number(body[key])||0));return json(res,200,controls);}
  if(url.pathname==='/__state')return json(res,200,{calls,controls,notifications:f.sms.length});
  if(url.pathname==='/__oauth'){
   const state=encodeURIComponent(url.searchParams.get('state')||''),callback='/api/platform/buyer-account/callback?state='+state;
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(`<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>격리 로그인 검증</title><body style="font:16px/1.6 sans-serif;padding:24px"><h1>가상 로그인</h1><p>실제 카카오 계정이나 외부 서비스에 연결하지 않습니다.</p><p><a href="${callback}&code=buyer">가상 낙찰자로 로그인</a></p><p><a href="${callback}&code=no-phone">전화번호 없는 가상 계정</a></p><p><a href="${callback}&error=access_denied">로그인 취소</a></p></body></html>`);return;
  }
  if(url.pathname==='/__audit'){
   const width=Math.max(320,Math.min(1280,Number(url.searchParams.get('width'))||320)),page=url.searchParams.get('page')||'/buyer-library.html#link='+links.a01;
   if(!page.startsWith('/')||page.startsWith('//'))return json(res,400,{});
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<html lang="ko"><title>보관함 ${width}px 검증</title><body style="margin:0"><iframe title="낙찰자 보관함" style="width:${width}px;height:760px;border:0" src="${page.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}"></iframe></body></html>`);return;
  }
  if(url.pathname.startsWith('/api/')){
   calls.push({method:req.method,path:url.pathname});
   const failKey=url.pathname==='/api/platform/buyer-collection'?'failList':/^\/api\/platform\/buyer-collection\//.test(url.pathname)&&req.method==='GET'?'failDetail':'';
   if(failKey&&controls[failKey]>0){controls[failKey]--;return json(res,503,{error:'격리 검증: 연결을 확인한 뒤 다시 시도해 주세요.'});}
   let status=200,headers={};
   const proxy={writeHead(code,value){status=code;headers=value||{};},end(body=''){
    if(headers.Location?.startsWith('https://kauth.kakao.com/oauth/authorize?'))headers={...headers,Location:'/__oauth?state='+encodeURIComponent(new URL(headers.Location).searchParams.get('state'))};
    if(url.pathname==='/api/platform/buyer-collection/connect'&&status===200&&controls.loseConnect>0){controls.loseConnect--;return json(res,503,{error:'격리 검증: 응답을 받지 못했어요. 다시 시도해 주세요.'});}
    res.writeHead(status,headers);res.end(body);
   }};
   if(await f.api.handle(req,proxy,url))return;
  }
  const file=path.resolve(root,'.'+(/^\/[ds]\/[\w-]{8,24}$/.test(url.pathname)?'/buyer-shipping.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{});
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){json(res,500,{error:'Isolated preview error: '+error.message});}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({library:origin+'/',narrow:origin+'/__audit?width=320',first:origin+'/d/'+links.a01,second:origin+'/d/'+links.b03})));
 process.once('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

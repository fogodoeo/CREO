'use strict';
// Synthetic read-only intake and auction visuals; never connects to production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {channel,item}=require('./national-settlement-fixture.cjs');
async function main(){
 const origin='http://127.0.0.1:4362',f=await createFixture({origin}),c=channel(),day='2026-10-14';
 await f.repository.saveCatalog([c]);await f.repository.setActiveChannel(c.id);
 const groups=['가상 서울 업체','가상 인천 크레스티드게코 연구소','가상 경기 업체'].map((name,index)=>({vendor:{id:'v'+index,name},media:[],parents:[],entries:Array.from({length:index===1?2:4},(_,i)=>({id:'entry-'+index+'-'+i,entryNumber:i+1,code:'개체 '+(i+1),version:1,status:index===1?'draft':'submitted',broadcastDate:index===2?'2026-10-19':day,submission:index===1?null:{sex:i%2?'female':'male',weight:String(18+i),hatchDate:'2026-02-01',morph:i%2?'릴리화이트':'트라이컬러',note:'가상 개체 정보'},note:'작성 중인 개체 정보'}))}));
 for(const group of groups)await f.repository.upsertRecord(c.id,'vendor',group.vendor);
 const state={id:'state',mode:'standby',hostName1:'옹동2',hostRole1:'진행',page1BannerOn:false,page1TickerOn:true,page1Ticker:'전국크레자랑 · 서울·인천 편',layoutPlacements:require('../public/broadcast-profiles').STANDARD_LAYOUT};
 await f.repository.upsertRecord(c.id,'broadcast',state);
 const admin=f.client();await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});
 const root=path.resolve(__dirname,'../public');
 const sampleItems=Array.from({length:7},(_,i)=>item('sample-'+(i+1),'v'+i,{vendorName:['가상 서울 업체','가상 인천 크레스티드게코 연구소','가상 경기 업체','가상 부산 업체','가상 전라 업체','가상 대구 업체','가상 충청 업체'][i],winnerName:'가상 낙찰자 '+(i+1),winnerPhone:'0100000000'+i,soldPrice:(8-i)*1250000}));
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin),json=value=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(url.pathname==='/preview-admin'){res.writeHead(303,{Location:'/channel-workspace.html?channel=national-cre&tab=items','Set-Cookie':Object.entries(admin.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname==='/preview-mobile'){const workspace=url.searchParams.get('screen')==='workspace',src=workspace?'/channel-workspace.html?channel=national-cre&tab=items':'/vendor-entry-review.html?channel=national-cre&broadcastDate=2026-10-14';res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<style>body{margin:0;background:#ddd;font:16px system-ui}iframe{width:320px;height:800px;border:0;display:block;margin:16px}a{display:inline-block;padding:8px}</style><a href="/preview-mobile?screen=review">출품 검토 320px</a><a href="/preview-mobile?screen=workspace">개체관리 320px</a><iframe title="모바일 검수" src="${src}"></iframe>`);return;}
  if(url.pathname==='/api/platform/channels/national-cre/entries'){if(req.method!=='GET'){res.writeHead(405);res.end('Read-only preview');return;}json({channel:c,policy:{open:true,revision:1},groups,allocation:[]});return;}
  if(url.pathname==='/preview-scene'&&req.method==='POST'){const mode=url.searchParams.get('mode');if(mode==='empty'){for(const row of sampleItems)await f.repository.deleteRecord(c.id,'item',row.id);}else if(mode==='ranked'){for(const row of sampleItems)await f.repository.upsertRecord(c.id,'item',row);}else if(mode==='long-host'){await f.repository.upsertRecord(c.id,'broadcast',{...state,hostName1:'가상 크레스티드게코 연구소'});}else if(mode==='normal-host'){await f.repository.upsertRecord(c.id,'broadcast',state);}res.end('ok');return;}
  if(url.pathname==='/preview-stage'){const page=url.searchParams.get('page')==='3'?3:1;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<style>*{box-sizing:border-box}body{margin:0;background:#eee;font:16px system-ui}nav{padding:12px;display:flex;gap:12px}button,a{font:inherit;padding:8px}.wrap{width:100%;aspect-ratio:16/9;overflow:hidden}#frame{position:relative;width:1920px;height:1080px;background:url(/assets/national-cre/stage-backdrop.png) center/100% 100%}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style><nav><a href="/preview-stage?page=1">P1 진행</a><a href="/preview-stage?page=3">P3 집계</a><button data-mode="empty">빈 집계</button><button data-mode="ranked">가상 낙찰</button><button data-mode="long-host">긴 진행자명</button><button data-mode="normal-host">기본 진행자</button></nav><div class="wrap"><div id="frame"><iframe title="전크자 송출 시안" src="/auction-live.html?channel=national-cre&page=${page}"></iframe></div></div><script>const fit=()=>{document.querySelector('#frame').style.transform='scale('+innerWidth/1920+')';document.querySelector('#frame').style.transformOrigin='top left'};fit();onresize=fit;document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{await fetch('/preview-scene?mode='+b.dataset.mode,{method:'POST'});document.querySelector('iframe').src='/auction-live.html?channel=national-cre&page=${page}'});</script>`);return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(4362,'127.0.0.1',()=>console.log(origin+'/preview-admin\n'+origin+'/preview-stage?page=1'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
// Local, disposable design review. All names, amounts and lots are examples.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
const profiles=require('../public/broadcast-profiles');
const output=path.resolve(process.env.USERPROFILE,'Desktop/전크자/output/november_broadcast_design');
const box=(x,y,width,height,fontScale=1)=>({x,y,width,height,fontScale,opacity:100,visible:true});
const placements={
 // Host captions sit under each seated host, centred on 30% and 70%. The ticker stops short of the side shelves.
 'p1-host-1':box(19,76,22,10,.8),'p1-host-2':box(59,76,22,10,.8),'p1-ticker':box(14,90,72,6,.65),
 'p2-progress':box(4,5,7,8,.7),'p2-info':box(16,5,80,11,.7),'p2-bidders':box(4,66,28,19,1),
 'p2-ticker':box(14,90,72,6,.65),'p2-parents':box(78,65,18,20,.7),'p3-board':box(22,20,56,66,.8)
};
function screen(channel,page){return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${channel==='jjunine'?'쭌이네 11.03':'씨랩 11.05'} · P${page} 디자인 예시</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#151716}body{display:grid;place-items:center}main{position:relative}section{position:absolute;inset:0;width:1920px;height:1080px;transform-origin:top left;background:#c9c7c1 url('/background/${channel}') center/cover}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.camera{position:absolute;inset:0;background:#d0d0c9;display:grid;place-items:center;color:#656760;font:26px system-ui;letter-spacing:.12em}.example{position:absolute;bottom:8px;right:4%;color:white;background:#222b;padding:4px 8px;font:14px system-ui;z-index:12}</style><main><section>${page===2?'<div class="camera">개체 카메라 영역 · 화면 예시</div>':''}<iframe title="방송 오버레이" src="/auction-live.html?channel=${channel}&page=${page}"></iframe><small class="example">디자인 미리보기 · 이름과 금액은 예시</small></section></main><script>function fit(){let s=Math.min(innerWidth/1920,innerHeight/1080);document.querySelector('main').style.cssText='width:'+1920*s+'px;height:'+1080*s+'px';document.querySelector('section').style.transform='scale('+s+')'}addEventListener('resize',fit);fit();</script></html>`}
async function main(){
 const port=4411,origin=`http://127.0.0.1:${port}`,f=await createFixture({origin});
 const channels=[
  {id:'jjunine',name:'쭌이네 단독방송',shortName:'쭌이네',broadcastTheme:'jjun-boutique',date:'2026-11-03',notice:'단독 라이브 경매'},
  {id:'clab-1105',name:'크레용 씨랩 열성모프 특집',shortName:'크레용 씨랩',broadcastTheme:'clab-gallery',date:'2026-11-05',notice:'열성모프 특집'}
 ].map(row=>normalizeChannel({...row,status:'active',dataAdapter:'platform',broadcastProfile:'standard',broadcastDefaults:{layoutPreset:'standard-v1',notice:row.notice},shippingDefaults:{deliverySchedule:{auctionDate:row.date}}}));
 await f.repository.saveCatalog(channels);
 for(const channel of channels){
  await f.repository.upsertRecord(channel.id,'vendor',{id:'example-shop',name:channel.shortName});
  await f.repository.upsertRecord(channel.id,'item',{id:'example-live',vendorId:'example-shop',lotNumber:4,name:'A04',note:channel.id==='jjunine'?'릴리화이트':'100% 헷 아잔틱',status:'live',attributes:{checklist:'gender:F|weight:18.5|birth:25.06.12',bid_log:JSON.stringify([{name:'게코집사',amount:25},{name:'초록크레',amount:28}])}});
  for(let i=0;i<5;i++)await f.repository.upsertRecord(channel.id,'item',{id:'example-sold-'+i,vendorId:'example-shop',lotNumber:i+5,name:'예시 '+i,status:'sold',winnerName:['게코집사','초록크레','달빛게코','봄날크레','숲속게코'][i],winnerPhone:'0100000000'+i,soldPrice:[450000,380000,260000,180000,120000][i]});
  await f.repository.upsertRecord(channel.id,'broadcast',{id:'state',...profiles.initialState(channel),layoutPlacements:placements,hostName1:'진행자 1',hostRole1:channel.shortName,hostName2:'진행자 2',hostRole2:'GUEST',activeItemId:'example-live',mode:'live',page1BannerOn:false,page2BannerOn:false,page2PhotoOn:false,page2ParentsOn:false,page3VendorRankingOn:false,page3BuyerRankingOn:true,page3On:true,page1Ticker:channel.id==='jjunine'?'직수령 · 광주 쭌이네 / 대구 크레오':'크레용 씨랩 · 열성모프 특집',page2Ticker:channel.id==='jjunine'?'직수령 · 광주 쭌이네 / 대구 크레오':'크레용 씨랩 · 열성모프 특집'});
 }
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/review/')){
   const name=decodeURIComponent(url.pathname.slice('/review/'.length))||'디자인_미리보기.html';
   const file=path.resolve(output,name);
   if(!file.startsWith(output+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
   res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);return;
  }
  if(url.pathname==='/screen'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(screen(url.searchParams.get('channel')==='jjunine'?'jjunine':'clab-1105',Math.max(1,Math.min(3,Number(url.searchParams.get('page'))||1))));return}
  if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<meta charset="utf-8"><h1>11월 방송 디자인</h1>'+channels.map(c=>`<h2>${c.name}</h2>`+[1,2,3].map(p=>`<p><a href="/screen?channel=${c.id}&page=${p}">P${p} ${['','진행','개체 경매','낙찰 현황'][p]}</a></p>`).join('')).join(''));return}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  let file=url.pathname==='/background/jjunine'?path.join(output,'쭌이네_크로마키_배경.png'):url.pathname==='/background/clab-1105'?path.resolve(process.env.USERPROFILE,'Desktop/크레용/7a4c6bb7-102c-4ee5-aa30-274733e40165.png'):path.resolve(root,'.'+url.pathname);
  if(!url.pathname.startsWith('/background/')&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message)}});
 server.listen(port,'127.0.0.1',()=>console.log(origin));
 function close(){server.close();f.close();process.exit()}process.on('SIGINT',close);process.on('SIGTERM',close);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={placements};

'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixture,item}=require('./national-settlement-fixture.cjs');
const layout={...require('../public/broadcast-profiles').STANDARD_LAYOUT,'p2-info':{x:4,y:78,width:73,height:9,fontScale:1,opacity:100,visible:true},'p2-bidders':{x:4,y:54,width:28,height:18,fontScale:1,opacity:100,visible:true},'p2-parents':{x:79,y:60,width:17,height:26,fontScale:1,opacity:100,visible:true}};
async function main(){
 const f=await fixture(),origin='http://127.0.0.1:4361',root=path.resolve(__dirname,'../public');
 await f.repository.upsertRecord('national-cre','item',item('a04','v1',{status:'passed',soldPrice:0,winnerPhone:''}));await f.repository.upsertRecord('national-cre','item',item('e05','v1',{attributes:{broadcastDate:'2026-10-14',auctionKind:'event'}}));
 await f.request('POST','/buyer-shipping',f.saveBody,false);
 await f.request('PUT','/channels/national-cre/organizer-shipping',{bankName:'가상은행',bankAccount:'000-000-000',bankHolder:'가상 주관사',notificationPhone:'01000000009'});
 const v=(await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:'v1'})).json(),o=(await f.request('POST','/channels/national-cre/organizer-link',{})).json();
 const opath=new URL(o.url).pathname,ocode=opath.split('/').at(-1);
 await f.repository.upsertRecord('national-cre','broadcast',{id:'state',mode:'live',activeItemId:'show',layoutPlacements:layout,page2PhotoOn:false,page2PriceOn:false,page2BannerOn:false,page2ItemFontSize:27,page2BiddersFontSize:25,page2Ticker:'오늘 낙찰자 배송비 최대 3만원 지원',page2TickerOn:true,page2ParentsOn:false,page2NoteOn:true});
 const show=()=>item('show','v1',{name:'A06',vendorName:'서울 가상업체',lotNumber:6,status:'live',soldPrice:0,winnerPhone:'',startPrice:100000,attributes:{broadcastDate:'2026-10-14',checklist:'gender:F|weight:28|birth:25.06.12',bid_log:JSON.stringify([{name:'게코친구',amount:23},{name:'크레집사',amount:25}])}});
 await f.repository.upsertRecord('national-cre','item',show());
 http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,origin);
  const redirects={'/preview-buyer':'/buyer-shipping.html?code='+f.code,'/preview-vendor':'/vendor-checkout.html?code='+v.code,'/preview-organizer':'/organizer-shipping.html?code='+ocode};
  if(redirects[u.pathname]){res.writeHead(303,{Location:redirects[u.pathname]});res.end();return;}
  if(u.pathname==='/scene'&&req.method==='POST'){const mode=u.searchParams.get('mode');if(!['live','sold','standby'].includes(mode))throw Error('Bad scene');const row=show();if(mode==='sold'){row.status='sold';row.soldPrice=250000;}await f.repository.upsertRecord('national-cre','item',row);const state=await f.repository.getRecord('national-cre','broadcast','state');await f.repository.upsertRecord('national-cre','broadcast',{...state,mode,updatedAt:new Date().toISOString()});res.end('ok');return;}
  if(u.pathname==='/preview-stage'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<style>*{box-sizing:border-box}body{margin:0;background:#eee;font:16px sans-serif}nav{padding:12px;display:flex;gap:14px}button{padding:10px 20px}#frame{position:relative;width:1920px;height:1080px;background:url(/assets/national-cre/stage-backdrop.png) center/100% 100%}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.wrap{width:100%;aspect-ratio:16/9;overflow:hidden}</style><nav><button data-mode="standby">대기</button><button data-mode="live">입찰</button><button data-mode="sold">낙찰</button><a href="/national-broadcast-kit.html">방송 파일</a></nav><div class="wrap"><div id="frame"><iframe title="전국크레자랑 송출" src="/auction-live.html?channel=national-cre&page=2"></iframe></div></div><script>const fit=()=>{document.querySelector('#frame').style.transform='scale('+innerWidth/1920+')';document.querySelector('#frame').style.transformOrigin='top left'};fit();onresize=fit;document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{await fetch('/scene?mode='+b.dataset.mode,{method:'POST'});document.querySelector('iframe').src='/auction-live.html?channel=national-cre&page=2'});</script>`);return;}
  if(u.pathname.startsWith('/api/')&&await f.api.handle(req,res,u))return;
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webm':'video/webm','.wav':'audio/wav'};res.writeHead(200,{'Cache-Control':'no-store','Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Isolated preview error');}}).listen(4361,'127.0.0.1',()=>console.log(origin+'/preview-stage\n'+origin+'/preview-buyer\n'+origin+'/preview-vendor\n'+origin+'/preview-organizer'));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={layout};

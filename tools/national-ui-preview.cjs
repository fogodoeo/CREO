'use strict';
// Synthetic read-only intake and auction visuals; never connects to production.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {channel,item}=require('./national-settlement-fixture.cjs');
async function main(){
 const origin='http://127.0.0.1:4362',f=await createFixture({origin}),c=channel(),day='2026-10-14';
 const layout=process.env.NATIONAL_PREVIEW_LAYOUT?JSON.parse(fs.readFileSync(process.env.NATIONAL_PREVIEW_LAYOUT,'utf8')).layoutPlacements:require('../public/broadcast-profiles').STANDARD_LAYOUT;
 await f.repository.saveCatalog([c]);await f.repository.setActiveChannel(c.id);
 const groups=['가상 서울 업체','가상 인천 크레스티드게코 연구소','가상 경기 업체'].map((name,index)=>({vendor:{id:'v'+index,name},media:[],parents:[],entries:Array.from({length:index===1?2:4},(_,i)=>({id:'entry-'+index+'-'+i,entryNumber:i+1,code:'개체 '+(i+1),version:1,status:index===1?'draft':'submitted',broadcastDate:index===2?'2026-10-19':day,submission:index===1?null:{sex:i%2?'female':'male',weight:String(18+i),hatchDate:'2026-02-01',morph:i%2?'릴리화이트':'트라이컬러',note:'가상 개체 정보'},note:'작성 중인 개체 정보'}))}));
 for(const group of groups)await f.repository.upsertRecord(c.id,'vendor',group.vendor);
 const state={id:'state',mode:'standby',hostName1:'옹동2',hostRole1:'진행',hostName2:layout['p1-host-2']?'가상 업체':'',hostRole2:'함께',page1BannerOn:false,page1TickerOn:true,page1Ticker:'전국크레자랑 · 서울·인천 편',page2BannerOn:false,page2TickerOn:true,page2Ticker:'전국크레자랑 · 서울·인천 편',page2PhotoOn:false,page2SoldOn:true,page2PriceOn:process.env.NATIONAL_PREVIEW_PRICE!=='0',page3On:true,page3VendorRankingOn:true,layoutPlacements:layout};
 await f.repository.upsertRecord(c.id,'broadcast',state);
 const admin=f.client();await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});
 const root=path.resolve(__dirname,'../public');
 const sampleItems=Array.from({length:7},(_,i)=>item('sample-'+(i+1),'v'+i,{vendorName:['가상 서울 업체','가상 인천 크레스티드게코 연구소','가상 경기 업체','가상 부산 업체','가상 전라 업체','가상 대구 업체','가상 충청 업체'][i],winnerName:'가상 낙찰자 '+(i+1),winnerPhone:'0100000000'+i,soldPrice:(8-i)*1250000}));
 const previewItem={id:'caption-preview',name:'A01 트라이컬러',vendorId:'v0',vendorName:'가상 서울 업체',lotNumber:1,status:'live',startPrice:100000,soldPrice:0,note:'덱스 × 소담',attributes:{checklist:'gender:F|weight:28|birth:2026-04-09',photo_sire:'/preview-parent.svg',sire_name:'덱스',photo_dam:'/preview-parent.svg?dam=1',dam_name:'소담'}};
 async function setScene(mode){
  if(mode==='empty'){for(const row of sampleItems)await f.repository.deleteRecord(c.id,'item',row.id);await f.repository.deleteRecord(c.id,'item',previewItem.id);await f.repository.upsertRecord(c.id,'broadcast',state);}
  else if(mode==='ranked'){await f.repository.deleteRecord(c.id,'item',previewItem.id);for(const row of sampleItems)await f.repository.upsertRecord(c.id,'item',row);await f.repository.upsertRecord(c.id,'broadcast',state);}
  else if(['long-host','normal-host','three-hosts'].includes(mode)){await f.repository.upsertRecord(c.id,'broadcast',{...state,hostName1:mode==='long-host'?'가상 크레스티드게코 연구소':'옹동2',hostName2:mode==='three-hosts'?'가상 서울 업체':'',hostName3:mode==='three-hosts'?'초대 손님':''});}
  else if(['waiting','one-bid','two-bids','next-bid','long-item','sold'].includes(mode)){
   const bids=[{name:mode==='long-item'?'가상 크레스티드게코 연구소':'가상 입찰자',bidder_key:'viewer-a',amount:30},{name:'가상 시청자',bidder_key:'viewer-b',amount:25}];
   const bidLog=mode==='waiting'?[]:mode==='one-bid'?bids.slice(0,1):mode==='next-bid'?[...bids,{name:'새 입찰자',bidder_key:'viewer-c',amount:35}]:bids;
   await f.repository.upsertRecord(c.id,'item',{...previewItem,name:mode==='long-item'?'A01 슈퍼 달마시안 트라이컬러 릴리화이트':previewItem.name,vendorName:mode==='long-item'?'가상 인천 크레스티드게코 연구소':previewItem.vendorName,note:mode==='long-item'?'상세 비고 '.repeat(25)+'끝부분':previewItem.note,bidLog,status:mode==='sold'?'sold':'live',soldPrice:mode==='sold'?300000:0});
   await f.repository.upsertRecord(c.id,'broadcast',{...state,mode:mode==='sold'?'sold':'live',activeItemId:previewItem.id});
  }else if(['national-stage','base','pixel'].includes(mode)){c.broadcastTheme=mode;await f.repository.saveCatalog([c]);}
  // Use the regular local mutation endpoint to advance the public pulse revision.
  const updated=await f.call(admin,'PUT','/api/platform/channels/national-cre/broadcast-state',{});
  if(updated.status!==200)throw Error('Preview broadcast state update failed');
 }
 function stagePage(page){
  const buttons=[['normal-host','진행자'],['long-host','긴 이름'],['three-hosts','3명'],['waiting','입찰 대기'],['one-bid','1명 입찰'],['two-bids','2명 입찰'],['next-bid','새 입찰'],['long-item','긴 개체 정보'],['sold','낙찰'],['empty','빈 집계'],['ranked','집계'],['national-stage','전크자'],['base','기본'],['pixel','픽셀']];
  return `<style>*{box-sizing:border-box}body{margin:0;background:#eee;font:14px system-ui;overflow:hidden}nav{height:50px;padding:8px;display:flex;gap:6px;overflow:auto;white-space:nowrap}nav>*{flex:none}button,a{font:inherit;padding:6px}.wrap{width:min(100vw,calc((100vh - 50px)*16/9));aspect-ratio:16/9;overflow:hidden;margin:auto}#frame{position:relative;width:1920px;height:1080px;background:url(/assets/national-cre/stage-backdrop.png) center/100% 100%}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style><nav><b>가상 데이터</b>${[1,2,3].map(n=>`<a href="/preview-stage?page=${n}">P${n}</a>`).join('')}${buttons.map(([mode,label])=>`<button data-mode="${mode}">${label}</button>`).join('')}</nav><div class="wrap"><div id="frame"><iframe title="전크자 송출 시안" src="/auction-live.html?channel=national-cre&page=${page}"></iframe></div></div><script>const fit=()=>{document.querySelector('#frame').style.transform='scale('+document.querySelector('.wrap').clientWidth/1920+')';document.querySelector('#frame').style.transformOrigin='top left'};fit();onresize=fit;document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{await fetch('/preview-scene?mode='+b.dataset.mode,{method:'POST'});if(b.dataset.mode!=='next-bid')document.querySelector('iframe').src='/auction-live.html?channel=national-cre&page=${page}'});</script>`;
 }
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin),json=value=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(url.pathname==='/preview-admin'){res.writeHead(303,{Location:'/channel-workspace.html?channel=national-cre&tab=items','Set-Cookie':Object.entries(admin.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname==='/preview-mobile'){const workspace=url.searchParams.get('screen')==='workspace',src=workspace?'/channel-workspace.html?channel=national-cre&tab=items':'/vendor-entry-review.html?channel=national-cre&broadcastDate=2026-10-14';res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<style>body{margin:0;background:#ddd;font:16px system-ui}iframe{width:320px;height:800px;border:0;display:block;margin:16px}a{display:inline-block;padding:8px}</style><a href="/preview-mobile?screen=review">출품 검토 320px</a><a href="/preview-mobile?screen=workspace">개체관리 320px</a><iframe title="모바일 검수" src="${src}"></iframe>`);return;}
  if(url.pathname==='/api/platform/channels/national-cre/entries'){if(req.method!=='GET'){res.writeHead(405);res.end('Read-only preview');return;}json({channel:c,policy:{open:true,revision:1},groups,allocation:[]});return;}
  if(url.pathname==='/preview-scene'&&req.method==='POST'){await setScene(url.searchParams.get('mode'));res.end('ok');return;}
  if(url.pathname==='/preview-stage'){const page=[1,2,3].includes(Number(url.searchParams.get('page')))?Number(url.searchParams.get('page')):1;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(stagePage(page));return;}
  if(url.pathname==='/preview-parent.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${url.searchParams.has('dam')?'#d7cabb':'#c4ccc4'}"/><text x="200" y="230" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#273b42">가상 부모 사진</text></svg>`);return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Isolated preview error');}});
 server.listen(4362,'127.0.0.1',()=>console.log(origin+'/preview-admin\n'+origin+'/preview-stage?page=1'));
 process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

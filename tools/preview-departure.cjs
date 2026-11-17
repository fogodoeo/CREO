'use strict';
// Local, read-only preview with synthetic data. No production API or writes.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../public');
const airport=path.resolve(__dirname,'../../Desktop/씨랩/11월17일용/송출/굿바이과천점_크로마키합성배경.png');
const box=(x,y,width,height,fontScale=1)=>({x,y,width,height,fontScale,opacity:100,visible:true});
function payload(id){const clab=id==='preview-clab';return {
 channel:{id,name:clab?'씨랩':'굿바이 과천점',shortName:clab?'C-LAB':'크레용 과천점 고별전',broadcastTheme:clab?'clab-gallery':'departure-blue',broadcastProfile:'standard',overlay:{skin:'clean',layout:'balanced'},shippingDefaults:{deliverySchedule:{auctionDate:'2026-11-17'}},broadcastDefaults:{notice:clab?'C-LAB LIVE':'굿바이 과천점'}},
 state:{mode:'live',activeItemId:'sample-1',hostName1:'진행자',hostRole1:'크레용',hostName2:'과천점',hostRole2:'게스트',page1HostsOn:true,page1TickerOn:true,page1BannerOn:false,page2PhotoOn:false,page2ParentsOn:false,page2PriceOn:false,page2BannerOn:false,page2ProgressOn:true,page2TickerOn:true,page1Ticker:'11월 17일 화요일 밤 8시 · BAND에서 크레용 검색',page2Ticker:'굿바이 과천점 · 함께해 주셔서 감사합니다',page3On:true,page3BuyerRankingOn:true,page3VendorRankingOn:false,layoutPlacements:{'p1-host-1':box(52,78,44,9,.85),'p1-host-2':box(4,78,42,9,.85),'p1-ticker':box(4,90,92,7,.65),'p2-info':{...box(52,5,44,12,1.25),...(clab?{}:{rightEdge:96})},'p2-progress':box(4,5,9,8.4,.9),'p2-bidders':box(4,59,29,25,.8),'p2-ticker':box(4,90,92,7,.65),'p3-board':box(49,33,47,60,.9)}},
 items:[{id:'sample-1',channelId:id,status:'live',name:'A01',lotNumber:1,vendorName:'크레용 과천점',startPrice:100000,note:'부모 확인 완료 · 먹이 반응 좋음',attributes:{checklist:'gender:F|weight:28|birth:2026-04-02'},bidLog:[{name:'입찰자 A',amount:25},{name:'입찰자 B',amount:20},{name:'입찰자 C',amount:15}]},...[['A',450000],['B',320000],['C',280000],['D',210000]].map(([name,soldPrice],i)=>({id:'sold-'+i,channelId:id,status:'sold',name:'낙찰 예시',vendorName:'크레용 과천점',winnerAlias:'입찰자 '+name,soldPrice}))],assets:[],itemProgress:{current:1,total:30,completed:0,remaining:30},revision:1};}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');const id=u.pathname.split('/')[4];return res.end(JSON.stringify(u.pathname.endsWith('broadcast-pulse')?{revision:1}:payload(id)));}
 const p=u.pathname==='/airport.png'?airport:path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/auction-live.html':u.pathname));
 if(p!==airport&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[path.extname(p)]||'application/octet-stream');
 if(p.endsWith('auction-live.html'))return res.end(fs.readFileSync(p,'utf8').replace('</head>','<style>html{background:#15334c url(/airport.png) center/cover no-repeat!important}</style></head>'));
 fs.createReadStream(p).pipe(res);
});
if(require.main===module)server.listen(4417,'127.0.0.1',()=>console.log('Synthetic preview: http://127.0.0.1:4417/auction-live.html?channel=preview-departure&page=1'));
module.exports={server,payload};

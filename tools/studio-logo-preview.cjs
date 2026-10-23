'use strict';
// Synthetic loopback preview: temporary database/assets, no real messages or records.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {fixture,channel}=require('./national-settlement-fixture.cjs');
const {BroadcastAssetStorage}=require('../broadcast-asset-storage');
const {createBroadcastAssetApi}=require('../broadcast-asset-api');
async function main(){
 const f=await fixture(),root=path.resolve(__dirname,'../public'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-video-preview-'));
 await f.repository.saveCatalog([{...channel(),broadcastProfile:'basic-dice',groups:[{id:'odd',name:'홀팀',shortName:'홀',color:'#E5B855'},{id:'even',name:'짝팀',shortName:'짝',color:'#749EDC'}],scoreboards:[{id:'team-contribution',dimension:'winnerGroup',metric:'points'}]},{id:'creyon',name:'가상 씨랩',status:'active'}]);
 await f.repository.upsertRecord('national-cre','asset',{id:'legacy-dice-4',kind:'dice',targetName:'4',name:'숨겨질 이전 영상',imageUrl:'/unused-old.mp4',active:true});
 const assets=createBroadcastAssetApi({storage:new BroadcastAssetStorage({localDir:dir,supabaseUrl:'',serviceKey:''}),isAdmin:()=>true});
 let failNext=false,uploads=0,metadata=0,resultTime=0;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__dice'&&req.method==='POST'){
   const now=Date.now(),started=new Date(now-6000).toISOString(),reveal=new Date(now).toISOString();resultTime=now;
   await f.repository.upsertRecord('national-cre','item',{id:'dice-test',lotNumber:4,name:'가상 개체',status:'sold',soldPrice:100000,winnerName:'가상 낙찰자',attributes:{audience_dice_event_id:'scene-'+now,audience_dice_started_at:started,audience_dice_reveal_at:reveal,audience_dice_face:4,audience_contribution_base:100000,audience_contribution_amount:400000,audience_contribution_effective_at:reveal,audience_group_key:'odd'}});
   await f.repository.upsertRecord('national-cre','broadcast',{id:'state',mode:'sold',activeItemId:'dice-test',page3On:true});res.end('ready');return;
  }
  if(url.pathname==='/__fail-next'&&req.method==='POST'){failNext=true;res.end('armed');return;}
  if(url.pathname==='/result-preview'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'auction-live.html'),'utf8').replace('<head>','<head><script>Date.now=()=>'+resultTime+';</script>'));return;}
  if(url.pathname==='/__audit-state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({uploads,metadata,failNext,assets:await f.repository.listRecords('national-cre','asset')}));return;}
  if(url.pathname.startsWith('/api/broadcast-assets/')){if(req.method==='POST')uploads++;if(await assets.handle(req,res,url))return;}
  if(['POST','PUT'].includes(req.method)&&/^\/api\/platform\/channels\/[^/]+\/assets(?:\/[^/]+)?$/.test(url.pathname)){metadata++;if(failNext){failNext=false;req.resume();res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'테스트: 저장 연결이 끊겼습니다.'}));return;}}
  if(url.pathname.startsWith('/api/platform/')){req.headers['x-creo-admin']=f.secret;if(await f.api.handle(req,res,url))return;}
  if(url.pathname==='/narrow'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>로고 설정 320px 검증</title><style>body{margin:0;background:#ddd}iframe{width:320px;height:800px;border:0;display:block}</style><iframe title="로고 설정" src="/auction-control.html?channel=national-cre&embedded=1"></iframe>');return;}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/auction-control.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Isolated preview failed');}});
 server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port,assets:dir})));
 process.on('SIGINT',()=>server.close(async()=>{await f.close();process.exit(0);}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});

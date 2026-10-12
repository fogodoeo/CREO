'use strict';
// Local-only fixture: synthetic contact/account data and an isolated SQLite database.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs');
const {normalizeChannel}=require('../platform-core');
async function main(){
    const origin='http://127.0.0.1:4393',f=await createFixture({origin});
    const channels=[normalizeChannel({id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'}),normalizeChannel({id:'table-team-preview',name:'팀 경매 · 검수용',status:'active',dataAdapter:'platform',features:{groups:true},groups:[{id:'blue',name:'푸른 팀'}]}),normalizeChannel({id:'table-empty-preview',name:'등록 전 · 검수용',status:'active',dataAdapter:'platform'})];
    await f.repository.saveCatalog(channels);
    const base={phone:'01000000000',address:'서울특별시 예시로 100, 예시상가 2층 201호',bankName:'예시은행',bankAccount:'000-000000-00000',bankHolder:'김예시'};
    const vendors=[
        {...base,id:'table-1',name:'서울 게코하우스',code:'S01',broadcastRegion:'서울·인천',manager:'김담당'},
        {...base,id:'table-2',name:'인천 크레스티드게코 연구소',code:'I01',broadcastRegion:'서울·인천',address:'인천광역시 예시로 79, 예시빌딩 5층 501호'},
        {...base,id:'table-3',name:'경기 크레숲',broadcastRegion:'경기',manager:'박담당',address:'경기도 예시시 예시로 123, 예시타워 지하 1층 출입구 맞은편 매장 (방문 시 사전 연락)'},
        {id:'table-4',name:'채채파파 · 검수용',broadcastRegion:'전라·충청'},
        {...base,id:'table-5',name:'하이랭크 · 검수용',broadcastRegion:'대구·경북',manager:'이담당',address:'대구광역시 예시로 200'},
        {...base,id:'table-6',name:'부산 크레팜',broadcastRegion:'부산·울산·경남',address:'부산광역시 예시로 300'},
        {id:'table-7',name:'지역 미등록 업체',address:'서울특별시 예시로 1'},
        {id:'table-inactive',name:'비활성 업체',active:false}
    ];
    for(const v of vendors)await f.repository.upsertRecord('national-cre','vendor',v);
    await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
    await f.repository.upsertRecord('national-cre','setting',{id:'national-broadcasts',regions:{'table-1':0,'table-2':0,'table-3':1,'table-4':2,'table-5':3,'table-6':4}});
    await f.repository.upsertRecord('table-team-preview','vendor',{...vendors[0],id:'table-team-1',groupId:'blue'});
    const admin=f.client(),login=await f.call(admin,'POST','/api/platform/auth/login',{password:f.secret});
    if(login.status!==200)throw Error('Fixture login failed: '+login.status);
    const root=path.resolve(__dirname,'../public');
    const server=http.createServer(async(req,res)=>{try{
        const url=new URL(req.url,origin);
        if(url.pathname==='/__preview/admin'){
            res.writeHead(303,{Location:'/channel-workspace.html?channel=national-cre&tab=vendors','Set-Cookie':Object.entries(admin.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;
        }
        if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
        const file=path.resolve(root,'.'+url.pathname);
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
        res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
    }catch(error){console.error(error.message);res.writeHead(500);res.end('Isolated preview error');}});
    server.listen(4393,'127.0.0.1',()=>console.log(origin+'/__preview/admin'));
    process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

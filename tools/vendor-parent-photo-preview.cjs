'use strict';
// Isolated synthetic auction and image storage. No production records or SMS.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createFixture}=require('./vendor-portal-preview.cjs'),{EntryPhotoStorage}=require('../entry-photo-storage');
async function main(){
 const origin='http://127.0.0.1:4363',dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-parent-preview-'));
 const storage=new EntryPhotoStorage({localDir:dir,secret:'isolated-parent-preview-secret'});
 const f=await createFixture({origin,apiOptions:{entryPhotoStorage:storage}});f.advance(21*86400000);
 await f.repository.upsertRecord('national-cre','setting',{id:'national-cycle-config',mode:'regional-cycle-v1'});
 const owner=await f.login('01000000001'),company=(await f.post(owner,'register',{name:'부모 사진 테스트',region:'서울',phone:'01000000001'})).json();
 if(!company.id)throw Error('Fixture registration failed');
 const selected=await f.post(owner,'select',{id:company.id}),token=selected.json().token;if(!token)throw Error(selected.body);
 const c=(await f.repository.getCatalog()).channels[0];await f.repository.saveCatalog([{...c,broadcastTheme:'national-stage'}]);await f.repository.setActiveChannel(c.id);
 for(let i=1;i<=4;i++)await f.repository.upsertRecord(c.id,'item',{id:'preview-'+i,name:'A0'+i,lotNumber:i,vendorId:company.id,vendorName:'부모 사진 테스트',status:i===3?'sold':i===1?'live':'waiting',soldPrice:i===3?100000:0,attributes:{broadcastDate:'2026-10-14',checklist:'gender:M|weight:12|birth:26.05.01',entry_traits:{sex:'male',weight:'12',hatchDate:'2026-05-01'}}});
 await f.repository.upsertRecord(c.id,'broadcast',{id:'state',mode:'live',activeItemId:'preview-1',page:2,page2ParentsOn:true,page2TickerOn:true,page2Ticker:'부모 사진 갱신 확인'});
 const root=path.resolve(__dirname,'../public');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/preview'){res.writeHead(303,{Location:'/vendor-broadcast.html?event=national-cre&token='+encodeURIComponent(token),'Set-Cookie':Object.entries(owner.jar).map(([k,v])=>`${k}=${v}; Path=/; HttpOnly; SameSite=Lax`)});res.end();return;}
  if(url.pathname.startsWith('/api/')&&await f.api.handle(req,res,url))return;
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end('Isolated preview error: '+e.message);}});
 server.listen(4363,'127.0.0.1',()=>console.log('Isolated parent-photo preview: '+origin+'/preview'));
 async function close(){server.close();f.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-parent-preview-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true});process.exit();}
 process.on('SIGINT',close);process.on('SIGTERM',close);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

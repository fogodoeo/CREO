'use strict';
// Isolated UI fixture: no production storage, printer, messages or credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {create}=require('../number-label-plans');
const records=new Map(),locks=new Map();
const service=create({repository:{async listRecords(c){return [...records.values()].filter(r=>r.channelId===c);},async getRecord(c,t,id){return records.get(c+id)||null;},async upsertRecord(c,t,r){const stored={...r,channelId:c};records.set(c+r.id,stored);return stored;}},lock(k,fn){const p=(locks.get(k)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(k,p);return p;}});
const channels=[{id:'label-fixture-a',name:'10월 26일 경북편 · 테스트',dataAdapter:'platform',status:'draft'},{id:'label-fixture-b',name:'10월 28일 경남편 · 테스트',dataAdapter:'platform',status:'draft'}];
const rounds=channels.map((c,i)=>({channelId:c.id,familyId:c.id,name:c.name,date:i?'2026-10-28':'2026-10-26',status:c.status,phase:'upcoming',itemCount:0,soldCount:0}));
const root=path.resolve(__dirname,'../public');
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
  if(url.pathname==='/api/platform/admin-check')return json(200,{authenticated:true});
  if(url.pathname==='/api/platform/operation-rounds')return json(200,{channels,rounds,activeChannelId:channels[0].id});
  const match=/^\/api\/platform\/channels\/([^/]+)\/number-label-plans$/.exec(url.pathname);
  if(match){if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;return json(200,{plan:await service.save(match[1],JSON.parse(body))});}return json(200,{plans:await service.list(match[1],url.searchParams.get('date')),vendors:['크레오','크레빠','마이리틀드래곤','마리드'].map(name=>({name})),roundVendors:(match[1]==='label-fixture-a'?['크레오','크레빠','마이리틀드래곤']:['마리드']).map(name=>({name}))});}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(404,{error:'not found'});
  res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'});res.end(fs.readFileSync(file));
 }catch(e){json(e.status||500,{error:e.message});}
}).listen(4448,'127.0.0.1',()=>console.log('Number label fixture: http://127.0.0.1:4448/number-labels.html?channel=label-fixture-a'));

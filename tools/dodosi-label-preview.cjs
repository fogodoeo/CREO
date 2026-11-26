'use strict';
// Synthetic, read-only layout fixture. No printer or production endpoints.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../public');
const print=fs.readFileSync(path.join(root,'print.html'),'utf8');
const fit=print.slice(print.indexOf('        function fitShippingLabelPreview()'),print.indexOf('        var D10_LABEL_BRIDGE_BASE'));
const fixtureItems=[1,2,3].map(n=>({name:'A0'+n,status:'낙찰',winner:'가상 수령인',winner_phone:'01000000002',_winner:{name:'가상 수령인',phone:'01000000002'},shipping_type:'배송',shipping_company:'도도시',shipping_region:'[서울/강서] 나뭇잎마을',payment_status:'paid',_platformItemId:'fixture-'+n,soldPrice:100000}));
const fixtureState={fresh:true,broadcastDate:'2026-11-23',originName:'크레용(대구)',sender:{name:'전크자',phone:'01000000001'},groups:[{name:'가상 수령인',phone:'01000000002',shop:'[서울/강서] 나뭇잎마을',quantity:3,items:fixtureItems.map(i=>({id:i._platformItemId,lot:i.name})),schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}}]};
const printFixture=print.replace('        initializePrint();',`
        // This fixture never connects to the real loopback printer.
        fetchD10Bridge=async function(path,options){return {ok:true,json:async function(){if(path==='/v1/status')return {shippingLabelDetails:true,shippingLabelVersion:2,dodosiTicketVersion:3};var body=JSON.parse(options.body);window.fixtureLastPrint=body;return {ok:true,accepted:body.labels.reduce((n,l)=>n+l.sides.length,0)};}};};
        loadDodosiLabelState=async function(){window._dodosiLabelState=${JSON.stringify(fixtureState)};};
        window._dodosiLabelState=${JSON.stringify(fixtureState)};
        document.title='도도시 출력 토글 · 인쇄 없는 테스트';
        document.getElementById('print-login').hidden=true;
        document.getElementById('print-action-btn').title='가상 대기열만 확인하며 실제 인쇄하지 않습니다';
        renderShippingLabels(${JSON.stringify(fixtureItems)});showTab('labels');
`);
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>도도시 라벨 배치 확인</title>
<link rel="stylesheet" href="/dodosi-labels.css"><style>@font-face{font-family:Pretendard;src:url('/promo-assets/PretendardVariable.ttf');font-weight:100 900}body{font-family:Pretendard,sans-serif;margin:24px;background:#eee}button{padding:12px;margin:4px}#preview{width:min(560px,100%);background:#eee;margin-top:20px}h1{font-size:22px}</style>
<h1>도도시 라벨 · 수령인 줄과 합배송 번호</h1><p>가상 자료 미리보기 · 실제 인쇄 없음</p><button onclick="count=1;paint()">단독 1개</button><button onclick="count=3;paint()">합배송 3개</button><button onclick="count=12;paint()">합배송 12개</button><button onclick="width=320;paint()">320px</button><button onclick="width=560;paint()">560px</button><div id="preview"></div>
<script src="/dodosi-labels.js"></script><script>let count=3,width=560;
function paint(){const lots=Array.from({length:count},(_,i)=>'A'+String(i+1).padStart(2,'0'));const p={bundle_lots:lots,bundle_index:Math.min(1,count-1),origin:'크레용(대구)',sender_name:'전크자',sender_phone:'01000000001',destination:'[서울/강서] 나뭇잎마을',winner_name:'가상 수령인',winner_phone:'01000000002',dropoff_date:'2026-11-24',arrival_date:'2026-11-28',broadcast_date:'2026-11-23'};document.getElementById('preview').style.width=width+'px';document.getElementById('preview').style.maxWidth='100%';document.getElementById('preview').innerHTML=CreoDodosiLabels.preview({payload:p,errors:[]});fitShippingLabelPreview();document.fonts.ready.then(fitShippingLabelPreview);}
${fit}
paint();window.onresize=fitShippingLabelPreview;</script></html>`;
http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'||u.pathname==='/print.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(u.pathname==='/'?html:printFixture);}const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));}).listen(4494,'127.0.0.1',()=>console.log('Dodosi preview: http://127.0.0.1:4494/print.html?channel=fixture-dodosi'));

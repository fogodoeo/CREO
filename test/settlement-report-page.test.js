'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const Workbook=require('../public/settlement-workbook');
const html=fs.readFileSync(path.join(__dirname,'../public/settlement-report.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../public/settlement-report-page.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function payload(archiveId=''){
 return {scope:'round',channel:{id:'national-cre',name:'가상 전크자'},round:{channelId:'national-cre',archiveId,date:'2026-10-19',name:'가상 경기편'},generatedAt:'2026-10-20T00:00:00Z',vendors:[{vendorName:'가상 업체',totalAmount:100000,remainingAmount:100000}],items:[],buyers:[],receipts:[],totals:{feeAmount:100000,shippingSupportAmount:0,remainingAmount:100000}};
}
function fixture(search='?channel=national-cre',workbook=Workbook){
 const {document}=parseHTML(html),requests=[];
 const context={document,URLSearchParams,location:{search},CreoSettlementWorkbook:workbook,CreoPlatform:{escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),api:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))}};
 vm.runInNewContext(source,context);
 return {document,requests,$:id=>document.getElementById(id)};
}
test('report rejects another round response and retry restores only the requested round with a literal name',async()=>{
 const f=fixture('?channel=national-cre&archive=old-round');
 f.requests[0].resolve(payload());await tick();
 assert.equal(f.$('content').hidden,true);assert.equal(f.$('excel').disabled,true);assert.match(f.$('message').textContent,/회차 정보가 일치하지/);
 const promise=f.$('refresh').onclick(),old=payload('old-round');old.round.name='<img src=x> 이전 회차';f.requests[1].resolve(old);await promise;
 assert.equal(f.$('content').hidden,false);assert.equal(f.$('round-name').textContent,'<img src=x> 이전 회차 · 2026-10-19');assert.equal(f.$('round-name').querySelector('img'),null);
 assert.equal(f.$('receipts').getAttribute('href'),'/organizer-shipping.html?channel=national-cre&archive=old-round');
 assert.equal(f.$('back').getAttribute('href'),'/main?channel=national-cre&archive=old-round');
 assert.equal(f.$('excel').disabled,false);
});
test('refresh failure removes stale settlement values and exports, then recovers without duplicate pending loads',async()=>{
 const f=fixture();f.requests[0].resolve(payload());await tick();assert.match(f.$('table').textContent,/100,000/);
 const refresh=f.$('refresh').onclick();await f.$('refresh').onclick();assert.equal(f.requests.length,2);
 assert.equal(f.$('content').hidden,true);assert.equal(f.$('table').textContent,'');
 f.requests[1].reject(Object.assign(Error('가상 연결 실패'),{status:503}));await refresh;
 assert.equal(f.$('content').hidden,true);assert.equal(f.$('copy').disabled,true);assert.equal(f.$('excel').disabled,true);assert.equal(f.$('round-name').textContent,'');
 assert.equal(f.$('message').getAttribute('role'),'alert');assert.match(f.$('message').textContent,/새로고침/);assert.equal(f.$('refresh').disabled,false);
 const retry=f.$('refresh').onclick();f.requests[2].resolve(payload());await retry;
 assert.equal(f.$('message').textContent,'');assert.equal(f.$('content').hidden,false);assert.equal(f.$('copy').disabled,false);
});
test('lost login or a partial rendering error never leaves a previous report available',async()=>{
 const f=fixture();f.requests[0].resolve(payload());await tick();
 const refresh=f.$('refresh').onclick();f.requests[1].reject(Object.assign(Error('로그인 필요'),{status:401}));await refresh;
 assert.equal(f.$('login').hidden,false);assert.equal(f.$('table').textContent,'');assert.equal(f.$('content').hidden,true);
 const broken=fixture('?channel=national-cre',{...Workbook,sheets(){throw Error('가상 렌더 실패');}});
 broken.requests[0].resolve(payload());await tick();assert.equal(broken.$('content').hidden,true);assert.equal(broken.$('excel').disabled,true);assert.equal(broken.$('round-name').textContent,'');
});
test('empty selected round is a successful empty report; a different channel is never rendered',async()=>{
 const f=fixture();const data=payload();data.vendors=[];data.totals.feeAmount=0;data.totals.remainingAmount=0;
 f.requests[0].resolve(data);await tick();assert.equal(f.$('content').hidden,false);assert.equal(f.$('fees').textContent,'0원');assert.match(f.$('table').textContent,/아직 내역이 없어요/);
 const retry=f.$('refresh').onclick();data.channel.id='other';f.requests[1].resolve(data);await retry;
 assert.equal(f.$('content').hidden,true);assert.match(f.$('message').textContent,/채널이 일치하지/);assert.equal(f.$('table').textContent,'');
});

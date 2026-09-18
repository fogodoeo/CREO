'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSourceReader}=require('../delivery-schedule-source');
const response=data=>new Response(typeof data==='string'?data:JSON.stringify(data),{status:200});
const weekly='월요일 화요일 수요일 목요일 금요일 토요일 일요일 수거 (수도권/경상권) 충청/구미/대구 배송 경상권 배송 수도권 배송 강원 배송 제주 배송 (토 에어·당일 도착) 전라도/진주/논산 배송';
test('Parge rejects changed weekday ordering and incomplete partner data',async()=>{
 let guide=weekly,count=50;
 const reader=createSourceReader(async url=>response(url.endsWith('/booking')?'<script src="/_next/static/chunks/test.js"></script>':url.endsWith('/test.js')?'({sudo:{sudo:10000},daegu:{sudo:30000,jeju:50000,wonchun:30000}})':url.endsWith('/guide')?guide:url.endsWith('/partners')?{partners:Array.from({length:count},(_,i)=>({name:'매장'+i,region:'강원',isActive:true}))}:{schedules:Array.from({length:5},()=>({isActive:true,collectDayLabel:'월요일'}))}));
 const parge=await reader.parge();assert.equal(parge.regionDays.gangwon[0],5);assert.equal(parge.ratePayload.data['강원도'].length,50);
 guide=weekly.replace('월요일 화요일','화요일 월요일');await assert.rejects(reader.parge(),/route changed/);
 guide=weekly;count=1;await assert.rejects(reader.parge(),/Invalid PARGE/);
});
test('Dodosi matches duplicate shop names by city and only performs read-only option queries',async()=>{
 const calls=[];
 const shops=[['출발점','대구','수/일'],['동명점','부산','월','화','2026/09/24','2026/09/27'],['동명점','울산','월'],...Array.from({length:17},(_,i)=>['다른점'+i,'서울','월'])];
 const reader=createSourceReader(async(url,options)=>{
  calls.push({url,method:options.method||'GET'});
  if(url.endsWith('/113'))return response("const spreadsheetId = 'public-sheet'; const apiKey = 'public-key';");
  if(url.includes('sheets.googleapis.com'))return response({values:url.includes('dodosiShopData')?shops:url.includes('dodosiEditData')?[['대구','동명점','3']]:[['1','대구출발','대구','부산도착','','/shop_view?idx=1']]});
  if(url.includes('shop_view'))return response('"prod_edit_time":"123"');
  assert.equal(new URL(url).pathname,'/shop/load_option.cm');assert.equal(options.method,'POST');
  const selected=[...options.body.keys()].filter(k=>k.endsWith('[option_code]')).length;
  const name=['대구-출발점//맡기는날-화','1마리','부산[남구]-동명점//찾는날-월/목'][selected];
  return response({option_html:`selectRequireOption('prod', 1, 'o${selected}', 'v${selected}', '${name}')`});
 });
 const data=await reader.dodosi(['출발점']);const target=data.origins[0].destinations[0];
 assert.equal(target.label,'부산 남구 - 동명점');assert.equal(target.area,'부산');assert.equal(target.transitDays,3);assert.deepEqual(target.arrivalDays,[1,4]);assert.equal(target.vacationStart,'2026-09-24');
 assert.equal(calls.filter(c=>c.method==='POST').length,3);assert.ok(calls.every(c=>!/[\/](cart|order|pay)/.test(c.url)));
});
test('oversized responses and cancelled refreshes fail without accepting data',async()=>{
 const huge=createSourceReader(async()=>new Response('x',{headers:{'content-length':'3000001'}}));await assert.rejects(huge.parge(),/too large/);
 const controller=new AbortController();controller.abort();
 const aborted=createSourceReader(async(_url,options)=>{options.signal.throwIfAborted()});await assert.rejects(aborted.parge([],{signal:controller.signal}),{name:'AbortError'});
});

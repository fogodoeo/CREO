'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readModern,readQuotes}=require('../dodosi-public-reader');
const Core=require('../delivery-schedule-core');
const id=i=>String(i).padStart(8,'0')+'-0000-0000-0000-000000000000';
const shops=Array.from({length:22},(_,i)=>({id:id(i),label:i===0?'[대구/북구] 크레용(대구)':i===1?'[광주/광산] 쭌이네':`[서울/강남] 테스트${i}`,region:i===0?'경상':i===1?'전라':'서울'}));
const html='<script src="/_next/static/chunks/estimate.js"></script><script>self.__next_f.push('+JSON.stringify([1,'8:'+JSON.stringify(['$','$L',null,{shops}])+'\n'])+')</script>';
test('exact quantity quote reader keeps non-linear official prices and isolates failed tuples',async()=>{
 const calls=[],get={text:async(url,options={})=>{
  if(url.endsWith('.js'))return ['deliverableAction','quoteAction'].map((n,i)=>`(0,c.createServerReference)("${(i?'b':'a').repeat(42)}",c.callServer,void 0,c.findSourceMapURL,"${n}")`).join(';');
  const args=JSON.parse(options.body);calls.push(args);const q=args[2],fee=Math.min(q-1,3)*7000;
  return '1:'+JSON.stringify(q===99?{ok:false}:{ok:true,quote:{base:28000,zoneSurcharge:0,petSurcharge:fee,total:28000+fee}})+'\n';
 }};
 const results=await readQuotes(get,html,[1,2,6,10,99].map(quantity=>({from:id(0),to:id(2),quantity})));
 assert.deepEqual(results.slice(0,4).map(r=>r.quote.total),[28000,35000,49000,49000]);assert.ok(results[4].error);assert.equal(calls.length,5);
 assert.ok(calls.every(args=>args[0]===id(0)&&args[1]===id(2)));
});
test('new public estimates are isolated by origin and do not invent dates or bookings',async()=>{
 const calls=[];let broken=false;
 const get={text:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('.js'))return 'let u=(0,c.createServerReference)("'+'a'.repeat(42)+'",c.callServer,void 0,c.findSourceMapURL,"deliverableAction"),d=(0,c.createServerReference)("'+'b'.repeat(42)+'",c.callServer,void 0,c.findSourceMapURL,"quoteAction");';
  assert.equal(url,'https://www.dodosi.co.kr/estimate');assert.equal(options.method,'POST');
  const args=JSON.parse(options.body);
  const result=options.headers['Next-Action'][0]==='a'?{ok:true,value:shops.filter(s=>s.id!==args[0]).map(s=>s.id)}:{ok:true,quote:{base:args[0]===id(0)?28000:32000,zoneSurcharge:0,petSurcharge:0,total:broken?-1:args[0]===id(0)?28000:32000}};
  return '0:{"a":"$@1"}\n1:'+JSON.stringify(result)+'\n';
 }};
 const data=await readModern(get,html,['크레용(대구)','쭌이네']);
 assert.equal(data.ratePayload.items.length,21);assert.equal(data.ratePayload.origins[0].items[0].price,28000);assert.equal(data.ratePayload.origins[1].items[0].price,32000);
 assert.equal(data.scheduleUnavailable,true);
 assert.equal(Core.estimate({config:{enabled:true,auctionDate:'2026-11-23'},carrier:'dodosi',destination:{shop:'테스트'},source:data}).reason,'schedule_unavailable');
 assert(calls.every(c=>!/order|payment|booking/.test(c.url)));
 broken=true;await assert.rejects(readModern(get,html,['크레용(대구)']),/Invalid DODOSI quote/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('../dodosi-quote-cache');
const id=n=>`${String(n).padStart(8,'0')}-0000-0000-0000-000000000000`;
const request=(quantity=1,to=id(2))=>({from:id(1),to,quantity});
const quote=n=>({base:28000,zoneSurcharge:0,petSurcharge:Math.min(n-1,3)*7000,total:28000+Math.min(n-1,3)*7000});
function fixture(){let clock=Date.parse('2026-11-24T07:59:00+09:00'),calls=0,writes=0,broken=false,disk=false;const rows=new Map(),repo={getRowsByKeys:async keys=>keys.filter(k=>rows.has(k)).map(key=>({key,value:rows.get(key)})),upsertRows:async batch=>{if(disk)throw Error('disk');writes++;for(const r of batch)rows.set(r.key,r.value);}};const read=async requests=>{calls++;if(broken)throw Error('offline');return requests.map(r=>({...r,quote:quote(r.quantity)}));};const make=()=>Q.createCache({repository:repo,read,now:()=>clock});return {repo,rows,read,make,now:()=>clock,advance:n=>clock+=n,fail:()=>broken=true,repair:()=>broken=false,diskFail:()=>disk=true,calls:()=>calls,writes:()=>writes};}
test('KST 08:00 boundary is fixed, including month rollover and restart catch-up',()=>{
 assert.equal(Q.nextRefresh(Date.parse('2026-11-30T07:59:59+09:00')),'2026-11-29T23:00:00.000Z');
 assert.equal(Q.nextRefresh(Date.parse('2026-11-30T08:00:00+09:00')),'2026-11-30T23:00:00.000Z');
});
test('concurrent pages and duplicate destinations share durable exact-quantity quotes',async()=>{
 const f=fixture(),c=f.make(),r=[request(),request(6),request(6)];
 const results=await Promise.all(Array.from({length:15},()=>c.getMany(r)));assert.equal(f.calls(),1);assert.equal(f.writes(),1);
 assert.deepEqual(results[0].map(p=>p.quote.total),[28000,49000,49000]);assert.equal(results[0][1].status,'ready');
 const restarted=f.make();await restarted.getMany(r);assert.equal(f.calls(),1);
 await restarted.getMany([request(2)]);assert.equal(f.calls(),2);assert.equal(f.writes(),2);
 assert.equal(Object.keys(JSON.parse(f.rows.get(Q.KEY)).entries).length,3);
});
test('08:00 refresh updates all saved pairs once and repeated timer ticks make no source requests',async()=>{
 const f=fixture(),c=f.make();await c.getMany([request(),request(6)]);f.advance(60000);await Promise.all([c.refresh(),c.refresh(),c.getMany([request()])]);assert.equal(f.calls(),2);
 f.advance(30000);await c.refresh();assert.equal(f.calls(),2);f.advance(86400000);await f.make().refresh();assert.equal(f.calls(),3);
});
test('failed refresh keeps last good quote explicitly stale, retries with backoff, and never invents zero',async()=>{
 const f=fixture(),c=f.make();await c.getMany([request()]);const before=f.rows.get(Q.KEY);f.advance(60000);f.fail();
 const old=await c.getMany([request(),request(6)]);assert.equal(old[0].status,'stale');assert.equal(old[0].quote.total,28000);assert.equal(old[1].status,'unavailable');assert.equal(old[1].quote,null);assert.equal(f.rows.get(Q.KEY),before);
 await c.refresh();assert.equal(f.calls(),2);f.repair();f.advance(300001);assert.equal((await c.getMany([request(),request(6)]))[1].status,'ready');
});
test('storage errors do not replace trusted memory and origin/quantity changes never reuse other quotes',async()=>{
 const f=fixture(),c=f.make();await c.getMany([request()]);f.diskFail();f.advance(60000);
 assert.equal((await c.getMany([request()]))[0].status,'stale');
 const other={...request(),from:id(3)};assert.equal((await c.getMany([other]))[0].status,'unavailable');
 await assert.rejects(c.getMany([request(0)]));await assert.rejects(c.getMany([{...request(),from:id(2)}]));
});
test('malformed, mismatched and duplicate provider results cannot populate the cache',async()=>{
 const f=fixture();for(const read of [async rs=>rs.map(r=>({...r,quote:{...quote(1),total:0}})),async rs=>rs.map(r=>({...r,to:id(9),quote:quote(1)})),async rs=>[...rs,...rs].map(r=>({...r,quote:quote(1)}))]){
 const c=Q.createCache({repository:f.repo,read,now:f.now});assert.equal((await c.getMany([request()]))[0].status,'unavailable');}
 assert.equal(f.writes(),0);
});

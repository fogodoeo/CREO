'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const View=require('../public/vendor-event-view');
const events=[{id:'national-cre',name:'전국크레자랑',status:'active'},{id:'national-cre-20261021',name:'10/21 전라·충청',status:'active'},{id:'national-cre-20261026',name:'다음 회차',status:'draft'}];
const data={channel:events[0],events};
test('new national portal settlement landing opens the participating active dated round',()=>{
 assert.equal(View.initialTarget(data,'?event=national-cre&portal=owned-vendor'),'national-cre-20261021');
 assert.equal(View.initialTarget({...data,events:[events[0]]},'?portal=owned-vendor'),'');
 assert.equal(View.initialTarget({...data,events:[events[0],events[2]]},'?portal=owned-vendor'),'');
});
test('historical links, direct sale links, and non-root selections never move automatically',()=>{
 for(const search of ['?event=national-cre&portal=owned-vendor&round=date:2026-10-19','?event=national-cre&portal=owned-vendor&round=archive:old','?event=national-cre&code=sale-link','?event=national-cre&token=signed'])assert.equal(View.initialTarget(data,search),'');
 assert.equal(View.initialTarget({...data,channel:events[1]},'?portal=owned-vendor'),'');
});
test('common national channel is history rather than a second operating auction',()=>{
 assert.equal(View.label(events[0],true),'이전 낙찰·결제 내역');
 assert.equal(View.label(events[1],true),'10/21 전라·충청 · 운영 중');
 assert.match(View.label({id:'clab',name:'씨랩',status:'active'},false),/운영 중/);
});
test('portal landing loads the current event before rendering and stays on history after a user switch',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8');
 const start=source.indexOf('async function load(silent='),end=source.indexOf('function showError',start),seen=[],rendered=[];
 const nodes=new Map(),ctx=vm.createContext({URLSearchParams,client:{valid:true},loadSequence:0,initialEventResolved:false,selectedEvent:'national-cre',data:null,location:{search:'?event=national-cre&portal=owned'},CreoVendorEvents:View,
  $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},api:async()=>{seen.push(ctx.selectedEvent);return {...data,channel:events.find(e=>e.id===ctx.selectedEvent)}} ,render:()=>rendered.push(ctx.data.channel.id),showError:e=>{throw Error(e)}});
 vm.runInContext(source.slice(start,end),ctx);assert.equal(await ctx.load(),true);assert.deepEqual(seen,['national-cre','national-cre-20261021']);assert.deepEqual(rendered,['national-cre-20261021']);
 ctx.selectedEvent='national-cre';await ctx.load();assert.equal(rendered.at(-1),'national-cre');assert.equal(seen.length,3);
});
test('failed initial current-round fetch restores selection and allows retry without showing a mismatched payload',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8'),nodes=new Map(),errors=[],rendered=[];
 const ctx=vm.createContext({URLSearchParams,client:{valid:true},loadSequence:0,initialEventResolved:false,selectedEvent:'national-cre',data:null,location:{search:'?portal=owned'},CreoVendorEvents:View,
  $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},api:async()=>{if(ctx.selectedEvent!=='national-cre')throw Error('temporary outage');return data},render:()=>rendered.push(ctx.data),showError:e=>errors.push(e)});
 vm.runInContext(source.slice(source.indexOf('async function load(silent='),source.indexOf('function showError')),ctx);assert.equal(await ctx.load(),false);assert.equal(ctx.selectedEvent,'national-cre');assert.equal(ctx.initialEventResolved,false);assert.deepEqual(rendered,[]);assert.deepEqual(errors,['temporary outage']);
});

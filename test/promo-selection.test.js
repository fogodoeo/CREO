'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const nodes=new Map(['detail','partner-retry','partner-refresh','partner-status','copy-status'].map(id=>[id,{open:true,hidden:false,textContent:'',setAttribute(){},removeAttribute(){}}])),calls=[];
 const ctx=vm.createContext({partnerMode:'all',partnerRegions:new Set(),partnerImages:[],partnerReady:true,partnerSequence:0,state:{},$:id=>nodes.get(id),drawPost(){},syncCopyButtons(){},showPartnerRegions(){},crypto:{randomUUID:()=>String(calls.length)},request:body=>new Promise((resolve,reject)=>calls.push({body,resolve,reject})),Image:class{set src(value){queueMicrotask(()=>this.onload());}},queueMicrotask,setTimeout:()=>1,clearTimeout(){},imageURL:v=>v});
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');vm.runInContext(source.slice(source.indexOf(' async function updatePartners('),source.indexOf('\n async function copy(')),ctx);return{ctx,calls,nodes};
}
test('switching to none cancels old results and restores copying without stale logos',async()=>{
 const f=fixture(),first=f.ctx.updatePartners();assert.equal(f.ctx.partnerReady,false);
 f.ctx.partnerMode='none';await f.ctx.updatePartners();assert.equal(f.ctx.partnerReady,true);f.calls[0].resolve({partners:{version:'old'}});await first;assert.equal(f.calls.length,1);assert.equal(f.ctx.partnerImages.length,0);assert.equal(f.ctx.partnerReady,true);
});
test('failed generation blocks copying; retry succeeds; closed preview ignores completion',async()=>{
 const f=fixture(),first=f.ctx.updatePartners();f.calls[0].resolve({partners:{version:'v'}});await new Promise(setImmediate);assert.equal(f.calls[1].body.catalogVersion,'v');f.calls[1].reject(Object.assign(Error('명단 변경'),{status:409}));await first;assert.equal(f.ctx.partnerReady,false);assert.equal(f.nodes.get('partner-retry').hidden,false);
 const second=f.ctx.updatePartners();f.calls[2].resolve({partners:{version:'new'}});await new Promise(setImmediate);f.calls[3].resolve({images:[{src:'https://example.com/new.png'}],count:2});await second;assert.equal(f.ctx.partnerReady,true);assert.equal(f.ctx.partnerImages[0].src,'https://example.com/new.png');
 const third=f.ctx.updatePartners();f.nodes.get('detail').open=false;f.calls[4].resolve({partners:{version:'closed'}});await third;assert.equal(f.calls.length,5);
});

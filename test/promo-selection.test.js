'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const nodes=new Map(['detail','partner-retry','partner-refresh','partner-status','copy-status'].map(id=>[id,{open:true,hidden:false,textContent:'',setAttribute(){},removeAttribute(){}}])),calls=[];
 const ctx=vm.createContext({partnerMode:'all',partnerRegions:new Set(),partnerImages:[],partnerReady:true,partnerSequence:0,state:{},$:id=>nodes.get(id),drawPost(){},syncCopyButtons(){},showPartnerRegions(){},crypto:{randomUUID:()=>String(calls.length)},request:body=>new Promise((resolve,reject)=>calls.push({body,resolve,reject})),Image:class{set src(value){queueMicrotask(()=>this.onload());}},queueMicrotask,setTimeout:()=>1,clearTimeout(){},imageURL:v=>v});
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');vm.runInContext(source.slice(source.indexOf(' async function updatePartners('),source.indexOf('\n async function copy(')),ctx);return{ctx,calls,nodes};
}
test('opening any manuscript starts with all partners, including after a previous none/region choice',()=>{
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const radios=['none','all','regions'].map(value=>({value,checked:false}));
 const nodes=new Map(['post-title','copy-status','detail'].map(id=>[id,{textContent:'',open:false,showModal(){this.open=true;},querySelector(){return {scrollTop:40};}}]));
 let updates=0;
 const ctx=vm.createContext({state:{templates:[{id:'new',title:'새 원고',blocks:[{type:'text',text:'소개'}]}]},partnerMode:'none',partnerRegions:new Set([1]),partnerImages:[{src:'old.png'}],partnerReady:true,
  $:id=>nodes.get(id),document:{activeElement:{},querySelectorAll:()=>radios},error(){},showPartnerRegions(){},drawPost(){},updatePartners(){updates++;}});
 vm.runInContext(source.slice(source.indexOf(' function preview('),source.indexOf('\n function syncCopyButtons(')),ctx);
 for(const previous of ['none','regions']){
  ctx.partnerMode=previous;ctx.preview('new');
  assert.equal(ctx.partnerMode,'all');assert.equal(ctx.partnerReady,false);assert.equal(ctx.partnerImages.length,0);assert.equal(ctx.partnerRegions.size,0);
  assert.deepEqual(radios.filter(r=>r.checked).map(r=>r.value),['all']);
 }
 assert.equal(updates,2);
});
test('switching to none cancels old results and restores copying without stale logos',async()=>{
 const f=fixture(),first=f.ctx.updatePartners();assert.equal(f.ctx.partnerReady,false);
 f.ctx.partnerMode='none';await f.ctx.updatePartners();assert.equal(f.ctx.partnerReady,true);f.calls[0].resolve({partners:{version:'old'}});await first;assert.equal(f.calls.length,1);assert.equal(f.ctx.partnerImages.length,0);assert.equal(f.ctx.partnerReady,true);
});
test('failed generation blocks copying; retry succeeds; closed preview ignores completion',async()=>{
 const f=fixture(),first=f.ctx.updatePartners();f.calls[0].resolve({partners:{version:'v'}});await new Promise(setImmediate);assert.equal(f.calls[1].body.catalogVersion,'v');f.calls[1].reject(Object.assign(Error('명단 변경'),{status:409}));await first;assert.equal(f.ctx.partnerReady,false);assert.equal(f.nodes.get('partner-retry').hidden,false);
 const second=f.ctx.updatePartners();f.calls[2].resolve({partners:{version:'new'}});await new Promise(setImmediate);f.calls[3].resolve({images:[{src:'https://example.com/new.png'}],count:2});await second;assert.equal(f.ctx.partnerReady,true);assert.equal(f.ctx.partnerImages[0].src,'https://example.com/new.png');
 const third=f.ctx.updatePartners();f.nodes.get('detail').open=false;f.calls[4].resolve({partners:{version:'closed'}});await third;assert.equal(f.calls.length,5);
});

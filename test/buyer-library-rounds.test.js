'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/buyer-library.js'),'utf8');
function setup(){
 const nodes=new Map(),pending=[],errors=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{focus(){},querySelectorAll:()=>[]});return nodes.get(id)};
 const ctx=vm.createContext({$,epoch:0,displayEvent:'',displayRound:'',encodeURIComponent,esc:require('../public/checkout-client').escapeHtml,money:String,location:{origin:'https://example.test'},window:{scrollTo(){}},api:path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject})),message(){},report:e=>errors.push(e.message),CreoCheckoutItemView:{pictures:()=>[],traitSummary:()=>'',parentDetails:()=>[],itemTitle:item=>item.name}});
 vm.runInContext(source.slice(source.indexOf('function roundTitle('),source.indexOf('function openConnect(')),ctx);
 const round=key=>({key,name:key==='old'?'이전 회차':'이번 회차',available:true});
 const data=(key='old',rounds=[round('old'),round('next')])=>({channel:{name:'가상 경매',status:'active'},round:round(key),rounds,items:[{id:key,name:key==='old'?'A01':'B01',vendorName:'가상 업체',soldAmount:100000}]});
 return{ctx,nodes,$,pending,errors,data};
}
test('library round switches show only the chosen items and hide a single round selector',async()=>{
 const f=setup(),one=f.ctx.openEvent('grant');f.pending[0].resolve(f.data());await one;
 assert.equal(f.$('event-title').innerHTML,'이전 회차');assert.match(f.$('items').innerHTML,/A01/);assert.doesNotMatch(f.$('items').innerHTML,/B01/);assert.equal(f.$('library-round-wrap').hidden,false);
 const next=f.ctx.openEvent('grant','next');assert.equal(f.pending[1].path,'buyer-collection/grant?view=rounds&round=next');assert.equal(f.$('library-round').disabled,true);f.pending[1].resolve(f.data('next'));await next;
 assert.match(f.$('items').innerHTML,/B01/);assert.doesNotMatch(f.$('items').innerHTML,/A01/);assert.equal(f.ctx.displayRound,'next');
 const single=f.ctx.openEvent('single');f.pending[2].resolve(f.data('old',[f.data().round]));await single;assert.equal(f.$('library-round-wrap').hidden,true);
});
test('failed and reordered library requests cannot replace the selected round with stale items',async()=>{
 const f=setup(),initial=f.ctx.openEvent('grant');f.pending[0].resolve(f.data());await initial;
 const failed=f.ctx.openEvent('grant','next');f.pending[1].reject(Error('offline'));await failed;assert.equal(f.ctx.displayRound,'old');assert.equal(f.$('library-round').value,'old');assert.match(f.$('items').innerHTML,/A01/);assert.deepEqual(f.errors,['offline']);
 const slow=f.ctx.openEvent('grant','old'),fast=f.ctx.openEvent('grant','next');f.pending[3].resolve(f.data('next'));await fast;f.pending[2].resolve(f.data());await slow;assert.equal(f.ctx.displayRound,'next');assert.match(f.$('items').innerHTML,/B01/);assert.doesNotMatch(f.$('items').innerHTML,/A01/);
});
test('a private-session reset invalidates pending library responses before they can render',async()=>{
 const f=setup(),loading=f.ctx.openEvent('grant');f.ctx.epoch++;f.pending[0].resolve(f.data());await loading;
 assert.equal(f.ctx.displayEvent,'');assert.equal(f.ctx.displayRound,'');assert.equal(f.$('items').innerHTML,undefined);
});
test('round titles keep the date together and escape all supplied markup',()=>{
 const f=setup();assert.equal(f.ctx.roundTitle('<img> & 2026-10-19'),'&lt;img&gt; &amp; <span class="library-round-date">2026-10-19</span>');assert.equal(f.ctx.roundTitle('이전 회차'),'이전 회차');
});
test('unknown legacy snapshots never adopt a later resale round or merge unrelated historical records',()=>{
 const {recordRounds}=require('../buyer-collection-rounds');
 const records=[{identity:'old-sale',itemId:'same',recordState:'changed',item:{name:'원래 개체'}},{identity:'new-sale',itemId:'same',recordState:'current',item:{name:'새 낙찰'}},{identity:'deleted-sale',itemId:'removed',recordState:'archived',item:{name:'삭제된 원본'}}];
 const rounds=recordRounds({channelName:'경매'},records,{channel:{name:'경매'},items:[{id:'same',status:'sold',attributes:{broadcastDate:'2026-10-21'}}],archives:[]});
 assert.equal(rounds.length,3);assert.ok(rounds.every(r=>r.records.length===1));assert.match(rounds.find(r=>r.records[0].identity==='old-sale').name,/보관 기록/);assert.match(rounds.find(r=>r.records[0].identity==='new-sale').name,/2026-10-21/);
});
test('many unknown historical snapshots reuse their permission gate and revoked lists do not expose item names',async()=>{
 const {createBuyerCollection}=require('../buyer-collection');let checks=0,allowed=true,reads=0;
 const items=Array.from({length:500},(_,i)=>({id:String(i),identity:'sale-'+i})),grant={id:'grant',channelId:'channel',channelName:'가상 경매',phoneHash:'fake',accessGeneration:0,items,linkedAt:1};
 const collection=createBuyerCollection({repository:{},auth:{read:async()=>({revision:1,grants:[grant]}),digest:v=>v,readMany:async keys=>{reads++;return new Map(keys.map((key,i)=>[key,{schema:1,identity:items[i].identity,itemId:items[i].id,item:{name:'PRIVATE-'+i}}]));}},linkAccess:{accepts:async()=>{checks++;return allowed}},resolveRecords:async()=>({items:[],archives:[]})});
 const list=await collection.list({accountId:'fake'});assert.equal(list.records[0].roundCount,500);assert.equal(reads,1);assert.ok(checks<=3,'do not re-read the same access gate once per frozen item');
 allowed=false;const priorReads=reads,revoked=await collection.list({accountId:'fake'});assert.equal(revoked.records[0].available,false);assert.equal(reads,priorReads);assert.doesNotMatch(JSON.stringify(revoked),/PRIVATE/);
});

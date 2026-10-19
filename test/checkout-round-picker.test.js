'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const element=()=>({children:[],append(...v){this.children.push(...v)},prepend(v){this.children.unshift(v)},replaceChildren(){this.children=[]}}),container=element();
 let key='',allowed=true,load=async()=>true;
 const location={href:'https://example.test/vendor-checkout.html?code=synthetic-link'},history={replaceState(_a,_b,url){location.href=String(url)}};
 const context=vm.createContext({window:{},document:{createElement:element},location,history,URL});
 vm.runInContext(fs.readFileSync(require.resolve('../public/checkout-round-picker'),'utf8'),context);
 const picker=context.window.CreoCheckoutRounds.create({container,client:{setRound:v=>key=v},load:()=>load(),canChange:()=>allowed});
 const panel=container.children[0],select=panel.children[1],data={channel:{id:'national-cre'},events:[],round:{key:'date:2026-10-19',name:'경기'},rounds:[{key:'date:2026-10-19',name:'경기',openCount:1},{key:'archive:old',name:'이전 회차',openCount:2}]};
 picker.update(data);
 return {picker,panel,select,data,location,get key(){return key},set allowed(v){allowed=v},set load(v){load=v}};
}
test('unfinished old rounds stay discoverable and selected event/round survive reload URLs',()=>{
 const f=setup();assert.equal(f.panel.hidden,false);assert.match(f.select.children[1].textContent,/이전 회차 · 결제 미완료 2개체/);
 assert.equal(f.panel.children.length,2);
 const url=new URL(f.location.href);assert.equal(url.searchParams.get('event'),'national-cre');assert.equal(url.searchParams.get('round'),f.data.round.key);
});
test('a single current or archived round hides the selector while preserving financial scope',()=>{
 for(const buyers of [undefined,[]])for(const round of [{key:'date:2026-10-19',name:'경기'},{key:'archive:old',name:'이전 회차',archiveId:'old'}]){
  const f=setup();f.picker.update({...f.data,buyers,round,rounds:[round]});
  assert.equal(f.panel.hidden,true);assert.equal(f.key,round.key);assert.equal(new URL(f.location.href).searchParams.get('round'),round.key);
  f.picker.update({...f.data,buyers});assert.equal(f.panel.hidden,false);
 }
});
test('round switch scopes requests, restores after failed load and respects unsaved work',async()=>{
 const f=setup(),seen=[];f.load=async()=>{seen.push(f.key);return seen.length!==1};f.select.value='archive:old';await f.select.onchange();
 assert.deepEqual(seen,['archive:old','date:2026-10-19']);assert.equal(f.select.value,'date:2026-10-19');assert.equal(f.select.disabled,false);
 f.allowed=false;f.select.value='archive:old';await f.select.onchange();assert.equal(seen.length,2);assert.equal(f.key,'date:2026-10-19');
});
for(const file of ['vendor-checkout.html','buyer-shipping.html'])test(file+' ignores older responses after changing financial round',async()=>{
 const source=fs.readFileSync(require.resolve('../public/'+file),'utf8'),start=source.indexOf('async function load(silent='),end=source.indexOf('function showError',start),pending=[],rendered=[];
 const nodes=new Map(),ctx=vm.createContext({client:{valid:true},loadSequence:0,data:null,api:()=>new Promise(resolve=>pending.push(resolve)),$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},render(){rendered.push(ctx.data.id)},hydrate(next){rendered.push(next.id)},showError(){throw Error('unexpected error')}});
 vm.runInContext(source.slice(start,end),ctx);const old=ctx.load(true),next=ctx.load(true);pending[1]({id:'selected'});await next;pending[0]({id:'stale'});await old;assert.deepEqual(rendered,['selected']);
});
for(const file of ['vendor-checkout.html','buyer-shipping.html'])test(file+' initializes round picker inside its executable script',()=>{
 const html=fs.readFileSync(require.resolve('../public/'+file),'utf8'),script=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('async function load(silent='));
 const end=script.indexOf(file==='vendor-checkout.html'?'function renderEvents':'const experience'),prefix=script.slice(script.indexOf('const Checkout='),end);
 let created=0;const context=vm.createContext({window:{CreoCheckoutClient:{createClient:()=>({}),byId:()=>({})}},location:{search:''},URLSearchParams,CreoCheckoutRounds:{create(){created++;return {}}}});
 const result=vm.runInContext('(function(){'+prefix+'return {roundPicker,loadSequence};})()',context);assert.equal(created,1);assert.equal(result.loadSequence,0);assert.ok(result.roundPicker);
});
test('vendor settlement navigation retains the selected historical round',()=>{
 const source=fs.readFileSync(require.resolve('../public/vendor-navigation'),'utf8'),start=source.indexOf('const destination = section =>'),end=source.indexOf("nav.querySelectorAll('a[data-vendor-section]')",start);
 const ctx=vm.createContext({query:new URLSearchParams({round:'archive:old'}),URLSearchParams,event:'national-cre',code:'synthetic-link',token:'',preview:false,nav:{classList:{contains:()=>false}}});
 const href=vm.runInContext(source.slice(start,end)+"destination('settlement')",ctx);assert.equal(new URL(href,'https://example.test').searchParams.get('round'),'archive:old');
});
test('unavailable round recovery removes only the view filter and keeps link authority, event and tab',()=>{
 const ctx=vm.createContext({window:{},URL});
 vm.runInContext(fs.readFileSync(require.resolve('../public/checkout-round-picker'),'utf8'),ctx);
 const recovery=ctx.window.CreoCheckoutRounds.recoveryHref;
 for(const path of ['/s/syntheticLink','/v/syntheticLink','/buyer-shipping.html','/vendor-checkout.html']){
  const before=new URL(path+'?code=syntheticLink&token=synthetic-token&event=national-cre&round=archive%3Amissing#items','https://example.test');
  const after=new URL(recovery(409,{href:before.href}));
  assert.equal(after.origin,before.origin);assert.equal(after.pathname,before.pathname);assert.equal(after.hash,'#items');
  assert.equal(after.searchParams.has('round'),false);
  for(const key of ['code','token','event'])assert.equal(after.searchParams.get(key),before.searchParams.get(key));
  for(const status of [0,400,401,403,404,500])assert.equal(recovery(status,{href:before.href}),'');
  assert.equal(recovery(409,{href:after.href}),'');
 }
});
for(const file of ['vendor-checkout.html','buyer-shipping.html'])test(file+' exposes round recovery only for a failed round read, with no stale recovery after an auth error',async()=>{
 const source=fs.readFileSync(require.resolve('../public/'+file),'utf8'),nodes=new Map();
 const ctx=vm.createContext({window:{},URL,location:{href:'https://example.test/'+file+'?code=syntheticLink&round=archive%3Amissing'},$:id=>{if(!nodes.has(id))nodes.set(id,{removeAttribute(name){delete this[name]}});return nodes.get(id)}});
 vm.runInContext(fs.readFileSync(require.resolve('../public/checkout-round-picker'),'utf8'),ctx);
 ctx.CreoCheckoutRounds=ctx.window.CreoCheckoutRounds;
 const start=source.indexOf('function showError('),end=source.indexOf('\n',start);
 vm.runInContext(source.slice(start,end),ctx);
 ctx.showError('unavailable round',409);
 const link=nodes.get('error-round-recovery');assert.equal(link.hidden,false);assert.equal(new URL(link.href).searchParams.has('round'),false);assert.equal(nodes.get('app').hidden,true);
 ctx.showError('revoked link',401);assert.equal(link.hidden,true);assert.equal(link.href,undefined);
 ctx.client={valid:true};ctx.loadSequence=0;ctx.api=async()=>{throw Object.assign(Error('unavailable round'),{status:409})};
 vm.runInContext(source.slice(source.indexOf('async function load(silent='),start),ctx);
 await ctx.load();assert.equal(link.hidden,false,'failed load must forward its status to recovery');
 assert.match(source,/<a id="error-round-recovery"[^>]*hidden>/);
});

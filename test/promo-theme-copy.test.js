'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
function renderer(extra={}){
 const ctx=vm.createContext({URL,location:{origin:'https://creok.onrender.com'},esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),...extra});
 vm.runInContext(source.slice(source.indexOf(' function imageURL('),source.indexOf('\n const kst=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function bodyHTML('),source.indexOf('\n function preview(')),ctx);
 return ctx;
}
const noColors=html=>assert.doesNotMatch(html,/\b(?:color|background(?:-color)?|-webkit-text-fill-color)\s*:|\bcolor\s*=/i);
test('every manuscript preview and rich copy leaves colors to the receiving theme',()=>{
 const ctx=renderer();
 for(const t of require('../promo-templates.json'))for(const copying of [false,true]){
  const html=ctx.bodyHTML(t,copying);noColors(html);
  assert.match(html,/<img /);assert.match(html,/font-size:\d+px/);assert.match(html,/font-weight:/);
 }
 const html=ctx.bodyHTML({blocks:[{type:'text',text:'강조 & 링크\n다음 줄',size:24,bold:true,color:'green',href:'https://band.us/n/example?a=1&b=2'}]},true);
 noColors(html);assert.match(html,/font-size:24px;font-weight:700/);assert.match(html,/강조 &amp; 링크<br>다음 줄/);assert.match(html,/href="https:\/\/band.us\/n\/example\?a=1&amp;b=2"/);
});

function clipboardFixture({modern=false,success=true}={}){
 const writes=[],handlers=new Map(),nodes=new Map(['detail','copy-status'].map(k=>[k,{open:false,textContent:'',append(){}}]));
 let host;
 const ctx=renderer({library:true,admin:false,copying:false,partnerReady:true,partnerImages:[],template:{title:'제목',blocks:[{type:'text',text:'테스트 원고',size:18,bold:true,color:'ink'}]},syncCopyButtons(){},$:k=>nodes.get(k),Blob,
  window:{ClipboardItem:modern},ClipboardItem:class{constructor(value){this.value=value;}},
  navigator:{clipboard:modern?{write:async value=>writes.push(value)}:undefined},
  document:{
   createElement(tag){assert.equal(tag,'textarea');host={style:{},select(){this.selected=true;},remove(){this.removed=true;}};return host;},
   addEventListener(type,handler){handlers.set(type,handler);},removeEventListener(type){handlers.delete(type);},
   execCommand(command){assert.equal(command,'copy');assert.ok(host.selected);if(!success)return false;const data={};let prevented=false;handlers.get('copy')({clipboardData:{setData:(type,value)=>data[type]=value},preventDefault(){prevented=true;}});assert.ok(prevented);writes.push(data);return true;}
  },request(){throw Error('Public copy must not mutate vendor data');}});
 vm.runInContext(source.slice(source.indexOf(' async function copy('),source.indexOf(' let imageBundleController=')),ctx);
 return {ctx,writes,handlers,nodes,get host(){return host;}};
}
test('modern and legacy clipboard paths carry identical color-neutral markup',async()=>{
 const modern=clipboardFixture({modern:true}),legacy=clipboardFixture();
 await modern.ctx.copy(true);await legacy.ctx.copy(true);
 const rich=await modern.writes[0][0].value['text/html'].text();
 noColors(rich);assert.equal(legacy.writes[0]['text/html'],rich);assert.equal(legacy.writes[0]['text/plain'],'테스트 원고');
 assert.equal(legacy.handlers.size,0);assert.ok(legacy.host.removed);assert.equal(legacy.host.value,'테스트 원고');
});
test('failed legacy copying removes its listener and temporary selection',async()=>{
 const f=clipboardFixture({success:false});await f.ctx.copy(true);
 assert.equal(f.writes.length,0);assert.equal(f.handlers.size,0);assert.ok(f.host.removed);assert.equal(f.ctx.copying,false);assert.match(f.nodes.get('copy-status').textContent,/복사하지 못했어요/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {printLabels,previewHtml,normalizeFormat,checkPrinterFormat,create}=require('../public/entry-label-print');
const labels=[{kind:'identification',lot_number:'1부 A01',company:'크레용 대구본점',traits:'암컷 28g',parents:'아토 × 미운',source_ref:'출품 01'}];
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

test('switching layouts preserves label identity, count and original details without mutating snapshots',()=>{
 const before=structuredClone(labels),fold=printLabels(labels,'fold');
 assert.equal(fold.length,1);assert.deepEqual(fold[0],{...labels[0],format:'fold'});
 assert.deepEqual(printLabels(labels,'standard'),before);assert.deepEqual(labels,before);
 const original=previewHtml(labels,'standard',escape),folded=previewHtml(labels,'fold',escape);
 assert.match(original,/아토 × 미운/);assert.match(original,/암컷 28g/);
 assert.equal((folded.match(/1부 A01/g)||[]).length,2);assert.equal((folded.match(/크레용 대구본점/g)||[]).length,2);
 assert.equal((folded.match(/identity-fold-line/g)||[]).length,1);assert.doesNotMatch(folded,/아토|암컷|출품 01/);
 assert.doesNotMatch(previewHtml([{...labels[0],company:'<img src=x onerror=alert(1)>'}],'fold',escape),/<img/);
 assert.equal(normalizeFormat('old-invalid-value'),'standard');
});

test('old desktop apps can print the existing layout but cannot silently substitute it for folded labels',()=>{
 assert.doesNotThrow(()=>checkPrinterFormat({identificationLabels:true},'standard'));
 assert.throws(()=>checkPrinterFormat({identificationLabels:true},'fold'),/재실행|기존형/);
 assert.doesNotThrow(()=>checkPrinterFormat({identificationLabels:true,identificationLabelFormats:['standard','fold']},'fold'));
 assert.throws(()=>checkPrinterFormat({identificationLabels:false},'standard'),/재실행/);
});

function fixture(storage){
 const nodes=new Map();
 function element(id){if(!nodes.has(id))nodes.set(id,{id,disabled:false,hidden:false,textContent:'',innerHTML:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},focus(){},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return {clientWidth:400};}});return nodes.get(id);}
 const radios=['standard','fold'].map(value=>({...element(value),value,checked:value==='standard'}));
 const document={getElementById:element,querySelectorAll:selector=>selector.startsWith('input')?radios:[]};
 const entry={id:'e',version:1,code:'출품 01',status:'submitted',submission:{sex:'female',weight:'28'}},group={vendor:{id:'v',name:'크레용'},entries:[]};group.entries=[entry];
 const fresh={channel:{id:'test'},groups:[group],allocation:[]};
 const window={localStorage:storage,print(){window.printed=element('entry-label-preview').innerHTML;}};
 return {nodes,radios,window,document,rows:[{entry,group}],client:{escapeHtml:escape,api:async()=>structuredClone(fresh)}};
}

test('chosen format survives reopening; verified print submission freezes layout and sends exactly one label',async()=>{
 const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 const f=fixture(storage),originalWindow=global.window,originalFetch=global.fetch,posts=[];
 let release;const pending=new Promise(resolve=>release=resolve);
 try{
  global.window=f.window;
  global.fetch=async(url,options={})=>{
   if(url.endsWith('/v1/status'))return {json:async()=>({identificationLabels:true,identificationLabelFormats:['standard','fold'],ready:true})};
   posts.push(JSON.parse(options.body));await pending;return {ok:true,json:async()=>({ok:true,accepted:1})};
  };
  const app=create({...f,endpoint:()=>'/test',channel:()=> 'test'});app.open(f.rows,[],{focus(){}});
  f.radios[0].checked=false;f.radios[1].checked=true;f.radios[1].listeners.change();
  const sending=f.nodes.get('b1-entry-print').onclick();
  assert.ok(f.radios.every(r=>r.disabled));
  await f.nodes.get('b1-entry-print').onclick(); // A second click must not enqueue again.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(posts.length,1);assert.equal(posts[0].labels.length,1);assert.equal(posts[0].labels[0].format,'fold');
  release();await sending;assert.ok(f.radios.every(r=>!r.disabled));
  await f.nodes.get('browser-label-print').onclick();assert.match(f.window.printed,/identity-fold-line/);
  const reopened=fixture(storage);global.window=reopened.window;create({...reopened,endpoint:()=>'/test',channel:()=> 'test'}).open(reopened.rows,[],null);
  assert.equal(reopened.radios[1].checked,true);assert.match(reopened.nodes.get('entry-label-preview').innerHTML,/identity-fold-line/);
  reopened.radios[1].checked=false;reopened.radios[0].checked=true;reopened.radios[0].listeners.change();
  assert.doesNotMatch(reopened.nodes.get('entry-label-preview').innerHTML,/identity-fold-line/);
 }finally{release();global.window=originalWindow;global.fetch=originalFetch;}
});

test('unsupported folded format and stale data fail before posting to the printer',async()=>{
 const originalWindow=global.window,originalFetch=global.fetch;
 try{
  for(const stale of [false,true]){
   const f=fixture({getItem:()=> 'fold',setItem(){}});global.window=f.window;let posts=0;
   global.fetch=async(url)=>{if(url.endsWith('/v1/labels'))posts++;return {json:async()=>({identificationLabels:true})};};
   if(stale)f.client.api=async()=>({channel:{id:'different'},groups:[],allocation:[]});
   create({...f,endpoint:()=>'/test',channel:()=> 'test'}).open(f.rows,[],null);
   await f.nodes.get('b1-entry-print').onclick();assert.equal(posts,0);
   assert.equal(f.nodes.get('label-print-error').hidden,false);assert.ok(f.radios.every(r=>!r.disabled));
  }
 }finally{global.window=originalWindow;global.fetch=originalFetch;}
});

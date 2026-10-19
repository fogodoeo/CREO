'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const html=fs.readFileSync(require.resolve('../public/capture-gallery.html'),'utf8'),script=html.match(/<script>\s*(document.addEventListener[\s\S]*?)<\/script>/)[1];
async function setup(search){
 const {document,window}=parseHTML(html),reads=[],pending=[];let slow=false;
 const channels=['national-cre','clab-1015'].map(id=>({id,name:id,dataAdapter:'platform'}));
 const select=document.getElementById('channel-select');Object.defineProperty(select,'value',{writable:true,value:''});
 const api=async path=>{if(path.startsWith('channels?'))return {channels};if(path==='active-channel')return {channelId:'national-cre'};return {items:[{id:path.includes('clab')?'clab-item':'national-item'}]};};
 vm.runInNewContext(script,{document,window,URL,URLSearchParams,location:{search,href:'http://test.invalid/capture-gallery.html'+search},history:{replaceState(){}},CreoPlatform:{api,escapeHtml:s=>s,verifyAdmin:async()=>true},fetch:async path=>{
  reads.push(path);const reply=()=>({ok:true,json:async()=>({captures:[{id:path,channelId:path.includes('clab')?'clab-1015':'national-cre',itemId:path.includes('clab')?'clab-item':'national-item',itemName:path.includes('clab')?'씨랩 개체':'전크자 개체'},{id:'old',itemId:'old-archive',itemName:'이전 회차 사진'}]})});
  if(slow)return new Promise(resolve=>pending.push(()=>resolve(reply())));return reply();
 },confirm:()=>false,alert(){}});
 document.dispatchEvent(new window.Event('DOMContentLoaded'));await new Promise(setImmediate);return {document,window,reads,pending,slow(){slow=true}};
}
test('capture gallery pins chosen channel and filters historical item captures',async()=>{
 const f=await setup('?channel=clab-1015');assert.match(f.document.getElementById('grid').textContent,/씨랩 개체/);assert.doesNotMatch(f.document.getElementById('grid').textContent,/이전 회차|전크자 개체/);
 assert.equal(f.reads.length,1);assert.match(f.reads[0],/channel\/clab-1015$/);
 const missing=await setup('?channel=missing');assert.deepEqual(missing.reads,[]);assert.equal(missing.document.getElementById('app').hidden,true);assert.match(missing.document.getElementById('login-error').textContent,/선택한 회차/);
});
test('late capture response cannot paint another round under selected channel title',async()=>{
 const f=await setup('?channel=clab-1015');f.slow();const s=f.document.getElementById('channel-select');
 s.value='national-cre';s.dispatchEvent(new f.window.Event('change'));await new Promise(setImmediate);s.value='clab-1015';s.dispatchEvent(new f.window.Event('change'));await new Promise(setImmediate);
 f.pending[1]();await new Promise(setImmediate);f.pending[0]();await new Promise(setImmediate);
 assert.match(f.document.getElementById('grid').textContent,/씨랩 개체/);assert.doesNotMatch(f.document.getElementById('grid').textContent,/전크자 개체/);
});

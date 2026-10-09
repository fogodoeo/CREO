'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/promo-upload-guide.js'),'utf8');
function fixture({storage=new Map(),time=Date.parse('2026-10-09T13:00:00+09:00'),blocked=false}={}){
 const nodes=new Map(),document={body:{},getElementById:id=>{
  if(!nodes.has(id))nodes.set(id,{isConnected:true,checked:false,open:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},focus(){document.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},querySelector(){return {scrollTop:0};},getBoundingClientRect(){return {left:100,right:600,top:100,bottom:700};}});
  return nodes.get(id);
 }};document.activeElement=document.body;
 const window={},localStorage={getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value);},removeItem:key=>{if(blocked)throw Error('blocked');storage.delete(key);}};
 class Clock extends Date{static now(){return time;}}
 vm.runInNewContext(source,{document,window,localStorage,Date:Clock});
 const node=document.getElementById,fire=(id,type,event)=>node(id).handlers[type]?.(event);
 return {guide:window.CreoPromoGuide,node,fire,storage,document,advance:ms=>{time+=ms;}};
}
test('entry guide opens once, waits for dismissal and restores focus to its visible help button',async()=>{
 const f=fixture();let resolved=false;const ready=f.guide.offer().then(()=>resolved=true);
 assert.equal(f.node('upload-guide').open,true);assert.equal(f.document.activeElement,f.node('upload-guide-title'));assert.equal(resolved,false);
 f.fire('upload-guide-confirm','click');await ready;
 assert.equal(resolved,true);assert.equal(f.document.activeElement,f.node('upload-guide-open'));
 await f.guide.offer();assert.equal(f.node('upload-guide').open,false);
 const next=fixture({storage:f.storage});next.guide.offer();assert.equal(next.node('upload-guide').open,true);
});
test('today option expires at Korean midnight while manual reopening always works',async()=>{
 const f=fixture();f.guide.offer();f.node('upload-guide-snooze').checked=true;f.fire('upload-guide-confirm','click');
 const sameDay=fixture({storage:f.storage});await sameDay.guide.offer();assert.equal(sameDay.node('upload-guide').open,false);
 sameDay.fire('upload-guide-open','click');assert.equal(sameDay.node('upload-guide').open,true);assert.equal(sameDay.node('upload-guide-snooze').checked,true);
 const nextDay=fixture({storage:f.storage,time:Date.parse('2026-10-09T15:00:00Z')});nextDay.guide.offer();assert.equal(nextDay.node('upload-guide').open,true);
});
test('unchecking today restores entry guidance and blocked browser storage never blocks closing',()=>{
 const f=fixture();f.guide.offer();f.node('upload-guide-snooze').checked=true;f.fire('upload-guide-close','click');
 f.fire('upload-guide-open','click');f.node('upload-guide-snooze').checked=false;f.fire('upload-guide-close','click');assert.equal(f.storage.size,0);
 const blocked=fixture({blocked:true});blocked.guide.offer();blocked.node('upload-guide-snooze').checked=true;assert.doesNotThrow(()=>blocked.fire('upload-guide-confirm','click'));assert.equal(blocked.node('upload-guide').open,false);
});
test('backdrop click dismisses but text selection dragged outside does not',()=>{
 const f=fixture();f.guide.offer();const event=x=>({target:f.node('upload-guide'),clientX:x,clientY:200,isPrimary:true,button:0});
 f.fire('upload-guide','pointerdown',event(200));f.fire('upload-guide','click',event(20));assert.equal(f.node('upload-guide').open,true);
 f.fire('upload-guide','pointerdown',event(20));f.fire('upload-guide','click',event(20));assert.equal(f.node('upload-guide').open,false);
});

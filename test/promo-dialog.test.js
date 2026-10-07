'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const source=fs.readFileSync(require.resolve('../public/promo-center.js'),'utf8');
 const context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf(' function enablePreviewDismiss('),source.indexOf('\n const kst=')),context);
 const handlers={},dialog={closed:0,addEventListener:(type,fn)=>handlers[type]=fn,getBoundingClientRect:()=>({left:100,right:700,top:40,bottom:700}),close(){this.closed++;handlers.close();}};
 context.enablePreviewDismiss(dialog);
 const event=(x,y,extra={})=>({target:dialog,clientX:x,clientY:y,button:0,isPrimary:true,...extra});
 return {dialog,event,fire:(type,e)=>handlers[type](e)};
}
test('preview closes on a complete outside pointer click, including touch',()=>{
 const f=fixture();for(const pointerType of ['mouse','touch']){const e=f.event(40,350,{pointerType});f.fire('pointerdown',e);f.fire('click',e);}
 assert.equal(f.dialog.closed,2);
});
test('content, padding, text selection dragged outside and cancelled gestures keep the preview open',()=>{
 const f=fixture(),inside=f.event(300,350),outside=f.event(40,350);
 f.fire('pointerdown',inside);f.fire('click',inside);
 f.fire('pointerdown',inside);f.fire('click',outside);
 f.fire('pointerdown',outside);f.fire('click',inside);
 f.fire('pointerdown',outside);f.fire('pointercancel',outside);f.fire('click',outside);
 f.fire('pointerdown',f.event(40,350,{button:2}));f.fire('click',outside);
 assert.equal(f.dialog.closed,0);
});

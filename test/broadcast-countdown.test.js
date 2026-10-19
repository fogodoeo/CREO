'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCountdown}=require('../broadcast-countdown');
const {visible}=require('../public/broadcast-countdown');
const state={mode:'live',activeItemId:'a'},item={id:'a',status:'live'};
const signal=(sequence,running=true)=>({sessionId:'test-session-123456',sequence,itemId:'a',running});
test('display lease rejects stale/duplicate packets and stays isolated',()=>{
 let now=100;const c=createCountdown({now:()=>now});
 c.update('one',signal(1),state,item);assert.equal(c.view('one',state,item).running,true);
 assert.equal(c.view('two',state,item),null);
 c.update('one',signal(3,false),state,item);assert.equal(c.update('one',signal(2),state,item).duplicate,true);assert.equal(c.view('one',state,item),null);
 c.update('one',signal(4),state,item);now+=15001;assert.equal(c.view('one',state,item),null);
});
test('sold, next item and restart clear the display; invalid active item cannot start',()=>{
 const c=createCountdown();
 assert.throws(()=>c.update('one',signal(1),{...state,mode:'sold'},item));
 c.update('one',signal(2),state,item);assert.equal(c.view('one',{...state,activeItemId:'b'},{id:'b',status:'live'}),null);
 c.update('one',signal(3),state,item);assert.equal(c.view('one',state,{...item,status:'sold'}),null);
 assert.equal(createCountdown().view('one',state,item),null);
});
test('public lease hides sender identity and UI never exposes seconds or closed state',()=>{
 const c=createCountdown();c.update('one',signal(1),state,item);
 const display=c.view('one',state,item);assert.deepEqual(Object.keys(display).sort(),['itemId','remainingMs','running']);
 assert.ok(visible({...state,countdownDisplay:display},item));
 for(const patch of [{mode:'sold'},{activeItemId:'b',countdownDisplay:null},{countdownDisplay:{...display,remainingMs:0}}])assert.equal(visible({...state,countdownDisplay:display,...patch},item),false);
});

test('P2 badge stays visible without a bidder list, expires, and hides on cancel',()=>{
 const fs=require('fs'),vm=require('vm');let now=0,tick,badge;
 const stage={querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),append:b=>{badge=b;b.isConnected=true}};
 const document={createElement:()=>({style:{},offsetWidth:340,offsetHeight:52,setAttribute(){},remove(){this.isConnected=false;badge=null}})};
 const scope={document,performance:{now:()=>now},setInterval:f=>{tick=f},addEventListener(){}};
 scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../public/broadcast-countdown'),'utf8'),scope);
 const live={...state,countdownDisplay:{running:true,itemId:'a',remainingMs:1000}};
 scope.CreoBroadcastCountdown.sync(stage,live,item);
 assert.equal(badge.hidden,false);assert.match(badge.innerHTML,/마감 카운트 진행 중/);
 assert.ok(parseFloat(badge.style.left)>=0&&parseFloat(badge.style.top)>=0);
 now=1001;tick();assert.equal(badge.hidden,true);
 scope.CreoBroadcastCountdown.sync(stage,live,item);assert.equal(badge.hidden,true,'rerender must not renew expired lease');
 scope.CreoBroadcastCountdown.sync(stage,{...live,countdownDisplay:{...live.countdownDisplay,remainingMs:1000}},item);assert.equal(badge.hidden,false);
 scope.CreoBroadcastCountdown.sync(stage,{...live,countdownDisplay:null},item);assert.equal(badge,null);
 assert.equal(visible({...live,activeItemId:'other'},item),false);
 assert.equal(visible({...live,countdownDisplay:{...live.countdownDisplay,remainingMs:Infinity}},item),false);
});

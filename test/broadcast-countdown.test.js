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

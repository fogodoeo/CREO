'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Checkout=require('../public/checkout-client');

function pageClock(){
 const document=new EventTarget(),window=new EventTarget();document.hidden=false;document.defaultView=window;
 const pending=new Map();let next=0;
 return {document,window,pending,setTimeout(fn,delay){pending.set(++next,{fn,delay});return next},clearTimeout(id){pending.delete(id)},
  fire(){const [id,timer]=pending.entries().next().value||[];assert.ok(timer,'expected one scheduled poll');pending.delete(id);return timer.fn()},
  event(type,values={}){const event=new Event(type);Object.assign(event,values);(type==='visibilitychange'?document:window).dispatchEvent(event)}
 };
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}

test('checkout polling resumes on repeated BFCache returns and explicit stop stays stopped',async()=>{
 const clock=pageClock();let reads=0,suspends=0;
 const poller=Checkout.createAdaptivePoller(async()=>{reads++},{...clock,onSuspend:()=>suspends++});
 poller.start(0);await clock.fire();assert.equal(reads,1);
 for(let round=0;round<2;round++){
  clock.event('pagehide',{persisted:true});assert.equal(clock.pending.size,0);
  clock.event('focus');assert.equal(clock.pending.size,0);
  clock.event('pageshow',{persisted:true});assert.equal(clock.pending.size,1);
  await clock.fire();assert.equal(reads,round+2);assert.equal(clock.pending.size,1);
 }
 assert.equal(suspends,2);poller.stop();
 clock.event('pageshow',{persisted:true});clock.event('focus');clock.event('visibilitychange');
 assert.equal(clock.pending.size,0);
 poller.start(0);poller.start(0);assert.equal(clock.pending.size,1);await clock.fire();assert.equal(reads,4);poller.stop();
});

test('focus, visibility and a restored page do not overlap an outstanding request',async()=>{
 const clock=pageClock(),held=deferred();let reads=0,active=0,maxActive=0;
 const poller=Checkout.createAdaptivePoller(async()=>{reads++;active++;maxActive=Math.max(maxActive,active);if(reads===1)await held.promise;active--},{...clock});
 poller.start(0);const first=clock.fire();
 clock.event('visibilitychange');clock.event('focus');await clock.fire();assert.equal(reads,1);
 clock.event('pagehide',{persisted:true});clock.event('pageshow',{persisted:true});await clock.fire();assert.equal(reads,1);
 held.resolve();await first;assert.equal(clock.pending.size,1);
 await clock.fire();assert.equal(reads,2);assert.equal(maxActive,1);poller.stop();
});

test('a stopped request never restarts a disposed poller; failures can recover',async()=>{
 const clock=pageClock(),held=deferred();let calls=0;const errors=[];
 const poller=Checkout.createAdaptivePoller(async()=>{calls++;if(calls===1)await held.promise;if(calls===2)throw Error('temporary failure')},{...clock,onError:error=>errors.push(error.message)});
 poller.start(0);const first=clock.fire();poller.stop();held.resolve();await first;assert.equal(clock.pending.size,0);
 poller.start(0);await clock.fire();assert.deepEqual(errors,['temporary failure']);assert.equal(clock.pending.size,1);
 await clock.fire();assert.equal(calls,3);poller.stop();
});

test('late revision responses cannot publish status after suspension or start a refresh during a save',async()=>{
 for(const outcome of ['reply','error','saving']){
  const held=deferred(),statuses=[];let busy=false,refreshes=0;
  const sync=Checkout.createRevisionSync({document:{hidden:false},fetchRevision:()=>held.promise,currentRevision:()=>1,isBusy:()=>busy,refresh:async()=>{refreshes++},onStatus:text=>statuses.push(text),settleDelay:0});
  const pending=sync.poll();if(outcome==='saving')busy=true;else sync.stop();
  if(outcome==='error')held.reject(Error('late failure'));else held.resolve({checkoutRevision:2});
  assert.equal(await pending,'skipped');assert.equal(refreshes,0);assert.deepEqual(statuses,[]);
  busy=false;if(outcome!=='error'){assert.equal(await sync.poll(),'refreshed');assert.equal(refreshes,1)}sync.stop();
 }
});

test('leaving during a refresh does not publish an old success on the next page',async()=>{
 const held=deferred(),statuses=[];
 const sync=Checkout.createRevisionSync({document:{hidden:false},fetchRevision:async()=>({checkoutRevision:2}),currentRevision:()=>1,refresh:()=>held.promise,onStatus:text=>statuses.push(text),settleDelay:0});
 const pending=sync.poll();await Promise.resolve();assert.deepEqual(statuses,['반영 중…']);
 sync.stop();held.resolve(true);assert.equal(await pending,'skipped');assert.deepEqual(statuses,['반영 중…']);
});

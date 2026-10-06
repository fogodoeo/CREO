'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Tasks=require('../public/vendor-task-state');
test('four or five submissions complete registration; a requested correction still needs attention',()=>{
 const now='2026-10-06T00:00:00Z',date={startsAt:'2026-10-14T11:00:00Z',maxQuantityAvailable:4},session={entriesDueAt:'2026-10-13T11:00:00Z'};
 assert.equal(Tasks.broadcastNeedsAction(date,null,now),true);
 for(const completed of [0,1,3,4,5]){
  const r={completed,session,entries:Array.from({length:completed},()=>({status:'submitted'}))};
  assert.equal(Tasks.broadcastRegistrationComplete(r),completed>=4);
  assert.equal(Tasks.broadcastNeedsAction(date,r,now),completed<4);
 }
 const r={completed:4,session,entries:[...Array.from({length:4},()=>({status:'approved'})),{status:'changes_requested'}]};
 assert.equal(Tasks.broadcastRegistrationComplete(r),false);assert.equal(Tasks.broadcastNeedsAction(date,r,now),true);
 r.entries[4]={status:'draft'};assert.equal(Tasks.broadcastRegistrationComplete(r),true);
 assert.equal(Tasks.broadcastNeedsAction(date,{completed:3,session},session.entriesDueAt),false);
 assert.equal(Tasks.broadcastNeedsAction(date,{completed:3,session},now,false),false);
});

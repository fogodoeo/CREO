'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../checkout-rounds');
test('payment needed precedes pending confirmation and completed rounds; latest date breaks ties',()=>{
 const channel={id:'test',name:'가상 방송'},dates=['2026-10-14','2026-10-19','2026-10-21','2026-10-26'];
 const items=dates.map((date,i)=>({id:String(i),status:'sold',attributes:{broadcastDate:date}}));
 const shipments=[{itemId:'2',paymentStatus:'bank_transfer_reported'},{itemId:'3',paymentStatus:'paid'}];
 const rounds=R.groups(channel,items,shipments,[]);
 assert.deepEqual(rounds.map(r=>r.date),[dates[1],dates[0],dates[2],dates[3]]);
 assert.equal(R.select(rounds).key,'date:'+dates[1]);
 assert.equal(R.select(rounds,'date:'+dates[3]).key,'date:'+dates[3]);
 assert.equal(R.select(rounds,'','3').key,'date:'+dates[3]);
 assert.throws(()=>R.select(rounds,'date:'+dates[1],'3'),{status:409});
 assert.deepEqual(R.groups(channel,items,shipments,[],i=>i.id==='3').map(r=>r.key),['date:'+dates[3]]);
});
test('vendor remaining balance and unpaid buyers have equal priority, then pending, then completed',()=>{
 const rows=[
  {key:'done',date:'2026-10-28',settlementRemaining:0,openCount:0},
  {key:'pending',date:'2026-10-26',settlementRemaining:20000,settlementPending:true},
  {key:'old',date:'2026-10-19',settlementRemaining:10000},
  {key:'new',date:'2026-10-21',openCount:2},
 ];
 assert.deepEqual(rows.sort(R.compare).map(r=>r.key),['new','old','pending','done']);
 assert.equal(R.priority({settlementRemaining:-1000}),0);
 assert.equal(R.priority({settlementNeedsReview:true}),2);
});

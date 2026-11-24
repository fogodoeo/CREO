'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),W=require('../dodosi-booking-workflow');
const now=Date.parse('2026-11-24T04:00:00Z'),checkedAt=new Date(now).toISOString();
const group=n=>({id:'g'+n,bookingKey:'k'+n,paid:true,name:'가상'+n,phone:'010'+String(n).padStart(8,'0'),quantity:n===1?6:1,destinationId:'dest'+n,schedule:{status:'estimated',dropoffDate:'2026-11-24',arrivalDate:'2026-11-28'}});
const groups=Array.from({length:12},(_,i)=>group(i+1)),config={originId:'origin',originName:'출발점',channelId:'fixture',sender:{name:'테스트',phone:'01000000000'},fresh:true};
const snapshot=records=>({source:'https://www.dodosi.co.kr/deliveries',checkedAt,complete:true,records});
const receipt=(g,extra={})=>({id:'receipt'+g.id,status:'paid',originId:'origin',destinationId:g.destinationId,name:g.name,phone:g.phone,quantity:g.quantity,dropoffDate:g.schedule.dropoffDate,arrivalDate:g.schedule.arrivalDate,...extra});
const initial=()=>W.command({revision:0},{action:'reconcile',snapshot:snapshot([])},groups,config,now).next;

test('selected reconciliation preserves other receipts, rejects changed scope and does not refresh old checks',()=>{
 const saved=W.command(initial(),{action:'reconcile',snapshot:snapshot([receipt(groups[0])])},groups,config,now).next;
 const g=groups[1],scope=[{groupId:g.id,bookingKey:g.bookingKey,originId:'origin',destinationId:g.destinationId,dropoffDate:g.schedule.dropoffDate}];
 const later=now+300001,body={action:'reconcile',snapshot:{...snapshot([]),checkedAt:new Date(later).toISOString(),scope}};
 const next=W.command(saved,body,groups,config,later).next;
 assert.deepEqual(next.checks.find(c=>c.groupId==='g1'),saved.checks.find(c=>c.groupId==='g1'));
 assert.equal(W.command(next,{action:'prepare-batch',groupIds:['g2']},groups,config,later).batch.plans.length,1);
 assert.throws(()=>W.command(next,{action:'prepare-batch',groupIds:['g3']},groups,config,later),/접수 내역/);
 for(const bad of [[...scope,...scope],[{...scope[0],bookingKey:'changed'}],[{...scope[0],originId:'other'}]])assert.throws(()=>W.command(saved,{...body,snapshot:{...body.snapshot,scope:bad}},groups,config,later),/배송정보/);
 const reloaded=JSON.parse(JSON.stringify(next));assert.deepEqual(W.command(reloaded,body,groups,config,later).next.checks,next.checks);
 const conflict=W.command(saved,{...body,snapshot:{...body.snapshot,records:[receipt(g,{destinationId:'changed'})]}},groups,config,later).next;
 assert.equal(conflict.checks.find(c=>c.groupId===g.id).status,'conflict');
});

test('reset input returns unbooked groups to waiting, preserves history, and rejects late fill results',()=>{
 const r=W.command(initial(),{action:'prepare-batch',groupIds:['g1']},groups,config,now);
 const filled=W.command(r.next,{action:'record-fill',batchId:r.batch.id,result:{filled:true,stage:'review',groupIds:['g1'],count:1}},groups,config,now).next;
 const saved={...filled,prepared:[{groupId:'g1'}],sender:{name:'sender',phone:'01000000000'}};
 const body={action:'reset-input',reason:'Operator confirmed no input was submitted'};
 const reset=W.command(saved,body,groups,config,now).next;
 assert.deepEqual(reset.batches,[]);assert.deepEqual(reset.prepared,[]);assert.deepEqual(reset.checks,saved.checks);assert.deepEqual(reset.sender,saved.sender);
 assert.deepEqual(reset.inputResets[0].batches,saved.batches);assert.deepEqual(reset.inputResets[0].prepared,saved.prepared);
 const restarted=JSON.parse(JSON.stringify(reset));assert.deepEqual(W.command(restarted,body,groups,config,now).next,restarted);
 assert.throws(()=>W.command(reset,{action:'record-fill',batchId:r.batch.id},groups,config,now),/찾지 못/);
 assert.equal(W.command(reset,{action:'prepare-batch',groupIds:['g1']},groups,config,now).batch.status,'prepared');
 for(const status of ['confirmed','payment_pending','conflict'])assert.throws(()=>W.command({...saved,checks:[{status,receiptId:'r1'}]},body,groups,config,now),/예약번호/);
 assert.throws(()=>W.command(saved,body,groups,{...config,archived:true},now),/보관/);
});
test('10 recipient limit counts a six-animal combined shipment as one person; retry persists one batch',()=>{
 const saved=initial(),body={action:'prepare-batch',groupIds:groups.slice(0,10).map(g=>g.id)};
 const r=W.command(saved,body,groups,config,now);assert.equal(r.batch.plans.length,10);assert.equal(r.batch.plans[0].quantity,6);
 const restarted=JSON.parse(JSON.stringify(r.next)),again=W.command(restarted,body,groups,config,now);assert.equal(again.next.batches.length,1);assert.equal(again.batch.id,r.batch.id);
 assert.throws(()=>W.command(saved,{...body,groupIds:groups.slice(0,11).map(g=>g.id)},groups,config,now),/1~10명/);
 assert.throws(()=>W.command(r.next,{...body,groupIds:['g1','g11']},groups,config,now),/진행 중인 묶음/);
});
test('unpaid override, stale source and schedule changes fail closed before preparing',()=>{
 const saved=initial(),unpaid=[{...groups[0],paid:false}],body={action:'prepare-batch',groupIds:['g1']};
 assert.throws(()=>W.command(saved,body,unpaid,config,now),/결제/);
 assert.equal(W.command(saved,{...body,includeUnpaidGroupIds:['g1']},unpaid,config,now).batch.plans[0].paid,false);
 assert.throws(()=>W.command(saved,body,groups,config,now+300001),/접수 내역/);
 assert.throws(()=>W.command(saved,body,groups,{...config,archived:true},now),/운영 회차/);
 assert.throws(()=>W.command(saved,{...body,groupIds:['g1','g2']},[groups[0],{...groups[1],schedule:{...groups[1].schedule,dropoffDate:'2026-11-26'}}],config,now),/같은 맡김일/);
});
test('only exact, unique paid receipts confirm booking; unpaid, mismatch, duplicate and cancellation do not',()=>{
 const records=[receipt(groups[0]),receipt(groups[1],{status:'pending_payment'}),receipt(groups[2],{quantity:2}),receipt(groups[3]),receipt(groups[3],{id:'duplicate'}),receipt(groups[4],{status:'cancelled'})];
 const checks=W.reconcile(groups,'origin',snapshot(records),now);assert.deepEqual(checks.slice(0,6).map(c=>c.status),['confirmed','payment_pending','conflict','conflict','missing','missing']);
 const saved=W.command(initial(),{action:'reconcile',snapshot:snapshot(records)},groups,config,now).next;
 for(const id of ['g1','g2','g3','g4'])assert.throws(()=>W.command(saved,{action:'prepare-batch',groupIds:[id]},groups,config,now),/대조/);
 assert.throws(()=>W.reconcile(groups,'origin',{...snapshot(records),complete:false},now),/다시 확인/);
});
test('filled form is not a completed booking; readback mismatch cannot advance status',()=>{
 const r=W.command(initial(),{action:'prepare-batch',groupIds:['g1']},groups,config,now);
 const body={action:'record-fill',batchId:r.batch.id,result:{filled:true,stage:'review',groupIds:['g2'],count:1}};
 assert.throws(()=>W.command(r.next,body,groups,config,now),/목록이 다릅니다/);
 const filled=W.command(r.next,{...body,result:{...body.result,groupIds:['g1']}},groups,config,now).next;
 assert.equal(filled.batches[0].status,'review');assert.equal(filled.checks[0].status,'missing');
 const done=W.command(filled,{action:'reconcile',snapshot:snapshot([receipt(groups[0])])},groups,config,now).next;assert.equal(done.batches[0].status,'confirmed');
 const cancelled=W.command(done,{action:'reconcile',snapshot:snapshot([receipt(groups[0],{status:'cancelled'})])},groups,config,now).next;assert.equal(cancelled.batches[0].status,'review');
});

test('partially booked batch resumes only its missing recipients without duplicating paid or pending bookings',()=>{
 const prepared=W.command(initial(),{action:'prepare-batch',groupIds:['g1','g2','g3']},groups,config,now).next;
 const checked=W.command(prepared,{action:'reconcile',snapshot:snapshot([receipt(groups[0]),receipt(groups[1],{status:'pending_payment'})])},groups,config,now).next;
 const resumed=W.command(checked,{action:'prepare-batch',groupIds:['g3']},groups,config,now);
 assert.equal(resumed.batch.plans.length,1);assert.equal(resumed.batch.plans[0].groupId,'g3');assert.equal(resumed.next.batches[0].status,'superseded');
 assert.throws(()=>W.command(checked,{action:'prepare-batch',groupIds:['g3','g4']},groups,config,now),/진행 중/);
});

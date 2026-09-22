'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {CheckoutNotificationService}=require('../checkout-notifications');
const B=require('../broadcast-booking');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const channel={id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'};
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-booking-test-'));
 const repository=new SQLitePlatformRepository({dataDir:dir,startWorker:false});t.after(()=>{repository.close();if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('creo-booking-test-'))throw Error('Unsafe cleanup');fs.rmSync(dir,{recursive:true,force:true});});
 let clock=Date.parse('2026-09-21T09:00:00+09:00');
 const vendors=Array.from({length:10},(_,i)=>({id:'v'+i,name:'가상 업체 '+i,phone:'01012345678'}));
 const notifications=new CheckoutNotificationService({repository,provider:{readiness:()=>({ready:false,missing:['template']}),status:()=>({})},now:()=>clock});
 const options={now:()=>clock,notificationService:notifications,entriesFor:async c=>[{id:c.vendor.id+'-entry',code:'출품 01',status:'submitted'}]};
 const service=B.createBroadcastBooking(repository,options);
 const op={channel,vendors},ctx=i=>({channel,vendor:vendors[i]});
 const command=(type,fields={})=>({type,requestId:randomUUID(),...fields});
 for(let i=0;i<vendors.length;i++)await service.command(op,command('region',{expectedVersion:i,vendorId:vendors[i].id,region:i%8}),{operator:true});
 return {repository,service,options,op,ctx,command,setTime:t=>clock=Date.parse(t)};
}
async function reserve(f,i,date='2026-09-28',quantity=8){return f.service.command(f.ctx(i),f.command('reserve',{date,quantity}));}

test('date window, cutoff, auto-open and unknown region explain unavailability',async t=>{
 const f=await fixture(t),view=await f.service.vendorView(f.ctx(0));
 assert.deepEqual(view.dates.map(d=>d.date),['2026-09-21','2026-09-23','2026-09-28','2026-09-30','2026-10-05']);
 assert.match(view.dates[0].reason,/마감/);assert.equal(view.dates[2].maxQuantityAvailable,8);
 await assert.rejects(f.service.command(f.ctx(0),f.command('reserve',{date:'2026-99-99',quantity:1})),/방송일/);
 await assert.rejects(reserve(f,0,'2026-10-07'),/공개 기간/);
 f.setTime('2026-09-23T00:00:00+09:00');assert.ok((await f.service.vendorView(f.ctx(0))).dates.some(d=>d.date==='2026-10-07'));
 const unknown=await f.service.vendorView({channel,vendor:{id:'unknown',name:'미등록'}});assert.equal(unknown.vendor.region,'');assert.ok(unknown.dates.every(d=>d.maxQuantityAvailable===0));
});
test('region quantity is shared across vendors, adjacent same-region booking is rejected',async t=>{
 const f=await fixture(t);await assert.rejects(reserve(f,0,'2026-09-28',9),/1~8/);await reserve(f,0,'2026-09-28',8);
 assert.equal((await f.service.vendorView(f.ctx(8))).dates.find(d=>d.date==='2026-09-28').maxQuantityAvailable,8);
 await reserve(f,8,'2026-09-28',8);
 assert.equal((await f.service.vendorView({...f.ctx(0),vendor:{...f.ctx(0).vendor,id:'extra',bookingRegion:0}})).dates.find(d=>d.date==='2026-09-28').maxQuantityAvailable,0);
 await assert.rejects(reserve(f,8,'2026-09-30',1),/앞뒤 방송/);
 await reserve(f,0,'2026-10-05',8);
});
test('joint feasibility prevents middle broadcast starvation without a fixed region limit',async t=>{
 const f=await fixture(t);
 for(let i=0;i<4;i++)await reserve(f,i,'2026-09-28',1);
 await reserve(f,4,'2026-10-05',1);await reserve(f,5,'2026-10-05',1);
 await assert.rejects(reserve(f,6,'2026-10-05',1),/모집 여력/);
 const view=await f.service.operatorView(channel,f.op.vendors),session=view.sessions.find(s=>s.date==='2026-09-28');
 assert.equal(session.confirmedQuantity,4);assert.equal(session.shortfall,28);
});
test('duplicate requests persist once and competing reservations never overbook',async t=>{
 const f=await fixture(t),input=f.command('reserve',{date:'2026-09-28',quantity:8});
 const results=await Promise.allSettled([f.service.command(f.ctx(0),input),f.service.command(f.ctx(8),f.command('reserve',{date:'2026-09-28',quantity:8}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const winner=results[0].status==='fulfilled'?0:8;
 if(winner===0){const restarted=B.createBroadcastBooking(f.repository,f.options);assert.equal((await restarted.command(f.ctx(0),input)).duplicate,true);await assert.rejects(restarted.command(f.ctx(0),{...input,quantity:9}),/같은 요청/);}
 assert.equal((await f.repository.listRecords(channel.id,'notification')).length,1);
});
test('same-session proposal holds only the increase; acceptance is idempotent',async t=>{
 const f=await fixture(t),id=(await reserve(f,0,'2026-09-28',4)).result;
 await f.service.command(f.op,f.command('propose',{id,expectedVersion:1,date:'2026-09-28',quantity:8,expiresAt:'2026-09-22T09:00:00+09:00'}),{operator:true});
 let admin=await f.service.operatorView(channel,f.op.vendors),s=admin.sessions.find(s=>s.date==='2026-09-28');assert.equal(s.confirmedQuantity,4);assert.equal(s.heldQuantity,4);assert.equal(s.shortfall,28);
 let r=(await f.service.vendorView(f.ctx(0))).reservations[0];assert.equal(r.quantity,4);
 const accept=f.command('respond',{id,expectedVersion:r.version,proposalId:r.proposal.id,response:'accept'});
 await f.service.command(f.ctx(0),accept);assert.equal((await f.service.command(f.ctx(0),accept)).duplicate,true);
 r=(await f.service.vendorView(f.ctx(0))).reservations[0];assert.equal(r.quantity,8);assert.equal(r.proposal,null);
});
test('reject, expiry and cancellation release holds without moving original booking',async t=>{
 const f=await fixture(t),id=(await reserve(f,0)).result;
 const propose=version=>f.service.command(f.op,f.command('propose',{id,expectedVersion:version,date:'2026-10-05',quantity:8,expiresAt:'2026-09-22T09:00:00+09:00'}),{operator:true});
 await propose(1);let r=(await f.service.vendorView(f.ctx(0))).reservations[0];
 await f.service.command(f.ctx(0),f.command('respond',{id,expectedVersion:r.version,proposalId:r.proposal.id,response:'reject'}));
 await propose(3);r=(await f.service.vendorView(f.ctx(0))).reservations[0];
 f.setTime('2026-09-22T09:00:00+09:00');
 await assert.rejects(f.service.command(f.ctx(0),f.command('respond',{id,expectedVersion:r.version,proposalId:r.proposal.id,response:'accept'})),/만료/);
 r=(await f.service.vendorView(f.ctx(0))).reservations[0];assert.equal(r.date,'2026-09-28');assert.equal(r.proposal,null);
 const s=(await f.service.operatorView(channel,f.op.vendors)).sessions.find(s=>s.date==='2026-10-05');assert.equal(s.heldQuantity,0);
 await f.service.command(f.ctx(0),f.command('cancel',{id,expectedVersion:r.version}));assert.equal((await f.service.vendorView(f.ctx(0))).reservations[0].status,'cancelled');
});
test('strict adjacent holds, foreign ownership and cross-channel access fail closed',async t=>{
 const f=await fixture(t),id=(await reserve(f,0)).result;
 await assert.rejects(f.service.command(f.op,f.command('propose',{id,expectedVersion:1,date:'2026-09-30',quantity:8,expiresAt:'2026-09-22T09:00:00+09:00'}),{operator:true}),/確保|확보/);
 await assert.rejects(f.service.command(f.ctx(1),f.command('cancel',{id,expectedVersion:1})),/찾을 수/);
 await assert.rejects(f.service.vendorView({...f.ctx(0),channel:{...channel,id:'cdcup'}}),/전국크레/);
 assert.deepEqual(await f.service.summary({...f.ctx(0),channel:{...channel,id:'cdcup'}}),{enabled:false,pendingCount:0});
});
test('per-date settings preserve committed and held quantities; stale settings reject',async t=>{
 const f=await fixture(t);for(let i=0;i<5;i++)await reserve(f,i,'2026-09-28',8);
 const admin=await f.service.operatorView(channel,f.op.vendors),s=admin.sessions.find(s=>s.date==='2026-09-28');
 await assert.rejects(f.service.command(f.op,f.command('session',{expectedVersion:admin.version,date:s.date,settings:{...s,maxQuantity:32}}),{operator:true}),/충돌/);
 await f.service.command(f.op,f.command('session',{expectedVersion:admin.version,date:s.date,settings:{...s,maxQuantity:64,closesAt:'2026-09-27T20:00:00+09:00'}}),{operator:true});
 await assert.rejects(f.service.command(f.op,f.command('region',{expectedVersion:admin.version,vendorId:'v0',region:1}),{operator:true}),/설정이 변경/);
 const after=await f.service.vendorView(f.ctx(4));assert.equal(after.dates.find(d=>d.date===s.date).closesAt,'2026-09-27T20:00:00+09:00');
});
test('notification preparation/storage failure cannot leave a half-booked reservation',async t=>{
 const f=await fixture(t),bad=B.createBroadcastBooking(f.repository,{...f.options,notificationService:{prepare:async()=>{throw Error('isolated failure')}}});
 await assert.rejects(bad.command(f.ctx(0),f.command('reserve',{date:'2026-09-28',quantity:8})),/isolated failure/);
 assert.equal((await f.service.vendorView(f.ctx(0))).reservations.length,0);
 const before=f.repository.db.prepare('SELECT count(*) AS n FROM platform_kv').get().n;
 f.repository.db.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON platform_kv WHEN NEW.key LIKE '%::notification::%' BEGIN SELECT RAISE(ABORT,'isolated notification failure'); END");
 await assert.rejects(reserve(f,0),/isolated notification/);
 assert.equal((await f.service.vendorView(f.ctx(0))).reservations.length,0);assert.equal(f.repository.db.prepare('SELECT count(*) AS n FROM platform_kv').get().n,before);
});
test('entry ownership, quantity, duplicate allocation and deadline are validated',async t=>{
 const f=await fixture(t),id=(await reserve(f,0)).result;
 await assert.rejects(f.service.command(f.ctx(0),f.command('entries',{id,expectedVersion:1,entryIds:['v1-entry']})),/출품 개체/);
 await f.service.command(f.ctx(0),f.command('entries',{id,expectedVersion:1,entryIds:['v0-entry']}));
 const id2=(await reserve(f,0,'2026-10-05')).result;
 await assert.rejects(f.service.command(f.ctx(0),f.command('entries',{id:id2,expectedVersion:1,entryIds:['v0-entry']})),/다른 방송/);
 f.setTime('2026-09-27T20:00:00+09:00');await assert.rejects(f.service.command(f.ctx(0),f.command('entries',{id,expectedVersion:2,entryIds:[]})),/기한/);
});
test('old notification versions are suppressed and booking links remain scoped',async t=>{
 const f=await fixture(t),id=(await reserve(f,0)).result;
 let notices=await f.repository.listRecords(channel.id,'notification');await f.service.assertNotification(channel,notices[0]);
 await f.service.command(f.ctx(0),f.command('change',{id,expectedVersion:1,date:'2026-09-28',quantity:7}));
 await assert.rejects(f.service.assertNotification(channel,notices[0]),e=>e.code==='BUYER_LINK_INACTIVE');
 const raw=(await f.service.read(channel)).state,r=raw.reservations[0];assert.deepEqual(await f.service.resolveLink(channel,r.linkCode),{vendorId:'v0',reservationId:id});
 assert.equal(await f.service.resolveLink(channel,'wrong'),null);assert.equal('linkCode' in (await f.service.vendorView(f.ctx(0))).reservations[0],false);
});

test('independent SQLite connections serialize overlapping broadcasts and survive reopening',async t=>{
 const f=await fixture(t),otherRepo=new SQLitePlatformRepository({dbPath:f.repository.dbPath,startWorker:false});
 const other=B.createBroadcastBooking(otherRepo,{...f.options,notificationService:new CheckoutNotificationService({repository:otherRepo,provider:{readiness:()=>({ready:false,missing:['template']})}})});
 try{
  const input=f.command('reserve',{date:'2026-09-28',quantity:8});
  const results=await Promise.allSettled([f.service.command(f.ctx(0),input),other.command(f.ctx(8),f.command('reserve',{date:'2026-09-30',quantity:8}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const state=(await other.read(channel)).state;assert.equal(state.reservations.length,1);assert.equal((await otherRepo.listRecords(channel.id,'notification')).length,1);
 }finally{otherRepo.close();}
 const reopened=new SQLitePlatformRepository({dbPath:f.repository.dbPath,startWorker:false});
 try{assert.equal((await B.createBroadcastBooking(reopened,f.options).read(channel)).state.reservations.length,1);}finally{reopened.close();}
});
test('acceptance versus cancellation race has exactly one durable outcome',async t=>{
 const f=await fixture(t),id=(await reserve(f,0)).result;
 await f.service.command(f.op,f.command('propose',{id,expectedVersion:1,date:'2026-10-05',quantity:8,expiresAt:'2026-09-22T09:00:00+09:00'}),{operator:true});
 const r=(await f.service.vendorView(f.ctx(0))).reservations[0];
 const results=await Promise.allSettled([f.service.command(f.ctx(0),f.command('respond',{id,expectedVersion:2,proposalId:r.proposal.id,response:'accept'})),f.service.command(f.ctx(0),f.command('cancel',{id,expectedVersion:2}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const after=(await f.service.vendorView(f.ctx(0))).reservations[0];assert.equal(after.version,3);assert.equal(after.proposal,null);
 assert.ok(after.status==='cancelled'||after.date==='2026-10-05');
});
test('past participation, cutoff, archived channel and inactive vendor remain authoritative',async t=>{
 const f=await fixture(t),id=(await reserve(f,0)).result;
 f.setTime('2026-09-28T20:01:00+09:00');
 const date=(await f.service.vendorView(f.ctx(8))).dates.find(d=>d.date==='2026-09-30');assert.equal(date.maxQuantityAvailable,0);
 await assert.rejects(f.service.command(f.ctx(0),f.command('cancel',{id,expectedVersion:1})),/종료/);
 const past=(await f.service.operatorView(channel,f.op.vendors)).sessions.find(s=>s.date==='2026-09-28');
 assert.equal(past.reservations[0].id,id);assert.equal(past.reservations[0].history[0].action,'예약 확정');
 await assert.rejects(f.service.command({...f.ctx(0),channel:{...channel,status:'archived'}},f.command('reserve',{date:'2026-10-05',quantity:1})),/현재 예약/);
 await assert.rejects(f.service.command({...f.ctx(0),vendor:{...f.ctx(0).vendor,active:false}},f.command('reserve',{date:'2026-10-05',quantity:1})),/참여가 중지/);
});
test('missing remote origin and unsupported storage fail closed; defaults retain existing dates',async t=>{
 const f=await fixture(t),before=await f.service.operatorView(channel,f.op.vendors),date=before.sessions[0];
 await f.service.command(f.op,f.command('defaults',{expectedVersion:before.version,defaults:{...before.defaults,maxQuantity:48,closeHours:24}}),{operator:true});
 const after=await f.service.operatorView(channel,f.op.vendors);assert.equal(after.sessions[0].maxQuantity,date.maxQuantity);assert.equal(after.sessions[0].closesAt,date.closesAt);
 const failed=B.createBroadcastBooking({getRowsByKeys:async()=>[],mirror:{},lastMirrorError:'offline'});
 await assert.rejects(failed.read(channel),/예약 원본/);
 const unsupported=B.createBroadcastBooking({});await assert.rejects(unsupported.command(f.ctx(0),f.command('reserve',{})),/저장소 설정/);
});

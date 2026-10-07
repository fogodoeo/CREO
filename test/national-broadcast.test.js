'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs'),{createVendorEntries}=require('../vendor-entries'),{REGIONS,regionAt,regionIndex,regionForVendor}=require('../national-broadcast');
async function fixture(t,name='서울 테스트',region='서울'){
 const f=await createFixture();t.after(f.close);f.advance(9*86400000);
 const admin={'x-creo-admin':f.secret};
 let r=await f.call(f.client(),'PUT','/api/platform/channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'},admin);assert.equal(r.status,200,r.body);
 const client=await f.login('01000000001'),registered=await f.post(client,'register',{name,region,phone:'01000000001'}),vendorId=registered.json().id;
 const vendor=await f.repository.getRecord('national-cre','vendor',vendorId);await f.repository.upsertRecord('national-cre','vendor',{...vendor,bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'});
 const token=(await f.post(client,'select',{id:vendorId})).json().token;
 const get=()=>f.call(client,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({token,event:'national-cre'}));
 const command=(body)=>f.call(client,'POST','/api/platform/vendor-bookings',{requestId:randomUUID(),...body,token,event:'national-cre'});
 const view=(await get()).json();assert.equal(view.mode,'regional-cycle-v1');
 return {...f,admin,client,vendorId,token,get,command,view};
}
test('five-region rotation has a fixed first broadcast and covers month/year boundaries',()=>{
 assert.deepEqual(REGIONS,['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남']);
 assert.equal(regionAt('2026-10-12'),null);assert.equal(regionAt('2026-10-14'),0);assert.equal(regionAt('2026-10-19'),1);assert.equal(regionAt('2026-10-26'),3);assert.equal(regionAt('2026-11-02'),0);assert.equal(regionAt('2026-02-30'),null);
 assert.equal(regionAt('2027-01-04'),3);assert.equal(regionAt('9999-12-29'),4);
});
test('every region always allows four entries regardless of company count or region overrides',()=>{
 const {regionEntryPolicy}=require('../national-broadcast');
 for(let region=0;region<5;region++){
  const vendors=Array.from({length:8},(_,i)=>({id:'v'+i,broadcastRegion:REGIONS[region],phone:'01000000001'}));
  const policy=list=>regionEntryPolicy({regions:{}},region,list);
  for(const count of [0,1,3,8,9,12])assert.equal(policy(Array.from({length:count},(_,i)=>({id:'count-'+i,broadcastRegion:REGIONS[region]}))).vendorEntryLimit,4);
  assert.deepEqual(policy(vendors),{regionVendorCount:8,vendorEntryLimit:4});
  assert.equal(policy([...vendors,vendors[0],{id:'inactive',active:false,broadcastRegion:REGIONS[region]},{id:'deleted',deletedAt:'2026-10-01',broadcastRegion:REGIONS[region]},{id:'unknown'},{id:'other',broadcastRegion:REGIONS[(region+1)%5]}]).vendorEntryLimit,4);
  const ninth={id:'ninth',broadcastRegion:REGIONS[(region+1)%5]};
  assert.deepEqual(regionEntryPolicy({regions:{ninth:region}},region,[...vendors,ninth]),{regionVendorCount:9,vendorEntryLimit:4});
  assert.equal(policy([...vendors,{...ninth,broadcastRegion:REGIONS[region]}]).vendorEntryLimit,4);
 }
});
async function addRegionalCompanies(f,count){
 for(let i=1;i<=count;i++){
  const result=await f.call(f.client,'POST','/api/platform/national-vendor-directory',{id:'regional-extra-'+i,name:'권역 테스트 '+i,region:'서울·인천',loginPhone:'0101000'+String(i).padStart(4,'0'),revision:0},f.admin);
  assert.equal(result.status,200,result.body);
 }
}
test('nine preregistered teams cap new reservations at four, with durable concurrent retry and isolated regions',async t=>{
 const f=await fixture(t);await addRegionalCompanies(f,8);
 const view=(await f.get()).json(),date=view.dates[0];
 assert.equal(date.regionVendorCount,9);assert.equal(date.vendorEntryLimit,4);assert.equal(date.maxQuantityAvailable,4);
 assert.equal(view.dates.find(d=>d.region===1).vendorEntryLimit,4);
 assert.equal((await f.command({type:'reserve',date:date.date,quantity:5})).status,422);
 const body={type:'reserve',date:date.date,quantity:4,requestId:randomUUID()},replies=await Promise.all([f.command(body),f.command(body)]);
 assert.ok(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>r.json().duplicate).length,1);
 const r=replies[0].json().reservations[0];assert.equal(r.entryLimit,4);assert.equal(r.entryIds.length,4);
 f.restart();assert.equal((await f.command(body)).json().duplicate,true);assert.equal((await f.get()).json().dates[0].vendorEntryLimit,4);
 const notices=await f.repository.listRecords('national-cre','notification');assert.equal(notices.filter(n=>n.templateKey==='broadcast_booking_updated').length,1);
 const operator=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',null,f.admin)).json();assert.equal(operator.sessions[0].regionVendorCount,9);assert.equal(operator.sessions[0].vendorEntryLimit,4);
});
async function legacyFiveBooking(f,fifthStatus){
 const reserved=await f.command({type:'reserve',date:'2026-10-14',quantity:4});assert.equal(reserved.status,200,reserved.body);
 const state=await f.repository.getRecord('national-cre','setting','national-broadcasts'),r=state.reservations[0];r.quantity=5;r.entryIds.push(randomUUID());
 await f.repository.upsertRecord('national-cre','setting',{...state,id:'national-broadcasts'});
 if(fifthStatus){
  const view=(await f.get()).json(),channel=require('../platform-core').normalizeChannel({id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'});
  const context={profile:{id:view.entryState.ownerId,members:[{channelId:channel.id,vendorId:f.vendorId}]},channel,vendor:await f.repository.getRecord('national-cre','vendor',f.vendorId),catalog:{channels:[channel]},nationalBroadcast:{id:r.id,date:r.date,slot:4,today:'2026-10-02'}};
  await createVendorEntries(f.repository).command(context,{type:fifthStatus==='submitted'?'submit':'save',entry:{id:r.entryIds[4],sex:'male',weight:'8',hatchDate:'2026-09-01',note:'보관할 다섯 번째'},expectedVersion:0,requestId:randomUUID()});
 }
 return (await f.get()).json().reservations[0];
}
test('even one team limits existing five-slot bookings without deleting saved data or partially saving stale batches',async t=>{
 const f=await fixture(t),r=await legacyFiveBooking(f,'draft');
 const fifth={type:'save-entry',id:r.id,slot:4,expectedVersion:0,entry:{sex:'male',weight:'8',hatchDate:'2026-09-01',note:'보관할 다섯 번째'}};
 let current=(await f.get()).json().reservations[0];assert.equal(current.entryLimit,4);assert.equal(current.entries[4].note,fifth.entry.note);
 assert.equal((await f.command({...fifth,expectedVersion:1,submit:true})).status,409);
 const rows=[0,1,2,3,4].map(slot=>({slot,expectedVersion:slot===4?1:0,entry:{sex:'unknown',weight:'5',hatchDate:'2026-09-01'}}));
 assert.equal((await f.command({type:'save-entries',id:r.id,submit:true,entries:rows})).status,409);
 current=(await f.get()).json().reservations[0];assert.ok(current.entries.slice(0,4).every(e=>e===null));assert.equal(current.entries[4].version,1);
 const submitted=await f.command({type:'save-entries',id:r.id,submit:true,entries:rows.slice(0,4)});assert.equal(submitted.status,200,submitted.body);assert.equal(submitted.json().reservations[0].registrationComplete,true);
 f.restart();current=(await f.get()).json().reservations[0];assert.equal(current.completed,4);assert.equal(current.entries[4].note,fifth.entry.note);
});
test('an existing fifth submission remains visible for withdrawal and historical broadcasts keep their original limit',async t=>{
 const f=await fixture(t),r=await legacyFiveBooking(f,'submitted');
 const rows=[0,1,2,3].map(slot=>({slot,expectedVersion:0,entry:{sex:'unknown',weight:'5',hatchDate:'2026-09-01'}}));
 assert.equal((await f.command({type:'save-entries',id:r.id,submit:true,entries:rows})).status,200);
 let current=(await f.get()).json().reservations[0];assert.equal(current.completed,5);assert.equal(current.excessSubmitted,1);assert.equal(current.registrationComplete,false);
 const withdrawn=await f.command({type:'reopen-entry',id:r.id,slot:4,expectedVersion:current.entries[4].version});assert.equal(withdrawn.status,200,withdrawn.body);
 current=withdrawn.json().reservations[0];assert.equal(current.completed,4);assert.equal(current.excessSubmitted,0);assert.equal(current.registrationComplete,true);assert.equal(current.entries[4].status,'draft');
 f.advance(13*86400000);f.restart();current=(await f.get()).json().reservations[0];assert.equal(current.entryLimit,5);assert.equal(current.entries.length,5);
});
test('Seoul and Incheon aliases share the first cycle region while explicit Gyeonggi stays separate',()=>{
 for(const name of ['서울','인천','서울+인천','서울·인천']){assert.equal(regionIndex(name),0);assert.equal(regionForVendor({broadcastRegion:name}),0);}
 assert.equal(regionForVendor({bookingRegion:1}),0);
 assert.equal(regionForVendor({broadcastRegion:'경기',bookingRegion:1}),1);
 assert.deepEqual([0,1,2,3,4,5,6,7].map(bookingRegion=>regionForVendor({bookingRegion})),[0,0,1,1,2,2,3,4]);
 assert.equal(regionIndex('알 수 없음'),-1);assert.equal(regionForVendor({}),null);
});
test('a legacy Incheon vendor gets Seoul-Incheon eligibility and canonical company details after restart',async t=>{
 const f=await fixture(t,'인천 테스트','인천'),vendor=await f.repository.getRecord('national-cre','vendor',f.vendorId);
 await f.repository.upsertRecord('national-cre','vendor',{...vendor,broadcastRegion:'인천',bookingRegion:1});
 for(let pass=0;pass<2;pass++){
  if(pass)f.restart();
  const view=(await f.get()).json();assert.equal(view.vendor.region,'서울·인천');
  assert.equal(view.dates.find(d=>d.date==='2026-10-14').maxQuantityAvailable,4);
  assert.equal(view.dates.find(d=>d.date==='2026-10-19').maxQuantityAvailable,0);
  assert.equal((await f.refresh(f.client)).json().companies.find(c=>c.id===f.vendorId).region,'서울·인천');
  assert.equal((await f.post(f.client,'profile',{companyId:f.vendorId})).json().region,'서울·인천');
 }
});
test('moving a cancelled Gyeonggi booking back to Seoul-Incheon creates one active four-slot booking',async t=>{
 const f=await fixture(t,'이동 테스트','서울·인천'),route='/api/platform/channels/national-cre/broadcast-bookings';f.advance(3*86400000);
 const read=async()=>(await f.call(f.client,'GET',route,null,f.admin)).json();
 const write=body=>f.call(f.client,'POST',route,{requestId:randomUUID(),...body},f.admin);
 const first=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json().reservations[0];
 assert.equal((await write({type:'cancel',id:first.id,expectedVersion:first.version})).status,200);
 assert.equal((await write({type:'region',vendorId:f.vendorId,region:1,expectedVersion:(await read()).version})).status,200);
 const second=(await f.command({type:'reserve',date:'2026-10-19',quantity:4})).json().reservations.find(r=>r.status==='confirmed');
 assert.equal((await write({type:'cancel',id:second.id,expectedVersion:second.version})).status,200);
 assert.equal((await write({type:'region',vendorId:f.vendorId,region:0,expectedVersion:(await read()).version})).status,200);
 const body={type:'reserve',date:'2026-10-14',quantity:4,requestId:randomUUID()};
 assert.equal((await f.command(body)).status,200);f.restart();assert.equal((await f.command(body)).json().duplicate,true);
 const view=(await f.get()).json(),active=view.reservations.filter(r=>r.status==='confirmed');
 assert.equal(view.vendor.region,'서울·인천');assert.deepEqual(active.map(r=>[r.date,r.quantity]),[['2026-10-14',4]]);
 assert.equal(new Set(active[0].entryIds).size,4);assert.equal(view.reservations.filter(r=>r.status==='cancelled').length,2);
 assert.equal((await f.post(f.client,'profile',{companyId:f.vendorId})).json().region,'서울·인천');
});
test('operator region correction is consistent in booking, company selection and profile after restart',async t=>{
 const f=await fixture(t,'권역 변경 테스트'),route='/api/platform/channels/national-cre/broadcast-bookings';
 f.advance(3*86400000);
 const adminRead=async()=>(await f.call(f.client,'GET',route,null,f.admin)).json();
 const adminWrite=body=>f.call(f.client,'POST',route,{requestId:randomUUID(),...body},f.admin);
 const reserved=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json().reservations[0];
 assert.equal((await adminWrite({type:'region',vendorId:f.vendorId,region:1,expectedVersion:(await adminRead()).version})).status,409);
 assert.equal((await adminWrite({type:'cancel',id:reserved.id,expectedVersion:reserved.version})).status,200);
 assert.equal((await adminWrite({type:'region',vendorId:f.vendorId,region:1,expectedVersion:(await adminRead()).version})).status,200);
 const moved=await f.command({type:'reserve',date:'2026-10-19',quantity:4});assert.equal(moved.status,200,moved.body);
 for(let pass=0;pass<2;pass++){
  if(pass)f.restart();
  const view=(await f.get()).json();assert.equal(view.vendor.region,'경기');
  assert.deepEqual(view.reservations.filter(r=>r.status==='confirmed').map(r=>[r.date,r.quantity]),[['2026-10-19',4]]);
  assert.equal((await f.refresh(f.client)).json().companies.find(c=>c.id===f.vendorId).region,'경기');
  assert.equal((await f.post(f.client,'profile',{companyId:f.vendorId})).json().region,'경기');
  const directory=(await f.call(f.client,'GET','/api/platform/national-vendor-directory',null,f.admin)).json();
  assert.equal(directory.companies.find(c=>c.id===f.vendorId).region,'경기');
 }
 const other=await f.login('01000000002');
 assert.equal((await f.post(other,'register',{name:'권역 변경 테스트',region:'경기',phone:'01000000002'})).status,409);
 const originalRegion=await f.post(other,'register',{name:'권역 변경 테스트',region:'서울',phone:'01000000002'});
 assert.equal(originalRegion.status,200,originalRegion.body);
});
test('vendor location is scoped to the authorized vendor and viewing recommendations has no durable effect',async t=>{
 const f=await fixture(t,'다이노마켓'),directory=require('../vendor-directory').createVendorDirectory(f.repository),vendor=await directory.find('national-cre',f.vendorId),address='서울특별시 송파구 거마로9길 18-8';
 await directory.update('national-cre',{...vendor,address},vendor.directoryRevision);
 const initial=(await f.get()).json();
 assert.equal(initial.vendor.locality.city,'서울');assert.equal(initial.vendor.locality.district,'송파구');
 assert.equal(initial.vendor.address,undefined);assert.equal(initial.vendor.phone,undefined);
 const beforeNotifications=(await f.repository.listRecords('national-cre','notification')).length;
 const Origin=require('../public/broadcast-origin-core'),data=require('../public/broadcast-inbound-data.json');
 assert.equal(initial.vendor.name,'다이노마켓');assert.equal(Origin.options(data,'dodosi',initial.vendor).own.area,'서울[송파]');
 for(let i=0;i<2;i++){const view=(await f.get()).json();assert.equal(view.version,initial.version);assert.deepEqual(view.vendor.inboundOrigins,{});assert.deepEqual(view.reservations,initial.reservations);}
 assert.equal((await f.repository.listRecords('national-cre','notification')).length,beforeNotifications);
 f.restart();const reloaded=(await f.get()).json();assert.deepEqual(reloaded.vendor.locality,initial.vendor.locality);assert.equal(Origin.options(data,'dodosi',reloaded.vendor).selected,Origin.options(data,'dodosi',initial.vendor).selected);
});
test('reserve creates exactly four durable slots, duplicates and restart do not add slots or notifications',async t=>{
 const f=await fixture(t),requestId=randomUUID(),body={type:'reserve',date:'2026-10-14',quantity:4,requestId};
 assert.equal(f.view.dates[0].maxQuantity,null);
 for(const quantity of [0,1,3,5,6,8,4.5,'4'])assert.equal((await f.command({...body,requestId:randomUUID(),quantity})).status,422);
 assert.equal((await f.command({...body,date:'2026-10-19'})).status,409);
 const first=await f.command(body);assert.equal(first.status,200,first.body);const slots=first.json().reservations[0].entryIds;assert.equal(new Set(slots).size,4);
 const adminView=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();assert.equal(adminView.sessions[0].reservations[0].completed,0);
 f.restart();const again=await f.command(body);assert.equal(again.status,200,again.body);assert.equal(again.json().duplicate,true);assert.deepEqual(again.json().reservations[0].entryIds,slots);
 assert.equal((await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='broadcast_booking_updated').length,1);
});
test('regional cycle has no minimum total or default session cap; an optional cap can be cleared',async t=>{
 const f=await fixture(t),{createNationalBroadcast}=require('../national-broadcast'),channel={id:'national-cre',name:'전국크레자랑',dataAdapter:'platform',status:'active'};
 const {state}=await createNationalBroadcast(f.repository).read(channel);
 state.reservations=Array.from({length:26},(_,i)=>({id:randomUUID(),vendorId:'isolated-'+i,vendorName:'가상 업체',region:0,date:'2026-10-14',quantity:5,status:'confirmed',version:1,entryIds:Array.from({length:5},randomUUID)}));
 await f.repository.upsertRecord('national-cre','setting',{...state,id:'national-broadcasts'});
 const reserved=await f.command({type:'reserve',date:'2026-10-14',quantity:4});assert.equal(reserved.status,200,reserved.body);
 const adminView=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();assert.equal(adminView.sessions[0].confirmedQuantity,108);assert.equal(adminView.sessions[0].shortfall,0);
 const session=adminView.sessions[1];
 const change=async(maxQuantity,version)=>f.call(f.client,'POST','/api/platform/channels/national-cre/broadcast-bookings',{type:'session',date:session.date,expectedVersion:version,settings:{...session,maxQuantity},requestId:randomUUID()},f.admin);
 const limited=await change(5,adminView.version);assert.equal(limited.status,200,limited.body);
 const unlimited=await change(null,limited.json().version);assert.equal(unlimited.status,200,unlimited.body);assert.equal(unlimited.json().sessions[1].maxQuantity,null);
});
test('entry and parent photos enter the existing approval queue; approval creates the ordinary auction item',async t=>{
 const f=await fixture(t),reserved=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json(),r=reserved.reservations[0],ownerId=reserved.entryState.ownerId;
 const profile={id:ownerId,members:[{channelId:'national-cre',vendorId:f.vendorId}]},channel=require('../platform-core').normalizeChannel({id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'});
 const context={profile,channel,vendor:{id:f.vendorId},catalog:{channels:[channel]}},service=createVendorEntries(f.repository),photoId=randomUUID();
 await service.addMedia(context,{id:photoId,url:'/assets/father.webp',thumbnailUrl:'/assets/thumb.webp',size:100,thumbnailSize:50});
 const requestId=randomUUID(),body={type:'save-entry',id:r.id,slot:0,expectedVersion:0,submit:true,entry:{sex:'female',weight:'12.5',hatchDate:'2026-09-01',note:'자유 정보'},parents:{sire:{photoId}},requestId};
 const saved=await f.command(body);assert.equal(saved.status,200,saved.body);const e=saved.json().reservations[0].entries[0];assert.equal(e.status,'submitted');assert.equal(e.broadcastDate,'2026-10-14');
 assert.equal((await f.command(body)).json().duplicate,true);
 const queue=await f.call(f.client,'GET','/api/platform/channels/national-cre/entries',undefined,f.admin);assert.equal(queue.status,200,queue.body);assert.equal(queue.json().groups[0].entries[0].id,e.id);
 const review=await f.call(f.client,'POST','/api/platform/channels/national-cre/entries/review',{type:'approve',requestId:randomUUID(),vendorId:f.vendorId,id:e.id,expectedVersion:e.version,lot:'A01',order:1,startPrice:0},f.admin);assert.equal(review.status,200,review.body);
 const items=await f.repository.listRecords('national-cre','item');assert.equal(items.length,1);assert.equal(items[0].attributes.parents[0].media[0].url,'/assets/father.webp');
 assert.equal((await f.command({...body,requestId:randomUUID(),expectedVersion:e.version+1})).status,409);
 const direct=await f.call(f.client,'POST','/api/platform/vendor-entries',{type:'save',entry:{id:randomUUID()},requestId:randomUUID(),token:f.token,event:'national-cre'});assert.equal(direct.status,409);
});
test('concurrent edits, invalid parents, deadlines and failed persistence fail without partial submission',async t=>{
 const f=await fixture(t),r=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json().reservations[0];
 const incomplete=await f.command({type:'save-entry',id:r.id,slot:1,expectedVersion:0,entry:{weight:'3.2'}});assert.equal(incomplete.status,200,incomplete.body);assert.equal(incomplete.json().reservations[0].entries[1].sex,'');assert.equal(incomplete.json().reservations[0].entries[1].code,'개체 2');
 const missingSex=await f.command({type:'save-entry',id:r.id,slot:1,expectedVersion:1,submit:true,entry:{weight:'3.2',hatchDate:'2026-09-01'}});assert.equal(missingSex.status,422);
 const base={type:'save-entry',id:r.id,slot:0,expectedVersion:0,submit:false,entry:{sex:'unknown',weight:'4.2',hatchDate:'2026-09-01'}};
 const results=await Promise.all([f.command(base),f.command({...base,entry:{...base.entry,weight:'5'}})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const current=(await f.get()).json().reservations[0].entries[0];
 const invalid=await f.command({...base,submit:true,expectedVersion:current.version,parents:{dam:{photoId:randomUUID()}}});assert.equal(invalid.status,422);assert.equal((await f.get()).json().reservations[0].entries[0].version,current.version);
 const future=await f.command({...base,submit:true,expectedVersion:current.version,entry:{...base.entry,hatchDate:'2027-01-01'}});assert.equal(future.status,422);
 const upsert=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.startsWith('vendor_entries_v1::')))throw Error('isolated failure');return upsert(rows)};
 assert.equal((await f.command({...base,submit:true,expectedVersion:current.version})).status,500);f.repository.upsertRows=upsert;
 assert.equal((await f.get()).json().reservations[0].entries[0].status,'draft');
 f.advance(12*86400000);assert.equal((await f.command({...base,expectedVersion:current.version})).status,409);
});
test('capacity is atomic across vendors; reserved slots are private and pickup survives restart',async t=>{
 const f=await fixture(t),initial=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();
 const settings={...initial.sessions[0],maxQuantity:28};
 const configured=await f.call(f.client,'POST','/api/platform/channels/national-cre/broadcast-bookings',{type:'session',date:'2026-10-14',settings,expectedVersion:initial.version,requestId:randomUUID()},f.admin);assert.equal(configured.status,200,configured.body);
 const access=[{client:f.client,token:f.token}];
 for(let i=2;i<=8;i++){const number='0100000000'+i,c=await f.login(number),v=(await f.post(c,'register',{name:'격리 업체 '+i,region:'서울',phone:number})).json();access.push({client:c,token:(await f.post(c,'select',{id:v.id})).json().token})}
 const responses=await Promise.all(access.map(a=>f.call(a.client,'POST','/api/platform/vendor-bookings',{type:'reserve',date:'2026-10-14',quantity:4,requestId:randomUUID(),token:a.token,event:'national-cre'})));
 assert.equal(responses.filter(r=>r.status===200).length,7);assert.equal(responses.filter(r=>r.status===409).length,1);
 const mine=(await f.get()).json().reservations[0],other=access[1];
 const cross=await f.call(other.client,'POST','/api/platform/vendor-bookings',{type:'save-entry',id:mine.id,slot:0,expectedVersion:0,entry:{},token:other.token,event:'national-cre',requestId:randomUUID()});assert.equal(cross.status,403);
 assert.equal((await f.command({type:'save-entry',id:mine.id,slot:5,expectedVersion:0,entry:{}})).status,403);
 const marked=await f.command({type:'pickup',id:mine.id,expectedVersion:mine.version,pickup:true});assert.equal(marked.status,200,marked.body);
 f.restart();assert.equal((await f.get()).json().reservations[0].pickup,true);
 const view=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();assert.equal(view.sessions[0].confirmedQuantity,28);assert.equal(view.sessions[0].regions[0].available,0);
});

test('four entries submit together, preserve the fifth slot and retry without duplicate entries',async t=>{
 const f=await fixture(t),r=await legacyFiveBooking(f);
 const body={type:'save-entries',id:r.id,requestId:randomUUID(),submit:true,entries:Array.from({length:4},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'female',weight:String(slot+5),hatchDate:'2026-09-01',note:'일괄 '+slot}}))};
 const response=await f.command(body);assert.equal(response.status,200,response.body);
 assert.equal(response.json().reservations[0].completed,4);assert.equal(response.json().reservations[0].entries[4],null);
 assert.equal(response.json().reservations[0].registrationComplete,true);assert.equal(response.json().pendingCount,0);
 const admin=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',null,f.admin)).json().sessions[0].reservations[0];
 assert.equal(admin.completed,4);assert.equal(admin.registrationComplete,true);
 const ids=response.json().reservations[0].entries.slice(0,4).map(e=>e.id);assert.deepEqual(ids,r.entryIds.slice(0,4));
 f.advance(86400000);f.restart();const duplicate=await f.command(body);assert.equal(duplicate.status,200,duplicate.body);assert.equal(duplicate.json().duplicate,true);
 assert.equal(duplicate.json().reservations[0].registrationComplete,true);assert.equal(duplicate.json().pendingCount,0);
 assert.equal((await f.command({...body,entries:body.entries.slice(0,3)})).status,409);
 const last=await f.command({...body,requestId:randomUUID(),entries:[{...body.entries[0],slot:4}]});assert.equal(last.status,409,last.body);
 assert.equal((await f.get()).json().reservations[0].registrationComplete,true);
});

test('four-place reservations fit the remaining capacity, survive retry, and cannot submit a fifth slot',async t=>{
 const f=await fixture(t),route='/api/platform/channels/national-cre/broadcast-bookings';
 const initial=(await f.call(f.client,'GET',route,null,f.admin)).json();
 assert.equal((await f.call(f.client,'POST',route,{type:'session',date:'2026-10-14',settings:{...initial.sessions[0],maxQuantity:9},expectedVersion:initial.version,requestId:randomUUID()},f.admin)).status,200);
 const first=await f.command({type:'reserve',date:'2026-10-14',quantity:4});assert.equal(first.status,200,first.body);
 const other=await f.login('01000000002'),company=(await f.post(other,'register',{name:'네 마리 업체',region:'서울',phone:'01000000002'})).json();
 const token=(await f.post(other,'select',{id:company.id})).json().token;
 const command=body=>f.call(other,'POST','/api/platform/vendor-bookings',{event:'national-cre',token,requestId:randomUUID(),...body});
 const view=(await f.call(other,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({event:'national-cre',token}))).json();assert.equal(view.dates[0].maxQuantityAvailable,4);
 assert.equal((await command({type:'reserve',date:'2026-10-14',quantity:5})).status,422);
 const body={type:'reserve',date:'2026-10-14',quantity:4,requestId:randomUUID()},responses=await Promise.all([command(body),command(body)]);
 assert.ok(responses.every(r=>r.status===200));assert.equal(responses.filter(r=>r.json().duplicate).length,1);
 const r=responses[0].json().reservations[0];assert.equal(r.quantity,4);assert.equal(r.entryIds.length,4);
 assert.equal((await command({type:'save-entry',id:r.id,slot:4,expectedVersion:0,entry:{}})).status,403);
 assert.equal((await command({type:'save-entries',id:r.id,entries:[{slot:4,expectedVersion:0,entry:{}}]})).status,422);
 f.restart();assert.equal((await command(body)).json().duplicate,true);
 const current=(await f.call(f.client,'GET',route,null,f.admin)).json();assert.equal(current.sessions[0].confirmedQuantity,8);assert.equal(current.sessions[0].regions[0].available,0);
 assert.equal((await f.call(f.client,'POST',route,{type:'session',date:'2026-10-14',settings:{...current.sessions[0],maxQuantity:7},expectedVersion:current.version,requestId:randomUUID()},f.admin)).status,422);
});

test('three submissions remain incomplete and the fourth completes an existing five-slot reservation',async t=>{
 const f=await fixture(t),r=await legacyFiveBooking(f);
 const entry={sex:'unknown',weight:'5',hatchDate:'2026-09-01'};
 const first=await f.command({type:'save-entries',id:r.id,submit:true,entries:[0,1,2].map(slot=>({slot,expectedVersion:0,entry}))});
 assert.equal(first.status,200,first.body);assert.equal(first.json().reservations[0].registrationComplete,false);assert.equal(first.json().pendingCount,1);
 const fourth=await f.command({type:'save-entry',id:r.id,slot:3,submit:true,expectedVersion:0,entry});
 assert.equal(fourth.status,200,fourth.body);assert.equal(fourth.json().reservations[0].registrationComplete,true);assert.equal(fourth.json().pendingCount,0);
 const current=fourth.json().reservations[0],pickup=await f.command({type:'pickup',id:r.id,expectedVersion:current.version,pickup:true});assert.equal(pickup.status,200,pickup.body);
 f.restart();const reloaded=(await f.get()).json().reservations[0];assert.equal(reloaded.registrationComplete,true);assert.equal(reloaded.pickup,true);
});

test('batch validation and storage failure leave every entry unchanged; retry is durable',async t=>{
 const f=await fixture(t),view=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json(),r=view.reservations[0];
 const body={type:'save-entries',id:r.id,requestId:randomUUID(),submit:true,entries:Array.from({length:4},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'unknown',weight:'5',hatchDate:'2026-09-01'}}))};
 const invalid=structuredClone(body);invalid.entries[3].entry.sex='';const bad=await f.command(invalid);assert.equal(bad.status,422,bad.body);assert.match(bad.json().error,/개체 4/);assert.equal((await f.get()).json().reservations[0].completed,0);
 assert.ok((await f.get()).json().reservations[0].entries.every(e=>e===null));
 const upsert=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.startsWith('vendor_entries_v1::')))throw Error('isolated write failure');return upsert(rows);};
 assert.equal((await f.command(body)).status,500);f.repository.upsertRows=upsert;
 assert.ok((await f.get()).json().reservations[0].entries.every(e=>e===null));
 assert.equal((await f.command(body)).status,200);f.restart();assert.equal((await f.get()).json().reservations[0].completed,4);
});

test('batch conflicts, duplicate slots, unowned reservations and deadlines cannot partially overwrite entries',async t=>{
 const f=await fixture(t),r=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json().reservations[0];
 const body={type:'save-entries',id:r.id,submit:false,entries:Array.from({length:4},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'male',weight:'5',hatchDate:'2026-09-01'}}))};
 assert.equal((await f.command({...body,entries:[body.entries[0],body.entries[0]]})).status,422);
 assert.equal((await f.command({...body,id:randomUUID()})).status,403);
 const results=await Promise.all([f.command(body),f.command({...body,entries:body.entries.map(e=>({...e,entry:{...e.entry,weight:'9'}}))})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const rows=(await f.get()).json().reservations[0].entries;assert.equal(new Set(rows.map(e=>e.weight)).size,1);assert.ok(rows.every(e=>e.version===1));
 f.advance(12*86400000);assert.equal((await f.command({...body,entries:body.entries.map(e=>({...e,expectedVersion:1}))})).status,409);
 assert.deepEqual((await f.get()).json().reservations[0].entries,rows);
});

test('inbound origin preferences persist per vendor, reject stale writes and never reserve transport',async t=>{
 const f=await fixture(t),data=require('../public/broadcast-inbound-data.json'),origin=data.dodosi.origins.find(o=>o.region==='서울·인천'),body={type:'inbound-origin',carrier:'dodosi',originId:origin.id,expectedVersion:f.view.version,requestId:randomUUID()};
 const saved=await f.command(body);assert.equal(saved.status,200,saved.body);assert.equal(saved.json().vendor.inboundOrigins.dodosi,origin.id);assert.equal(saved.json().reservations.length,0);
 f.restart();const duplicate=await f.command(body);assert.equal(duplicate.status,200,duplicate.body);assert.equal(duplicate.json().duplicate,true);
 assert.equal((await f.command({...body,requestId:randomUUID(),originId:''})).status,409);
 const other=await f.login('01000000002'),company=(await f.post(other,'register',{name:'독립 업체',region:'서울',phone:'01000000002'})).json(),token=(await f.post(other,'select',{id:company.id})).json().token;
 const separate=(await f.call(other,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({token,event:'national-cre'}))).json();assert.deepEqual(separate.vendor.inboundOrigins,{});
 const current=(await f.get()).json();
 assert.equal((await f.command({...body,requestId:randomUUID(),expectedVersion:current.version,originId:'unknown-shop'})).status,422);
 const results=await Promise.all([f.command({...body,requestId:randomUUID(),expectedVersion:current.version,originId:''}),f.command({...body,requestId:randomUUID(),expectedVersion:current.version,carrier:'parge',originId:'parge-capital'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='broadcast_booking_updated').length,0);
});

test('carrier-specific inbound destinations are automatic and stay fixed across origin changes, pickup and restart',async t=>{
 const f=await fixture(t),expected={parge:'대구 크레오',dodosi:'대구 크레용'},phones={parge:'010-5002-9163',dodosi:'010-2508-8240'};
 for(let i=0;i<2;i++){const view=(await f.get()).json();assert.deepEqual(view.inboundDestinations,expected);assert.deepEqual(view.inboundDestinationPhones,phones);assert.equal(view.version,f.view.version);assert.equal(view.reservations.length,0);}
 const reserved=await f.command({type:'reserve',date:'2026-10-14',quantity:4,inboundDestinations:{parge:'다른 곳',dodosi:'다른 곳'}});assert.equal(reserved.status,200,reserved.body);
 const r=reserved.json().reservations[0];assert.deepEqual(reserved.json().inboundDestinations,expected);
 const origin=require('../public/broadcast-inbound-data.json').dodosi.origins.find(o=>o.region==='경기'&&!o.issue);
 const changed=await f.command({type:'inbound-origin',carrier:'dodosi',originId:origin.id,expectedVersion:reserved.json().version});assert.equal(changed.status,200,changed.body);assert.deepEqual(changed.json().inboundDestinations,expected);
 const pickup={type:'pickup',id:r.id,pickup:true,expectedVersion:r.version,requestId:randomUUID()};assert.equal((await f.command(pickup)).status,200);
 f.restart();const again=await f.command(pickup);assert.equal(again.status,200,again.body);assert.equal(again.json().duplicate,true);assert.deepEqual(again.json().inboundDestinations,expected);assert.deepEqual(again.json().inboundDestinationPhones,phones);assert.equal(again.json().reservations[0].pickup,true);
});
test('a nearby departure shop may cross the broadcast-region boundary without changing eligibility',async t=>{
 const f=await fixture(t),data=require('../public/broadcast-inbound-data.json'),shop=data.dodosi.origins.find(o=>o.area==='하남');
 const response=await f.command({type:'inbound-origin',carrier:'dodosi',originId:shop.id,expectedVersion:f.view.version});assert.equal(response.status,200,response.body);
 const view=response.json();assert.equal(view.vendor.region,'서울·인천');assert.equal(view.vendor.inboundOrigins.dodosi,shop.id);
 assert.equal(view.dates.find(d=>d.date==='2026-10-19').maxQuantityAvailable,0);assert.equal(view.dates.find(d=>d.date==='2026-10-14').maxQuantityAvailable,4);
 const plan=require('../public/broadcast-inbound-core').forVendor(data,'dodosi','서울',shop.id,'2026-10-14','2026-10-05',{anyRegion:true});assert.equal(plan.origin.id,shop.id);assert.notEqual(plan.status,'review');
});
test('failed inbound preference persistence leaves the previous choice and permits a safe retry',async t=>{
 const f=await fixture(t),body={type:'inbound-origin',carrier:'parge',originId:'parge-capital',expectedVersion:f.view.version,requestId:randomUUID()};
 const cas=f.repository.compareAndSwapRows.bind(f.repository);f.repository.compareAndSwapRows=async()=>{throw Error('isolated persistence failure');};
 assert.equal((await f.command(body)).status,500);f.repository.compareAndSwapRows=cas;
 assert.deepEqual((await f.get()).json().vendor.inboundOrigins,{});
 assert.equal((await f.command(body)).status,200);f.restart();assert.equal((await f.get()).json().vendor.inboundOrigins.parge,'parge-capital');
});

test('batch photos remain associated with their row and invalid media rolls back every row',async t=>{
 const f=await fixture(t),view=(await f.command({type:'reserve',date:'2026-10-14',quantity:4})).json(),r=view.reservations[0];
 const channel={id:'national-cre',name:'전국크레자랑',status:'active',dataAdapter:'platform'},context={profile:{id:view.entryState.ownerId,members:[{channelId:channel.id,vendorId:f.vendorId}]},channel,vendor:{id:f.vendorId},catalog:{channels:[channel]}};
 const service=createVendorEntries(f.repository),animal=randomUUID(),parent=randomUUID();
 for(const id of [animal,parent])await service.addMedia(context,{id,url:'/assets/'+id+'.webp',thumbnailUrl:'/assets/'+id+'-thumb.webp',size:100,thumbnailSize:50});
 const body={type:'save-entries',id:r.id,submit:true,entries:[0,1].map(slot=>({slot,expectedVersion:0,entry:{sex:'unknown',weight:'8',hatchDate:'2026-09-01',photoIds:slot===0?[animal]:[]},parents:{sire:{photoId:slot===0?parent:randomUUID()}}}))};
 assert.equal((await f.command(body)).status,422);assert.ok((await f.get()).json().reservations[0].entries.every(e=>e===null));
 body.entries[1].parents={};const saved=await f.command(body);assert.equal(saved.status,200,saved.body);
 const result=saved.json(),rows=result.reservations[0].entries;assert.deepEqual(rows[0].photoIds,[animal]);assert.deepEqual(rows[1].photoIds,[]);
 assert.equal(result.entryState.parents.find(p=>p.id===rows[0].sireId).photoId,parent);assert.ok(!rows[1].sireId);
 const queue=(await f.call(f.client,'GET','/api/platform/channels/national-cre/entries',undefined,f.admin)).json();assert.equal(queue.groups[0].entries.length,2);
});

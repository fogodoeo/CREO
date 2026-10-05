'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFixture}=require('../tools/vendor-portal-preview.cjs'),{createVendorEntries}=require('../vendor-entries'),{REGIONS,regionAt}=require('../national-broadcast');
async function fixture(t){
 const f=await createFixture();t.after(f.close);f.advance(9*86400000);
 const admin={'x-creo-admin':f.secret};
 let r=await f.call(f.client(),'PUT','/api/platform/channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'},admin);assert.equal(r.status,200,r.body);
 const client=await f.login('01000000001'),registered=await f.post(client,'register',{name:'서울 테스트',region:'서울',phone:'01000000001'}),vendorId=registered.json().id;
 const vendor=await f.repository.getRecord('national-cre','vendor',vendorId);await f.repository.upsertRecord('national-cre','vendor',{...vendor,bankName:'가상은행',bankAccount:'000000',bankHolder:'테스트'});
 const token=(await f.post(client,'select',{id:vendorId})).json().token;
 const get=()=>f.call(client,'GET','/api/platform/vendor-bookings?'+new URLSearchParams({token,event:'national-cre'}));
 const command=(body)=>f.call(client,'POST','/api/platform/vendor-bookings',{requestId:randomUUID(),...body,token,event:'national-cre'});
 const view=(await get()).json();assert.equal(view.mode,'regional-cycle-v1');
 return {...f,admin,client,vendorId,token,get,command,view};
}
test('five-region rotation has a fixed first broadcast and covers month/year boundaries',()=>{
 assert.deepEqual(REGIONS,['서울','경기','전라·충청','대구·경북','부산·울산·경남']);
 assert.equal(regionAt('2026-10-12'),null);assert.equal(regionAt('2026-10-14'),0);assert.equal(regionAt('2026-10-19'),1);assert.equal(regionAt('2026-10-26'),3);assert.equal(regionAt('2026-11-02'),0);assert.equal(regionAt('2026-02-30'),null);
 assert.equal(regionAt('2027-01-04'),3);assert.equal(regionAt('9999-12-29'),4);
});
test('reserve creates exactly five durable slots, duplicates and restart do not add slots or notifications',async t=>{
 const f=await fixture(t),requestId=randomUUID(),body={type:'reserve',date:'2026-10-14',quantity:5,requestId};
 assert.equal(f.view.dates[0].maxQuantity,null);
 for(const quantity of [1,4,8])assert.equal((await f.command({...body,requestId:randomUUID(),quantity})).status,422);
 assert.equal((await f.command({...body,date:'2026-10-19'})).status,409);
 const first=await f.command(body);assert.equal(first.status,200,first.body);const slots=first.json().reservations[0].entryIds;assert.equal(new Set(slots).size,5);
 const adminView=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();assert.equal(adminView.sessions[0].reservations[0].completed,0);
 f.restart();const again=await f.command(body);assert.equal(again.status,200,again.body);assert.equal(again.json().duplicate,true);assert.deepEqual(again.json().reservations[0].entryIds,slots);
 assert.equal((await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='broadcast_booking_updated').length,1);
});
test('regional cycle has no minimum total or default vendor cap; an optional cap can be cleared',async t=>{
 const f=await fixture(t),{createNationalBroadcast}=require('../national-broadcast'),channel={id:'national-cre',name:'전국크레자랑',dataAdapter:'platform',status:'active'};
 const {state}=await createNationalBroadcast(f.repository).read(channel);
 state.reservations=Array.from({length:26},(_,i)=>({id:randomUUID(),vendorId:'isolated-'+i,vendorName:'가상 업체',region:0,date:'2026-10-14',quantity:5,status:'confirmed',version:1,entryIds:Array.from({length:5},randomUUID)}));
 await f.repository.upsertRecord('national-cre','setting',{...state,id:'national-broadcasts'});
 const reserved=await f.command({type:'reserve',date:'2026-10-14',quantity:5});assert.equal(reserved.status,200,reserved.body);
 const adminView=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();assert.equal(adminView.sessions[0].confirmedQuantity,135);assert.equal(adminView.sessions[0].shortfall,0);
 const session=adminView.sessions[1];
 const change=async(maxQuantity,version)=>f.call(f.client,'POST','/api/platform/channels/national-cre/broadcast-bookings',{type:'session',date:session.date,expectedVersion:version,settings:{...session,maxQuantity},requestId:randomUUID()},f.admin);
 const limited=await change(5,adminView.version);assert.equal(limited.status,200,limited.body);
 const unlimited=await change(null,limited.json().version);assert.equal(unlimited.status,200,unlimited.body);assert.equal(unlimited.json().sessions[1].maxQuantity,null);
});
test('entry and parent photos enter the existing approval queue; approval creates the ordinary auction item',async t=>{
 const f=await fixture(t),reserved=(await f.command({type:'reserve',date:'2026-10-14',quantity:5})).json(),r=reserved.reservations[0],ownerId=reserved.entryState.ownerId;
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
 const f=await fixture(t),r=(await f.command({type:'reserve',date:'2026-10-14',quantity:5})).json().reservations[0];
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
 const settings={...initial.sessions[0],maxQuantity:35};
 const configured=await f.call(f.client,'POST','/api/platform/channels/national-cre/broadcast-bookings',{type:'session',date:'2026-10-14',settings,expectedVersion:initial.version,requestId:randomUUID()},f.admin);assert.equal(configured.status,200,configured.body);
 const access=[{client:f.client,token:f.token}];
 for(let i=2;i<=8;i++){const number='0100000000'+i,c=await f.login(number),v=(await f.post(c,'register',{name:'격리 업체 '+i,region:'서울',phone:number})).json();access.push({client:c,token:(await f.post(c,'select',{id:v.id})).json().token})}
 const responses=await Promise.all(access.map(a=>f.call(a.client,'POST','/api/platform/vendor-bookings',{type:'reserve',date:'2026-10-14',quantity:5,requestId:randomUUID(),token:a.token,event:'national-cre'})));
 assert.equal(responses.filter(r=>r.status===200).length,7);assert.equal(responses.filter(r=>r.status===409).length,1);
 const mine=(await f.get()).json().reservations[0],other=access[1];
 const cross=await f.call(other.client,'POST','/api/platform/vendor-bookings',{type:'save-entry',id:mine.id,slot:0,expectedVersion:0,entry:{},token:other.token,event:'national-cre',requestId:randomUUID()});assert.equal(cross.status,403);
 assert.equal((await f.command({type:'save-entry',id:mine.id,slot:5,expectedVersion:0,entry:{}})).status,403);
 const marked=await f.command({type:'pickup',id:mine.id,expectedVersion:mine.version,pickup:true});assert.equal(marked.status,200,marked.body);
 f.restart();assert.equal((await f.get()).json().reservations[0].pickup,true);
 const view=(await f.call(f.client,'GET','/api/platform/channels/national-cre/broadcast-bookings',undefined,f.admin)).json();assert.equal(view.sessions[0].confirmedQuantity,35);assert.equal(view.sessions[0].regions[0].available,0);
});

test('four entries submit together, preserve the fifth slot and retry without duplicate entries',async t=>{
 const f=await fixture(t),r=(await f.command({type:'reserve',date:'2026-10-14',quantity:5})).json().reservations[0];
 const body={type:'save-entries',id:r.id,requestId:randomUUID(),submit:true,entries:Array.from({length:4},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'female',weight:String(slot+5),hatchDate:'2026-09-01',note:'일괄 '+slot}}))};
 const response=await f.command(body);assert.equal(response.status,200,response.body);
 assert.equal(response.json().reservations[0].completed,4);assert.equal(response.json().reservations[0].entries[4],null);
 const ids=response.json().reservations[0].entries.slice(0,4).map(e=>e.id);assert.deepEqual(ids,r.entryIds.slice(0,4));
 f.advance(86400000);f.restart();const duplicate=await f.command(body);assert.equal(duplicate.status,200,duplicate.body);assert.equal(duplicate.json().duplicate,true);
 assert.equal((await f.command({...body,entries:body.entries.slice(0,3)})).status,409);
 const last=await f.command({...body,requestId:randomUUID(),entries:[{...body.entries[0],slot:4}]});assert.equal(last.status,200,last.body);assert.equal(last.json().reservations[0].completed,5);
});

test('batch validation and storage failure leave every entry unchanged; retry is durable',async t=>{
 const f=await fixture(t),view=(await f.command({type:'reserve',date:'2026-10-14',quantity:5})).json(),r=view.reservations[0];
 const body={type:'save-entries',id:r.id,requestId:randomUUID(),submit:true,entries:Array.from({length:5},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'unknown',weight:'5',hatchDate:'2026-09-01'}}))};
 const invalid=structuredClone(body);invalid.entries[4].entry.sex='';const bad=await f.command(invalid);assert.equal(bad.status,422,bad.body);assert.match(bad.json().error,/개체 5/);assert.equal((await f.get()).json().reservations[0].completed,0);
 assert.ok((await f.get()).json().reservations[0].entries.every(e=>e===null));
 const upsert=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=async rows=>{if(rows.some(r=>r.key.startsWith('vendor_entries_v1::')))throw Error('isolated write failure');return upsert(rows);};
 assert.equal((await f.command(body)).status,500);f.repository.upsertRows=upsert;
 assert.ok((await f.get()).json().reservations[0].entries.every(e=>e===null));
 assert.equal((await f.command(body)).status,200);f.restart();assert.equal((await f.get()).json().reservations[0].completed,5);
});

test('batch conflicts, duplicate slots, unowned reservations and deadlines cannot partially overwrite entries',async t=>{
 const f=await fixture(t),r=(await f.command({type:'reserve',date:'2026-10-14',quantity:5})).json().reservations[0];
 const body={type:'save-entries',id:r.id,submit:false,entries:Array.from({length:5},(_,slot)=>({slot,expectedVersion:0,entry:{sex:'male',weight:'5',hatchDate:'2026-09-01'}}))};
 assert.equal((await f.command({...body,entries:[body.entries[0],body.entries[0]]})).status,422);
 assert.equal((await f.command({...body,id:randomUUID()})).status,403);
 const results=await Promise.all([f.command(body),f.command({...body,entries:body.entries.map(e=>({...e,entry:{...e.entry,weight:'9'}}))})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const rows=(await f.get()).json().reservations[0].entries;assert.equal(new Set(rows.map(e=>e.weight)).size,1);assert.ok(rows.every(e=>e.version===1));
 f.advance(12*86400000);assert.equal((await f.command({...body,entries:body.entries.map(e=>({...e,expectedVersion:1}))})).status,409);
 assert.deepEqual((await f.get()).json().reservations[0].entries,rows);
});

test('batch photos remain associated with their row and invalid media rolls back every row',async t=>{
 const f=await fixture(t),view=(await f.command({type:'reserve',date:'2026-10-14',quantity:5})).json(),r=view.reservations[0];
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

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {copyItem,safeUnstarted}=require('../national-round-operations');
const ROOT='national-cre',TARGET='national-cre-20261021',DATE='2026-10-21';
const pending=(id,date=DATE)=>item(id,'v1',{status:'waiting',soldPrice:0,winnerName:'',winnerPhone:'',attributes:{broadcastDate:date,checklist:'weight:3|gender:',entry_traits:{weight:3},parents:[{side:'father',name:'가상 부개체'}],media:[{url:'https://example.invalid/photo.webp'}]}});
async function setup(t){const f=await fixture();t.after(()=>f.close());await createVendorDirectory(f.repository).enroll(ROOT,'v1');await f.repository.upsertRecord(ROOT,'item',pending('new01'));f.command=(action='prepare',more={})=>f.request('POST','/national-rounds',{action,date:DATE,...more});return f;}
const records=(f,ch,type='item')=>f.repository.listRecords(ch,type);
test('prepare isolates date, money, notifications, draw and broadcasts; old buyer link still works',async t=>{
 const f=await setup(t),before=await f.read();assert.equal(before.status,200);
 await f.repository.upsertRecord(ROOT,'item',pending('later','2026-10-28'));
 await f.repository.upsertRecord(ROOT,'setting',{id:'pinball-session',winner:'old'});
 await f.repository.upsertRecord(ROOT,'broadcast',{id:'state',mode:'sold',activeItemId:'a01',layoutPreset:'national'});
 const old=(await records(f,ROOT)).filter(i=>i.status==='sold');
 const initialList=await f.request('GET','/national-rounds');assert.equal(initialList.json().rounds.find(r=>r.channelId===ROOT).itemCount,3);
 const r=await f.command();assert.equal(r.status,200,r.body);assert.equal(r.json().imported,1);
 const imported=await records(f,TARGET);assert.equal(imported.length,1);assert.equal(imported[0].attributes.entry_traits.weight,3);assert.equal(imported[0].attributes.parents[0].name,'가상 부개체');assert.equal(imported[0].winnerPhone,'');assert.equal(imported[0].soldPrice,0);
 assert.equal((await f.repository.getCatalog()).channels.find(c=>c.id===TARGET).nationalRound.date,DATE);
 assert.equal((await f.repository.getCatalog()).channels.find(c=>c.id===TARGET).shippingSupport.enabled,false);
 assert.equal((await f.repository.getCatalog()).channels.find(c=>c.id===TARGET).settlementDiscount.enabled,false);
 for(const type of ['shipment','notification'])assert.deepEqual(await records(f,TARGET,type),[]);
 assert.equal(await f.repository.getRecord(TARGET,'setting','pinball-session'),null);
 const broadcast=await f.repository.getRecord(TARGET,'broadcast','state');assert.equal(broadcast.mode,'standby');assert.equal(broadcast.activeItemId,'');
 assert.equal(await f.repository.getActiveChannel(),ROOT);assert.deepEqual((await records(f,ROOT)).filter(i=>i.status==='sold'),old);
 assert.deepEqual((await f.read()).json(),before.json());
 const directory=await createVendorDirectory(f.repository).profileFor(TARGET,'v1');assert.equal(directory.members.length,2);
});
test('concurrent repeated prepare imports once; retry after restart preserves local edits and appends new approvals',async t=>{
 const f=await setup(t),responses=await Promise.all([f.command(),f.command(),f.command()]);
 assert.deepEqual(responses.map(r=>r.status),[200,200,200]);assert.equal(responses.reduce((n,r)=>n+r.json().imported,0),1);
 const first=(await records(f,TARGET))[0];await f.repository.upsertRecord(TARGET,'item',{...first,name:'A09',note:'엑셀 비고',lotNumber:9});
 f.restart();assert.equal((await f.command()).json().duplicate,true);
 await f.repository.upsertRecord(ROOT,'item',pending('new02'));
 assert.equal((await f.command()).json().imported,1);const rows=await records(f,TARGET);assert.equal(rows.length,2);assert.equal(rows.find(i=>i.id===first.id).note,'엑셀 비고');assert.equal(rows.find(i=>i.id!==first.id).lotNumber,10);
});
test('atomic storage failure leaves source, target, membership and catalog unchanged; retry succeeds',async t=>{
 const f=await setup(t),old=await records(f,ROOT),catalog=await f.repository.getCatalog(),cas=f.repository.compareAndSwapRows.bind(f.repository);
 f.repository.compareAndSwapRows=async()=>{throw Error('isolated storage failure')};assert.equal((await f.command()).status,500);
 assert.deepEqual(await records(f,ROOT),old);assert.deepEqual(await records(f,TARGET),[]);assert.deepEqual(await f.repository.getCatalog(),catalog);assert.equal(await createVendorDirectory(f.repository).profileFor(TARGET,'v1'),null);
 f.repository.compareAndSwapRows=cas;assert.equal((await f.command()).status,200);
});
test('catalog conflict fails closed without partially prepared round',async t=>{
 const f=await setup(t);f.repository.compareAndSwapRows=async()=>false;assert.equal((await f.command()).status,409);assert.deepEqual(await records(f,TARGET),[]);
});
test('closed historical dates cannot be recreated as empty new rounds',async t=>{
 const f=await setup(t);
 for(const i of (await records(f,ROOT)).filter(i=>i.status==='sold'))await f.repository.upsertRecord(ROOT,'item',{...i,auctionArchiveId:'closed'});
 const result=await f.command('prepare',{date:'2026-10-14'});assert.equal(result.status,409,result.body);
 assert.equal((await f.repository.getCatalog()).channels.some(c=>c.id==='national-cre-20261014'),false);
});
test('activation requires fresh selection and no live auction, keeps previous checkout active and retries safely',async t=>{
 const f=await setup(t);await f.command();assert.equal((await f.command('activate')).status,409);
 await f.repository.upsertRecord(ROOT,'broadcast',{id:'state',mode:'live'});assert.equal((await f.command('activate',{expectedActiveChannelId:ROOT})).status,409);
 await f.repository.upsertRecord(ROOT,'broadcast',{id:'state',mode:'standby'});assert.equal((await f.command('activate',{expectedActiveChannelId:ROOT})).status,200);
 assert.equal(await f.repository.getActiveChannel(),TARGET);assert.equal((await f.read()).status,200);
 f.restart();assert.equal((await f.command('activate',{expectedActiveChannelId:ROOT})).json().duplicate,true);assert.equal((await f.command()).status,409);
 const oldTransition=await f.request('PUT','/channels/'+ROOT+'/auction-transition',{itemId:'new01',status:'live'});assert.equal(oldTransition.status,409);
});
test('guard wrong dates on creation/edit and default unassigned items to round date',async t=>{
 const f=await setup(t);await f.command();
 const wrong=await f.request('POST','/channels/'+TARGET+'/items',{record:pending('wrong','2026-10-28')});assert.equal(wrong.status,409,wrong.body);
 const blank=pending('manual');blank.attributes={};blank.lotNumber=2;
 const created=await f.request('POST','/channels/'+TARGET+'/items',{record:blank});assert.equal(created.status,201,created.body);assert.equal(created.json().record.attributes.broadcastDate,DATE);
 const changed=await f.request('PUT','/channels/'+TARGET+'/items/manual',{record:{...created.json().record,attributes:{broadcastDate:'2026-10-28'}}});assert.equal(changed.status,409,changed.body);
});
test('reject imported source auction and sold/bid/malformed/archived entries, plus invalid days and unauthorized requests',async t=>{
 const f=await setup(t);assert.equal((await f.request('POST','/national-rounds',{action:'prepare',date:DATE},false)).status,401);
 assert.equal((await f.command('prepare',{date:'2026-10-22'})).status,422);
 for(const extra of [{status:'sold'},{winnerAlias:'old'},{buyerSaleId:'sale'},{auctionArchiveId:'archive'},{attributes:{broadcastDate:DATE,bid_log:'bad'}},{attributes:{broadcastDate:DATE,bid_log:[{amount:100}]}}])assert.equal(safeUnstarted({...pending('new'),...extra}),false);
 await f.command();const blocked=await f.request('PUT','/channels/'+ROOT+'/auction-transition',{itemId:'new01',status:'live'});assert.equal(blocked.status,409,blocked.body);
 const stale=await f.request('PUT','/channels/'+ROOT+'/items/new01',{record:{...pending('new01'),lotNumber:4,note:'stale desktop edit',attributes:{broadcastDate:DATE}}});assert.equal(stale.status,200,stale.body);assert.equal(stale.json().record.attributes.roundTargetChannelId,TARGET);
 const reused=await f.request('POST','/channels/'+ROOT+'/items',{record:pending('new01')});assert.equal(reused.status,409,reused.body);
 const selected=await f.request('PUT','/channels/'+ROOT+'/broadcast-state',{activeItemId:'new01',mode:'live'});assert.equal(selected.status,409,selected.body);
 assert.throws(()=>copyItem(item('sold'),{id:TARGET},DATE,1));
});
test('historical archive is listed separately; new-round buyer and shipping never include old same-phone sales',async t=>{
 const f=await setup(t);const archived=item('historic','v1',{auctionArchiveId:'old-archive'});await f.repository.upsertRecord(ROOT,'item',archived);await f.repository.upsertRecord(ROOT,'archive',{id:'old-archive',closedAt:'2026-10-19',title:'이전 회차'});
 await f.command();await f.command('activate',{expectedActiveChannelId:ROOT});
 const imported=(await records(f,TARGET))[0];
 const started=await f.request('PUT','/channels/'+TARGET+'/auction-transition',{itemId:imported.id,status:'live'});assert.equal(started.status,200,started.body);
 assert.equal((await f.command('activate',{expectedActiveChannelId:ROOT})).json().duplicate,true);
 const sold=await f.request('PUT','/channels/'+TARGET+'/auction-transition',{itemId:imported.id,status:'sold',item:{soldPrice:50000,winnerName:'가상 낙찰자',winnerPhone:'01000000003'}});assert.equal(sold.status,200,sold.body);
 const link=await f.request('POST','/channels/'+TARGET+'/buyer-shipping-link',{itemId:imported.id});assert.equal(link.status,200,link.body);
 const buyer=await f.request('GET','/buyer-shipping?code='+link.json().code,null,false);assert.equal(buyer.status,200,buyer.body);const body=JSON.stringify(buyer.json());assert.ok(body.includes(imported.id));assert.ok(!body.includes('historic'));assert.ok(!body.includes('"a01"'));
 const list=await f.request('GET','/national-rounds');assert.equal(list.json().rounds.length,3);assert.equal(list.json().rounds.find(r=>r.archiveId).soldCount,1);
});

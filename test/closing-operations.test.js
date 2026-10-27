'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base,item}=require('../tools/national-settlement-fixture.cjs');
const path='/channels/national-cre/closing-tools';
async function fixture(t){
 const f=await base();t.after(()=>f.close());f.advance(40*86400000);
 f.provider.status=()=>({smsConfigured:true,testMode:false});
 f.provider.send=async n=>{f.sms.push(n);return {messageId:'fake-'+n.id};};
 f.get=()=>f.request('GET',path);
 f.preview=body=>f.request('POST',path,{mode:'preview',archiveId:'',...body});
 f.execute=id=>f.request('POST',path,{mode:'execute',planId:id,confirmed:true});
 f.save=()=>f.request('POST','/buyer-shipping',f.saveBody,false);
 f.pay=async()=>{const r=await f.preview({action:'payment',ids:['v1','v2']});assert.equal(r.status,200,r.body);const e=await f.execute(r.json().id);assert.equal(e.status,200,e.body);return e.json();};
 return f;
}
test('admin only, round scope, missing address and buyer deduplication',async t=>{
 const f=await fixture(t);assert.equal((await f.request('GET',path,null,false)).status,401);
 let r=await f.get();assert.equal(r.status,200,r.body);assert.equal(r.json().buyers.length,1);assert.equal(r.json().buyers[0].missing,true);assert.equal(r.json().buyers[0].itemCount,3);assert.equal(r.json().buyers[0].phone,undefined);
 assert.equal((await f.preview({action:'payment',ids:['injected']})).status,409);
 assert.equal((await f.request('GET',path+'?archive=missing')).status,404);
 const p=(await f.preview({action:'payment',ids:['v1']})).json();assert.equal(p.entries.length,0);assert.equal(p.excluded.length,1);
 assert.equal((await f.execute(p.id)).status,200);assert.equal((await f.repository.listRecords('national-cre','shipment')).length,0);
});
test('selected vendors payment uses existing checkout, multiple vendors for one buyer, duplicate and restart',async t=>{
 const f=await fixture(t);assert.equal((await f.save()).status,200);
 const p=(await f.preview({action:'payment',ids:['v1','v2']})).json();assert.equal(p.entries.length,2);
 const [a,b]=await Promise.all([f.execute(p.id),f.execute(p.id)]);assert.equal(a.status,200,a.body);assert.equal(b.status,200,b.body);assert.deepEqual(a.json().results.map(r=>r.status),['paid','paid']);
 assert.equal((await f.repository.listRecords('national-cre','shipment')).filter(s=>s.paymentStatus==='paid').length,3);
 const notices=await f.repository.listRecords('national-cre','notification');f.restart();assert.equal((await f.execute(p.id)).json().duplicate,true);assert.deepEqual(await f.repository.listRecords('national-cre','notification'),notices);
 assert.equal((await f.repository.listRecords('creyon','shipment')).length,0);
});
test('stale payment preview never confirms changed price, missing payment is excluded',async t=>{
 const f=await fixture(t);await f.save();const p=(await f.preview({action:'payment',ids:['v1']})).json();
 const old=await f.repository.getRecord('national-cre','item','a01');await f.repository.upsertRecord('national-cre','item',{...old,soldPrice:900000});
 const r=await f.execute(p.id);assert.equal(r.status,200,r.body);assert.equal(r.json().results[0].status,'skipped');assert.equal((await f.repository.listRecords('national-cre','shipment')).filter(s=>s.paymentStatus==='paid').length,0);
});
test('vendor reminders exclude settled/reported vendors and pin exact round link',async t=>{
 const f=await fixture(t);await f.save();await f.pay();
 let data=(await f.get()).json();assert.equal(data.vendors[0].settlementBlocked,'');
 const p=await f.preview({action:'vendor_sms',ids:['v1','v2']});assert.equal(p.status,200,p.body);assert.equal(p.json().entries.length,2);assert.match(p.json().entries[0].message,/event=national-cre&round=date%3A2026-10-14/);
 const v=data.vendors.find(v=>v.id==='v1');await f.repository.upsertRows([{key:'creo_organizer_shipping_ledger::national-cre',value:JSON.stringify([{id:'paid',vendorId:'v1',amount:v.remainingAmount,status:'confirmed',itemIds:['a01','a02']}])}]);
 assert.equal((await f.execute(p.json().id)).status,409);
 const next=(await f.preview({action:'vendor_sms',ids:['v1','v2']})).json();assert.equal(next.entries.length,1);assert.equal(next.excluded.length,1);
 const result=await f.execute(next.id);assert.equal(result.status,200,result.body);assert.equal(result.json().results.length,1);
});
test('buyer reminder transactional outbox, concurrency, restart, cooldown and explicit resend',async t=>{
 const f=await fixture(t);const buyer=(await f.get()).json().buyers[0];const p=(await f.preview({action:'buyer_sms',ids:[buyer.id]})).json();assert.equal(p.entries.length,1);
 const [a,b]=await Promise.all([f.execute(p.id),f.execute(p.id)]);assert.equal(a.status,200,a.body);assert.equal(b.json().duplicate,true);
 let notices=(await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='operator_buyer_reminder');assert.equal(notices.length,1);
 f.restart();assert.equal((await f.execute(p.id)).json().duplicate,true);
 let blocked=(await f.preview({action:'buyer_sms',ids:[buyer.id],resend:true})).json();assert.equal(blocked.entries.length,0);
 const n=notices[0];await f.repository.upsertRecord('national-cre','notification',{...n,status:'sent',sentAt:n.createdAt});
 blocked=(await f.preview({action:'buyer_sms',ids:[buyer.id]})).json();assert.equal(blocked.entries.length,0);
 const resend=(await f.preview({action:'buyer_sms',ids:[buyer.id],resend:true})).json();assert.equal(resend.entries.length,1);
 await f.repository.upsertRecord('national-cre','notification',{...n,status:'delivery_unknown'});assert.equal((await f.execute(resend.id)).status,409);
});
test('stale buyer preview, expired preview, state changes while queued and revoked links fail closed',async t=>{
 const f=await fixture(t);let data=(await f.get()).json();const buyer=data.buyers[0];
 const p=(await f.preview({action:'buyer_sms',ids:[buyer.id]})).json();await f.save();assert.equal((await f.execute(p.id)).status,409);
 const q=(await f.preview({action:'buyer_sms',ids:[buyer.id]})).json();f.advance(16*60000);assert.equal((await f.execute(q.id)).status,409);
 const r=(await f.preview({action:'buyer_sms',ids:[buyer.id]})).json();assert.equal((await f.execute(r.id)).status,200);
 const n=(await f.repository.listRecords('national-cre','notification')).find(n=>n.templateKey==='operator_buyer_reminder');
 await f.api.assertBuyerNotificationLink('national-cre',n);
 const old=await f.repository.getRecord('national-cre','item','a01');await f.repository.upsertRecord('national-cre','item',{...old,status:'waiting'});
 await assert.rejects(f.api.assertBuyerNotificationLink('national-cre',n));
});
test('atomic save failure queues no partial recipients; same plan retry succeeds',async t=>{
 const f=await fixture(t);await f.repository.upsertRecord('national-cre','item',item('other','v1',{winnerPhone:'01000000004',winnerName:'두 번째'}));
 const ids=(await f.get()).json().buyers.map(b=>b.id),p=(await f.preview({action:'buyer_sms',ids})).json(),original=f.repository.upsertRows.bind(f.repository);
 let once=true;f.repository.upsertRows=async rows=>{if(once&&rows.some(r=>r.key.includes('notification'))){once=false;throw Error('injected storage failure');}return original(rows);};
 assert.equal((await f.execute(p.id)).status,500);assert.equal((await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='operator_buyer_reminder').length,0);
 assert.equal((await f.execute(p.id)).status,200);assert.equal((await f.repository.listRecords('national-cre','notification')).filter(n=>n.templateKey==='operator_buyer_reminder').length,2);
});

test('partial reported payment is excluded instead of claiming the whole vendor group paid',async t=>{
 const f=await fixture(t);await f.save();const shipments=await f.repository.listRecords('national-cre','shipment');
 const first=shipments.find(s=>s.itemId==='a01');await f.repository.upsertRecord('national-cre','shipment',{...first,paymentStatus:'bank_transfer_reported'});
 const p=(await f.preview({action:'payment',ids:['v1']})).json();assert.equal(p.entries.length,0);assert.match(p.excluded[0].reason,/일부 개체/);
});

test('archived channel and archive round remain isolated from the next round',async t=>{
 const f=await fixture(t);await f.save();const cat=await f.repository.getCatalog();await f.repository.saveCatalog(cat.channels.map(c=>({...c,status:'archived'})));
 assert.equal((await f.get()).status,200);await f.pay();
 await f.repository.upsertRecord('national-cre','archive',{id:'past',title:'지난 회차',closedAt:new Date().toISOString()});
 for(const i of await f.repository.listRecords('national-cre','item'))await f.repository.upsertRecord('national-cre','item',{...i,auctionArchiveId:'past'});
 await f.repository.upsertRecord('national-cre','item',item('next','v1',{attributes:{broadcastDate:'2026-11-09'}}));
 const r=await f.request('GET',path+'?archive=past');assert.equal(r.status,200,r.body);assert.equal(r.json().buyers[0].itemCount,3);
 const p=await f.preview({action:'buyer_sms',archiveId:'past',ids:[r.json().buyers[0].id]});assert.equal(p.status,200,p.body);assert.equal((await f.execute(p.json().id)).status,200);
 assert.equal((await f.get()).json().history.length,0);
 const n=(await f.repository.listRecords('national-cre','notification')).find(n=>n.templateKey==='operator_buyer_reminder');await f.api.assertBuyerNotificationLink('national-cre',n);
});

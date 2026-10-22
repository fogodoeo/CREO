'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');
const {createVendorDirectory}=require('../vendor-directory');
const {normalizeChannel}=require('../platform-core');
const {listVendorSettlementRounds,roundName}=require('../vendor-settlement-rounds');
test('dated CLAB names show the broadcast date once',()=>{
 assert.equal(roundName({id:'clab-1015',name:'씨랩 · 2026-10-15'},{date:'2026-10-15'}),'씨랩 · 2026-10-15');
 assert.equal(roundName({id:'creyon',name:'씨랩'},{date:'2026-10-01'}),'씨랩 · 2026-10-01');
});
test('one authorized vendor catalogue retains old balances and separate channel/round targets without writing records',async t=>{
 const f=await fixture();t.after(()=>f.close());const directory=createVendorDirectory(f.repository),profile=await directory.enroll('national-cre','v1');
 const link=(await f.request('POST','/channels/national-cre/vendor-checkout-link',{vendorId:'v1'})).json();
 const archive=(await f.request('POST','/channels/national-cre/archives',{title:'서울·인천편'})).json().archive.id;
 assert.equal((await f.request('POST','/channels/national-cre/archives/'+archive+'/close-round')).status,200);
 await f.repository.upsertRecord('national-cre','item',item('current','v1',{attributes:{broadcastDate:'2026-10-19'}}));
 const catalog=await f.repository.getCatalog(),child='national-cre-20261021';
 await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id:child,name:'전라·충청',status:'active',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:'2026-10-21'}})]);
 const member=await directory.attach(profile.id,child);await f.repository.upsertRecord(child,'item',item('child',member.vendorId,{attributes:{broadcastDate:'2026-10-21'}}));
 await f.repository.upsertRecord('creyon','vendor',{id:'v1',name:'같은 이름의 별개 업체'});await f.repository.upsertRecord('creyon','item',item('private','v1'));
 const url='/vendor-checkout/rounds?code='+link.code,read=()=>f.request('GET',url,null,false);
 const before=await Promise.all(['national-cre',child].map(async id=>[await f.repository.listRecords(id,'item'),await f.repository.listRecords(id,'shipment')]));
 const responses=await Promise.all([read(),read()]);assert.ok(responses.every(r=>r.status===200));assert.deepEqual(responses[0].json(),responses[1].json());
 const rows=responses[0].json().rounds;assert.equal(rows.length,3);assert.ok(rows.some(r=>r.channelId===child&&r.key==='date:2026-10-21'));
 const old=rows.find(r=>r.key==='archive:'+archive);assert.match(old.name,/2026-10-14 서울·인천편/);assert.equal(old.openCount,2);assert.ok(old.settlementRemaining>0);assert.ok(!JSON.stringify(rows).includes('010000'));assert.ok(!rows.some(r=>r.channelId==='creyon'));
 for(const r of rows){const page=await f.request('GET','/vendor-checkout?code='+link.code+'&event='+r.channelId+'&round='+encodeURIComponent(r.key),null,false);assert.equal(page.status,200,page.body);assert.equal(page.json().summary.itemCount,r.itemCount);}
 f.restart();assert.deepEqual((await read()).json().rounds,rows);
 assert.deepEqual(await Promise.all(['national-cre',child].map(async id=>[await f.repository.listRecords(id,'item'),await f.repository.listRecords(id,'shipment')])),before);
 assert.equal((await f.request('GET','/vendor-checkout/rounds',null,false)).status,401);assert.equal((await f.request('GET',url+'&event=creyon',null,false)).status,401);
});
test('catalogue does not silently drop a failed historical read or invent a missing membership',async()=>{
 const context={channel:{id:'national-cre'},token:{checkoutRound:'date:old'},profile:{members:[{channelId:'national-cre'},{channelId:'lost'}]},financialRounds:[]};
 let token;assert.deepEqual(await listVendorSettlementRounds(context,{resolve:async value=>{token=value;return null},settlement:()=>{throw Error('unexpected')}}),[]);assert.equal(token.checkoutRound,'');
 await assert.rejects(listVendorSettlementRounds(context,{resolve:async()=>{throw Error('storage unavailable')},settlement:()=>{}}),/storage unavailable/);
});
test('CLAB shared vendor uses the same dated catalogue without acquiring access to Nationwide CRE',async t=>{
 const f=await fixture();t.after(()=>f.close());const d=createVendorDirectory(f.repository);
 await f.repository.upsertRecord('creyon','vendor',{id:'clab-v',name:'씨랩 가상 업체'});const p=await d.enroll('creyon','clab-v');
 const catalog=await f.repository.getCatalog();await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id:'clab-next',name:'씨랩 다음 방송',status:'active',dataAdapter:'platform'})]);
 const m=await d.attach(p.id,'clab-next');
 await f.repository.upsertRecord('creyon','item',item('old','clab-v',{attributes:{broadcastDate:'2026-10-01'}}));
 await f.repository.upsertRecord('clab-next','item',item('new',m.vendorId,{attributes:{broadcastDate:'2026-10-15'}}));
 const link=(await f.request('POST','/channels/creyon/vendor-checkout-link',{vendorId:'clab-v'})).json();
 const response=await f.request('GET','/vendor-checkout/rounds?code='+link.code,null,false);assert.equal(response.status,200,response.body);
 assert.deepEqual(response.json().rounds.map(r=>[r.channelId,r.key]),[['clab-next','date:2026-10-15'],['creyon','date:2026-10-01']]);assert.ok(response.json().rounds.every(r=>!r.name.includes('전국크레자랑')));
});

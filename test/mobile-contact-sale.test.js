'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('../tools/vendor-portal-preview.cjs');
async function setup(t){
 const f=await createFixture({apiOptions:{bandMembership:{async resolveMemberIdentity(input){assert.equal(input.requireMemberKey,true);return input.bandMemberKey==='known-member'?{phone:'01000000009'}:null;}}}});
 t.after(()=>f.close());const c=f.client();f.request=(method,path,body)=>f.call(c,method,'/api/platform/channels/national-cre'+path,body,{'x-creo-admin':f.secret});
 f.provider.readiness=()=>({ready:true,missing:[]});
 for(const [id,name,phone] of [['seller','가상 판매업체','01000000001'],['buyer-shop','가상 구매업체','01000000002']])await f.repository.upsertRecord('national-cre','vendor',{id,name,phone,active:true});
 return f;
}
test('new sales normalize names and phones, queue one notice, survive retry/restart, and retain raw identity',async t=>{
 const f=await setup(t);
 const cases=[['mixed','가상/용인/010이사이이2022','01024222022','가상',''],['short','쩡/용인/2093-4625','01020934625','쩡',''],['space','김준형 01084978955 용인','01084978955','김준형',''],['member','번호 없는 회원','01000000009','번호 없는 회원','known-member'],['vendor','가상 구매업체','01000000002','가상 구매업체','']];
 for(const [i,[id,raw,phone,name,member]] of cases.entries()){
  await f.repository.upsertRecord('national-cre','item',{id,name:'A0'+(i+1),lotNumber:i+1,vendorId:'seller',status:'waiting'});
  const body={itemId:id,status:'sold',item:{winnerName:raw,winnerAlias:raw,soldPrice:100000,attributes:{bid_log:JSON.stringify([{name:raw,amount:10,bidder_key:member}])}}};
  const responses=await Promise.all([f.request('PUT','/auction-transition',body),f.request('PUT','/auction-transition',body)]);
  for(const r of responses)assert.equal(r.status,200,r.body);
  f.restart();const item=await f.repository.getRecord('national-cre','item',id);assert.equal(item.winnerPhone,phone);assert.equal(item.winnerName,raw);
  const notices=(await f.repository.listRecords('national-cre','notification')).filter(n=>n.recipientRole==='buyer'&&n.eventKey.startsWith('sale-v2:'+id+':'));
  assert.equal(notices.length,1);assert.equal(notices[0].recipientPhone,phone);assert.equal(notices[0].variables['#{구매자명}'],name);assert.equal(notices[0].status,'queued');
  const contacts=await f.request('GET','/buyer-contacts');assert.equal(contacts.json().rows.find(r=>r.itemId===id).name,name);
 }
});
test('unknown or ambiguous identities stay visible and never queue a buyer notice; other channels and old records are unchanged',async t=>{
 const f=await setup(t);
 await f.repository.upsertRecord('national-cre','vendor',{id:'duplicate',name:'가상 구매업체',phone:'01000000003',active:true});
 await f.repository.upsertRecord('national-cre','item',{id:'old',name:'OLD',lotNumber:99,status:'sold',winnerName:'가상 구매업체',soldPrice:100000});
 const before=await f.repository.getRecord('national-cre','item','old');
 for(const [i,raw] of ['번호없는사람','가상 구매업체','가상 / 01012345678 / 01087654321','010가나다5678'].entries()){
  const id='missing-'+i;await f.repository.upsertRecord('national-cre','item',{id,name:'B0'+(i+1),lotNumber:i+1,status:'waiting',vendorId:'seller'});
  const r=await f.request('PUT','/auction-transition',{itemId:id,status:'sold',item:{winnerName:raw,soldPrice:100000}});assert.equal(r.status,200,r.body);
  assert.equal((await f.repository.getRecord('national-cre','item',id)).winnerPhone,'');
  const row=(await f.request('GET','/buyer-contacts')).json().rows.find(r=>r.itemId===id);assert.equal(row.status,'missing_phone');assert.equal(row.attention,true);
 }
 assert.equal((await f.repository.listRecords('national-cre','notification')).filter(n=>n.recipientRole==='buyer').length,0);
 assert.deepEqual(await f.repository.getRecord('national-cre','item','old'),before);
 assert.deepEqual(await f.repository.listRecords('other','notification'),[]);
});

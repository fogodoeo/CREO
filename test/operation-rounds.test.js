'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,item}=require('../tools/national-settlement-fixture.cjs');
const {normalizeChannel}=require('../platform-core');
const R=require('../operation-rounds');
async function setup(t){
 const f=await fixture();t.after(()=>f.close());
 const archive=(await f.request('POST','/channels/national-cre/archives',{title:'10/14 이전 회차'})).json().archive.id;
 assert.equal((await f.request('POST','/channels/national-cre/archives/'+archive+'/close-round')).status,200);
 await f.repository.upsertRecord('national-cre','item',item('new01','v1',{soldPrice:50000,attributes:{broadcastDate:'2026-10-19'}}));
 await f.repository.upsertRecord('national-cre','shipment',{id:'new-shipment',itemId:'new01',vendorId:'v1',cost:15000,method:'delivery',carrier:'파르게'});
 for(const id of ['creyon-1001','clab-1015']){
  const catalog=await f.repository.getCatalog();
  await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id,name:id,status:'active',shippingDefaults:{deliverySchedule:{enabled:true,auctionDate:id==='clab-1015'?'2026-10-15':'2026-10-01'}}})]);
  await f.repository.upsertRecord(id,'vendor',{id:'v1',name:'가상 씨랩 업체'});
  await f.repository.upsertRecord(id,'item',item('same-id','v1',{attributes:{},soldPrice:id==='clab-1015'?250000:100000}));
 }
 return {...f,archive};
}
test('operation catalog groups CLAB and Creyon dates, retains closed rounds, is private and never switches live',async t=>{
 const f=await setup(t),before=await f.repository.getActiveChannel();
 assert.equal((await f.request('GET','/operation-rounds',null,false)).status,401);
 const result=(await f.request('GET','/operation-rounds')).json();
 assert.deepEqual(result.rounds.filter(r=>r.familyId==='clab'&&r.date).map(r=>r.channelId),['clab-1015','creyon-1001']);
 assert.equal(result.rounds.find(r=>r.archiveId===f.archive).soldCount,3);
 assert.equal(result.rounds.find(r=>r.channelId==='national-cre'&&!r.archiveId).soldCount,1);
 assert.equal(await f.repository.getActiveChannel(),before);
});
test('workspace, broadcast, shipping totals and exports only expose selected round; archived shipment IDs remain durable',async t=>{
 const f=await setup(t),before=await f.repository.listRecords('national-cre','item');
 for(const endpoint of ['workspace?scope=round','broadcast','settlement-report']){
  const result=await f.request('GET','/channels/national-cre/'+endpoint);assert.equal(result.status,200,result.body);
  assert.deepEqual(result.json().items.map(i=>i.id||i.itemId),['new01']);
 }
 const current=(await f.request('GET','/channels/national-cre/workspace?scope=round')).json();assert.deepEqual(current.shipments.map(s=>s.id),['new-shipment']);assert.deepEqual(current.archivedItems,[]);
 const old=(await f.request('GET','/channels/national-cre/workspace?archive='+f.archive)).json();assert.deepEqual(old.items.map(i=>i.id).sort(),['a01','a02','b03']);assert.deepEqual(old.shipments,[]);
 for(const endpoint of ['workspace?archive=missing','settlement-report?archive=missing'])assert.equal((await f.request('GET','/channels/national-cre/'+endpoint)).status,404);
 for(const [id,price] of [['clab-1015',250000],['creyon-1001',100000]]){const r=(await f.request('GET','/channels/'+id+'/settlement-report')).json();assert.equal(r.items.length,1);assert.equal(r.totals.soldAmount,price);}
 f.restart();assert.deepEqual(await f.repository.listRecords('national-cre','item'),before);
 assert.equal((await f.request('GET','/channels/national-cre/workspace?archive='+f.archive)).json().items.length,3);
});
test('same-phone buyer links and payment previews stay pinned across round close, new sale, restart and revocation',async t=>{
 const f=await setup(t);
 const old=await f.read();assert.equal(old.status,200,old.body);assert.deepEqual(old.json().items.map(i=>i.id).sort(),['a01','a02','b03']);
 const response=await f.request('POST','/channels/national-cre/buyer-shipping-link',{itemId:'new01'});assert.equal(response.status,200,response.body);const code=response.json().code;assert.notEqual(code,f.code);
 const readNew=()=>f.request('GET','/buyer-shipping?code='+code,null,false);
 assert.deepEqual((await readNew()).json().items.map(i=>i.id),['new01']);
 for(const [id,count] of [['a01',3],['new01',1]]){const r=await f.request('GET','/channels/national-cre/buyer-checkout-preview?itemId='+id);assert.equal(r.status,200,r.body);assert.equal(r.json().items.length,count);}
 f.restart();assert.equal((await f.read()).json().items.length,3);assert.equal((await readNew()).json().items.length,1);
 const info=(await f.request('GET','/channels/national-cre/buyer-link-access?itemId=new01')).json();
 assert.equal((await f.request('POST','/channels/national-cre/buyer-link-access',{itemId:'new01',action:'revoke',expectedRevision:info.revision,requestId:'round-revoke-0001'})).status,200);
 assert.notEqual((await readNew()).status,200);assert.equal((await f.read()).status,200);
});
test('ambiguous legacy buyer identity and mixed sold dates fail closed instead of summing different rounds',()=>{
 const rows=[item('old','v1',{auctionArchiveId:'archive'}),item('new')];
 assert.throws(()=>R.buyerScope(rows,'',rows),e=>e.code==='ROUND_SCOPE_REQUIRED');
 assert.deepEqual(R.buyerScope(rows,'old',rows).map(i=>i.id),['old']);
 for(const id of ['national-cre','clab-1015','creyon-1001'])assert.throws(()=>R.scopeWorkspace({id},{items:[item('a'),item('b','v1',{attributes:{broadcastDate:'2026-10-19'}})]}),e=>e.code==='ROUND_SCOPE_REQUIRED');
 assert.deepEqual(R.scopeWorkspace({id:'national-cre'},{items:[item('a'),item('future','v1',{status:'waiting',soldPrice:0,attributes:{broadcastDate:'2026-10-21'}})]}).items.map(i=>i.id),['a']);
});
test('unassigned old receipts are visible as needing classification and are never subtracted from a new round',async t=>{
 const f=await setup(t);
 await f.repository.upsertRows([{key:'creo_organizer_shipping_ledger::national-cre',value:JSON.stringify([{id:'legacy-receipt',vendorId:'v1',amount:999999,status:'confirmed'}])}]);
 const report=(await f.request('GET','/channels/national-cre/settlement-report')).json();assert.equal(report.unassignedReceiptCount,1);assert.equal(report.totals.receivedAmount,0);
});
test('receipt writes, cancellations and checkout-change lists preserve exact historical round',async t=>{
 const f=await setup(t),key='creo_organizer_shipping_ledger::national-cre',oldReceipt={id:'old-paid',vendorId:'v1',amount:10000,status:'confirmed',itemIds:['a01','a02']};
 await f.repository.upsertRows([{key,value:JSON.stringify([oldReceipt])}]);
 const get=async archive=>(await f.request('GET','/channels/national-cre/organizer-shipping'+(archive?'?archive='+archive:''))).json();
 const current=await get(),v=current.vendors.find(v=>v.vendorId==='v1');assert.equal(v.receivedAmount,0);
 assert.equal(current.scope,'round');assert.equal(current.round.channelId,'national-cre');assert.equal(current.round.archiveId,'');assert.equal(current.round.date,'2026-10-19');
 const old=await get(f.archive);assert.equal(old.scope,'round');assert.equal(old.round.archiveId,f.archive);assert.equal(old.round.name,'10/14 이전 회차');assert.equal(old.round.date,'2026-10-14');
 const body={vendorId:'v1',requestId:'new-round-deposit-01',amount:1000,paidOn:'2026-10-19',memo:'가상 새 회차',expectedReceivedAmount:0,expectedTotalAmount:v.totalAmount};
 const responses=await Promise.all([f.request('POST','/channels/national-cre/organizer-shipping/deposit',body),f.request('POST','/channels/national-cre/organizer-shipping/deposit',body)]);assert.ok(responses.every(r=>r.status===200));assert.deepEqual(responses.map(r=>r.json().duplicate).sort(),[false,true]);
 assert.equal((await get()).vendors.find(v=>v.vendorId==='v1').receivedAmount,1000);assert.equal((await get(f.archive)).vendors.find(v=>v.vendorId==='v1').receivedAmount,10000);
 assert.equal((await f.request('POST','/channels/national-cre/organizer-shipping/cancel',{vendorId:'v1',receiptId:'old-paid',expectedAmount:10000})).status,404);
 for(const row of [{id:'old-change',itemIds:['a01']},{id:'new-change',itemIds:['new01']},{id:'mixed-change',itemIds:['a01','new01']}])await f.repository.upsertRecord('national-cre','checkoutchange',{...row,state:'pending'});
 assert.deepEqual((await f.request('GET','/channels/national-cre/checkout-changes')).json().records.map(r=>r.id),['new-change']);
 const focused=(await f.request('GET','/channels/national-cre/checkout-changes?recordId=old-change')).json();assert.equal(focused.archiveId,f.archive);assert.deepEqual(focused.records.map(r=>r.id),['old-change']);
 const stored=JSON.parse((await f.repository.getRowsByKeys([key]))[0].value);assert.deepEqual(stored.find(r=>r.id==='old-paid'),oldReceipt);
});
test('desktop and transition reject another date; unknown archive and stale source never fall back',async t=>{
 const f=await setup(t);await f.repository.upsertRecord('national-cre','item',item('future','v1',{status:'waiting',soldPrice:0,winnerPhone:'',attributes:{broadcastDate:'2026-10-21'}}));
 const desktop=(await f.request('GET','/operator-context')).json();assert.deepEqual(desktop.workspace.items.map(i=>i.id),['new01']);
 for(const [route,body] of [['auction-transition',{itemId:'future',status:'live'}],['broadcast-state',{activeItemId:'future',mode:'live'}]])assert.equal((await f.request('PUT','/channels/national-cre/'+route,body)).status,409);
 assert.equal((await f.repository.getRecord('national-cre','item','future')).status,'waiting');
});
test('shipping saves from a stale current tab cannot write into a newly archived round',async t=>{
 const f=await setup(t),record={id:'old-shipping',itemId:'a01',vendorId:'v1',method:'pickup',cost:0};
 const send=(method,path,expectedArchiveId,value=record)=>f.request(method,'/channels/national-cre/shipments'+path,{record:value,expectedArchiveId});
 assert.equal((await send('POST','','')).status,409);
 assert.equal((await send('POST','',f.archive)).status,201);
 assert.equal((await send('PUT','/old-shipping','',{...record,note:'stale'})).status,409);
 assert.equal((await send('PUT','/old-shipping',f.archive,{...record,note:'보관 회차 수정'})).status,200);
 f.restart();assert.equal((await f.repository.getRecord('national-cre','shipment','old-shipping')).note,'보관 회차 수정');
});
test('settlement identity, receipts and all workbook headings preserve the selected current, historical, and empty round',async t=>{
 const f=await setup(t),Workbook=require('../public/settlement-workbook'),XLSX=require('../public/assets/vendor/xlsx.mini.min.js');
 const ledger=[{id:'old-report-paid',vendorId:'v1',amount:5000,status:'confirmed',itemIds:['a01','a02']},{id:'new-report-paid',vendorId:'v1',amount:1000,status:'confirmed',itemIds:['new01']}];
 await f.repository.upsertRows([{key:'creo_organizer_shipping_ledger::national-cre',value:JSON.stringify(ledger)}]);
 const get=async archive=>(await f.request('GET','/channels/national-cre/settlement-report'+(archive?'?archive='+archive:''))).json();
 const [current,old]=await Promise.all([get(),get(f.archive)]);
 assert.equal(current.scope,'round');assert.equal(current.round.channelId,'national-cre');assert.equal(current.round.archiveId,'');assert.equal(current.round.date,'2026-10-19');
 assert.equal(old.scope,'round');assert.equal(old.round.archiveId,f.archive);assert.equal(old.round.name,'10/14 이전 회차');assert.equal(old.round.date,'2026-10-14');
 assert.equal(current.totals.receivedAmount,1000);assert.equal(current.totals.remainingAmount,29000);assert.deepEqual(current.receipts.map(r=>r.id),['new-report-paid']);
 assert.equal(old.totals.receivedAmount,5000);assert.equal(old.totals.remainingAmount,55000);assert.deepEqual(old.receipts.map(r=>r.id),['old-report-paid']);
 for(const report of [current,old]){
  const workbook=XLSX.read(Workbook.xlsxBytes(report,XLSX),{type:'buffer'}),label=Workbook.scopeLabel(report);
  for(const name of workbook.SheetNames){assert.equal(workbook.Sheets[name].A2.v,label+' '+name);assert.doesNotMatch(workbook.Sheets[name].A3.v,/채널 누적/);}
  assert.equal(workbook.Props.Title,label+' 총정산');
 }
 f.restart();assert.deepEqual((await get(f.archive)).round,old.round);assert.deepEqual((await get()).round,current.round);
 const catalog=await f.repository.getCatalog();
 await f.repository.saveCatalog([...catalog.channels,normalizeChannel({id:'national-cre-20261021',name:'전라·충청',status:'draft',nationalRound:{parentId:'national-cre',date:'2026-10-21'}})]);
 const empty=(await f.request('GET','/channels/national-cre-20261021/settlement-report')).json();
 assert.equal(empty.items.length,0);assert.equal(empty.totals.remainingAmount,0);assert.equal(empty.round.date,'2026-10-21');assert.match(Workbook.scopeLabel(empty),/전라·충청.*2026-10-21/);
 assert.deepEqual(JSON.parse((await f.repository.getRowsByKeys(['creo_organizer_shipping_ledger::national-cre']))[0].value),ledger);
 assert.equal(f.sms.length,0);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository');
const {createPlatformApi}=require('../platform-api');
const {normalizeChannel}=require('../platform-core');
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'organizer-receipts-'));
 const options={dbPath:path.join(dir,'test.sqlite'),durable:true,adminSecret:'secret',startWorker:false};
 let repo=new SQLitePlatformRepository(options),api;
 const boot=()=>{api=createPlatformApi({repository:repo,adminSessionSecret:'receipt-test',logger:{error(){},warn(){}}})};
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active'})));
 await repo.upsertRecord('alpha','vendor',{id:'v',name:'비송',bankHolder:'송향주'});
 await repo.upsertRecord('alpha','item',{id:'i',vendorId:'v',name:'A01',status:'sold',winnerPhone:'01011112222',soldPrice:100000});
 await repo.upsertRecord('alpha','shipment',{id:'s',itemId:'i',vendorId:'v',method:'delivery',address:'서울',cost:80000,paymentStatus:'pending'});
 boot();
 async function call(method,url,body,admin='secret',headers={}){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'creo.test',...(admin?{'x-creo-admin':admin}:{}),...headers};const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};await api.handle(req,res,new URL('https://creo.test'+url));return res;}
 const route='/api/platform/channels/alpha/organizer-shipping';
 t.after(()=>{repo.close();fs.rmSync(dir,{recursive:true,force:true})});
 const body={vendorId:'v',amount:50000,paidOn:'2026-09-09',memo:'별도 입금',requestId:'manual-first',expectedReceivedAmount:0,expectedTotalAmount:80000,reportId:'',expectedReportAmount:0};
 return {call,route,body,get repo(){return repo},async restart(){repo.close();repo=new SQLitePlatformRepository(options);boot()},async vendor(){return (await call('GET',route)).json().vendors[0]}};
}
test('manual installments are durable and reflected in vendor totals without changing buyer payment or sending notifications',async t=>{
 const f=await fixture(t);
 assert.equal((await f.vendor()).vendorBankHolder,'송향주');
 const result=await f.call('POST',f.route+'/deposit',f.body);assert.equal(result.status,200,result.body);
 await f.restart();let v=await f.vendor();assert.equal(v.receivedAmount,50000);assert.equal(v.remainingAmount,30000);assert.equal(v.history[0].paidOn,'2026-09-09');
 const link=(await f.call('POST','/api/platform/channels/alpha/vendor-checkout-link',{vendorId:'v'})).json();
 const vendor=(await f.call('GET','/api/platform/vendor-checkout?code='+link.code,null,'')).json();assert.equal(vendor.shippingSettlement.vendors[0].receivedAmount,50000);
 assert.equal(vendor.shippingSettlement.vendors[0].history[0].memo,undefined);assert.equal(vendor.shippingSettlement.vendors[0].history[0].depositSignature,undefined);
 const second={...f.body,requestId:'manual-second',expectedReceivedAmount:50000,amount:20000};assert.equal((await f.call('POST',f.route+'/deposit',second)).status,200);
 v=await f.vendor();assert.equal(v.remainingAmount,10000);assert.equal(v.history.length,2);
 assert.equal((await f.repo.getRecord('alpha','shipment','s')).paymentStatus,'pending');assert.equal((await f.repo.listRecords('alpha','notification')).length,0);
});
test('same request and concurrent stale windows never double count, including retry after restart',async t=>{
 const f=await fixture(t);const results=await Promise.all([f.call('POST',f.route+'/deposit',f.body),f.call('POST',f.route+'/deposit',f.body)]);
 assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.json().duplicate).length,1);
 await f.restart();assert.equal((await f.call('POST',f.route+'/deposit',f.body)).json().duplicate,true);
 assert.equal((await f.call('POST',f.route+'/deposit',{...f.body,amount:40000})).status,409);
 assert.equal((await f.call('POST',f.route+'/deposit',{...f.body,requestId:'other-window'})).status,409);
 const next={...f.body,expectedReceivedAmount:50000,amount:10000};const concurrent=await Promise.all([f.call('POST',f.route+'/deposit',{...next,requestId:'window-aaa'}),f.call('POST',f.route+'/deposit',{...next,requestId:'window-bbb'})]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assert.equal((await f.vendor()).receivedAmount,60000);
});
test('pending vendor report is reconciled once, retains original amount, and cannot be confirmed again by the old endpoint',async t=>{
 const f=await fixture(t),pending={id:'vendor-report',vendorId:'v',amount:80000,status:'pending',reportedAt:'2026-09-09T00:00:00Z'};
 await f.repo.upsertRows([{key:'creo_organizer_shipping_ledger::alpha',value:JSON.stringify([pending])}]);
 assert.equal((await f.call('POST',f.route+'/deposit',f.body)).status,409);
 const body={...f.body,reportId:pending.id,expectedReportAmount:80000};assert.equal((await f.call('POST',f.route+'/deposit',body)).status,200);
 const v=await f.vendor();assert.equal(v.history.length,1);assert.equal(v.history[0].reportedAmount,80000);assert.equal(v.receivedAmount,50000);assert.equal(v.pendingReport,null);
 assert.equal((await f.call('POST',f.route+'/review',{vendorId:'v',reportId:pending.id,expectedAmount:80000,action:'confirmed'})).status,409);
 assert.equal((await f.call('POST',f.route+'/deposit',{...body,requestId:'duplicate-new-id'})).status,409);
});
test('cancellation retains records, is idempotent, restores balance, and does not resurrect a cancelled receipt on retry',async t=>{
 const f=await fixture(t);await f.call('POST',f.route+'/deposit',f.body);let v=await f.vendor();const body={vendorId:'v',receiptId:v.history[0].id,expectedAmount:50000};
 assert.equal((await f.call('POST',f.route+'/cancel',{...body,expectedAmount:1})).status,409);
 for(const r of await Promise.all([f.call('POST',f.route+'/cancel',body),f.call('POST',f.route+'/cancel',body)]))assert.equal(r.status,200);
 await f.restart();v=await f.vendor();assert.equal(v.receivedAmount,0);assert.equal(v.history.length,1);assert.equal(v.history[0].status,'cancelled');assert.ok(v.history[0].cancelledAt);
 assert.equal((await f.call('POST',f.route+'/deposit',f.body)).json().duplicate,true);assert.equal((await f.vendor()).receivedAmount,0);
 assert.equal((await f.call('POST',f.route+'/deposit',{...f.body,requestId:'corrected-entry'})).status,200);assert.equal((await f.vendor()).history.length,2);
});
test('write failure and changed shipping amounts fail closed; ended auction still permits settlement',async t=>{
 const f=await fixture(t),write=f.repo.upsertRows.bind(f.repo);f.repo.upsertRows=async()=>{throw Error('disk failure')};
 assert.equal((await f.call('POST',f.route+'/deposit',f.body)).status,500);f.repo.upsertRows=write;assert.equal((await f.vendor()).receivedAmount,0);
 await f.repo.upsertRecord('alpha','shipment',{id:'s',itemId:'i',vendorId:'v',method:'delivery',cost:90000,paymentStatus:'pending'});
 assert.equal((await f.call('POST',f.route+'/deposit',f.body)).status,409);
 const catalog=await f.repo.getCatalog();catalog.channels[0].status='archived';await f.repo.saveCatalog(catalog.channels);assert.equal((await f.repo.getCatalog()).channels[0].status,'archived');
 const r=await f.call('POST',f.route+'/deposit',{...f.body,expectedTotalAmount:90000});assert.equal(r.status,200,r.body);
 f.repo.upsertRows=async()=>{throw Error('disk failure')};const record=(await f.vendor()).history[0];assert.equal((await f.call('POST',f.route+'/cancel',{vendorId:'v',receiptId:record.id,expectedAmount:50000})).status,500);f.repo.upsertRows=write;assert.equal((await f.vendor()).receivedAmount,50000);
});
test('manual writes require organizer authorization for the same channel and reject malformed input',async t=>{
 const f=await fixture(t);assert.equal((await f.call('POST',f.route+'/deposit',f.body,'')).status,401);
 const link=(await f.call('POST','/api/platform/channels/alpha/organizer-link',{})).json(),code=new URL(link.url).pathname.split('/').at(-1),headers={'x-creo-organizer':code};
 assert.equal((await f.call('POST',f.route.replace('alpha','beta')+'/deposit',f.body,'',headers)).status,401);
 assert.equal((await f.call('POST',f.route+'/cancel',{},'')).status,401);
 assert.equal((await f.call('POST',f.route+'/deposit',{...f.body,vendorId:'missing'},'',headers)).status,404);
 for(const patch of [{amount:-1},{amount:0},{amount:1.5},{amount:'50000'},{paidOn:'2026-02-30'},{paidOn:'2099-01-01'},{memo:'x'.repeat(201)}])assert.equal((await f.call('POST',f.route+'/deposit',{...f.body,...patch},'',headers)).status,422,JSON.stringify(patch));
 assert.equal((await f.call('POST',f.route+'/deposit',f.body,'',headers)).status,200);assert.equal((await f.repo.getRowsByKeys(['creo_organizer_shipping_ledger::beta'])).length,0);
});

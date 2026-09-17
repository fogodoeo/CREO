'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{Readable}=require('node:stream');
const {SQLitePlatformRepository}=require('../sqlite-platform-repository'),{createPlatformApi}=require('../platform-api'),{normalizeChannel}=require('../platform-core');
const {organizerAuctionItems}=require('../shipping-settlement');
async function fixture(t,{shared=false,method='card',external=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creo-vendor-shipping-'));let repo,api;
 const start=()=>{repo=new SQLitePlatformRepository({dbPath:path.join(dir,'test.sqlite'),durable:true,startWorker:false,adminSecret:'test'});api=createPlatformApi({repository:repo,adminSessionSecret:'test-session',logger:{warn(){},error(){}}})};start();
 t.after(()=>{repo.close();const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('creo-vendor-shipping-'))throw Error('Unsafe cleanup');fs.rmSync(target,{recursive:true,force:true})});
 await repo.saveCatalog(['alpha','beta'].map(id=>normalizeChannel({id,name:id,status:'active',shippingDefaults:{pickupLocations:['로컬 인계점','다른 인계점'],enabledCarriers:['parge','dodosi']}})));
 await repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{강원:[{shop:'수령점',cost:40000},{shop:'다른 수령점',cost:30000}]}})}]);
 for(const id of ['v1','v2'])await repo.upsertRecord('alpha','vendor',{id,name:id,phone:'01000000001',bankName:'가상은행',bankAccount:'0000000',bankHolder:'가상',paymentMethods:['card','bank_transfer']});
 for(const [i,id] of ['first','second'].entries())await repo.upsertRecord('alpha','item',{id,name:id,lotNumber:i+1,status:'sold',soldPrice:300000,winnerName:'테스트 구매자',winnerPhone:'01000000002',vendorId:shared&&i?'v2':'v1'});
 async function call(method,route,body,admin=false){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.headers={host:'test.invalid',...(admin?{'x-creo-admin':'test'}:{})};
  const res={writeHead(status){this.status=status},end(body=''){this.body=String(body)},json(){return JSON.parse(this.body||'{}')}};await api.handle(req,res,new URL('https://test.invalid/api/platform/'+route));return res;
 }
 const link=(await call('POST','channels/alpha/buyer-shipping-link',{itemId:'first'},true)).json();
 const selected=await call('POST','buyer-shipping',{code:link.code,destinationId:'parge',pargeRegion:'강원',pargeShop:'수령점',payments:[{vendorKey:'v1',method},...(shared?[{vendorKey:'v2',method}]:[])],requestId:'initial-shipping'});assert.equal(selected.status,200,selected.body);
 const vendor=(await call('POST','channels/alpha/vendor-checkout-link',{vendorId:'v1'},true)).json();
 const vendorState=()=>call('GET','vendor-checkout?code='+vendor.code);
 const buyer=(await vendorState()).json().buyers[0];
 if(method==='card'){
  const card=await call('POST','vendor-checkout/card-link',{code:vendor.code,buyerId:buyer.id,requestId:'initial-card-link',cardNoticeMethod:external?'external':'link',cardPaymentUrl:'https://pay.example.test/old',expectedAmount:buyer.totals.totalAmount});assert.equal(card.status,200,card.body);
 }
 const editor=async()=>{const r=await call('GET','vendor-checkout/shipping-editor?code='+vendor.code+'&buyerId='+buyer.id);assert.equal(r.status,200,r.body);return r.json()};
 const body=async(extra={})=>({code:vendor.code,buyerId:buyer.id,expectedVersion:(await editor()).expectedVersion,requestId:'vendor-shipping-change',destinationId:'pickup-1',pargeRegion:'',pargeShop:'',note:'구매자 섭외 배송업체가 수령 · 배송비 별도 부담',expectedAmount:shared?340000:600000,...extra});
 const save=b=>call('POST','vendor-checkout/shipping-editor',b);
 return{call,link,vendor,buyer,vendorState,editor,body,save,get repo(){return repo},restart(){repo.close();start()}};
}
for(const external of [true,false])test(`vendor changes ${external?'external':'linked'} card shipping to pickup atomically and can resend`,async t=>{
 const f=await fixture(t,{external}),body=await f.body();assert.equal((await f.editor()).shippingAmount,47000);
 const before=await f.repo.listRecords('alpha','notification');
 const results=await Promise.all([f.save(body),f.save(body)]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.deepEqual(results.map(r=>r.json().duplicate).sort(),[false,true]);
 let buyer=results[0].json().buyers[0];assert.equal(buyer.totals.totalAmount,600000);assert.equal(buyer.totals.shippingAmount,0);assert.equal(buyer.payment.cardLinkCancellationRequired,true);assert.equal(buyer.payment.status,'card_link_pending');assert.equal(buyer.payment.cardPaymentUrl,'');
 const rows=await f.repo.listRecords('alpha','shipment');for(const s of rows){assert.equal(s.cost,0);assert.equal(s.method,'pickup');assert.equal(s.address,'로컬 인계점');assert.equal(s.note,body.note);assert.equal(s.paymentRequestedAmount,600000);assert.equal(s.paymentConfirmedAmount,0)}
 assert.deepEqual(await f.repo.listRecords('alpha','notification'),before,'editing sends no extra notification');assert.deepEqual(await f.repo.listRecords('beta','shipment'),[]);
 const publicBuyer=(await f.call('GET','buyer-shipping?code='+f.link.code)).json();assert.equal(publicBuyer.vendors[0].shippingNote,body.note);assert.equal(publicBuyer.totals.totalAmount,600000);
 const items=await f.repo.listRecords('alpha','item'),vendors=await f.repo.listRecords('alpha','vendor');assert.equal(organizerAuctionItems(items,rows,vendors)[0].shippingNote,body.note);
 assert.equal(results[0].json().shippingSettlement.vendors[0].totalAmount,0);
 f.restart();assert.equal((await f.save(body)).json().duplicate,true);assert.equal((await f.editor()).note,body.note);
 const request={code:f.vendor.code,buyerId:f.buyer.id,requestId:'new-card-link',cardPaymentUrl:'https://pay.example.test/new',expectedAmount:600000,expectedVersion:(await f.editor()).expectedVersion};
 assert.equal((await f.call('POST','vendor-checkout/card-link',request)).status,409,'old guide cancellation required');
 buyer=(await f.vendorState()).json().buyers[0];
 assert.equal((await f.call('POST','vendor-checkout/confirm-card-cancellation',{code:f.vendor.code,buyerId:f.buyer.id,confirmed:true,expectedCardCancellationVersion:buyer.payment.cardCancellationVersion})).status,200);
 request.expectedVersion=(await f.editor()).expectedVersion;
 assert.equal((await f.call('POST','vendor-checkout/card-link',request)).status,200);
 const after=await f.repo.listRecords('alpha','shipment');assert.equal((await f.save(body)).json().duplicate,true);assert.deepEqual(await f.repo.listRecords('alpha','shipment'),after);
});
test('note-only edit preserves price, card guide and every payment field',async t=>{
 const f=await fixture(t),before=await f.repo.listRecords('alpha','shipment');
 await f.repo.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{강원:[{shop:'수령점',cost:90000}]}})}]);
 const body=await f.body({destinationId:'parge',pargeRegion:'강원',pargeShop:'수령점',expectedAmount:647000});
 const r=await f.save(body);assert.equal(r.status,200,r.body);
 for(const s of await f.repo.listRecords('alpha','shipment')){const old=before.find(row=>row.id===s.id);assert.deepEqual({...s,note:old.note,updatedAt:old.updatedAt},old)}
 assert.equal(r.json().buyers[0].payment.cardLinkCancellationRequired,false);
});
test('stale data, changed quote, invalid destination and invalid credentials cannot save',async t=>{
 const f=await fixture(t),body=await f.body(),before=await f.repo.listRecords('alpha','shipment');
 for(const [extra,status] of [[{expectedVersion:'stale'},409],[{expectedAmount:1},409],[{destinationId:'not-real'},422],[{note:'x'.repeat(501)},422],[{code:'bad'},401],[{event:'beta'},401],[{buyerId:'someone-else'},404]])assert.equal((await f.save({...body,...extra})).status,status,JSON.stringify(extra));
 assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);
 assert.equal((await f.save(body)).status,200);
 assert.equal((await f.save({...body,note:'changed request'})).status,409,'request IDs cannot be reused for different content');
});
test('another vendor cannot change this buyer records',async t=>{
 const f=await fixture(t),other=(await f.call('POST','channels/alpha/vendor-checkout-link',{vendorId:'v2'},true)).json();
 const before=await f.repo.listRecords('alpha','shipment');assert.equal((await f.save({...await f.body(),code:other.code})).status,404);assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);
});
test('cross-vendor combined delivery is protected but own-vendor memo remains editable',async t=>{
 const f=await fixture(t,{shared:true}),editor=await f.editor();assert.equal(editor.canEditDestination,false);assert.match(editor.lockedReason,/합배송/);
 const before=await f.repo.listRecords('alpha','shipment');assert.equal((await f.save(await f.body())).status,409);
 const r=await f.save(await f.body({destinationId:'parge',pargeRegion:'강원',pargeShop:'수령점'}));assert.equal(r.status,200,r.body);
 const after=await f.repo.listRecords('alpha','shipment');assert.deepEqual(after.find(s=>s.vendorId==='v2'),before.find(s=>s.vendorId==='v2'));assert.match(after.find(s=>s.vendorId==='v1').note,/구매자/);
});
for(const patch of [{paymentStatus:'paid',paymentConfirmedAmount:647000},{paymentStatus:'card_payment_reported'},{trackingNumber:'TRACK'},{status:'shipped'},{paymentConfirmedAmount:1000}])test('payment/shipment lock preserves address but permits notes '+JSON.stringify(patch),async t=>{
 const f=await fixture(t);for(const s of await f.repo.listRecords('alpha','shipment'))await f.repo.upsertRecord('alpha','shipment',{...s,...patch});
 const before=await f.repo.listRecords('alpha','shipment');assert.equal((await f.editor()).canEditDestination,false);assert.equal((await f.save(await f.body())).status,409);
 const r=await f.save(await f.body({destinationId:'parge',pargeRegion:'강원',pargeShop:'수령점',expectedAmount:647000}));assert.equal(r.status,200,r.body);
 for(const s of await f.repo.listRecords('alpha','shipment')){const old=before.find(row=>row.id===s.id);assert.deepEqual({...s,note:old.note,updatedAt:old.updatedAt},old)}
});
test('atomic storage failure rolls back receipt, preference and all item changes',async t=>{
 const f=await fixture(t),body=await f.body(),before=await f.repo.listRecords('alpha','shipment');
 const upsert=f.repo.upsertRows.bind(f.repo);f.repo.upsertRows=rows=>upsert(rows.some(row=>row.key.startsWith('checkout_action_v1::'))?[...rows,{key:{invalid:true},value:'fail'}]:rows);
 assert.equal((await f.save(body)).status,500);assert.deepEqual(await f.repo.listRecords('alpha','shipment'),before);
 f.restart();assert.equal((await f.save(body)).json().duplicate,false);
});
test('payment confirmation racing with destination change accepts only the first version',async t=>{
 for(const confirmFirst of [true,false]){
  const f=await fixture(t),body=await f.body();
  const confirm=()=>f.call('POST','vendor-checkout/confirm-payment',{code:f.vendor.code,buyerId:f.buyer.id,requestId:'racing-confirm',expectedVersion:body.expectedVersion,expectedAmount:647000});
  const result=await Promise.all(confirmFirst?[confirm(),f.save(body)]:[f.save(body),confirm()]);assert.deepEqual(result.map(r=>r.status),[200,409]);
 }
});
test('bank payment fee recalculates, stale buyer save fails, and archive blocks even note edits',async t=>{
 const f=await fixture(t,{method:'bank_transfer'}),before=(await f.call('GET','buyer-shipping?code='+f.link.code)).json();
 const r=await f.save(await f.body());assert.equal(r.status,200,r.body);assert.equal(r.json().buyers[0].payment.status,'bank_transfer_pending');
 const stale=await f.call('POST','buyer-shipping',{code:f.link.code,...before.selection,expectedVersion:before.editVersion,requestId:'old-buyer-save'});assert.equal(stale.status,409);
 const body=await f.body({requestId:'archived-note'});const catalog=await f.repo.getCatalog();await f.repo.saveCatalog(catalog.channels.map(c=>({...c,status:'archived'})));assert.equal((await f.save(body)).status,409);
});
test('UI quote preserves saved fees, computes changed carrier and hides empty notes safely',()=>{
 const context=vm.createContext({window:{CreoCheckoutClient:require('../public/checkout-client')}});vm.runInContext(fs.readFileSync(require.resolve('../public/vendor-shipping-editor.js'),'utf8'),context);
 const {quote,summary}=context.window.CreoVendorShipping;
 const e={selection:{destinationId:'parge',pargeRegion:'강원',pargeShop:'이전점'},shippingAmount:47000,itemCount:2,destinations:[{id:'pickup-1',type:'pickup'}],carriers:{parge:{regions:[{region:'강원',shops:[{name:'신규점',baseCost:30000}]}],additionalFee:7000,jejuAdditionalFee:4000}}};
 assert.equal(quote(e,e.selection),47000);assert.equal(quote(e,{destinationId:'pickup-1'}),0);assert.equal(quote(e,{destinationId:'parge',pargeRegion:'강원',pargeShop:'신규점'}),37000);assert.equal(quote(e,{destinationId:'bad'}),null);
 const buyer={id:'b',canEditShippingNote:true,destination:{address:'로컬점'},shippingNote:'<img onerror=bad>'};assert.match(summary(buyer,{status:'active'}),/data-edit-shipping/);assert.doesNotMatch(summary(buyer,{status:'active'}),/<img/);assert.doesNotMatch(summary(buyer,{status:'archived'}),/data-edit-shipping/);assert.doesNotMatch(summary({...buyer,shippingNote:''},{status:'active'}),/vendor-shipping-note/);
});

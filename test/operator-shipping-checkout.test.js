'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base,item}=require('../tools/national-settlement-fixture.cjs');
const pricing=require('../public/operator-shipping-pricing');
const route='/channels/national-cre/buyer-shipping-editor';
async function fixture(t) {
    const f=await base();t.after(()=>f.close());
    const catalog=await f.repository.getCatalog();await f.repository.saveCatalog(catalog.channels.map(c=>({...c,shippingSupport:{enabled:false}})));
    const vendor=await f.repository.getRecord('national-cre','vendor','v2');await f.repository.upsertRecord('national-cre','vendor',{...vendor,paymentMethods:['bank_transfer','card']});
    f.saveBody.payments[1].method='card';
    assert.equal((await f.request('POST','/buyer-shipping',f.saveBody,false)).status,200);
    for(const row of await f.repository.listRecords('national-cre','shipment'))if(row.vendorId==='v2')await f.repository.upsertRecord('national-cre','shipment',{...row,paymentStatus:'card_payment_pending',cardPaymentUrl:'https://pay.example.test/old',cardLinkPreparedAt:'2026-10-14T01:00:00Z'});
    f.editor=async()=>{const r=await f.request('GET',route+'?itemId=a01');assert.equal(r.status,200,r.body);return r.json()};
    f.body=async(extra={})=>({itemId:'a01',expectedArchiveId:'',expectedVersion:(await f.editor()).editVersion,requestId:'operator-save-0001',shipping:{type:'배송',company:'파르게',region:'수도권',hub:'가상 정거샵'},note:'수령 메모',expectedAmount:333000,...extra});
    f.save=body=>f.request('POST',route,body);
    f.rows=()=>f.repository.listRecords('national-cre','shipment');
    return f;
}

test('operator list uses each saved quote: A 26,000 + B 7,000, never 22,000 + 11,000',async t=>{
    const f=await fixture(t),payload=await f.editor(),items=await f.repository.listRecords('national-cre','item'),rows=await f.rows();
    const projected=items.map(i=>({...i,company:i.vendorId,_checkoutShipment:rows.find(s=>s.itemId===i.id)}));
    const actual=pricing.calculate(projected,{}, {'파르게':{regions:{수도권:[{shop:'가상 정거샵',cost:90000}]}}});
    assert.deepEqual(actual,{companies:{v1:26000,v2:7000},total:33000});
    assert.deepEqual(payload.vendors.map(v=>v.totals.totalAmount),[226000,107000]);
    const reversed=pricing.calculate([...projected].reverse(),{},{});assert.deepEqual(reversed.companies,actual.companies);
});

test('unchanged destination preserves fees, payment reports and other-vendor notes after rate changes',async t=>{
    const f=await fixture(t);
    for(const s of await f.rows())await f.repository.upsertRecord('national-cre','shipment',{...s,note:'기존 '+s.vendorId,...(s.vendorId==='v1'?{paymentStatus:'bank_transfer_reported',buyerPaymentReportedAt:'2026-10-14T01:00:00Z',buyerPaymentReportRequestId:'reported'}:{})});
    const before=await f.rows();
    await f.repository.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{수도권:[{shop:'가상 정거샵',cost:90000}]}})}]);
    const body=await f.body(),quote=await f.save({...body,action:'quote'});assert.equal(quote.status,200,quote.body);assert.equal(quote.json().totals.totalAmount,333000);assert.deepEqual(await f.rows(),before);
    const res=await f.save(body);assert.equal(res.status,200,res.body);
    for(const row of await f.rows()) {const old=before.find(s=>s.id===row.id);assert.deepEqual({...row,note:old.note,updatedAt:old.updatedAt},old);assert.equal(row.note,row.vendorId==='v1'?body.note:old.note)}
    assert.equal((await f.read()).json().vendors[0].payment.status,'bank_transfer_reported');
});

test('cross-vendor destination change is atomic, reprices canonically and retires the old card guide',async t=>{
    const f=await fixture(t),body=await f.body({shipping:{type:'직접수령',region:'현장 수령'},expectedAmount:300000}),notifications=await f.repository.listRecords('national-cre','notification');
    const results=await Promise.all([f.save(body),f.save(body)]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.deepEqual(results.map(r=>r.json().duplicate).sort(),[false,true]);
    const rows=await f.rows();for(const row of rows){assert.equal(row.cost,0);assert.equal(row.address,'현장 수령');assert.equal(row.method,'pickup')}
    const card=rows.find(row=>row.vendorId==='v2');assert.equal(card.paymentRequestedAmount,100000);assert.equal(card.cardPaymentUrl,'');assert.equal(card.cardLinkCancellationRequired,true);
    assert.equal((await f.read()).json().totals.totalAmount,300000);
    assert.deepEqual(await f.repository.listRecords('national-cre','notification'),notifications);
    assert.deepEqual(await f.repository.listRecords('creyon','shipment'),[]);
    f.restart();assert.equal((await f.save(body)).json().duplicate,true);assert.deepEqual(await f.rows(),rows);
    assert.equal((await f.save({...body,note:'다른 메모'})).status,409);
});

test('stale selection, stale total, invalid destination and missing round fail without writes',async t=>{
    const f=await fixture(t),body=await f.body(),before=await f.rows();
    for(const [extra,status] of [[{expectedVersion:'stale'},409],[{expectedAmount:1},409],[{shipping:{type:'직접수령',region:'없는곳'}},422],[{expectedArchiveId:null},409],[{itemId:'missing'},409],[{note:'x'.repeat(501)},422]]) {
        const r=await f.save({...body,...extra});assert.equal(r.status,status,r.body);assert.deepEqual(await f.rows(),before);
    }
    assert.equal((await f.request('POST',route,body,false)).status,401);
});

test('older round editor cannot change current round and vice versa',async t=>{
    const f=await fixture(t);
    await f.repository.upsertRecord('national-cre','archive',{id:'older',closedAt:'2026-10-14T16:00:00Z',title:'14일'});
    for(const old of await f.repository.listRecords('national-cre','item'))await f.repository.upsertRecord('national-cre','item',{...old,auctionArchiveId:'older'});
    await f.repository.upsertRecord('national-cre','item',item('new21','v1',{attributes:{broadcastDate:'2026-10-21'}}));
    assert.equal((await f.request('GET',route+'?itemId=a01')).status,409);
    const before=await f.rows(),old=(await f.request('GET',route+'?itemId=a01&archive=older')).json();
    const body={itemId:'a01',expectedArchiveId:'older',expectedVersion:old.editVersion,requestId:'older-round-note',shipping:{type:'배송',company:'파르게',region:'수도권',hub:'가상 정거샵'},note:'지난 회차 메모',expectedAmount:333000};
    const res=await f.save(body);assert.equal(res.status,200,res.body);
    assert.equal((await f.rows()).length,before.length);assert.ok(!(await f.rows()).some(s=>s.itemId==='new21'));
    assert.equal((await f.save({...body,itemId:'new21',requestId:'wrong-round-save'})).status,409);
});

test('payment confirmation racing with operator change accepts only the first version',async t=>{
    for(const confirmFirst of [true,false]) {
        const f=await fixture(t),body=await f.body({shipping:{type:'직접수령',region:'현장 수령'},expectedAmount:300000});
        const confirm=()=>f.request('POST','/channels/national-cre/buyer-shipping-payment',{itemId:'a01',requestId:'racing-payment-confirm',expectedVersion:body.expectedVersion,expectedAmount:226000});
        const results=await Promise.all(confirmFirst?[confirm(),f.save(body)]:[f.save(body),confirm()]);assert.deepEqual(results.map(r=>r.status),[200,409],results.map(r=>r.body).join('\n'));
    }
});

test('transaction failure rolls back all vendors, destination and receipt, allowing retry',async t=>{
    const f=await fixture(t),body=await f.body({shipping:{type:'직접수령',region:'현장 수령'},expectedAmount:300000}),before=await f.rows();
    const upsert=f.repository.upsertRows.bind(f.repository);f.repository.upsertRows=rows=>upsert(rows.some(row=>row.key.startsWith('checkout_action_v1::'))?[...rows,{key:{invalid:true},value:'fail'}]:rows);
    assert.equal((await f.save(body)).status,500);assert.deepEqual(await f.rows(),before);
    f.repository.upsertRows=upsert;f.restart();const retry=await f.save(body);assert.equal(retry.status,200,retry.body);assert.equal(retry.json().duplicate,false);
});

test('reported bank quote remains reviewable when destination changes, paid amounts cannot silently change',async t=>{
    const f=await fixture(t);
    for(const row of await f.rows())if(row.vendorId==='v1')await f.repository.upsertRecord('national-cre','shipment',{...row,paymentStatus:'bank_transfer_reported',buyerPaymentReportedAt:'2026-10-14T01:00:00Z'});
    let body=await f.body({shipping:{type:'직접수령',region:'현장 수령'},expectedAmount:300000});assert.equal((await f.save(body)).status,200);
    const reported=(await f.rows()).find(s=>s.vendorId==='v1');assert.equal(reported.paymentRequestedAmount,226000);assert.equal(reported.shippingChangedAfterReport,true);assert.equal(reported.paymentStatus,'bank_transfer_reported');
    for(const row of await f.rows())if(row.vendorId==='v1')await f.repository.upsertRecord('national-cre','shipment',{...row,paymentStatus:'paid',paymentConfirmedAmount:200000,paymentConfirmedAt:'2026-10-14T02:00:00Z'});
    body=await f.body({requestId:'paid-reprice-request'});const before=await f.rows();assert.equal((await f.save(body)).status,409);assert.deepEqual(await f.rows(),before);
});

test('manual handoff and Wrapang keep their distinct shipping prices in checkout',async t=>{
    for(const wrapang of [false,true]) {
        const f=await fixture(t);
        await f.repository.upsertRows([{key:'shipping_rate_wrapang',value:JSON.stringify({data:{서울:[{shop:'테스트 랩팡점',cost:25000}]}})}]);
        const shipping=wrapang?{type:'배송',company:'랩팡',region:'서울',hub:'테스트 랩팡점',address:'서울 (테스트 랩팡점)'}:{type:'배송',company:'구매자 요청 배송',address:'별도 협의 수령지'};
        const amount=wrapang?339000:300000,body=await f.body({shipping,expectedAmount:amount});
        const quote=await f.save({...body,action:'quote'});assert.equal(quote.status,200,quote.body);assert.equal(quote.json().totals.totalAmount,amount);
        const saved=await f.save(body);assert.equal(saved.status,200,saved.body);assert.equal((await f.read()).json().totals.totalAmount,amount);
        if(wrapang)assert.deepEqual((await f.rows()).sort((a,b)=>a.itemLotNumber-b.itemLotNumber).map(s=>s.cost),[25000,7000,7000]);
    }
});

test('newly won item uses canonical additional fee without changing earlier saved quotes',async t=>{
    const f=await fixture(t),items=await f.repository.listRecords('national-cre','item'),rows=await f.rows();
    const added=item('a04','v1',{lotNumber:4}),projected=[...items,added].map(i=>({...i,company:i.vendorId,_checkoutShipment:rows.find(s=>s.itemId===i.id)}));
    const result=pricing.calculate(projected,{}, {'파르게':{regions:{수도권:[{shop:'가상 정거샵',cost:19000}]}}});
    assert.deepEqual(result.companies,{v1:33000,v2:7000});
});

test('legacy destinations use canonical lookup while submitted zero-fee quotes stay zero',()=>{
    const items=[{id:'one',lotNumber:1,company:'A',_checkoutShipment:{itemId:'one',method:'delivery',carrier:'파르게',address:'서울 (수령점)',cost:9000}},{id:'two',lotNumber:2,company:'B'}];
    const data={'파르게':{regions:{서울:[{shop:'수령점',cost:19000}]}}};
    assert.deepEqual(pricing.calculate(items,{},data).companies,{A:19000,B:7000});
    items[0]._checkoutShipment.buyerSubmittedAt='2026-10-14';items[0]._checkoutShipment.cost=0;
    assert.deepEqual(pricing.calculate(items,{},data).companies,{A:0,B:7000});
});

test('a later fee change invalidates an earlier preview without partial writes',async t=>{
    const f=await fixture(t);
    await f.repository.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{수도권:[{shop:'가상 정거샵',cost:19000},{shop:'신규점',cost:15000}]}})}]);
    const body=await f.body({shipping:{type:'배송',company:'파르게',region:'수도권',hub:'신규점'},expectedAmount:329000});
    assert.equal((await f.save({...body,action:'quote'})).json().totals.totalAmount,329000);
    const before=await f.rows();await f.repository.upsertRows([{key:'shipping_rate_parge',value:JSON.stringify({data:{수도권:[{shop:'신규점',cost:18000}]}})}]);
    assert.equal((await f.save(body)).status,409);assert.deepEqual(await f.rows(),before);
});

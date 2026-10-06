'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../shipping-destination-history');
const carriers={parge:{regions:[{region:'서울',shops:[{name:'수령점'}]},{region:'인천',shops:[{name:'다른 수령점'}]}]},dodosi:{regions:[{region:'경기',shops:[{name:'정거샵'}]}]}};
const raw=(id,extra={})=>({id,status:'낙찰',winner_phone:'01012345678',shipping_type:'배송',shipping_company:'파르게',shipping_region:'서울 (수령점)',updated_at:'2026-09-01T10:00:00Z',...extra});
const saved=extra=>({id:'old',recipientPhone:'01012345678',carrier:'파르게',address:'서울 (수령점)',status:'complete',updatedAt:'2026-09-01T10:00:00Z',...extra});

test('only a complete domestic or international phone can match a historical recipient',()=>{
 for(const phone of ['01012345678','010-1234-5678','+82 10-1234-5678'])assert.equal(H.fullPhone(phone),'01012345678');
 for(const phone of ['12345678','5678','구매자 5678','',null])assert.equal(H.fullPhone(phone),'');
});

test('old destination labels resolve only to one currently available receiving shop',()=>{
 for(const address of ['수령점','서울 (수령점)','서울·수령점'])assert.equal(H.reusableDestination(saved({address}),'new',[],carriers).pargeShop,'수령점');
 assert.equal(H.reusableDestination(saved({destinationType:'parge',pargeRegion:'서울특별시',pargeShop:'수령점'}),'new',[],carriers).pargeRegion,'서울');
 assert.equal(H.reusableDestination(saved({address:'비슷한 수령점'}),'new',[],carriers),null);
 assert.equal(H.reusableDestination(saved({address:'폐점'}),'new',[],carriers),null);
 assert.equal(H.reusableDestination(saved({}),'new',[],{}),null);
 const ambiguous={parge:{regions:[{region:'서울',shops:[{name:'동명점'}]},{region:'경기',shops:[{name:'동명점'}]}]}};
 assert.equal(H.reusableDestination(saved({address:'동명점'}),'new',[],ambiguous),null);
 assert.equal(H.reusableDestination(saved({address:'경기 (동명점)'}),'new',[],ambiguous).pargeRegion,'경기');
});

test('unusable latest records fall back chronologically without changing source history',()=>{
 const rows=[saved({id:'old',updatedAt:'2026-08-01T00:00:00Z'}),saved({id:'new',address:'다른 수령점',updatedAt:'2026-09-01T00:00:00+09:00'}),saved({id:'cancelled',updatedAt:'2026-10-01',status:'cancelled'}),saved({id:'closed',address:'폐점',updatedAt:'2026-10-02'}),saved({id:'pickup',destinationType:'pickup',destinationId:'pickup-1',sourceChannelId:'old',address:'행사장',updatedAt:'2026-10-03'})];
 const original=structuredClone(rows),result=H.latestDestination(rows,'new',[{id:'pickup-1',label:'행사장'}],carriers);
 assert.equal(result.destination.pargeShop,'다른 수령점');assert.equal(result.recordedAt,'2026-09-01T00:00:00+09:00');assert.deepEqual(rows,original);
 assert.equal(H.reusableDestination(saved({paymentStatus:'환불 완료'}),'new',[],carriers),null);
 assert.equal(H.reusableDestination(saved({status:'낙찰취소'}),'new',[],carriers),null);
 assert.equal(H.reusableDestination(rows.at(-1),'old',[{id:'pickup-1',label:'행사장'}],carriers).destinationType,'pickup');
});

test('legacy reader includes paginated live rows and all indexed archives without unrelated personal or payment fields',async()=>{
 const items=[raw('one'),raw('other',{winner_phone:'01099998888'}),raw('partial',{winner_phone:'12345678'}),raw('cancel',{status:'낙찰취소'}),raw('pickup',{shipping_type:'직접수령'}),raw('waiting',{status:'대기'})],requests=[],signals=[];
 const snapshots={auction_archive_first:JSON.stringify({createdAt:'2026-08-01',items:[raw('archived',{shipping_company:'도도시',shipping_region:'경기 (정거샵)',updated_at:'',winner_phone:'+82 10-1234-5678',winner_name:'DO NOT COPY',sold_price:123456,account:'PRIVATE'})]}),auction_archive_second:JSON.stringify({createdAt:'2026-08-02',items:[raw('paid',{status:'입금완료'})]})};
 const repository={request:async(query,{signal})=>{requests.push(query);signals.push(signal);const params=new URL('https://test.invalid/'+query).searchParams;return items.slice(Number(params.get('offset')),Number(params.get('offset'))+Number(params.get('limit')));},getRowsByKeys:async(keys,{signal})=>{signals.push(signal);if(keys[0]==='auction_archive_index')return [{key:keys[0],value:JSON.stringify([{id:'first'},{id:'second'},{id:'first'},{id:'bad/id'}])}];assert.deepEqual(keys,['auction_archive_first','auction_archive_second']);return keys.map(key=>({key,value:snapshots[key]}));}};
 const read=H.createLegacyShippingHistory({repository,pageSize:2});assert.deepEqual(await read(new Set()),[]);assert.equal(requests.length,0);
 const records=await read(new Set(['01012345678']));assert.deepEqual(records.map(r=>r.id),['one','archived','paid']);assert.equal(records[1].updatedAt,'2026-08-01');assert.equal(records[1].sourceChannelId,'legacy-cdcup:auction_archive_first');assert.ok(records.every(r=>r.recipientPhone==='01012345678'));
 assert.doesNotMatch(JSON.stringify(records),/DO NOT COPY|PRIVATE|123456,|sold_price|winner_name|account/);assert.equal(requests.length,4);assert.ok(requests.every(q=>q.includes('select=id,status,winner_phone,shipping_type,shipping_company,shipping_region,updated_at')&&!q.includes('select=*')));assert.ok(signals.every(signal=>signal===signals[0]));
 assert.deepEqual(await read(new Set(['12345678'])),[]);assert.deepEqual((await read(new Set(['01099998888']))).map(r=>r.id),['other']);assert.equal(requests.length,4);
});

test('concurrent callers share a read but get separate phone-scoped copies, refreshed after expiry',async()=>{
 let clock=0,calls=0,release;const gate=new Promise(resolve=>release=resolve);
 const repository={request:async()=>{calls++;await gate;return [raw('one'),raw('two',{winner_phone:'01099998888'})];},getRowsByKeys:async()=>[]};
 const read=H.createLegacyShippingHistory({repository,now:()=>clock,cacheMs:30});
 const first=read(new Set(['01012345678'])),second=read(new Set(['01099998888']));release();const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);assert.equal(a[0].id,'one');assert.equal(b[0].id,'two');
 a[0].address='changed';assert.notEqual((await read(new Set(['01012345678'])))[0].address,'changed');assert.equal(calls,1);
 clock=31;await read(new Set(['01012345678']));assert.equal(calls,2);
});

test('failed refresh never serves stale history and retries on the next request',async()=>{
 let clock=0,fail=false,calls=0;
 const repository={request:async()=>{calls++;if(fail)throw Error('offline');return [raw('one')];},getRowsByKeys:async()=>[]};
 const read=H.createLegacyShippingHistory({repository,now:()=>clock,cacheMs:30});await read(new Set(['01012345678']));clock=31;fail=true;
 await assert.rejects(read(new Set(['01012345678'])),/offline/);fail=false;assert.equal((await read(new Set(['01012345678']))).length,1);assert.equal(calls,3);
});

test('a malformed archive is skipped without suppressing valid past deliveries',async()=>{
 const warnings=[],repository={request:async()=>[raw('one')],getRowsByKeys:async keys=>keys[0]==='auction_archive_index'?[{key:keys[0],value:'[{"id":"bad"},{"id":"good"}]'}]:[{key:'auction_archive_bad',value:'broken'},{key:'auction_archive_good',value:JSON.stringify({items:[raw('archive')]})}]};
 const read=H.createLegacyShippingHistory({repository,logger:{warn:message=>warnings.push(message)}});assert.deepEqual((await read(new Set(['01012345678']))).map(r=>r.id),['one','archive']);assert.equal(warnings.length,1);
});

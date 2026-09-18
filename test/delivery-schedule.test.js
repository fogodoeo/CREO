'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../delivery-schedule-core');
const { createDeliveryScheduleService, KEY } = require('../delivery-schedule-service');
const now = Date.parse('2026-09-18T00:00:00Z');
const checkedAt = new Date(now).toISOString();
const config = { enabled: true, auctionDate: '2026-09-17', pargeOrigin: '대구 출발점', dodosiOrigin: '대구 출발점' };
function parge() { return { ratePayload:{data:{서울:[{shop:'서울 도착점',cost:30000}]}},checkedAt, partners: [{ name: '대구 출발점', region: '대구/경북/부산/경남' }, { name: '서울 도착점', region: '서울/경기/인천' }, { name: '광주 도착점', region: '전라/광주' }, { name: '제주 도착점', region: '제주도' }], schedules: [{partnerName:'대구 출발점',region:'경상권',pickupDayLabel:'토요일',collectDayLabel:'월요일',deliveryDayLabel:'화요일'}], regionDays: {capital:[4],jeolla:[0]},jejuSaturdayFrom:'2026-09-19' }; }
function dodosi() { return { ratePayload:{items:[{route:'서울A',shop:'도착점',price:30000}]},checkedAt, origins: [{name:'대구 출발점',collectDays:[3,0],vacationStart:'2026-09-24',vacationEnd:'2026-09-27',destinations:[
    {label:'서울 방배 - 도착점',route:'서울A',arrivalDays:[2,6],transitDays:1,closedDays:[1],vacationStart:'2026-09-24',vacationEnd:'2026-09-27'},
    {label:'양산 물금 - 도착점',route:'경상B',arrivalDays:[4,0],transitDays:3,vacationStart:'2026-09-24',vacationEnd:'2026-09-27'},
    {label:'제주 - 도착점',route:'제주',arrivalDays:[4],arrivalWeeks:[2,4],transitDays:1}
] }] }; }
const estimate = (carrier = 'parge', extra = {}) => Core.estimate({ config, carrier, source: carrier === 'parge' ? parge() : dodosi(), destination: carrier === 'parge' ? {region:'서울/경기/인천',shop:'서울 도착점'} : {region:'서울A',shop:'서울 방배 - 도착점'}, now, ...extra });

test('uses collection after auction, not the customer drop-off day', () => {
    assert.deepEqual(estimate(), {status:'estimated',dispatchDate:'2026-09-21',arrivalDate:'2026-09-24',checkedAt});
    const sunday = estimate('parge',{destination:{region:'전라/광주',shop:'광주 도착점'}});
    assert.equal(sunday.arrivalDate,'2026-09-27');
    assert.ok(sunday.arrivalDate > sunday.dispatchDate);
    assert.equal(estimate('parge',{config:{...config,auctionDate:'2026-09-20'}}).dispatchDate,'2026-09-21');
});
test('Dodosi starts from the next collection and applies route transit and holidays', () => {
    assert.deepEqual(estimate('dodosi'),{status:'estimated',dispatchDate:'2026-09-20',arrivalDate:'2026-09-22',checkedAt});
    assert.equal(estimate('dodosi',{destination:{region:'경상B',shop:'양산 물금 - 도착점'}}).reason,'holiday_or_route');
    const data=dodosi();delete data.origins[0].destinations[1].vacationStart;
    assert.equal(estimate('dodosi',{source:data,destination:{region:'경상B',shop:'양산 물금 - 도착점'}}).arrivalDate,'2026-09-24');
});
test('each provider applies its own Jeju rule after collection', () => {
    assert.equal(estimate('parge',{destination:{region:'제주도',shop:'제주 도착점'}}).arrivalDate,'2026-09-26');
    assert.equal(estimate('dodosi',{destination:{region:'제주',shop:'제주 - 도착점'}}).arrivalDate,'2026-09-24');
    assert.equal(Core.nextDay('2026-09-25',[4],{weeks:[2,4]}),'2026-10-08');
    const source=parge();source.partners[0].region='제주도';
    const outbound=estimate('parge',{source});
    assert.equal(outbound.dispatchDate,'2026-09-19');assert.equal(outbound.arrivalDate,'2026-09-24');
});
test('shop-specific Parge arrival takes precedence over regional days', () => {
    const source=parge();source.schedules.push({partnerName:'서울 도착점',deliveryDayLabel:'금요일'});
    assert.equal(estimate('parge',{source}).arrivalDate,'2026-09-25');
});
test('pickup, disabled configuration, missing destinations and unknown identities never get guessed dates', () => {
    assert.equal(estimate('pickup'),null);
    assert.equal(estimate('parge',{config:{enabled:false}}),null);
    assert.equal(estimate('parge',{destination:null}),null);
    assert.equal(estimate('parge',{destination:{shop:'서울 도착점',region:'제주'}}).status,'review');
    assert.equal(estimate('dodosi',{destination:{shop:'서울 방배 - 도착점',region:'서울B'}}).status,'review');
    const data=dodosi();data.origins.push(structuredClone(data.origins[0]));
    assert.equal(estimate('dodosi',{source:data}).reason,'location');
});
test('invalid dates, stale data and future timestamps fail closed', () => {
    assert.equal(Core.date('2026-02-30'),'');assert.equal(Core.date('2028-02-29'),'2028-02-29');
    assert.equal(Core.add('2028-02-28',1),'2028-02-29');assert.equal(Core.add('2026-12-31',1),'2027-01-01');
    assert.equal(estimate('parge',{config:{...config,auctionDate:'2026-02-30'}}).reason,'configuration');
    assert.equal(estimate('parge',{now:now+4*Core.DAY}).reason,'schedule_unavailable');
    assert.equal(estimate('parge',{source:{...parge(),checkedAt:'bad'}}).reason,'schedule_unavailable');
    assert.equal(estimate('parge',{now:now-Core.DAY}).reason,'schedule_unavailable');
});
test('unknown weekday text is not treated as an arbitrary delivery day', () => {
    assert.deepEqual(Core.weekdays('수/목요일'),[3,4]);assert.deepEqual(Core.weekdays('화.토'),[2,6]);
    assert.deepEqual(Core.weekdays('일정 확인 필요'),[]);assert.deepEqual(Core.weekdays('월요일'),[1]);
});
test('late registration uses KST boundary and does not silently move a round', () => {
    assert.equal(estimate('dodosi',{submittedAt:'2026-09-19T14:59:00Z'}).status,'estimated');
    assert.equal(estimate('dodosi',{submittedAt:'2026-09-19T15:00:00Z'}).reason,'late_registration');
    assert.equal(estimate('dodosi',{config:{...config,dodosiDispatchDate:'2026-09-23'},submittedAt:'2026-09-20T10:00:00Z',destination:{region:'제주',shop:'제주 - 도착점'}}).dispatchDate,'2026-09-23');
});
test('repeat reads, time passing and another channel do not change the original round', () => {
    const source=parge(), before=JSON.stringify(source), first=estimate('parge',{source});
    for(let i=0;i<80;i++)assert.deepEqual(estimate('parge',{source}),first);
    assert.equal(estimate('parge',{source,now:now+2*Core.DAY}).dispatchDate,first.dispatchDate);
    assert.equal(estimate('parge',{config:{...config,auctionDate:'2026-09-21'}}).dispatchDate,'2026-09-28');
    assert.equal(JSON.stringify(source),before);
});
test('closed-day adjustment cannot move arrival before necessary transit', () => {
    const source=dodosi();source.origins[0].destinations[0].arrivalDays=[1];source.origins[0].destinations[0].closedDays=[1];
    assert.equal(estimate('dodosi',{source}).reason,'holiday_or_route');
});

function repository() {
    const rows=new Map();let writes=0;
    return {rows,get writes(){return writes},async getRowsByKeys(keys){return keys.filter(k=>rows.has(k)).map(key=>({key,value:rows.get(key)}))},async upsertRows(input){writes++;for(const r of input)rows.set(r.key,r.value)},async getCatalog(){return{channels:[{id:'test',status:'active',dataAdapter:'platform',shippingDefaults:{enabledCarriers:['parge','dodosi'],deliverySchedule:config}}]}}};
}
test('concurrent refresh and 80 page reads share data; reload uses durable data without provider requests', async () => {
    const repo=repository();let calls=0;const reader={async parge(){calls++;return parge()},async dodosi(){calls++;return dodosi()}};
    const service=createDeliveryScheduleService({repository:repo,reader,now:()=>now});
    await Promise.all([service.refresh(),service.refresh(),service.refresh()]);assert.equal(calls,2);assert.equal(repo.writes,3);
    const channel={shippingDefaults:{deliverySchedule:config}},selection={destinationType:'parge',pargeRegion:'서울/경기/인천',pargeShop:'서울 도착점'};
    const values=await Promise.all(Array.from({length:80},()=>service.estimate(channel,selection)));assert.ok(values.every(v=>v.arrivalDate==='2026-09-24'));assert.equal(calls,2);assert.equal(repo.writes,3);
    const restarted=createDeliveryScheduleService({repository:repo,reader,now:()=>now});
    assert.deepEqual(await restarted.estimate(channel,selection),values[0]);assert.equal(calls,2);assert.equal(restarted.revision(),service.revision());
    await service.stop();await restarted.stop();
});
test('source/storage failure preserves last good schedule and respects backoff', async () => {
    const repo=repository();let clock=now,calls=0,fail=false;
    const reader={async parge(){calls++;if(fail)throw Error('offline');return parge()},async dodosi(){calls++;if(fail)throw Error('offline');return dodosi()}};
    const service=createDeliveryScheduleService({repository:repo,reader,now:()=>clock,logger:{warn(){}}});
    await service.refresh();const before=repo.rows.get(KEY);clock+=Core.DAY+1;fail=true;
    await service.refresh();assert.equal(repo.rows.get(KEY),before);const attempts=calls;await service.refresh();assert.equal(calls,attempts);
    clock+=3600001;fail=false;repo.upsertRows=async()=>{throw Error('disk full')};await service.refresh();assert.equal(repo.rows.get(KEY),before);
    await service.stop();
});
test('normalization preserves settings on partial channel edits and keeps legacy defaults unchanged', () => {
    const {normalizeChannel}=require('../platform-core');
    const first=normalizeChannel({id:'test',shippingDefaults:{deliverySchedule:config}});
    assert.deepEqual(normalizeChannel({name:'renamed'},first).shippingDefaults.deliverySchedule,first.shippingDefaults.deliverySchedule);
    assert.equal(normalizeChannel({id:'old'}).shippingDefaults.deliverySchedule,undefined);
});
test('shared rates refresh without auctions; new origins refresh despite a fresh shared cache', async () => {
    const repo=repository(),catalog=await repo.getCatalog();let enabled=false,calls=0;
    repo.getCatalog=async()=>enabled?catalog:{channels:[]};
    const service=createDeliveryScheduleService({repository:repo,now:()=>now,reader:{async parge(){calls++;return parge()},async dodosi(origins){calls++;return {...dodosi(),origins:origins.map(name=>({...dodosi().origins[0],name}))}}}});
    await service.refresh();assert.equal(calls,2);enabled=true;
    for(const carrier of ['parge','dodosi'])await service.enrichRates(catalog.channels[0],carrier,[]);
    await service.refresh();assert.equal(calls,3);await service.stop();
});
test('shutdown aborts an in-flight schedule request without persisting partial data', async () => {
    const repo=repository();let began;const started=new Promise(resolve=>began=resolve);
    const service=createDeliveryScheduleService({repository:repo,now:()=>now,logger:{warn(){}},reader:{parge(_origins,{signal}){began();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))}}});
    const job=service.refresh();await started;await service.stop();await job;assert.equal(repo.writes,0);
});
test('changing destination after collection cannot borrow an earlier registration date', async () => {
    const repo=repository(),source=parge(),clock=now+4*Core.DAY;source.checkedAt=new Date(clock).toISOString();
    repo.rows.set(KEY,JSON.stringify({version:1,sources:{parge:source}}));
    const service=createDeliveryScheduleService({repository:repo,now:()=>clock});
    const rows=await service.enrichRates({shippingDefaults:{deliverySchedule:config}},'parge',[{region:'서울/경기/인천',shops:[{name:'서울 도착점'}]},{region:'전라/광주',shops:[{name:'광주 도착점'}]}],checkedAt,{destinationType:'parge',pargeRegion:'서울/경기/인천',pargeShop:'서울 도착점'});
    assert.equal(rows[0].shops[0].deliverySchedule.status,'estimated');assert.equal(rows[1].shops[0].deliverySchedule.reason,'late_registration');await service.stop();
});

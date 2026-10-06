'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../public/broadcast-inbound-core'),data=require('../public/broadcast-inbound-data.json');
const today='2026-10-05',o=(shop,area='')=>data.dodosi.origins.find(r=>r.shop===shop&&(!area||r.area===area));
test('October 14 and 19 require the same October 11 PARGE application; later collection misses Monday',()=>{
 for(const date of ['2026-10-14','2026-10-19']){const p=Core.forVendor(data,'parge','서울','',date,today);assert.equal(p.actionDate,'2026-10-11');assert.equal(p.departureDate,'2026-10-12');assert.equal(p.arrivalDate,'2026-10-13');}
 const p=Core.forVendor(data,'parge','경기','', '2026-10-19','2026-10-12');assert.equal(p.status,'missed');
});
test('DODOSI permits broadcast-day arrival but still follows the actual departure legs',()=>{
 const p=Core.plan(data,'dodosi',o('드래곤길들이기'),'2026-10-14',today);assert.equal(p.actionDate,'2026-10-12');assert.equal(p.departureDate,'2026-10-13');assert.equal(p.arrivalDate,'2026-10-14');
 const monday=Core.plan(data,'dodosi',o('드래곤길들이기'),'2026-10-19',today);assert.equal(monday.actionDate,'2026-10-16');assert.equal(monday.arrivalDate,'2026-10-18');
 const cheongju=Core.plan(data,'dodosi',o('세븐디가든'),'2026-10-19',today);assert.equal(cheongju.actionDate,'2026-10-13');assert.equal(cheongju.departureDate,'2026-10-14');assert.equal(cheongju.arrivalDate,'2026-10-18');
 const holiday=Core.plan(data,'dodosi',o('디어렙(청주)'),'2026-10-19',today);assert.equal(holiday.actionDate,'2026-10-12');assert.equal(holiday.arrivalDate,'2026-10-18');
});
test('source conflicts, missing shops, Jeju weeks and ambiguous regional schedules require confirmation',()=>{
 for(const shop of ['그로브비','티그리스게코(제주)'])assert.equal(Core.plan(data,'dodosi',o(shop),'2026-10-19',today).status,'review');
 assert.equal(Core.forVendor(data,'dodosi','전라·충청','', '2026-10-21',today).status,'review');
 assert.equal(Core.forVendor(data,'dodosi','서울','not-a-shop','2026-10-14',today).status,'review');
 assert.equal(Core.forVendor(data,'parge','전라·충청','parge-chungcheong','2026-10-21',today).status,'review');
 assert.equal(Core.forVendor(data,'dodosi','서울',o('세븐디가든').id,'2026-10-14',today).status,'review');
});
test('all confirmed routes preserve order across month/year boundaries and before/at/after deadlines',()=>{
 for(const carrier of ['parge','dodosi'])for(const origin of data[carrier].origins)for(const date of ['2026-10-14','2026-11-02','2027-01-04']){
  const p=Core.plan(data,carrier,origin,date,today);if(p.status==='review')continue;
  assert.ok(p.actionDate<=p.departureDate);assert.ok(p.departureDate<p.arrivalDate);assert.ok(p.arrivalDate<=Core.add(date,-(data[carrier].arrivalBufferDays??data.arrivalBufferDays)));
  assert.equal(Core.plan(data,carrier,origin,date,p.actionDate).status,'today');
  assert.equal(Core.plan(data,carrier,origin,date,Core.add(p.actionDate,1)).status,'missed');
 }
 assert.equal(Core.valid('2026-02-30'),false);assert.equal(Core.plan(data,'dodosi',o('세븐디가든'),'2026-02-30',today).status,'review');
});
test('vacations do not count as available DODOSI hand-in or departure dates',()=>{
 const origin={...o('드래곤길들이기'),vacationStart:'2026-10-09',vacationEnd:'2026-10-13'};
 const p=Core.plan(data,'dodosi',origin,'2026-10-14',today);assert.ok(p.actionDate<origin.vacationStart);
});
test('Gimhae departure shops belong to the Gyeongnam vendor region',()=>{
 const gimhae=data.parge.origins.find(o=>o.shop.includes('김해'));assert.ok(gimhae);
 assert.ok(Core.origins(data,'parge','부산·울산·경남').includes(gimhae));
 assert.ok(!Core.origins(data,'parge','대구·경북').includes(gimhae));
});

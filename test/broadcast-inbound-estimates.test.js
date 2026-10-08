'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../public/broadcast-inbound-core'),Origin=require('../public/broadcast-origin-core'),data=require('../public/broadcast-inbound-data.json');
const today='2026-10-06';
const vendor=(region,address='',name='가상 업체',inboundOrigins={})=>({name,region,locality:Origin.locality(data,address,region),inboundOrigins});
const estimate=(carrier,v,date,day=today)=>Core.forSelection(data,carrier,v.region,Origin.options(data,carrier,v),date,day);
test('unselected regions never inherit one shop deadline and instead compare latest feasible real-shop services',()=>{
 for(const region of ['서울·인천','서울','인천','대구·경북','경기','전라·충청','부산·울산·경남']){
  const v=vendor(region),before=JSON.stringify(v);
  for(const c of ['parge','dodosi']){const p=estimate(c,v,'2026-10-26');assert.equal(p.status,'review');assert.equal(p.requiresSelection,true);assert.equal(p.actionDate,undefined);assert.equal(p.arrivalDate,undefined);assert.ok(p.candidates.length<=3);for(const [i,x]of p.candidates.entries()){assert.ok(!x.origin.regionalDefault);assert.ok(!x.origin.issue);assert.ok(!x.origin.locationIssue);if(i)assert.ok(p.candidates[i-1].actionDate>=x.actionDate);}}
  assert.equal(JSON.stringify(v),before);
 }
});
test('a known locality compares nearby shop services without assigning any of them',()=>{
 const v=vendor('서울·인천','서울특별시 송파구 거마로 1'),choice=Origin.options(data,'dodosi',v),before=JSON.stringify(choice);
 const p=Core.forSelection(data,'dodosi',v.region,choice,'2026-10-14',today);
 assert.equal(p.actionDate,undefined);assert.equal(p.requiresSelection,true);assert.ok(p.candidates.length);
 assert.ok(p.candidates.every(x=>choice.recommended.some(o=>o.id===x.origin.id)));
 assert.equal(choice.selected,'');assert.equal(JSON.stringify(choice),before);
});
test('explicit departure overrides the estimate, including outside the broadcast region and after reload',()=>{
 const shop=data.dodosi.origins.find(o=>o.shop==='티그리스게코(하남)'),v=vendor('서울·인천','서울특별시 송파구 거마로 1','가상 업체',{dodosi:shop.id});
 for(const record of [v,JSON.parse(JSON.stringify(v))]){const p=estimate('dodosi',record,'2026-10-14');assert.equal(p.origin.id,shop.id);assert.equal(p.actionDate,'2026-10-12');assert.equal(p.estimated,undefined);assert.equal(record.region,'서울·인천');}
 const own=estimate('dodosi',vendor('경기','경기도 부천시 원미구 중동로 1','크레다이브'),'2026-10-19');assert.equal(own.origin.shop,'크레다이브');assert.equal(own.estimated,undefined);
});
test('invalid saved shops, conflicting schedules and unsupported known localities do not silently inherit a different route',()=>{
 const v=vendor('서울·인천','','가상 업체',{dodosi:'retired-shop'});assert.equal(estimate('dodosi',v,'2026-10-14').status,'review');
 const conflict=data.dodosi.origins.find(o=>o.shop==='그로브비');v.inboundOrigins.dodosi=conflict.id;assert.equal(estimate('dodosi',v,'2026-10-14').status,'review');
 const cheongju=estimate('parge',vendor('전라·충청','충청북도 청주시 상당구 상당로 1'),'2026-10-21');assert.equal(cheongju.status,'review');assert.equal(cheongju.actionDate,undefined);
 for(const region of ['', '미등록 권역'])assert.equal(estimate('dodosi',vendor(region),'2026-10-14').status,'review');
});
test('Daegu October 26 no longer gets Pohang October 17 as a fixed deadline; later routes remain selectable',()=>{
 const v=vendor('대구·경북'),p=estimate('dodosi',v,'2026-10-26');
 assert.equal(p.actionDate,undefined);assert.equal(p.candidates[0].actionDate,'2026-10-20');assert.equal(p.candidates[0].arrivalDate,'2026-10-25');
 const chosen=p.candidates[0],saved={...v,inboundOrigins:{dodosi:chosen.origin.id}};
 for(const record of [saved,JSON.parse(JSON.stringify(saved))]){const exact=estimate('dodosi',record,'2026-10-26');assert.equal(exact.actionDate,'2026-10-20');assert.equal(exact.origin.id,chosen.origin.id);}
 const seoul=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기');
 const elsewhere=estimate('dodosi',{...v,inboundOrigins:{dodosi:seoul.id}},'2026-10-26');assert.equal(elsewhere.actionDate,'2026-10-23');assert.equal(elsewhere.departureDate,'2026-10-24');assert.equal(elsewhere.arrivalDate,'2026-10-25');
});
test('selected routes retain missed deadlines and month boundaries without silently changing the departure shop',()=>{
 const shop=data.dodosi.origins.find(o=>o.shop==='드래곤길들이기'),v=vendor('서울·인천','','가상 업체',{dodosi:shop.id,parge:'parge-capital'});
 for(const [day,status]of [['2026-10-11','planned'],['2026-10-12','today'],['2026-10-13','missed']])assert.equal(estimate('dodosi',v,'2026-10-14',day).status,status);
 assert.equal(estimate('dodosi',v,'2026-11-02').actionDate,'2026-10-30');assert.equal(estimate('parge',v,'2026-11-02').actionDate,'2026-10-25');
 const unselected=vendor('대구·경북'),p=estimate('dodosi',unselected,'2026-10-26','2026-10-22');assert.equal(p.actionDate,undefined);assert.ok(p.candidates.every(x=>x.status==='missed'&&x.arrivalDate<='2026-10-26'));
});

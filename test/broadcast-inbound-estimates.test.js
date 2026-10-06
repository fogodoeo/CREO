'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../public/broadcast-inbound-core'),Origin=require('../public/broadcast-origin-core'),data=require('../public/broadcast-inbound-data.json');
const today='2026-10-06';
const vendor=(region,address='',name='가상 업체',inboundOrigins={})=>({name,region,locality:Origin.locality(data,address,region),inboundOrigins});
const estimate=(carrier,v,date,day=today)=>Core.forSelection(data,carrier,v.region,Origin.options(data,carrier,v),date,day);
test('unselected Seoul and Incheon vendors see preparation dates without any saved departure or address',()=>{
 for(const region of ['서울·인천','서울','인천']){
  const v=vendor(region),before=JSON.stringify(v);
  for(const c of ['parge','dodosi']){const p=estimate(c,v,'2026-10-14');assert.equal(p.actionDate,'2026-10-11');assert.equal(p.estimated,true);assert.equal(p.estimateBasis,'region');}
  assert.equal(estimate('dodosi',v,'2026-10-14').arrivalDate,'2026-10-14');assert.equal(JSON.stringify(v),before);
 }
});
test('a known locality uses the nearest verified shop and does not save it as the chosen departure',()=>{
 const v=vendor('서울·인천','서울특별시 송파구 거마로 1'),choice=Origin.options(data,'dodosi',v),before=JSON.stringify(choice);
 const p=Core.forSelection(data,'dodosi',v.region,choice,'2026-10-14',today);
 assert.equal(p.origin.id,choice.recommended[0].id);assert.equal(p.origin.area,'서울[송파]');assert.equal(p.actionDate,'2026-10-11');
 assert.equal(p.estimateBasis,'nearby');assert.equal(p.basisLabel,'서울 송파구');assert.equal(choice.selected,'');assert.equal(JSON.stringify(choice),before);
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
test('nearby same-day estimates follow each origin route instead of treating every Wednesday as reachable',()=>{
 const cases=[['대전광역시 유성구','2026-10-18','2026-10-21'],['충청남도 천안시','2026-10-19','2026-10-21'],['전북특별자치도 전주시','2026-10-18','2026-10-21'],['충청북도 청주시 상당구','2026-10-12','2026-10-18']];
 for(const [address,action,arrival]of cases){const p=estimate('dodosi',vendor('전라·충청',address),'2026-10-21');assert.equal(p.actionDate,action,address);assert.equal(p.arrivalDate,arrival,address);assert.equal(p.estimated,true);}
 const gyeonggi=estimate('dodosi',vendor('경기'),'2026-10-19');assert.equal(gyeonggi.actionDate,'2026-10-16');assert.equal(gyeonggi.arrivalDate,'2026-10-18');
 const parge=estimate('parge',vendor('서울·인천'),'2026-10-13');assert.equal(parge.arrivalDate,'2026-10-06');
});
test('estimates retain deadlines when missed, cross months, and do not borrow unresolved regional routes',()=>{
 const v=vendor('서울·인천');
 for(const [day,status]of [['2026-10-10','planned'],['2026-10-11','today'],['2026-10-12','missed']])assert.equal(estimate('dodosi',v,'2026-10-14',day).status,status);
 assert.equal(estimate('dodosi',v,'2026-11-02').actionDate,'2026-10-30');assert.equal(estimate('parge',v,'2026-11-02').actionDate,'2026-10-25');
 const p=estimate('dodosi',vendor('전라·충청'),'2026-10-21');assert.equal(p.actionDate,'2026-10-12');assert.equal(p.estimateBasis,'region');assert.ok(!p.origin.issue);
});

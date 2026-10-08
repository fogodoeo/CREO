'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Origin=require('../public/broadcast-origin-core'),Inbound=require('../public/broadcast-inbound-core'),data=require('../public/broadcast-inbound-data.json');
const vendor=(name,region,address='',saved={})=>({name,region,locality:Origin.locality(data,address,region),inboundOrigins:saved});
test('unique own shop matches normalized spacing and branch location, not substrings',()=>{
 for(const name of ['크레다이브','크레 다이브','부천 크레다이브']){
  const r=Origin.options(data,'dodosi',vendor(name,'경기','경기도 부천시 원미구 중동로 1'));
  assert.equal(r.own.shop,'크레다이브');assert.equal(r.selected,r.own.id);assert.equal(r.automatic,true);
 }
 assert.equal(Origin.options(data,'dodosi',vendor('크레다이브와 친구들','경기')).own,null);
 assert.equal(Origin.options(data,'dodosi',vendor('서울 크레다이브','경기')).own,null);
 assert.equal(Origin.options(data,'dodosi',vendor('크레다이브','경기','경기도 김포시 김포대로 1')).own,null);
});
test('same-brand shops require an unambiguous district; brand name alone never picks a branch',()=>{
 assert.equal(Origin.options(data,'dodosi',vendor('다이노마켓','서울')).own,null);
 const r=Origin.options(data,'dodosi',vendor('다이노마켓','서울','서울특별시 송파구 거마로 1'));
 assert.equal(r.own.area,'서울[송파]');
 assert.equal(Origin.options(data,'dodosi',vendor('크레스타','부산·울산·경남')).own,null);
});

test('High Rank rename preserves the Daegu departure identity for old and new names, without matching Suwon',()=>{
 for(const name of ['하이랭크','High_Rank','룸메이트','룸메이트 (대구)']){
  const r=Origin.options(data,'parge',vendor(name,'대구·경북','대구광역시 달서구 월배로373'));
  assert.equal(r.own.id,'parge-seed-16');assert.equal(r.own.shop,'하이랭크 (대구)');assert.equal(r.automatic,true);
 }
 assert.equal(Origin.options(data,'parge',vendor('룸메이트 수원','경기','경기도 수원시 권선구 탑동')).own,null);
});
test('explicit saved choice wins over an own shop and recommendations, including after reload',()=>{
 const selected=data.dodosi.origins.find(o=>o.shop==='아임룻'),v=vendor('크레다이브','경기','경기도 부천시 원미구 중동로 1',{dodosi:selected.id});
 for(const x of [v,JSON.parse(JSON.stringify(v))]){const r=Origin.options(data,'dodosi',x);assert.equal(r.selected,selected.id);assert.equal(r.automatic,false);}
 const invalid=Origin.options(data,'dodosi',{...v,inboundOrigins:{dodosi:'retired-shop'}});assert.equal(invalid.selected,'retired-shop');
 assert.equal(Inbound.forVendor(data,'dodosi','경기',invalid.selected,'2026-10-19','2026-10-05').status,'review');
});
test('address locality prioritizes the same city without choosing a recommended shop automatically',()=>{
 const r=Origin.options(data,'dodosi',vendor('가상 업체','경기','경기도 부천시 원미구 중동로 1'));
 assert.equal(r.place.city,'부천');assert.equal(r.recommended[0].shop,'크레다이브');assert.equal(r.selected,'');assert.equal(r.own,null);
 assert.equal(r.recommended.length,3);
 assert.ok(r.recommended.length<=3);assert.ok(r.recommended.every(o=>!o.issue));
});
test('nearby recommendations can cross a regional boundary while vendor region stays unchanged',()=>{
 const v=vendor('가상 업체','경기','경기도 하남시 미사대로 1'),r=Origin.options(data,'dodosi',v);
 assert.ok(r.recommended.some(o=>o.region==='서울·인천'));assert.equal(v.region,'경기');assert.equal(r.selected,'');
});
test('missing, unsupported, or conflicting addresses fall back to explicit locality selection',()=>{
 for(const address of ['', '주소 미입력','서울특별시 송파구 1']){
  const r=Origin.options(data,'dodosi',vendor('가상 업체','경기',address));assert.equal(r.place,null);assert.deepEqual(r.recommended,[]);
 }
 const v=vendor('가상 업체','경기'),r=Origin.options(data,'dodosi',v,'경기|부천');
 assert.equal(r.place.city,'부천');assert.equal(r.recommended[0].shop,'크레다이브');assert.equal(r.selected,'');
 assert.equal(Origin.options(data,'dodosi',v,'서울·인천|서울|송파구').place,null);
});
test('Gwangju city, Gyeonggi Gwangju and old/new province names are distinct',()=>{
 assert.equal(Origin.addressParts('광주광역시 광산구 송정로 1').region,'전라·충청');
 assert.equal(Origin.addressParts('경기도 광주시 경안로 1').region,'경기');
 for(const prefix of ['전북특별자치도','전라북도','전북'])assert.equal(Origin.addressParts(prefix+' 전주시 완산구 중화산로 1').city,'전주');
 assert.equal(Origin.addressParts('부산광역시 부산진구 중앙대로 1').district,'부산진구');
});
test('active PARGE partner directory supports own shops beyond schedule exceptions',()=>{
 const station=data.parge.origins.find(o=>o.location?.city==='부천'&&!o.regionalDefault);assert.ok(station);
 const r=Origin.options(data,'parge',vendor(station.shop,'경기',station.address));assert.equal(r.selected,station.id);
 assert.equal(Inbound.forVendor(data,'parge','경기',r.selected,'2026-10-19','2026-10-05').actionDate,'2026-10-11');
 assert.ok(Origin.options(data,'parge',vendor('가상 업체','경기',station.address)).recommended.every(o=>!o.regionalDefault));
});
test('directory metadata is finite, scoped, and excludes unresolved schedules from recommendations',()=>{
 const ids=new Set();for(const p of data.places){assert.ok(!ids.has(p.id));ids.add(p.id);if('lat'in p)assert.ok(Number.isFinite(p.lat)&&p.lat>=33&&p.lat<=39);}
 for(const c of ['parge','dodosi'])for(const region of ['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남']){
  for(const p of data.places.filter(p=>p.region===region)){
   const r=Origin.options(data,c,{name:'가상 업체',region,locality:p});
   assert.ok(r.recommended.every(o=>!o.issue&&!o.locationIssue));assert.equal(new Set(r.recommended.map(o=>o.id)).size,r.recommended.length);
   assert.ok(r.recommended.every(o=>o.location.city===p.city||!o.location.approximate));
  }
 }
});
test('Incheon localities and saved departure shops follow Seoul-Incheon without changing transport timing',()=>{
 const address='인천광역시 서구 청라에메랄드로 79',v=vendor('크레리즘','서울·인천',address);
 assert.equal(v.locality.region,'서울·인천');assert.equal(v.locality.city,'인천');assert.equal(v.locality.district,'서구');
 assert.equal(Origin.locality(data,address,'인천').id,v.locality.id);
 const r=Origin.options(data,'dodosi',v),gyeonggi=Origin.options(data,'dodosi',vendor('가상 업체','경기'));
 assert.ok(r.places.some(p=>p.city==='서울'));assert.ok(r.places.some(p=>p.city==='인천'));assert.ok(!gyeonggi.places.some(p=>p.city==='인천'));
 const shop=data.dodosi.origins.find(o=>o.shop.includes('크레리즘')&&o.area.includes('청라'));assert.ok(shop);
 const saved=Origin.options(data,'dodosi',{...v,inboundOrigins:{dodosi:shop.id}});assert.equal(saved.selected,shop.id);assert.equal(saved.automatic,false);
 for(const region of ['서울·인천','서울','인천']){
  const dodosi=Inbound.forVendor(data,'dodosi',region,saved.selected,'2026-10-14','2026-10-05');assert.equal(dodosi.actionDate,'2026-10-12');assert.equal(dodosi.arrivalDate,'2026-10-14');
  const parge=Inbound.forVendor(data,'parge',region,'','2026-10-14','2026-10-05');assert.equal(parge.actionDate,'2026-10-11');assert.equal(parge.arrivalDate,'2026-10-13');
 }
 for(const carrier of ['parge','dodosi'])for(const shop of data[carrier].origins.filter(o=>o.location?.city==='인천')){
  assert.equal(shop.location.region,'서울·인천');assert.ok(Inbound.origins(data,carrier,'서울·인천').some(o=>o.id===shop.id));assert.ok(!Inbound.origins(data,carrier,'경기').some(o=>o.id===shop.id));
 }
});
test('same-name shops in one district show their branch areas instead of identical recommendation labels',()=>{
 const shops=data.dodosi.origins.filter(o=>o.shop==='크레리즘');assert.equal(shops.length,2);
 assert.deepEqual(shops.map(o=>Origin.shopLocation(o,shops)).sort(),['인천[검단]','인천[청라]']);
 const unique=data.dodosi.origins.find(o=>o.shop==='크레다이브');assert.equal(Origin.shopLocation(unique,data.dodosi.origins),unique.location.label);
});
test('a same-brand map pin in another city never replaces the route locality',()=>{
 const busan=data.dodosi.origins.find(o=>o.shop==='티그리스게코(부산)');assert.equal(busan.location.city,'부산');assert.equal(busan.location.region,'부산·울산·경남');
 const inconsistent=data.dodosi.origins.filter(o=>o.locationIssue);assert.ok(inconsistent.length);
 for(const o of inconsistent)assert.equal(Origin.options(data,'dodosi',vendor(o.shop,o.region,o.address)).own,null);
});

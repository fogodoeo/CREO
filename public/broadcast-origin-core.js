(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoOriginCore=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const compact=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('en').replace(/[\s()[\]{}·.,_\-/]/g,'');
 function addressParts(address){
  const words=String(address||'').trim().split(/\s+/),first=words[0]||'';
  const provinces=[['서울','서울'],['인천','경기'],['경기','경기'],['강원','경기'],['대전','전라·충청'],['세종','전라·충청'],['충청남','전라·충청'],['충남','전라·충청'],['충청북','전라·충청'],['충북','전라·충청'],['전북','전라·충청'],['전라북','전라·충청'],['전라남','전라·충청'],['전남','전라·충청'],['광주','전라·충청'],['제주','전라·충청'],['대구','대구·경북'],['경상북','대구·경북'],['경북','대구·경북'],['부산','부산·울산·경남'],['울산','부산·울산·경남'],['경상남','부산·울산·경남'],['경남','부산·울산·경남']];
  const found=provinces.find(([prefix])=>first.startsWith(prefix));if(!found)return null;
  const metro=/^(서울|인천|대전|세종|광주|대구|부산|울산)/.test(first);
  const city=metro?found[0]:(words[1]||'').replace(/[시군]$/,'');
  if(!city||(!metro&&!/[시군]$/.test(words[1]||'')))return null;
  const district=(words[metro?1:2]||'').match(/^(.+구)$/)?.[1]||'';
  return {region:found[1],city,district,id:found[1]+'|'+city+(district?'|'+district:''),cityId:found[1]+'|'+city};
 }
 function locality(data,address,region){
  const parsed=addressParts(address);if(!parsed||parsed.region!==region)return null;
  const places=data.places||[];
  return places.find(p=>p.id===parsed.id)||places.find(p=>p.id===parsed.cityId)||null;
 }
 function nameKeys(origin){
  const keys=new Set([compact(origin.shop),...(origin.aliases||[]).map(compact)]);
  const location=origin.location,city=location?.city||'';
  // Drop only an explicit locality suffix, never a part of the actual shop name.
  const base=String(origin.shop||'').replace(/\s*[(\[]([^\])]+)[)\]]\s*$/,(_all,area)=>city&&compact(area).startsWith(compact(city))?'':_all).trim();
  if(base!==origin.shop){keys.add(compact(base));keys.add(compact(city+base));keys.add(compact(base+city));keys.add(compact(base+city+'점'));}
  if(city){keys.add(compact(city+origin.shop));keys.add(compact(origin.shop+city));keys.add(compact(origin.shop+city+'점'));}
  return keys;
 }
 function ownShop(choices,vendor){
  const name=compact(vendor.name);if(!name)return null;
  let found=choices.filter(o=>!o.regionalDefault&&!o.locationIssue&&nameKeys(o).has(name));
  const place=vendor.locality;
  if(place){const region=place.region||String(place.id||'').split('|')[0];found=found.filter(o=>!o.location||(o.location.city===place.city&&(!region||o.location.region===region)));const exact=found.filter(o=>o.location?.district&&o.location.district===place.district);if(exact.length)found=exact;}
  return found.length===1?found[0]:null;
 }
 function distance(a,b){
  if(![a?.lat,a?.lng,b?.lat,b?.lng].every(Number.isFinite))return Infinity;
  const rad=Math.PI/180,lat=(b.lat-a.lat)*rad,lng=(b.lng-a.lng)*rad;
  const h=Math.sin(lat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(lng/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
 }
 function options(data,carrier,vendor,areaId=''){
  // Broadcast rotation and the physical departure shop are independent.
  const choices=data[carrier]?.origins||[];
  const places=(data.places||[]).filter(p=>p.region===vendor.region),own=ownShop(choices,vendor);
  const saved=vendor.inboundOrigins?.[carrier]||'',selected=saved||own?.id||'';
  let place=places.find(p=>p.id===areaId)||places.find(p=>p.id===vendor.locality?.id)||null;
  if(place&&!Number.isFinite(place.lat)){const city=places.find(p=>p.city===place.city&&!p.district&&Number.isFinite(p.lat));if(city)place={...place,lat:city.lat,lng:city.lng,approximate:true};}
  const available=choices.filter(o=>!o.regionalDefault&&o.location&&!o.issue&&!o.locationIssue);
  const scored=place?available.map(o=>{
   const sameCity=o.location.city===place.city,sameDistrict=sameCity&&place.district&&o.location.district===place.district;
   const km=distance(place,o.location);
   return {origin:o,group:sameDistrict?0:sameCity?1:2,km};
  }).filter(r=>r.group<2||(!r.origin.location.approximate&&r.km<=50)).sort((a,b)=>a.group-b.group||a.km-b.km||a.origin.shop.localeCompare(b.origin.shop,'ko')):[];
  return {choices,places,own,selected,automatic:!saved&&!!own,place,recommended:scored.slice(0,3).map(r=>r.origin)};
 }
 return {compact,addressParts,locality,nameKeys,ownShop,distance,options};
});

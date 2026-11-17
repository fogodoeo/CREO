'use strict';
// Public November 2026 timetable and price-zone contract. No authenticated APIs.
const compact = v => String(v || '').normalize('NFKC').replace(/\s/g, '').toLowerCase();
const zones = ['서울/경기/인천','충청/대전','전라/광주','순천/진주','대구/구미/경산','부산/양산/김해','경주/울산/창원','강원 원주/춘천','강원 고성/강릉/동해'];
function zone(p) {
 const n=compact(p.name),a=compact(p.address),r=compact(p.region),s=n+' '+a,t=s+' '+(zones.includes(p.region)?'':r);
 if((s+r).includes('제주'))return null;
 if(/순천|진주/.test(s)||r==='순천/진주')return '순천/진주';
 if(/고성|강릉|동해/.test(s))return '강원 고성/강릉/동해';
 if(/원주|춘천|강원/.test(s)||r.includes('강원')&&!zones.includes(p.region))return '강원 원주/춘천';
 if(/부산|양산|김해/.test(s))return '부산/양산/김해';
 if(/경주|울산|창원|포항/.test(s))return '경주/울산/창원';
 if(/대구|구미|경산/.test(s))return '대구/구미/경산';
 if(/충청|대전|세종|전북|익산|논산|천안|청주/.test(t))return '충청/대전';
 if(!t.includes('경기광주')&&!n.includes('해치앤코')&&(/\(광주\)|광주광역시|전라|전남/.test(t)||t.includes('광주')&&!t.includes('경기')))return '전라/광주';
 if(/서울|경기|인천|수도|안성|평택|성남|군포|용인|수원|의정부|호원동/.test(t))return '서울/경기/인천';
 if(zones.includes(p.region))return p.region;
 if(/경상|대구|경북|부산|경남/.test(r))return '대구/구미/경산';
 return null;
}
function delayed(p){const s=compact([p.name,p.address].join(' '));return !s.includes('경기광주')&&!s.includes('해치앤코')&&(/순천|진주|\(광주\)|광주광역시/.test(s)||compact(p.region)==='광주');}
function extract(chunks){
 for(const chunk of chunks)for(const m of chunk.matchAll(/JSON\.parse\('([^'\\]*(?:\\.[^'\\]*)*)'\)/g)){
  if(!m[1].includes('"from"')||!m[1].includes('"price"'))continue;
  let rows;try{rows=JSON.parse(m[1]);}catch{continue;}
  if(!Array.isArray(rows)||rows.length!==81)continue;
  const table={};for(const row of rows){if(!zones.includes(row.from)||!zones.includes(row.to)||!Number.isSafeInteger(row.price)||row.price<=0||table[row.from+'→'+row.to])throw Error('Invalid renewal price table');table[row.from+'→'+row.to]=row.price;}
  if(Object.keys(table).length===81)return table;
 }
 throw Error('PARGE renewal price table unavailable');
}
function payload(partners,table,Rates){
 const data=Object.fromEntries(['서울/경기/인천','충청/대전','전라/광주','대구/경북/부산/경남','강원도','제주도'].map(x=>[x,[]]));
 let count=0;
 for(const p of partners.filter(p=>p.isActive!==false)){
  if(compact([p.name,p.address,p.region].join(' ')).includes('제주'))continue;
  const z=zone(p);if(!z)throw Error('Unknown PARGE price zone: '+p.name);
  const cost=table['대구/구미/경산→'+z];if(!cost)throw Error('Missing renewal route');
  // Preserve existing customer-facing region keys and historical hub selections.
  const group=Rates.groupForHub(Rates.partnerHub(p));
  data[group].push({shop:p.name,cost,day:'목요일'});count++;
 }
 if(count<50)throw Error('Incomplete renewal partners');
 return {updated:new Date().toISOString(),source:'parge-renewal-public',origin:'하이딩 플레이스 (대구 동구)',data};
}
module.exports={zones,zone,delayed,extract,payload};

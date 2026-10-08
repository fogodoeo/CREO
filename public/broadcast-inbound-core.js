(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoInboundCore=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DAY=86400000;
 function destination(data,carrier){return ['parge','dodosi'].includes(carrier)?String(data?.destinations?.[carrier]||''):'';}
 function destinationPhone(data,carrier){return ['parge','dodosi'].includes(carrier)?String(data?.destinationPhones?.[carrier]||''):'';}
 function valid(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
 function add(s,n){return new Date(Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
 function dow(s){return new Date(s+'T00:00:00Z').getUTCDay();}
 function next(s,days,include=false){for(let n=include?0:1;n<=7;n++){const d=add(s,n);if(days.includes(dow(d)))return d;}return '';}
 function closed(date,origin){const from=String(origin.vacationStart||'').replaceAll('/','-'),to=String(origin.vacationEnd||'').replaceAll('/','-');return valid(from)&&valid(to)&&date>=from&&date<=to;}
 function origins(data,carrier,region){const label=['서울','인천','서울+인천'].includes(region)?'서울·인천':region;return (data?.[carrier]?.origins||[]).filter(o=>!label||(carrier==='parge'?o.regions.includes(label):o.region===label));}
 function plan(data,carrier,origin,broadcastDate,today){
  if(!valid(broadcastDate)||!valid(today)||!origin)return {status:'review',reason:'출발 정거샵을 선택해 주세요.'};
  if(origin.issue)return {status:'review',reason:origin.issue,origin};
  const cutoff=add(broadcastDate,-(data[carrier]?.arrivalBufferDays??data.arrivalBufferDays)),candidates=[];
  // Follow each service leg forward; only DODOSI permits arrival on the broadcast date.
  for(let n=0;n<=45;n++){
   const actionDate=add(cutoff,-n);let departureDate,arrivalDate;
   if(carrier==='parge'){
    departureDate=add(actionDate,data.parge.bookingLeadDays);
    if(!origin.collectDays.includes(dow(departureDate)))continue;
    arrivalDate=next(departureDate,data.parge.arrivalDays);
   }else if(carrier==='dodosi'){
    if(!origin.dropoffDays.includes(dow(actionDate))||closed(actionDate,origin))continue;
    departureDate=next(actionDate,origin.departureDays,true);
    if(!departureDate||closed(departureDate,origin))continue;
    arrivalDate=next(departureDate,origin.arrivalDays);
   }else return {status:'review',reason:'운송사를 확인해 주세요.'};
   if(arrivalDate&&arrivalDate<=cutoff)candidates.push({actionDate,departureDate,arrivalDate});
  }
  const best=candidates[0];if(!best)return {status:'review',reason:'방송 전 도착편을 확인해 주세요.',origin};
  return {...best,carrier,origin,broadcastDate,cutoff,status:best.actionDate<today?'missed':best.actionDate===today?'today':'planned',actionLabel:carrier==='parge'?'접수':'맡기기',departureLabel:carrier==='parge'?'수거':'출발',checkedAt:data.checkedAt};
 }
 function forVendor(data,carrier,region,selectedId,broadcastDate,today,{anyRegion=false}={}){
  const choices=origins(data,carrier,anyRegion?undefined:region),selected=choices.find(o=>o.id===selectedId);
  if(selectedId&&!selected)return {status:'review',reason:'출발 정거샵을 다시 선택해 주세요.',choices};
  if(selected)return {...plan(data,carrier,selected,broadcastDate,today),choices};
  const defaults=carrier==='parge'?choices.filter(o=>o.id==='parge-capital'||o.id==='parge-gyeongsang'):choices;
  const plans=defaults.map(o=>plan(data,carrier,o,broadcastDate,today)),key=p=>[p.actionDate,p.departureDate,p.arrivalDate,p.status].join('|');
  if(plans.length&&plans.every(p=>p.status!=='review')&&new Set(plans.map(key)).size===1)return {...plans[0],regional:true,choices};
  return {status:'review',reason:choices.length?'출발 정거샵을 고르면 일정이 표시돼요.':'이 지역의 대구행 운송편은 확인이 필요해요.',choices};
 }
 function forSelection(data,carrier,region,selection,broadcastDate,today){
  const choices=selection.choices||origins(data,carrier);
  if(selection.selected)return {...forVendor(data,carrier,region,selection.selected,broadcastDate,today,{anyRegion:true}),choices};
  // Suggestions are not the vendor's shipping deadline. Each shop already uses
  // its latest feasible service; compare them without silently choosing one.
  const pool=selection.place?(selection.recommended||[]):region?origins(data,carrier,region):[];
  const candidates=pool.filter(o=>!o.issue&&!o.locationIssue&&!o.regionalDefault)
   .map(o=>plan(data,carrier,o,broadcastDate,today)).filter(p=>p.status!=='review');
  candidates.sort((a,b)=>b.actionDate.localeCompare(a.actionDate)||b.arrivalDate.localeCompare(a.arrivalDate)||a.origin.id.localeCompare(b.origin.id));
  return {status:'review',requiresSelection:true,reason:'이용할 출발 정거샵을 선택해 주세요.',choices,candidates:candidates.slice(0,3)};
 }
 return {valid,add,dow,next,origins,plan,forVendor,forSelection,destination,destinationPhone};
});

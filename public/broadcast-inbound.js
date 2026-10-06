(() => {
 'use strict';
 const Core=window.CreoInboundCore,Origin=window.CreoOriginCore,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={parge:'파르게',dodosi:'도도시'},fmt=d=>`${Number(d.slice(5,7))}/${Number(d.slice(8))}(${['일','월','화','수','목','금','토'][Core.dow(d)]})`;
 const truck='<svg class="inbound-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
 const source=p=>p.carrier==='parge'?data.parge.source:p.origin?.source||data.dodosi.source;
 const deliveryNotice='<p class="inbound-notice">배송 일정은 참고용입니다.<strong>반드시 방송일 전에 도착하도록 준비해 주세요.</strong></p>';
 let data,failed=false,context,milestones=new Map(),lastTrigger,selections={},areaIds={},saving=false;
 async function ready(){if(data)return;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const r=await fetch('/broadcast-inbound-data.json?v=20261006-destinations',{cache:'no-cache',signal:controller.signal});if(!r.ok)throw Error();const v=await r.json();if(v.version!==1||!Array.isArray(v.dodosi?.origins)||!Array.isArray(v.parge?.origins))throw Error();data=v;failed=false;}catch{failed=true;}finally{clearTimeout(timer);}}
 function destinationLine(p){return p.destination?`<dl class="inbound-destination"><dt>도착지</dt><dd>${esc(p.destination)}</dd></dl>`:'';}
 function details(p){
  if(p.status==='review'){
   return p.origin?.issue||!p.choices?.length?`<a class="inbound-review-link" href="${esc(source(p))}" target="_blank" rel="noopener" aria-label="${names[p.carrier]} 마감일 확인">마감일 확인 ↗</a>`:'';
  }
  return `<p class="inbound-deadline"><strong>${fmt(p.actionDate)}</strong>까지${p.status==='missed'?'<span class="inbound-warning">기한 지남</span>':p.status==='today'?'<span class="inbound-warning">오늘까지</span>':''}</p>`;
 }
 function compute(date){const s=context.state,today=new Date(Date.parse(s.now)+9*3600000).toISOString().slice(0,10);return ['parge','dodosi'].map(c=>{const choice=selections[c],plan=choice.selected?Core.forVendor(data,c,s.vendor.region,choice.selected,date,today,{anyRegion:true}):{status:'review',choices:choice.choices};return {...plan,carrier:c,broadcastDate:date,selection:choice,destination:s.inboundDestinations?.[c]||Core.destination(data,c)};});}
 function originControl(p){
  if(!p.choices.length)return '';
  const {selected,own,place,places,recommended}=p.selection,isOwn=selected&&selected===own?.id,label=selected?(isOwn?'우리 업체 · ':'출발지 · ')+(p.origin?.shop||'다시 선택'):'출발 정거샵 선택';
  const choice=o=>`<option value="${esc(o.id)}" ${selected===o.id?'selected':''}>${esc(o.area+' · '+o.shop)}</option>`;
  const real=p.choices.filter(o=>!o.regionalDefault).sort((a,b)=>a.area.localeCompare(b.area,'ko')||a.shop.localeCompare(b.shop,'ko')),regional=p.choices.filter(o=>o.regionalDefault);
  return `<details class="inbound-origin"><summary>${esc(label)}</summary><label for="inbound-area-${p.carrier}">지역</label><select id="inbound-area-${p.carrier}" data-inbound-area="${p.carrier}"><option value="">${context.state.vendor.locality?'업체 소재지 기준':'시·군·구 선택'}</option>${places.map(o=>`<option value="${esc(o.id)}" ${areaIds[p.carrier]===o.id?'selected':''}>${esc(o.label)}</option>`).join('')}</select>${place?`<p class="inbound-location-basis">${esc(place.label)} 인근</p>${recommended.length?`<div class="inbound-recommendations">${recommended.map(o=>`<button type="button" data-inbound-pick="${esc(o.id)}" data-carrier="${p.carrier}"><span><strong>${esc(o.shop)}</strong><small>${esc(Origin.shopLocation(o,p.choices))}</small></span><span aria-hidden="true">${selected===o.id?'✓':'›'}</span></button>`).join('')}</div>`:'<p class="inbound-review">확인된 후보가 없어요. 목록에서 골라 주세요.</p>'}`:''}<label for="inbound-${p.carrier}">${recommended.length?'다른 정거샵':'출발 정거샵'}</label><select id="inbound-${p.carrier}" data-inbound-origin="${p.carrier}"><option value="">${own?'우리 업체 자동 선택':'정거샵 선택'}</option>${own?`<optgroup label="우리 업체">${choice(own)}</optgroup>`:''}<optgroup label="정거샵">${real.filter(o=>o.id!==own?.id).map(choice).join('')}</optgroup>${regional.length?`<optgroup label="지역 기본 일정">${regional.map(choice).join('')}</optgroup>`:''}</select></details>`;
 }
 function render(next){
  if(context&&context.state.vendor.id!==next.state.vendor.id)areaIds={};
  context=next;milestones=new Map();document.querySelector('#inbound-panel')?.remove();
  const calendar=document.querySelector('.broadcast-calendar');if(!calendar)return;
  calendar.querySelector('.calendar-key')?.remove();
  calendar.querySelector('.calendar-head').insertAdjacentHTML('afterend',`<div class="calendar-key" aria-label="달력 표시"><span><i class="calendar-key-broadcast" aria-hidden="true"></i>방송</span><span>${truck}배송 마감</span></div>`);
  if(!data){calendar.insertAdjacentHTML('afterend',failed?'<section id="inbound-panel" class="inbound-panel"><p>운송 일정을 불러오지 못했어요.</p><button type="button" class="text" data-inbound-retry>다시 불러오기</button></section>':'<section id="inbound-panel" class="inbound-panel"><p class="muted" role="status">운송 일정 불러오는 중…</p></section>');return;}
  const {state,month}=context,today=new Date(Date.parse(state.now)+9*3600000).toISOString().slice(0,10);
  selections=Object.fromEntries(['parge','dodosi'].map(c=>[c,Origin.options(data,c,state.vendor,areaIds[c])]));
  const mine=state.dates.filter(d=>d.regionName===state.vendor.region&&d.date>=today&&!d.paused),target=mine.find(d=>d.date.startsWith(month))||mine.find(d=>d.date>=month+'-01');
  if(!target)return;
  // Include the following month's broadcast so its earlier shipping deadline stays visible.
  const planDates=mine.filter(d=>d.date>=month+'-01'&&d.date<=Core.add(month+'-01',65));
  for(const d of planDates)for(const p of compute(d.date)){
   if(p.status==='review'||!p.actionDate.startsWith(month))continue;
   const list=milestones.get(p.actionDate)||[];list.push({...p,label:p.actionLabel});milestones.set(p.actionDate,list);
  }
  for(const day of calendar.querySelectorAll('.day')){
   const n=Number(day.querySelector('span')?.textContent),date=month+'-'+String(n).padStart(2,'0'),items=milestones.get(date);if(!items?.length)continue;
   day.disabled=false;day.dataset.inboundDate=date;day.classList.add('has-inbound');
   const labels=[...new Set(items.map(p=>names[p.carrier]))],broadcastLabel=day.getAttribute('aria-label');
   day.insertAdjacentHTML('beforeend',`<div class="inbound-day-mark">${truck}${labels.map(label=>`<small class="inbound-mark">${esc(label)}</small>`).join('')}</div>`);
   day.setAttribute('aria-label',`${broadcastLabel?broadcastLabel+', ':fmt(date)+', '}${labels.join('·')} 배송 마감`);
  }
  const plans=compute(target.date);
  const html=`<section id="inbound-panel" class="inbound-panel" aria-labelledby="inbound-title"><div class="inbound-heading"><h2 id="inbound-title">배송 마감</h2><p>${fmt(target.date)} 방송</p></div>${deliveryNotice}<div class="inbound-carriers">${plans.map(p=>`<article class="inbound-card"><div class="inbound-row"><h3>${names[p.carrier]}</h3>${details(p)}</div>${destinationLine(p)}${originControl(p)}</article>`).join('')}</div><p id="inbound-error" class="form-error" role="alert"></p></section>`;
  (document.querySelector('.registration-task:last-of-type')||calendar).insertAdjacentHTML('afterend',html);
 }
 function openDate(date){
  const items=milestones.get(date);if(!items)return;lastTrigger=document.activeElement;
  let dialog=document.querySelector('#inbound-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='inbound-dialog';dialog.className='inbound-dialog';dialog.setAttribute('aria-labelledby','inbound-dialog-title');document.body.append(dialog);dialog.addEventListener('close',()=>lastTrigger?.isConnected&&lastTrigger.focus());}
  dialog.innerHTML=`<header><h2 id="inbound-dialog-title">${fmt(date)}까지</h2><button type="button" class="icon" data-inbound-close aria-label="배송 마감 닫기">×</button></header>${items.map(p=>`<article class="inbound-card"><h3>${names[p.carrier]}</h3><p class="inbound-for">${fmt(p.broadcastDate)} 방송 · 배송 마감</p>${destinationLine(p)}${p.status==='missed'?'<p class="inbound-warning">기한 지남 · 운송사에 문의해 주세요.</p>':''}<a class="text" href="${esc(p.carrier==='parge'?data.parge.source:p.origin.source)}" target="_blank" rel="noopener">${names[p.carrier]} 안내</a></article>`).join('')}${deliveryNotice}${context.state.dates.some(d=>d.date===date)?'<button type="button" class="primary" data-inbound-broadcast="'+date+'">이날 방송 보기</button>':''}`;
  dialog.showModal();
 }
 document.addEventListener('click',e=>{
  const pick=e.target.closest('[data-inbound-pick]');if(pick){saveOrigin(pick.dataset.carrier,pick.dataset.inboundPick);return;}
  const date=e.target.closest('[data-inbound-date]');if(date){e.stopImmediatePropagation();openDate(date.dataset.inboundDate);return;}
  if(e.target.closest('[data-inbound-close]'))document.querySelector('#inbound-dialog').close();
  const b=e.target.closest('[data-inbound-broadcast]');if(b){document.querySelector('#inbound-dialog').close();context.openDate(b.dataset.inboundBroadcast);}
  if(e.target.closest('[data-inbound-retry]'))ready().then(()=>context.redraw());
 });
 async function saveOrigin(carrier,originId){
  if(saving)return;saving=true;const old=selections[carrier].selected,el=document.querySelector('#inbound-'+carrier);
  document.querySelectorAll('[data-inbound-origin],[data-inbound-area],[data-inbound-pick]').forEach(s=>s.disabled=true);
  document.querySelector('#inbound-error').textContent='';
  try{await context.save(carrier,originId);context.redraw();document.querySelector('#inbound-'+carrier)?.closest('details').querySelector('summary')?.focus();}
  catch(error){if(el)el.value=old;document.querySelector('#inbound-error').textContent=error.message;}
  finally{saving=false;document.querySelectorAll('[data-inbound-origin],[data-inbound-area],[data-inbound-pick]').forEach(s=>s.disabled=false);}
 }
 document.addEventListener('change',e=>{
  const area=e.target.closest('[data-inbound-area]');if(area){const carrier=area.dataset.inboundArea;areaIds[carrier]=area.value;context.redraw();const input=document.querySelector('#inbound-area-'+carrier);input?.closest('details').setAttribute('open','');input?.focus();return;}
  const el=e.target.closest('[data-inbound-origin]');if(el)saveOrigin(el.dataset.inboundOrigin,el.value);
 });
 window.CreoInbound={ready,render};
})();

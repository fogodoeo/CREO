(() => {
 'use strict';
 const $=s=>document.querySelector(s),Store=window.EntryPreviewStore,sheet=$('#sheet'),q=new URLSearchParams(location.search);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={draft:'작성 중',changes_requested:'수정 필요',submitted:'접수 완료',approved:'경매 편성 완료'};
 const dateLabel=d=>new Date(d+'T20:00:00+09:00').toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'});
 const pending=e=>!e||!['submitted','approved'].includes(e.status),uid=()=>crypto.randomUUID();
 const koreanDay=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10);
 let state,month='',selected='',slot=0,busy=false,draft=null,dirty=false,recovery={},recoveryQueue=Promise.resolve(),photoBusy=false,lastTrigger=null;
  const removed=new Map(),photoUrls=new Map(),editingSubmitted=new Set();
 let bulkDrafts=null,auctionPhotoItem=null,auctionPhotoPending=null;
  const auctionPhotoUndo=new Map(),auctionNameDrafts=new Map();
 const auctionItems=(date=selected)=>(state?.entryState.auctionItems||[]).filter(item=>item.date===date);
  const rowHasData=row=>!!(row.sex||row.weight||row.hatchDate||row.note||row.photoIds?.length||['sire','dam'].some(side=>row.parents?.[side]?.photoId||row.parents?.[side]?.name?.trim()));
  const registrationOpen=r=>!!r&&r.date>=koreanDay(state.now)&&(!r.session.entriesDueAt||Date.parse(r.session.entriesDueAt)>Date.parse(state.now));
  function entryParents(e){return Object.fromEntries(['sire','dam'].map(side=>{const p=state.entryState.parents.find(p=>p.id===e?.[side+'Id']);return [side,{name:p?.name||'',photoId:p?.photoId||''}]}))}
 function message(s){$('#notice').textContent=s;setTimeout(()=>{$('#notice').textContent=''},4500)}
 function params(){return {...(Store.code?{code:Store.code}:{token:Store.token}),event:'national-cre'}}
 function reservation(date=selected){return state.reservations.find(r=>r.date===date&&r.status==='confirmed')}
 function entry(r=reservation(),i=slot){return r?.entries[i]||null}
 const entryLimit=r=>r.entryLimit??Math.min(4,r.entryIds.length);
 const policyText=d=>`${d.regionName} ${d.regionVendorCount}개 업체 · 업체당 4마리`;
 function pickupBlock(r){
  if(!registrationOpen(r)||!CreoVendorTasks.broadcastRegistrationComplete(r))return '';
  const places=state.inboundDestinations||{},phones=state.inboundDestinationPhones||{};
  return `<section class="entry-delivery" aria-label="출품 배송"><h3>출품 배송</h3><dl class="inbound-destination">${[['parge','파르게'],['dodosi','도도시']].filter(([carrier])=>places[carrier]).map(([carrier,name])=>`<dt>${name} 도착지</dt><dd>${esc(places[carrier])}${phones[carrier]?`<a class="inbound-phone" href="tel:${phones[carrier].replace(/\D/g,'')}" aria-label="${esc(places[carrier]+'에 전화 '+phones[carrier])}">${esc(phones[carrier])}</a>`:''}</dd>`).join('')}</dl><div class="pickup-line"><div><strong>수거 상태</strong><span>${r.pickup?'수거 완료':'수거 전'}</span></div><button type="button" class="pickup-button" data-action="pickup">${r.pickup?'수거 전으로 변경':'수거 완료 표시'}</button></div></section>`;
 }
  function editable(e=entry(),i=slot){return i<entryLimit(reservation())&&(!e||['draft','changes_requested'].includes(e.status)||(e.status==='submitted'&&editingSubmitted.has(e.id)))&&registrationOpen(reservation())&&state.entryState.events.some(e=>e.id==='national-cre'&&e.entriesOpen)}
 function task(d){if(auctionItems(d.date).length>=4)return false;return d.regionName===state.vendor.region&&CreoVendorTasks.broadcastNeedsAction(d,reservation(d.date),state.now,state.entryState.events.some(e=>e.id==='national-cre'&&e.entriesOpen))}
 async function request(body){
  let requestId,storageKey='national-broadcast-request:'+Store.VENDOR,payload;
  if(body){payload=JSON.stringify(body);let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{}
   requestId=saved?.payload===payload?saved.id:uid();sessionStorage.setItem(storageKey,JSON.stringify({payload,id:requestId}));
  }
  let response;try{response=await fetch('/api/platform/vendor-bookings'+(body?'':'?'+new URLSearchParams(params())),{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify({...body,requestId,...params()})}:{}),signal:AbortSignal.timeout(30000)})}catch{throw Error('연결하지 못했어요. 작성 내용은 유지돼요. 다시 시도해 주세요.')}
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'다시 시도해 주세요.'),{status:response.status});
  if(body)sessionStorage.removeItem(storageKey);return data;
 }
 function persistRecovery(){const value={nationalDrafts:structuredClone(recovery)};recoveryQueue=recoveryQueue.catch(()=>{}).then(()=>Store.recovery.save(value));return recoveryQueue}
  function fields(){const f=$('#entry-step-form');if(!f)return draft;const data=Object.fromEntries(new FormData(f));return {...draft,sex:data.sex||'',weight:String(data.weight||''),hatchDate:data.hatchDate||'',note:data.note||'',parents:Object.fromEntries(['sire','dam'].map(side=>[side,{...draft.parents?.[side],name:data[side+'-name']??draft.parents?.[side]?.name??''}]))}}
 function capture(){if($('#bulk-entry-form')){captureBulk();return}if(!editable()||!draft)return;draft=fields();dirty=true;recovery[draft.id]={...draft};persistRecovery().catch(e=>{$('#step-error').textContent=e.message})}
 function photo(id){return state.entryState.media.find(m=>m.id===id)||Store.getState().media.find(m=>m.id===id)}
 function photoStatus(id,readonly,label,index){
  if(readonly||!photo(id)?.pending)return '';
  return `<div class="photo-pending" role="status"><p>${esc(label)}을 아직 전송하지 못했어요.</p><button type="button" data-action="retry-draft-photo" data-photo-id="${esc(id)}" ${Number.isInteger(index)?`data-index="${index}"`:''} aria-label="${esc(label)} 다시 전송">다시 전송</button></div>`;
 }
 async function retryDraftPhoto(id,index){
  const bulk=Number.isInteger(index)&&!!bulkDrafts;
  if(bulk?!bulkEditable(index):!editable())return;
  const row=bulk?bulkDrafts[index]:draft;
  if(!row||![...(row.photoIds||[]),...Object.values(row.parents||{}).map(p=>p.photoId)].includes(id))return;
  capture();const scroll=$('.bulk-scroll')?.scrollTop;let failure;
  try{await Store.send({type:'retry-photo',id})}catch(error){failure=error}
  state.entryState.media=Store.getState().media;
  if(bulk){openBulk();$(`[data-bulk-row="${index}"] details`).open=true;$('.bulk-scroll').scrollTop=scroll;}
  else openDate(selected,slot);
  const target=bulk?$(`[data-bulk-row="${index}"]`):sheet;
  target.querySelector('[data-action="retry-draft-photo"]')?.focus();
  if(failure)throw failure;
  target.querySelector('input[type=file]')?.focus();
  message('사진을 전송했어요. 입력창에서 저장을 완료해 주세요.');
 }
 function photoBlock(readonly){
   return `<fieldset class="parent-photo-fields"><legend>부모정보 <span class="muted">(선택)</span></legend><div class="parent-photo-grid">${[['sire','부 개체'],['dam','모 개체']].map(([side,label])=>{
   const id=draft.parents?.[side]?.photoId,m=id&&photo(id),url=m&&(m.thumbnailUrl||m.url)||photoUrls.get(id);
   return `<div class="parent-photo">${url?`<label class="photo-picker has-photo"><img src="${esc(url)}" alt="${label} 사진"><span>${label}${readonly?'':'<small>사진 교체</small>'}</span>${readonly?'':`<input type="file" accept="image/*" data-photo="${side}" aria-label="${label} 사진 교체">`}</label>${readonly?'':`<button class="photo-remove" type="button" data-action="remove-photo" data-side="${side}" aria-label="${label} 사진 삭제"><span aria-hidden="true">×</span></button>`}`:`<label class="photo-picker"><span class="photo-add" aria-hidden="true">＋</span><span>${label}<small>${readonly?'미등록':'사진 추가'}</small></span>${readonly?'':`<input type="file" accept="image/*" data-photo="${side}" aria-label="${label} 사진 추가">`}</label>`}${!readonly&&removed.has(draft.id+side)?`<button class="photo-undo" type="button" data-action="undo-photo" data-side="${side}">삭제 취소</button>`:''}<label class="parent-name-field"><span>${label} 이름</span><input name="${side}-name" maxlength="40" value="${esc(draft.parents?.[side]?.name||'')}" ${readonly?'readonly':''}></label></div>`;
  }).join('')}</div>${['sire','dam'].map(side=>photoStatus(draft.parents?.[side]?.photoId,readonly,side==='sire'?'부 개체 사진':'모 개체 사진')).join('')}</fieldset>`;
 }
 function setBusy(value){busy=value;sheet.querySelectorAll('button').forEach(el=>el.disabled=value);const scroll=sheet.querySelector('.entry-step-scroll');if(scroll)scroll.inert=value;$('#refresh').disabled=value}
 function auctionItem(id,channelId){return auctionItems().find(item=>item.id===id&&(item.channelId||'national-cre')===(channelId||'national-cre'))}
 function auctionParentKey(item,side){return (item.channelId||'national-cre')+':'+item.id+':'+side}
 function auctionPhotoList(){
  return `<div class="auction-photo-table" id="auction-photo-table"><div class="auction-columns" aria-hidden="true"><span>개체</span><span>성별</span><span>체중(g)</span><span>출생년월일</span></div>${auctionItems().map(item=>{
   const t=item.traits||{},number=esc(item.displayNumber);
   return `<section class="auction-photo-row" aria-label="${number}"><div class="auction-facts"><strong>${number}</strong><span aria-label="성별">${esc(({male:'수컷',female:'암컷',unknown:'미구분'})[t.sex]||'—')}</span><span aria-label="체중(g)">${esc(t.weight||'—')}</span><time aria-label="출생년월일">${esc(t.hatchDate||'—')}</time></div><div class="auction-photo-tools">${[['sire','부'],['dam','모']].map(([side,label])=>{
    const parent=item.parents?.find(p=>p.role===side),media=parent?.media?.[0],url=media?.thumbnailUrl||media?.url,key=auctionParentKey(item,side),name=auctionNameDrafts.get(key)?.name??parent?.name??'',identity=`data-item="${esc(item.id)}" data-item-channel="${esc(item.channelId||'national-cre')}"`;
    return `<div class="parent-photo"><label class="auction-photo-picker ${url?'has-photo':''}">${url?`<img src="${esc(url)}" alt="${number} ${label} 개체 사진">`:''}<span>${label} 사진${!url&&item.canEdit?' ＋':''}${!url&&!item.canEdit?' 없음':''}</span>${item.canEdit?`<input type="file" accept="image/jpeg,image/png,image/webp" data-auction-parent="${side}" ${identity} aria-label="${number} ${label} 개체 사진 ${url?'교체':'추가'}">`:''}</label>${url&&item.canEdit?`<button type="button" class="photo-remove" data-action="auction-remove-photo" ${identity} data-side="${side}" aria-label="${number} ${label} 개체 사진 삭제"><span aria-hidden="true">×</span></button>`:''}${auctionPhotoUndo.has(key)&&item.canEdit?`<button type="button" class="photo-undo" data-action="auction-undo-photo" ${identity} data-side="${side}">${label} 사진 삭제 취소</button>`:''}<label class="parent-name-field"><span>${label} 이름</span><input maxlength="40" aria-label="${number} ${label} 개체 이름" value="${esc(name)}" ${item.canEdit?`data-auction-name="${side}" ${identity}`:'readonly'}></label></div>`;
   }).join('')}</div>${!item.canEdit?'<span class="auction-readonly">낙찰·종료</span>':''}</section>`;
  }).join('')}${auctionPhotoPending?`<button type="button" class="text" data-action="auction-retry-photo">저장 다시 시도</button>`:''}<button type="button" class="secondary auction-name-save" data-action="auction-save-names" ${auctionNameDrafts.size?'':'hidden'}>부모 이름 저장</button></div>`;
 }
 function openAuctionList(){
  draft=null;bulkDrafts=null;auctionPhotoItem=null;dirty=false;
  modal(dateLabel(selected),`<div class="entry-step-scroll bulk-scroll"><div class="entry-progress"><h3>출품 개체</h3><span>${auctionItems().length}마리</span></div>${auctionPhotoList()}${reservation()?pickupBlock(reservation()):''}</div><p class="form-error" id="step-error" role="alert"></p><div class="step-footer"><button class="primary" data-action="close">닫기</button></div>`,true);
  sheet.classList.add('bulk-sheet');
 }
 function refreshAuctionPhotos(){
  const table=$('#auction-photo-table');if(table)table.outerHTML=auctionPhotoList();
  if(auctionPhotoItem)auctionPhotoItem=auctionItem(auctionPhotoItem.id,auctionPhotoItem.channelId);
 }
  async function saveAuctionPhoto(side,photoId){return saveAuctionParent(side,{photoId})}
  async function saveAuctionParent(side,changes){
  const item=auctionPhotoItem;if(!item?.canEdit)return;
   const nameDraft=auctionNameDrafts.get(auctionParentKey(item,side)),body={...changes,itemId:item.id,itemChannelId:item.channelId||'national-cre',side,...(nameDraft?{name:nameDraft.name}:{}),expectedUpdatedAt:nameDraft?.expectedUpdatedAt||item.updatedAt};
   const pending=JSON.stringify(auctionPhotoPending)===JSON.stringify(body)?auctionPhotoPending:body,photoId=pending.photoId;
  auctionPhotoPending=pending;
  if(photoId&&Store.getState().media.find(m=>m.id===photoId)?.pending)await Store.send({type:'retry-photo',id:photoId});
   state=await request({type:'parent-photos',...pending});auctionPhotoPending=null;
   auctionNameDrafts.delete(auctionParentKey(item,side));
   const updated=auctionItem(item.id,item.channelId);
   for(const row of auctionNameDrafts.values())if(row.itemId===item.id&&row.itemChannelId===pending.itemChannelId&&row.expectedUpdatedAt===pending.expectedUpdatedAt)row.expectedUpdatedAt=updated.updatedAt;
   await Store.read({state:state.entryState});refreshAuctionPhotos();$('#step-error').textContent='';renderCalendar();message('부모정보를 저장했어요');
 }
  async function saveAuctionNames(){for(const row of [...auctionNameDrafts.values()]){auctionPhotoItem=auctionItem(row.itemId,row.itemChannelId);if(!auctionPhotoItem?.canEdit)throw Error('개체 상태가 변경됐어요. 최신 자료를 불러와 주세요.');await saveAuctionParent(row.side,{name:row.name})}}
  function captureAuctionName(input){
   const item=auctionItem(input.dataset.item,input.dataset.itemChannel),side=input.dataset.auctionName;if(!item?.canEdit)return;
   const key=auctionParentKey(item,side),name=input.value,previous=auctionNameDrafts.get(key);
   if(name===(item.parents?.find(p=>p.role===side)?.name||''))auctionNameDrafts.delete(key);
   else auctionNameDrafts.set(key,{itemId:item.id,itemChannelId:item.channelId||'national-cre',side,name,expectedUpdatedAt:previous?.expectedUpdatedAt||item.updatedAt});
   const save=$('[data-action="auction-save-names"]');if(save)save.hidden=!auctionNameDrafts.size;
  }
 function auctionPhotoError(error){
  $('#step-error').textContent=error.message;
  if(error.status===409)$('#step-error').insertAdjacentHTML('beforeend',' <button type="button" class="text" data-action="auction-photo-refresh">최신 자료 불러오기</button>');
 }
 function modal(title,body,editing=false){
  $('#sheet-title').textContent=title;$('#sheet-body').innerHTML=body;sheet.className='broadcast-sheet'+(editing?' entry-sheet':'');
  if(!sheet.open){lastTrigger=document.activeElement;sheet.showModal()}
 }
 function renderCalendar(){
   const calendarOpen=$('#all-broadcast-dates')?.open,deliveryOpen=$('#vendor-delivery')?.open;
  const months=[...new Set(state.dates.map(d=>d.date.slice(0,7)))];
  if(!months.includes(month))month=months[0];
  const [year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate(),offset=new Date(Date.UTC(year,m-1,1)).getUTCDay();
  let cells='<span aria-hidden="true"></span>'.repeat(offset);
  for(let n=1;n<=count;n++){const k=month+'-'+String(n).padStart(2,'0'),d=state.dates.find(d=>d.date===k),mine=d?.regionName===state.vendor.region,attention=d&&task(d);
   const regionLabel=d&&({'서울·인천':'서울\n인천','전라·충청':'전라\n충청','대구·경북':'대구\n경북','부산·울산·경남':'부울경'}[d.regionName]||d.regionName);
    cells+=`<button class="day ${d?'event':''} ${mine?'mine':''} ${k===selected?'selected':''}" ${d?`data-date="${k}" aria-label="${m}월 ${n}일 ${d.regionName} 방송${attention?', 개체 등록 필요':mine?', 내 출품 보기':''}"`:'disabled'}><span>${n}</span>${attention?'<i class="calendar-attention" aria-hidden="true"></i>':''}${d?`<small class="calendar-region">${esc(regionLabel)}</small>${mine?'<small class="calendar-mine">내 방송</small>':''}`:''}</button>`;
  }
   $('#calendar-content').innerHTML=`${roundCards()}<details id="all-broadcast-dates" class="vendor-secondary" ${calendarOpen?'open':''}><summary>전체 방송 달력</summary><section class="broadcast-calendar" aria-label="방송 달력"><div class="calendar-head"><h2>${year}년 ${m}월</h2><div><button class="icon" style="display:inline-grid" data-month="-1" aria-label="이전 달" ${month===months[0]?'disabled':''}>‹</button><button class="icon" style="display:inline-grid" data-month="1" aria-label="다음 달" ${month===months.at(-1)?'disabled':''}>›</button></div></div><div class="week" aria-hidden="true">${'일월화수목금토'.split('').map(s=>'<div>'+s+'</div>').join('')}</div><div class="dates">${cells}</div></section></details><details id="vendor-delivery" class="vendor-secondary" ${deliveryOpen?'open':''}><summary>개체 보내는 방법·운송 일정</summary><div id="vendor-inbound"></div></details>`;
  renderInbound();
 }
  function roundCards(){
   const rounds=CreoVendorTasks.vendorBroadcasts(state),upcoming=rounds.filter(r=>!r.past),past=rounds.filter(r=>r.past&&(r.reservation||r.count)).reverse();
   const card=r=>`<article class="vendor-round-card" aria-label="${esc(dateLabel(r.date)+' '+r.region)}"><p class="round-eyebrow">${r.past?'지난 방송':'내 방송일'}</p><h2>${esc(dateLabel(r.date))}</h2><p class="round-region">${esc(r.region)}편 · 오후 8시</p><p class="round-status">${r.past?'방송 종료 · '+r.count+'마리':r.assigned?'경매 편성 완료 · '+r.count+'마리':r.complete?'출품 접수 완료 · '+r.submitted+'마리':r.needsChanges?'수정할 개체가 있어요':r.reservation?r.submitted+' / 4마리 접수 · 작성 중':r.canStart?'출품할 개체 4마리를 등록해 주세요.':'접수 일정 확인이 필요해요.'}</p><button type="button" class="primary ${!r.complete&&!r.past?'registration-task':''}" data-date="${r.date}"${!r.past&&r.canStart&&!r.reservation&&!r.assigned?' data-start-registration="true"':''}>${r.past?'출품 내역 보기':r.assigned?'출품 개체 보기':r.complete?'등록한 개체 보기·수정':r.reservation?'개체 등록 이어하기':r.canStart?'개체 등록 시작':'방송 정보 보기'}</button>${r.count&&!r.past?`<button type="button" class="parent-task" data-date="${r.date}" data-photos="true"><span><strong>부모 사진·이름 ${r.past?'보기':'등록'}</strong><small>${r.missingSire||r.missingDam?`부 사진 ${r.missingSire}마리 · 모 사진 ${r.missingDam}마리 미등록`:'부모 사진 등록 완료'}</small></span><span aria-hidden="true">›</span></button>`:''}</article>`;
   return `<section class="my-broadcasts" aria-label="내 출품 관리">${upcoming.map(card).join('')||(!past.length?'<p class="vendor-empty">예정된 방송이 없어요. 전체 방송 달력에서 일정을 확인해 주세요.</p>':'')}${past.length?`<details class="vendor-secondary"><summary>지난 출품 내역 · ${past.length}회</summary>${past.map(card).join('')}</details>`:''}</section>`;
  }
 function renderInbound(){window.CreoInbound?.render({state,month,redraw:renderCalendar,openDate,save:async(carrier,originId)=>{state=await request({type:'inbound-origin',carrier,originId,expectedVersion:state.version})}})}
 async function load(){
  $('#load-error').textContent='';$('#refresh').disabled=true;
  const inboundReady=window.CreoInbound?.ready();
  try{
   const next=await request();
   if(next.mode!=='regional-cycle-v1'){location.replace('/vendor-bookings.html?'+new URLSearchParams(params()));return}
   if(q.get('event')&&q.get('event')!==next.channel.id){const canonical=new URL(location.href);canonical.searchParams.set('event',next.channel.id);location.replace(canonical.href);return;}
   await Store.read({state:{...next.entryState,bookingSummary:{enabled:true,mode:next.mode}}});recovery=Store.recovery.read()?.nationalDrafts||{};state=next;
   if(!month)month=(state.dates.find(d=>d.startsAt>=state.now&&d.regionName===state.vendor.region)||state.dates[0]).date.slice(0,7);
   $('#company-name').textContent=state.vendor.name;
   $('#nav-broadcast').href=location.pathname+location.search;$('#nav-settlement').href=Store.pageUrl('settlement');$('#nav-profile').href=Store.pageUrl('profile');window.CreoVendorShell.mount($('.channel-vendor-nav'),{active:'booking',companyName:state.vendor.name});$('.channel-vendor-nav').hidden=false;
   $('#channel-picker').href='/vendor-access.html?'+new URLSearchParams({section:'channels',...(q.get('portal')?{company:q.get('portal')}:{})});
   renderCalendar();
   inboundReady?.then(()=>{if(state)renderCalendar()});
  }catch(e){
   $('#load-error').textContent=e.message;
   if(!state||e.status===401){state=null;$('#calendar-content').innerHTML='';$('.channel-vendor-nav').hidden=true;}
   if(e.status===401)$('#load-error').insertAdjacentHTML('beforeend',' <a class="text" href="/vendor-access.html">다시 로그인</a>');
  }finally{$('#refresh').disabled=false}
 }
 function startRegistration(date){
  if(busy||photoBusy)return;
  const d=state.dates.find(d=>d.date===date);if(!d)return;
  openDate(date);
  if(reservation(date)||d.maxQuantityAvailable<4)return;
  return run(async()=>{state=await request({type:'reserve',date,quantity:4});openDate(date);renderCalendar();sheet.querySelector('[name="sex-0"]')?.focus();});
 }
 function openDate(date,index){
  selected=date;const d=state.dates.find(d=>d.date===date),r=reservation(date);if(!d)return;
  if(index===undefined&&auctionItems(date).length>=(r?entryLimit(r):1)){openAuctionList();return}
  auctionPhotoItem=null;
  if(r&&index===undefined){openBulk();return}
  bulkDrafts=null;
  if(!r){modal(dateLabel(date),`<div class="broadcast-empty"><p class="eyebrow">${esc(d.regionName)} · 오후 8시</p><h3>${d.regionName===state.vendor.region?'개체 미등록':esc(d.regionName)+' 방송'}</h3><p class="muted">${esc(d.reason||policyText(d))}</p></div>${d.maxQuantityAvailable>=4?'<button class="primary" data-action="reserve">출품 개체 등록</button>':''}<p class="form-error" id="step-error" role="alert"></p>`);return}
  slot=index??r.entries.findIndex(pending);if(slot<0)slot=0;
  const e=entry(),saved=recovery[r.entryIds[slot]],canEdit=editable(e);
  draft=saved&&canEdit?structuredClone(saved):{id:r.entryIds[slot],version:e?.version||0,sex:e?.sex||'',weight:e?.weight||'',hatchDate:e?.hatchDate||'',note:e?.note||'',parents:entryParents(e)};
  dirty=!!(saved&&canEdit);const conflict=dirty&&draft.version!==(e?.version||0);
  modal(dateLabel(date),`<form id="entry-step-form" novalidate><div class="entry-step-scroll"><div class="entry-progress"><h3>출품 개체</h3><span>${r.completed}마리 제출</span></div><div class="entry-steps" aria-label="출품 개체">${r.entries.slice(0,entryLimit(r)).map((e,i)=>`<button type="button" data-slot="${i}" aria-label="개체 ${i+1}, ${labels[e?.status]||'미등록'}" ${slot===i?'aria-current="step"':''}><span>${i+1}</span><small>${labels[e?.status]||'미등록'}</small></button>`).join('')}</div>
   ${e?.reason?`<p class="entry-reason">${esc(e.reason)}</p>`:''}${conflict?'<p class="entry-reason">다른 화면에서 변경됐어요. 작성 내용을 확인한 뒤 최신 자료를 불러와 주세요.</p><button type="button" class="text" data-action="discard">최신 자료 불러오기</button>':''}
   <fieldset class="sex-options" ${canEdit&&!conflict?'':'disabled'}><legend>성별</legend><div>${[['female','암컷'],['male','수컷'],['unknown','미구분']].map(([v,l])=>`<label><input type="radio" name="sex" required value="${v}" ${draft.sex===v?'checked':''}><span>${l}</span></label>`).join('')}</div></fieldset>
   <div class="step-basics"><label class="field">체중<span class="weight-input"><input name="weight" type="number" required min=".01" max="1000" step=".01" inputmode="decimal" value="${esc(draft.weight)}" ${canEdit&&!conflict?'':'readonly'}><span>g</span></span></label><label class="field">출생년월일<input name="hatchDate" type="date" required max="${koreanDay(state.now)}" value="${esc(draft.hatchDate)}" ${canEdit&&!conflict?'':'readonly'}></label></div>
   <label class="field step-extra">추가 정보 <span class="muted">(선택)</span><textarea name="note" rows="2" maxlength="600" placeholder="모프, 특징 등" ${canEdit&&!conflict?'':'readonly'}>${esc(draft.note)}</textarea></label>${photoBlock(!canEdit||conflict)}
   <p id="step-error" class="form-error" role="alert"></p>${!canEdit?`<p class="server-status">${labels[e?.status]||'개체 등록이 마감됐어요.'}</p>`:''}
    </div><div class="step-footer">${slot?'<button type="button" class="secondary" data-action="prev">이전</button>':''}${canEdit&&!conflict?`<button class="primary" type="submit">${r.completed>=3?'제출하기':'제출하고 다음'}</button>`:e?.status==='submitted'&&registrationOpen(r)?'<button class="primary" type="button" data-action="reopen">수정하기</button>':'<button class="primary" type="button" data-action="next">다음</button>'}</div></form>`,true);
  sheet.querySelector('[aria-current=step]')?.focus({preventScroll:true});
 }
 function bulkEditable(i){return editable(entry(reservation(),i),i)}
 function bulkPhotos(row,i,readonly){
  return `<div class="bulk-photo-grid">${[['animal','개체'],['sire','부 개체'],['dam','모 개체']].map(([side,label])=>{
   const id=side==='animal'?row.photoIds?.[0]:row.parents?.[side]?.photoId,m=id&&photo(id),url=m&&(m.thumbnailUrl||m.url)||photoUrls.get(id);
   return `<div class="parent-photo"><label class="photo-picker ${url?'has-photo':''}">${url?`<img src="${esc(url)}" alt="개체 ${i+1} ${label} 사진">`:''}<span>${label}<small>${readonly?(url?'등록됨':'미등록'):(url?'사진 교체':'사진 추가')}</small></span>${readonly?'':`<input type="file" accept="image/jpeg,image/png,image/webp" data-bulk-photo="${side}" data-index="${i}" aria-label="개체 ${i+1} ${label} 사진 ${url?'교체':'추가'}">`}</label>${url&&!readonly?`<button type="button" class="photo-remove" data-action="bulk-remove-photo" data-index="${i}" data-side="${side}" aria-label="개체 ${i+1} ${label} 사진 삭제"><span aria-hidden="true">×</span></button>`:''}${removed.has(row.id+side)&&!readonly?`<button class="photo-undo" type="button" data-action="bulk-undo-photo" data-index="${i}" data-side="${side}">삭제 취소</button>`:''}${side==='animal'?'':`<label class="parent-name-field"><span>${label} 이름</span><input name="${side}-name-${i}" aria-label="개체 ${i+1} ${label} 이름" maxlength="40" value="${esc(row.parents?.[side]?.name||'')}" ${readonly?'readonly':''}></label>`}</div>`;
  }).join('')}</div>${[['animal','개체'],['sire','부 개체'],['dam','모 개체']].map(([side,label])=>photoStatus(side==='animal'?row.photoIds?.[0]:row.parents?.[side]?.photoId,readonly,`개체 ${i+1} ${label} 사진`,i)).join('')}`;
 }
  function bulkDetails(row,i,readonly){
  const photos=(row.photoIds?.length||0)+['sire','dam'].filter(side=>row.parents?.[side]?.photoId).length;
  const extra=[photos?'사진 '+photos+'장':'',row.note||['sire','dam'].some(side=>row.parents?.[side]?.name)?'정보 있음':''].filter(Boolean).join(' · ');
   return `<details class="bulk-details"><summary aria-label="개체 ${i+1} 사진·부모정보${extra?', '+extra:''}"><span>사진·부모정보</span><small>${photos?`사진 ${photos}장`:'사진 추가'}</small><span class="bulk-caret" aria-hidden="true">⌄</span></summary><div class="bulk-extra">${readonly&&reservation().entries[i]?.status==='submitted'&&registrationOpen(reservation())?`<button type="button" class="secondary parent-edit" data-action="bulk-reopen" data-index="${i}" data-photos="true">부모 사진·이름 수정</button>`:''}${bulkPhotos(row,i,readonly)}<label class="bulk-field bulk-note"><span>추가 정보 <small>선택</small></span><textarea name="note-${i}" aria-label="개체 ${i+1} 추가 정보" rows="2" maxlength="600" placeholder="모프, 특징 등" ${readonly?'readonly':''}>${esc(row.note)}</textarea></label></div></details>`;
 }
 function openBulk(){
  const r=reservation();draft=null;
   for(const e of r.entries)if(e?.status==='submitted'&&recovery[e.id])editingSubmitted.add(e.id);
  bulkDrafts=r.entryIds.slice(0,entryLimit(r)).map((id,i)=>{
   const e=r.entries[i],saved=recovery[id];
   return saved&&bulkEditable(i)?structuredClone(saved):{id,version:e?.version||0,sex:e?.sex||'',weight:e?.weight||'',hatchDate:e?.hatchDate||'',note:e?.note||'',photoIds:e?.photoIds||[],parents:entryParents(e)};
  });
  dirty=bulkDrafts.some((row,i)=>bulkEditable(i)&&!!recovery[row.id]);
   modal(dateLabel(selected),`<form id="bulk-entry-form" novalidate><div class="entry-step-scroll bulk-scroll"><div class="entry-progress"><h3>${CreoVendorTasks.broadcastRegistrationComplete(r)?'개체 등록 완료':'출품 개체'}</h3><span>${r.completed?r.completed+'마리 접수':entryLimit(r)+'마리'}</span></div>
   <p class="muted">${esc(policyText(r.session))}</p>
   <div class="bulk-columns" aria-hidden="true"><span>개체</span><span>성별</span><span>체중(g)</span><span>출생년월일</span></div>
   <div class="bulk-rows">${bulkDrafts.map((row,i)=>{
    const e=r.entries[i],conflict=bulkEditable(i)&&row.version!==(e?.version||0),readonly=!bulkEditable(i)||conflict;
    return `<section class="bulk-row" data-bulk-row="${i}" aria-labelledby="bulk-label-${i}"><h4 class="bulk-number" id="bulk-label-${i}" aria-label="개체 ${i+1}">${i+1}</h4>
    <label class="bulk-field"><span>성별</span><select name="sex-${i}" aria-label="개체 ${i+1} 성별" ${readonly?'disabled':''}><option value="">선택</option>${[['female','암컷'],['male','수컷'],['unknown','미구분']].map(([v,l])=>`<option value="${v}" ${row.sex===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="bulk-field"><span>체중 (g)</span><input name="weight-${i}" aria-label="개체 ${i+1} 체중 (g)" type="number" inputmode="decimal" min=".01" max="1000" step=".01" placeholder="g" value="${esc(row.weight)}" ${readonly?'readonly':''}></label>
    <label class="bulk-field bulk-date"><span>출생년월일</span><input name="hatchDate-${i}" aria-label="개체 ${i+1} 출생년월일" type="date" max="${koreanDay(state.now)}" value="${esc(row.hatchDate)}" ${readonly?'readonly':''}></label>
     <div class="bulk-row-state"><span>${e?.status==='submitted'&&editingSubmitted.has(e.id)?'수정 중 · 기존 접수 유지':labels[e?.status]||''}</span>${e?.status==='submitted'&&!editingSubmitted.has(e.id)&&registrationOpen(r)?`<button type="button" class="text" data-action="bulk-reopen" data-index="${i}" aria-label="개체 ${i+1} 수정">수정</button>`:''}</div>
    ${bulkDetails(row,i,readonly)}${e?.reason?`<p class="entry-reason">${esc(e.reason)}</p>`:''}${conflict?`<p class="entry-reason">다른 화면에서 변경된 개체예요.</p><button type="button" class="text bulk-latest" data-action="bulk-latest" data-index="${i}">최신 자료 불러오기</button>`:''}</section>`;
   }).join('')}</div><p id="step-error" class="form-error" role="alert"></p>
   ${retainedEntries(r)}${auctionItems().length?'<h3 class="auction-photo-heading">편성된 개체 부모정보</h3>'+auctionPhotoList():''}${pickupBlock(r)}
   </div><div class="step-footer"></div></form>`,true);
  renderBulkActions();
  sheet.classList.add('bulk-sheet');
 }
 function retainedEntries(r){
  return r.entryIds.slice(entryLimit(r)).map((id,j)=>{
   const i=entryLimit(r)+j,e=r.entries[i],row=recovery[id]||e;
   if(!row)return '';
    return `<details class="bulk-details"><summary>개체 ${i+1} 기존 자료 보관</summary><p class="muted">현재 등록 한도는 ${entryLimit(r)}마리입니다. 기존 자료는 삭제하지 않고 보관합니다.${e?.status==='approved'?' 이미 승인된 개체는 운영자에게 확인해 주세요.':''}</p><p>${esc(labels[e?.status]||'이 기기에 임시 저장')} · ${esc(row.sex==='male'?'수컷':row.sex==='female'?'암컷':'미구분')} · ${esc(row.weight||'미입력')}g · ${esc(row.hatchDate||'출생일 미입력')}</p>${bulkDetails({...row,parents:row.parents||entryParents(e)},i,true)}${e?.status==='submitted'&&registrationOpen(r)?`<button type="button" class="text" data-action="bulk-withdraw" data-index="${i}">개체 ${i+1} 제출 철회</button>`:''}</details>`;
  }).join('');
 }
 function renderBulkActions(){
  const hasEdits=bulkDrafts.some((row,i)=>bulkEditable(i)&&rowHasData(row));
  const canSubmit=hasEdits||(!CreoVendorTasks.broadcastRegistrationComplete(reservation())&&bulkDrafts.some((_,i)=>bulkEditable(i)));
   const replacing=bulkDrafts.some(row=>editingSubmitted.has(row.id));
   $('#bulk-entry-form .step-footer').innerHTML=canSubmit?(replacing?'<button type="button" class="secondary" data-action="bulk-cancel-edit">변경 취소</button><button type="submit" class="primary">변경사항 저장</button>':'<button type="button" class="secondary" data-action="bulk-save">나중에 이어 쓰기</button><button type="submit" class="primary">출품 등록 완료</button>'):'<button type="button" class="primary" data-action="close">닫기</button>';
 }
 function captureBulk(){
  if(!bulkDrafts)return;
  for(const [i,row] of bulkDrafts.entries()){
   if(!bulkEditable(i)||row.version!==(reservation().entries[i]?.version||0))continue;
   for(const key of ['sex','weight','hatchDate','note'])row[key]=$(`[name="${key}-${i}"]`)?.value||'';
   for(const side of ['sire','dam'])row.parents[side]={...row.parents[side],name:$(`[name="${side}-name-${i}"]`)?.value??row.parents[side]?.name??''};
   recovery[row.id]=structuredClone(row);
  }
  dirty=true;renderBulkActions();persistRecovery().catch(e=>{$('#step-error').textContent=e.message});
 }
 async function commitBulk(submit){
  await saveAuctionNames();
  if(!bulkDrafts||(!dirty&&!submit))return true;
  captureBulk();await recoveryQueue;
   const rows=bulkDrafts.map((row,i)=>({row,i})).filter(({row,i})=>bulkEditable(i)&&(submit||reservation().entries[i]?.status!=='submitted')&&(rowHasData(row)||!!reservation().entries[i]));
   if(submit&&reservation().completed+rows.filter(({i})=>reservation().entries[i]?.status!=='submitted').length<4){const empty=bulkDrafts.findIndex(row=>!rowHasData(row));$(`[name="sex-${empty}"]`)?.focus();throw Error('4마리의 정보를 모두 입력해 주세요.');}
  if(!rows.length){if(submit)throw Error('등록할 개체 정보를 입력해 주세요.');dirty=false;return true}
  for(const {row,i} of rows){
   if(row.version!==(reservation().entries[i]?.version||0))throw Error(`개체 ${i+1}: 최신 자료를 불러온 뒤 다시 저장해 주세요.`);
   if(submit){for(const key of ['sex','weight','hatchDate']){const input=$(`[name="${key}-${i}"]`);input.required=true;if(!input.checkValidity()){input.setAttribute('aria-invalid','true');input.focus();input.reportValidity();throw Error(`개체 ${i+1}: 성별·체중·출생년월일을 확인해 주세요.`)}input.removeAttribute('aria-invalid')}}
   for(const id of [...(row.photoIds||[]),...Object.values(row.parents||{}).map(p=>p.photoId)].filter(Boolean)){if(Store.getState().media.find(m=>m.id===id)?.pending)await Store.send({type:'retry-photo',id})}
  }
   state=await request({type:'save-entries',id:reservation().id,submit,entries:rows.map(({row,i})=>({slot:i,expectedVersion:row.version,...(reservation().entries[i]?.status==='submitted'?{replaceSubmitted:true}:{}),entry:{sex:row.sex,weight:row.weight,hatchDate:row.hatchDate,note:row.note,photoIds:row.photoIds||[]},parents:row.parents}))});
   for(const {row} of rows){delete recovery[row.id];editingSubmitted.delete(row.id);for(const side of ['animal','sire','dam'])removed.delete(row.id+side)}
  await persistRecovery();dirty=false;return true;
 }
 async function commit(submit){
  if($('#bulk-entry-form'))return commitBulk(submit);
  await saveAuctionNames();
  if(!draft||!editable()||(!dirty&&!submit))return true;
  capture();await recoveryQueue;
   if(!submit&&entry()?.status==='submitted')return true;
  const r=reservation(),id=draft.id;
  for(const parent of Object.values(draft.parents||{})){const media=parent.photoId&&Store.getState().media.find(m=>m.id===parent.photoId);if(media?.pending)await Store.send({type:'retry-photo',id:media.id})}
   state=await request({type:'save-entry',id:r.id,slot,expectedVersion:draft.version,submit,...(entry()?.status==='submitted'?{replaceSubmitted:true}:{}),entry:{sex:draft.sex,weight:draft.weight,hatchDate:draft.hatchDate,note:draft.note},parents:draft.parents});
   delete recovery[id];editingSubmitted.delete(id);removed.delete(id+'sire');removed.delete(id+'dam');await persistRecovery();dirty=false;return true;
 }
 async function run(work){if(busy||photoBusy)return;setBusy(true);try{await work()}catch(e){const error=$('#step-error')||$('#load-error');if(auctionPhotoItem&&$('#step-error'))auctionPhotoError(e);else error.textContent=e.message;if(e.message.includes('계좌'))error.insertAdjacentHTML('beforeend',` <a class="text" href="${esc(Store.pageUrl('profile'))}">업체 정보</a>`)}finally{setBusy(false)}}
 async function close(){await run(async()=>{await commit(false);sheet.close();renderCalendar()})}
 async function imageBlob(file){
  if(!file.type.startsWith('image/')||file.size>10*1024*1024)throw Error('10MB 이하 사진을 선택해 주세요.');
  const url=URL.createObjectURL(file),img=new Image();
  try{await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('JPG 또는 PNG 사진을 선택해 주세요.'));img.src=url});const scale=Math.min(1,800/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',.72));if(!blob||blob.size>350000)throw Error('사진 크기를 줄여 다시 선택해 주세요.');return blob}finally{URL.revokeObjectURL(url)}
 }
 document.addEventListener('input',e=>{if(e.target.dataset.auctionName){captureAuctionName(e.target);return}if(e.target.type!=='file'&&e.target.closest('#entry-step-form,#bulk-entry-form')){e.target.removeAttribute('aria-invalid');capture()}});
 document.addEventListener('change',async e=>{
  if(e.target.dataset.auctionParent){
   if(busy||photoBusy)return;
   auctionPhotoItem=auctionItem(e.target.dataset.item,e.target.dataset.itemChannel);
   const side=e.target.dataset.auctionParent,file=e.target.files?.[0];if(!file||busy||photoBusy||!auctionPhotoItem?.canEdit)return;
   photoBusy=true;setBusy(true);
   try{const blob=await imageBlob(file),id=uid(),url=URL.createObjectURL(blob);photoUrls.set(id,url);await Store.send({type:'media',media:{id,blob,url,thumbnailUrl:url,label:side==='sire'?'부 개체':'모 개체'}});await saveAuctionPhoto(side,id);}
   catch(error){refreshAuctionPhotos();auctionPhotoError(error);}
   finally{photoBusy=false;setBusy(false)}return;
  }
  if(e.target.dataset.bulkPhoto){
   const i=Number(e.target.dataset.index),side=e.target.dataset.bulkPhoto,file=e.target.files?.[0];
   if(!file||busy||photoBusy||!bulkEditable(i))return;
   captureBulk();photoBusy=true;setBusy(true);const scroll=$('.bulk-scroll').scrollTop;
   try{const blob=await imageBlob(file),id=uid(),url=URL.createObjectURL(blob);photoUrls.set(id,url);const result=await Store.send({type:'media',media:{id,blob,url,thumbnailUrl:url,label:`개체 ${i+1} ${side}`}});state.entryState.media=result.state.media;
    if(side==='animal')bulkDrafts[i].photoIds=[id];else bulkDrafts[i].parents[side]={...bulkDrafts[i].parents[side],photoId:id};
    recovery[bulkDrafts[i].id]=structuredClone(bulkDrafts[i]);await persistRecovery();openBulk();$(`[data-bulk-row="${i}"] details`).open=true;$('.bulk-scroll').scrollTop=scroll;
   }catch(error){$('#step-error').textContent=error.message}finally{photoBusy=false;setBusy(false)}return;
  }
  const side=e.target.dataset.photo,file=e.target.files?.[0];if(!side||!file||busy||photoBusy||!editable())return;
  capture();photoBusy=true;setBusy(true);
  try{const blob=await imageBlob(file),id=uid(),url=URL.createObjectURL(blob);photoUrls.set(id,url);const result=await Store.send({type:'media',media:{id,blob,url,thumbnailUrl:url,label:side==='sire'?'부 개체':'모 개체'}});state.entryState.media=result.state.media;draft.parents[side]={...draft.parents[side],photoId:id};recovery[draft.id]=structuredClone(draft);await persistRecovery();dirty=true;openDate(selected,slot)}
  catch(error){$('#step-error').textContent=error.message}finally{photoBusy=false;setBusy(false)}
 });
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||busy||photoBusy)return;
   if(b.dataset.date){if(b.dataset.startRegistration){startRegistration(b.dataset.date);return}const r=reservation(b.dataset.date),index=Math.max(0,r?.entries.findIndex(e=>e&&['draft','submitted','changes_requested'].includes(e.status))??0);if(b.dataset.photos&&r?.entries[index]?.status==='submitted')editingSubmitted.add(r.entries[index].id);openDate(b.dataset.date);if(b.dataset.photos){const details=sheet.querySelector(`[data-bulk-row="${index}"] .bulk-details`);if(details){details.open=true;details.querySelector('summary')?.focus()}else sheet.querySelector('[data-auction-parent]')?.focus()}return}
  if(b.dataset.month){const months=[...new Set(state.dates.map(d=>d.date.slice(0,7)))],next=months[months.indexOf(month)+Number(b.dataset.month)];if(next){month=next;renderCalendar()}return}
  if(b.dataset.slot!==undefined){run(async()=>{await commit(false);openDate(selected,Number(b.dataset.slot))});return}
  const action=b.dataset.action;
  if(action==='retry-draft-photo'){run(()=>retryDraftPhoto(b.dataset.photoId,b.dataset.index===undefined?undefined:Number(b.dataset.index)));return}
  if(action==='auction-photo-refresh'){run(async()=>{state=await request();auctionPhotoPending=null;for(const row of auctionNameDrafts.values()){const item=auctionItem(row.itemId,row.itemChannelId);if(item)row.expectedUpdatedAt=item.updatedAt;}refreshAuctionPhotos();$('#step-error').textContent=''});return}
  if(action==='auction-retry-photo'){auctionPhotoItem=auctionItem(auctionPhotoPending.itemId,auctionPhotoPending.itemChannelId);run(()=>saveAuctionParent(auctionPhotoPending.side,auctionPhotoPending));return}
  if(action==='auction-remove-photo'||action==='auction-undo-photo'){
   auctionPhotoItem=auctionItem(b.dataset.item,b.dataset.itemChannel);if(!auctionPhotoItem?.canEdit)return;
   run(async()=>{const side=b.dataset.side,key=auctionParentKey(auctionPhotoItem,side);if(action==='auction-remove-photo'){const previous=auctionPhotoItem.parentPhotoIds[side];if(previous)auctionPhotoUndo.set(key,previous);else auctionPhotoUndo.delete(key);await saveAuctionPhoto(side,'')}else{const photoId=auctionPhotoUndo.get(key);await saveAuctionPhoto(side,photoId);auctionPhotoUndo.delete(key);refreshAuctionPhotos()}});return;
  }
  if(action==='auction-save-names'){run(saveAuctionNames);return}
  if(action==='bulk-save'){run(async()=>{await commitBulk(false);openBulk();renderCalendar();message('입력한 개체를 저장했어요')});return}
   if(action==='bulk-reopen'){run(async()=>{captureBulk();const i=Number(b.dataset.index);editingSubmitted.add(reservation().entries[i].id);openBulk();if(b.dataset.photos){const details=$(`[data-bulk-row="${i}"] details`);details.open=true;details.querySelector('input[type=file]')?.focus()}else $(`[name="sex-${i}"]`)?.focus()});return}
   if(action==='bulk-cancel-edit'){run(async()=>{for(const e of reservation().entries)if(e?.status==='submitted'){delete recovery[e.id];editingSubmitted.delete(e.id)}await persistRecovery();openBulk()});return}
   if(action==='bulk-withdraw'){const i=Number(b.dataset.index);if(!confirm(`개체 ${i+1}의 제출을 철회할까요? 기존 정보는 작성 중으로 보관됩니다.`))return;run(async()=>{state=await request({type:'reopen-entry',id:reservation().id,slot:i,expectedVersion:reservation().entries[i].version});openBulk();renderCalendar()});return}
  if(action==='bulk-latest'){run(async()=>{const i=Number(b.dataset.index);captureBulk();delete recovery[bulkDrafts[i].id];await persistRecovery();await load();openBulk()});return}
  if(action==='bulk-remove-photo'||action==='bulk-undo-photo'){
   const i=Number(b.dataset.index),side=b.dataset.side;if(!bulkEditable(i))return;
   run(async()=>{captureBulk();const row=bulkDrafts[i],key=row.id+side,scroll=$('.bulk-scroll').scrollTop;
    if(action==='bulk-remove-photo'){removed.set(key,side==='animal'?row.photoIds:row.parents[side]);if(side==='animal')row.photoIds=[];else row.parents[side]={...row.parents[side],photoId:''}}
    else{if(side==='animal')row.photoIds=removed.get(key);else row.parents[side]={...row.parents[side],photoId:removed.get(key)?.photoId||''};removed.delete(key)}
    recovery[row.id]=structuredClone(row);await persistRecovery();openBulk();$(`[data-bulk-row="${i}"] details`).open=true;$('.bulk-scroll').scrollTop=scroll;
   });return;
  }
  if(action==='close'){close();return}
  if(action==='remove-photo'||action==='undo-photo'){run(async()=>{capture();const key=draft.id+b.dataset.side;if(action==='remove-photo'){removed.set(key,draft.parents[b.dataset.side]);draft.parents[b.dataset.side]={...draft.parents[b.dataset.side],photoId:''}}else{draft.parents[b.dataset.side]={...draft.parents[b.dataset.side],photoId:removed.get(key)?.photoId||''};removed.delete(key)}recovery[draft.id]=structuredClone(draft);await persistRecovery();openDate(selected,slot)});return}
  if(action==='discard'){run(async()=>{delete recovery[draft.id];await persistRecovery();dirty=false;await load();openDate(selected,slot)});return}
  if(action==='reserve')startRegistration(selected);
  if(action==='prev'||action==='next')run(async()=>{await commit(false);openDate(selected,action==='prev'?Math.max(0,slot-1):slot<entryLimit(reservation())-1?slot+1:undefined)});
   if(action==='reopen')run(async()=>{editingSubmitted.add(entry().id);openDate(selected,slot)});
  if(action==='pickup')run(async()=>{const r=reservation();state=await request({type:'pickup',id:r.id,expectedVersion:r.version,pickup:!r.pickup});openDate(selected)});
 });
 document.addEventListener('submit',e=>{
  if(e.target.id==='bulk-entry-form'){
   e.preventDefault();if(busy||photoBusy)return;captureBulk();
   for(const [i,row] of bulkDrafts.entries())for(const key of ['sex','weight','hatchDate']){const input=$(`[name="${key}-${i}"]`);input.required=bulkEditable(i)&&rowHasData(row);if(input.required&&!input.checkValidity()){input.setAttribute('aria-invalid','true');input.focus();input.reportValidity();$('#step-error').textContent=`개체 ${i+1}: 성별·체중·출생년월일을 확인해 주세요.`;return}}
   run(async()=>{await commitBulk(true);openBulk();renderCalendar();message('입력한 개체를 제출했어요')});return;
  }
  if(e.target.id!=='entry-step-form')return;e.preventDefault();if(!e.target.reportValidity())return;run(async()=>{await commit(true);const r=reservation(),missing=r.entries.slice(0,entryLimit(r)).findIndex(pending);openDate(selected,CreoVendorTasks.broadcastRegistrationComplete(r)||missing<0?undefined:missing);renderCalendar()})});
  $('#close').onclick=close;sheet.addEventListener('cancel',e=>{e.preventDefault();close()});sheet.addEventListener('close',()=>{draft=null;auctionPhotoItem=null;dirty=false;editingSubmitted.clear();(lastTrigger?.isConnected?lastTrigger:$('#refresh')).focus()});
 $('#refresh').onclick=load;window.addEventListener('beforeunload',e=>{if(busy||photoBusy||auctionNameDrafts.size){e.preventDefault();e.returnValue=''}});
 load();
})();

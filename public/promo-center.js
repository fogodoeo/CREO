(() => {
 'use strict';
 const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),admin=query.get('admin')==='1';
 const library=!admin&&(query.get('library')==='1'||!query.get('company'));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function imageURL(src){
  const url=new URL(src,location.origin);
  if(url.origin===location.origin&&/^\/promo-assets\/partners-20261007\.(png|thumb\.webp)$/.test(url.pathname))url.pathname=url.pathname.replace('partners-20261007.','partners-20261007-v4.');
  if(url.origin===location.origin&&/^\/promo-assets\/ticket\.(png|thumb\.webp)$/.test(url.pathname))url.pathname=url.pathname.replace('ticket.','ticket-seoul-incheon-v2.');
  if(url.origin===location.origin&&/^\/promo-assets\/(weekly|easy)\.(png|thumb\.webp)$/.test(url.pathname))url.pathname=url.pathname.replace(/\.(png|thumb\.webp)$/,'-v2.$1');
  if(url.origin===location.origin&&['/promo-assets/hero.jpg','/promo-assets/hero-seoul-incheon-v2.png'].includes(url.pathname))url.pathname='/promo-assets/hero-seoul-incheon-v3.png';
  return url.href;
 }
 function isSharedHero(block){
  if(block.type!=='image')return false;
  const url=new URL(block.src,location.origin);
  return url.origin===location.origin&&['/promo-assets/hero.jpg','/promo-assets/hero-seoul-incheon-v2.png','/promo-assets/hero-seoul-incheon-v3.png'].includes(url.pathname);
 }
 function isSharedAsset(b,kind){if(b.type!=='image')return false;const u=new URL(b.src,location.origin);return u.origin===location.origin&&(kind==='ticket'?/^\/promo-assets\/ticket(?:-seoul-incheon-v2)?\.png$/:/^\/promo-assets\/partners-20261007(?:-v4)?\.png$/).test(u.pathname);}
 function postBlocks(t,images=[]){
  const blocks=[],hasBoard=t.blocks.some(b=>isSharedAsset(b,'partners'));
  let inserted=false;
  for(const b of t.blocks){
   if(isSharedHero(b)||isSharedAsset(b,'ticket'))continue;
   if(isSharedAsset(b,'partners')){if(!inserted){blocks.push(...images.map(i=>({...i,type:'image'})));inserted=true;}continue;}
   if(hasBoard&&b.type==='text'&&/^※ 2026\.10\.07 기준/.test(b.text))continue;
   blocks.push(b);
   // Insert once, immediately after the paragraph introducing the participating vendors.
   if(!hasBoard&&!inserted&&b.type==='text'&&(/다양한 크레들을 선보일 예정|다양한 크레들을 선보입니다|30여 곳의 전문|전국의 전문 브리더|여러 업체의 크레|여러 지역의 전문 업체|지역별 전문 업체가 돌아가며 참여/.test(b.text))){blocks.push(...images.map(i=>({...i,type:'image'})));inserted=true;}
  }
  if(!inserted&&images.length){const index=blocks.findIndex(b=>b.href);blocks.splice(index<0?blocks.length:index,0,...images.map(i=>({...i,type:'image'})));}
  const ticket={type:'image',src:'/promo-assets/ticket-seoul-incheon-v2.png',alt:'첫 방송 서울·인천 편 · 10월 14일 · 배송비 무료 · 낙찰자 1인당 최대 3만 원 지원'};
  const link=blocks.findIndex(b=>b.href&&/band\.us/.test(b.href));blocks.splice(link<0?blocks.length:link,0,ticket);
  return [{type:'image',src:'/promo-assets/hero-seoul-incheon-v3.png',alt:'전국크레자랑 라이브 방송 · EP 01. 서울, 인천 · 10월 14일 수요일 밤 8시'},...blocks];
 }
 function thumbnailImage(t){return t.blocks.find(b=>b.type==='image'&&!isSharedHero(b));}
 function enablePreviewDismiss(dialog){
  let outsideStart=false;
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{outsideStart=e.isPrimary&&e.button===0&&outside(e);});
  dialog.addEventListener('pointercancel',()=>{outsideStart=false;});
  dialog.addEventListener('click',e=>{const dismiss=outsideStart&&outside(e);outsideStart=false;if(dismiss)dialog.close();});
  dialog.addEventListener('close',()=>{outsideStart=false;});
 }
 const kst=ms=>new Date(ms+9*3600000).toISOString().slice(0,10),format=d=>d.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$2월 $3일');
 let company=query.get('company')||'',session,state,month=kst(Date.now()).slice(0,7),selected=kst(Date.now()),template,busy=false,trigger,refreshSequence=0,copying=false;
 const pendingRequests=new Map();
 let loadedAt=Date.now(),assignmentOpened=false;
 let partnerMode='all',partnerRegions=new Set(),partnerImages=[],partnerReady=false,partnerSequence=0;
 const names={assigned:'배정됨',completed:'게시 완료',overdue:'미게시',cancelled:'취소됨'};
 function error(message){$('error').textContent=message;$('error').hidden=!message;}
 async function request(body){
  if(library){
   if(body&&body.action!=='partner-image')throw Error('원고 수정과 일정 관리는 업체 로그인 후 이용해 주세요.');
   const params=new URLSearchParams(body?{mode:body.mode,catalogVersion:body.catalogVersion}:{});
   for(const region of body?.regions||[])params.append('region',region);
   const response=await fetch('/api/platform/promo-library'+(body?'/partners?'+params:''),{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(body?60000:20000)});
   const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'원고를 불러오지 못했어요.'),{status:response.status});return data;
  }
  let fingerprint;
  if(body){const {requestId,...intent}=body;fingerprint=JSON.stringify(intent);const retained=pendingRequests.get(fingerprint)||requestId;pendingRequests.set(fingerprint,retained);body={...body,requestId:retained};}
  const params=new URLSearchParams({month,...(!admin?{company}:{})});
  const response=await fetch('/api/platform/promo-center'+(body?'':'?'+params),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-vendor-csrf':session?.csrfToken||''},...(body?{body:JSON.stringify({...body,...(!admin?{company}:{})})}:{}),signal:AbortSignal.timeout(body?.action==='partner-image'?60000:20000)});
  const data=await response.json();if(fingerprint&&(response.ok||response.status<500))pendingRequests.delete(fingerprint);if(!response.ok)throw Object.assign(Error(data.error||'불러오지 못했어요.'),{status:response.status});return data;
 }
 async function refresh(){
  const sequence=++refreshSequence;error('');$('loading').hidden=false;$('content').setAttribute('aria-busy','true');
  try{const result=await request();if(sequence!==refreshSequence)return;state=result;loadedAt=Date.now();$('content').hidden=false;$('login').hidden=true;render();}
  catch(e){if(sequence!==refreshSequence)return;if(e.status===401||e.status===403){$('content').hidden=true;$('login').hidden=false;for(const d of document.querySelectorAll('dialog[open]'))d.close();}throw e;}
  finally{if(sequence===refreshSequence){$('loading').hidden=true;$('content').removeAttribute('aria-busy');}}
 }
 const vendorName=id=>state.vendors.find(v=>v.id===id)?.name||'이전 참여 업체';
 const templateName=id=>state.templates.find(t=>t.id===id)?.name||'보관된 원고';
 function render(){
  if(library){
   document.title='홍보 원고 · 전국크레자랑';document.querySelector('h1').textContent='홍보 원고';
   $('library-intro').hidden=false;$('next').hidden=true;document.querySelector('.view-tabs').hidden=true;
   $('calendar-view').hidden=true;$('templates-view').hidden=false;$('vendor-nav').hidden=true;
   renderTemplates();return;
  }
  $('assign').hidden=!admin;$('settings').hidden=!admin;$('create-template').hidden=!admin;$('capacity').value=state.capacity;
  if(admin)$('next').innerHTML='<div class="next-card"><h2>날짜와 담당 업체를 배정해 주세요</h2><p class="muted">업체는 자신의 일정에서 원고를 복사하고, 게시한 글의 링크로 완료를 기록합니다.</p><span class="muted">시간대별 '+state.capacity+'곳 · 복사와 게시 완료를 별도로 기록</span></div>';
  else {const a=state.next;$('next').innerHTML=a?`<div class="next-card"><p class="eyebrow">${esc(vendorName(company))} · 다음 게시 일정</p><h2>${format(a.date)} ${state.slots[a.slot].label}</h2><p>${state.slots[a.slot].start}–${state.slots[a.slot].end} 사이에 게시해 주세요</p><button class="primary" data-preview="${esc(a.templateId)}">배정 원고 보기</button></div>`:'<div class="next-card"><h2>아직 배정된 일정이 없어요</h2><p class="muted">운영자가 배정하면 이곳에 표시됩니다. 홍보 원고는 미리 확인할 수 있어요.</p></div>';
   const pending=state.pending||[];
   $('next').innerHTML=pending.length?`<section class="next-card"><p class="eyebrow">${esc(vendorName(company))} · 내 게시 일정 ${pending.length}건</p>${pending.map((a,i)=>`<div class="pending-row"><div><${i?'h3':'h2'}>${format(a.date)} ${state.slots[a.slot].label}</${i?'h3':'h2'}><p class="muted">${state.slots[a.slot].start}–${state.slots[a.slot].end}${a.status==='overdue'?' · 게시 여부 확인 필요':''}</p></div><div class="actions"><button ${i?'':'class="primary"'} data-preview="${esc(a.templateId)}">원고 보기·복사</button><button data-complete="${a.id}">게시 완료 등록</button></div></div>`).join('')}</section>`:$('next').innerHTML;
   const nav=$('vendor-nav');nav.hidden=false;nav.dataset.company=company;nav.innerHTML=`<a href="/vendor-access.html?section=channels&company=${encodeURIComponent(company)}" data-vendor-section="booking"></a><a href="/vendor-access.html?section=profile&company=${encodeURIComponent(company)}" data-vendor-section="profile"></a>`;window.CreoVendorShell.mount(nav,{active:'promo',companyName:vendorName(company)});nav.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
  }
  renderCalendar();renderDay();renderTemplates();
 }
 function renderCalendar(){
  const [y,m]=month.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate();$('month-label').textContent=y+'년 '+m+'월';
  let html=['일','월','화','수','목','금','토'].map(d=>'<span class="weekday">'+d+'</span>').join('')+'<span></span>'.repeat(first);
  for(let n=1;n<=days;n++){const date=month+'-'+String(n).padStart(2,'0'),rows=state.assignments.filter(a=>a.date===date&&a.status!=='cancelled'),done=rows.filter(a=>a.status==='completed').length;
   html+=`<button class="day ${date===kst(state.now)?'today':''}" data-date="${date}" aria-pressed="${date===selected}" aria-label="${format(date)}, ${rows.length}곳 배정, ${done}곳 완료"><span>${n}</span>${rows.length?`<small>${done}/${rows.length} 완료${rows.some(a=>a.vendorId===company)?'<br>내 일정':''}</small>`:''}</button>`;
  }$('calendar').innerHTML=html;
 }
 function renderDay(){
  $('selected-date').textContent=format(selected)+' 게시 일정';
  $('day-list').innerHTML=Object.entries(state.slots).map(([key,slot])=>{const rows=state.assignments.filter(a=>a.date===selected&&a.slot===key);return `<section class="slot-card"><div class="slot-title"><h3>${slot.label}</h3><span>${slot.start}–${slot.end}</span></div>${rows.length?rows.map(a=>`<div class="assignment"><div class="assignment-top"><strong>${esc(vendorName(a.vendorId))}${a.vendorId===company?' · 내 일정':''}</strong><span class="state ${a.status}">${names[a.status]}</span></div><p>${esc(templateName(a.templateId))}</p><div class="actions"><button data-preview="${esc(a.templateId)}">원고 보기</button>${a.publication?`<a class="button" target="_blank" rel="noopener" href="${esc(a.publication.url)}">게시글 확인 ↗</a>`:a.status!=='cancelled'?(admin?`<button data-edit="${a.id}">배정 변경</button><button data-cancel="${a.id}">배정 취소</button>`:a.vendorId===company?`<button class="primary" data-complete="${a.id}">게시 완료 등록</button>`:''):''}</div>${a.publication?'<p class="muted">업체가 등록한 게시 완료 기록</p>':''}</div>`).join(''):'<p class="empty">배정된 업체가 없습니다</p>'}</section>`;}).join('');
 }
 function renderTemplates(){
  const cards=list=>list.map(entry=>{
   const t={usage:[],published:[],...entry};
   const image=thumbnailImage(t),paragraphs=t.blocks.filter(b=>b.type==='text'&&b.text.trim()&&!b.href);
   const prose=paragraphs.filter(b=>b.size===16&&!b.bold&&!b.text.trim().startsWith('※'));
   const lead=(prose.length?prose:paragraphs).slice(0,2).map(b=>b.text.replace(/\s+/g,' ').trim()).join(' ');
   const excerpt=lead.length>110?lead.slice(0,110)+'…':lead;
   const thumb=image?imageURL(image.src.replace(/\.[^.]+$/,'.thumb.webp')):undefined;
   return `<section class="template-card"><button class="template-visual" data-preview="${esc(t.id)}" aria-label="${esc(t.name)} 원고 미리보기"><span class="template-visual-fallback" aria-hidden="true"><small>전국크레자랑</small><strong>${esc(paragraphs[0]?.text||t.title)}</strong><span>${image?'이미지 미리보기':'텍스트 원고'}</span></span>${image?`<img src="${esc(thumb)}" data-original="${esc(imageURL(image.src))}" alt="" loading="lazy" decoding="async">`:''}</button><div class="template-info"><span class="eyebrow">${esc(t.name)}${t.active===false?' · 보관됨':''}</span><h3>${esc(t.title)}</h3><p class="template-excerpt">${esc(excerpt)}</p><p class="usage">최근 복사 · ${t.usage.length?t.usage.slice(0,3).map(c=>esc(vendorName(c.vendorId))+' '+format(kst(c.at))).join(' / '):'아직 없음'}<br>게시 완료 · ${t.published.length?t.published.slice(-3).map(c=>esc(vendorName(c.vendorId))+' '+format(c.date)).join(' / '):'아직 없음'}</p><div class="actions"><button data-preview="${esc(t.id)}">원고 보기·복사</button>${admin?`<button data-template-edit="${esc(t.id)}">수정</button><button data-template-clone="${esc(t.id)}">복제</button>`:''}</div></div></section>`;
  }).join('')||'<p class="empty">등록된 홍보 원고가 없습니다</p>';
  const active=state.templates.filter(t=>t.active!==false).sort((a,b)=>(a.catalogOrder??100)-(b.catalogOrder??100));
  const archived=state.templates.filter(t=>t.active===false);
  $('templates').innerHTML=cards(active);
  if(library)for(const usage of $('templates').querySelectorAll('.usage'))usage.hidden=true;
  $('archive-templates').hidden=!admin||!archived.length;
  $('archive-summary').textContent='보관된 원고 '+archived.length+'개';
  $('archived-templates').innerHTML=admin?cards(archived):'';
  for(const image of document.querySelectorAll('.template-visual img'))image.addEventListener('error',()=>{if(image.dataset.original){const original=image.dataset.original;delete image.dataset.original;image.src=original;}else image.hidden=true;});
 }
 function bodyHTML(t,copying=false,images=[]){return postBlocks(t,images).map(b=>b.type==='image'?`<p align="center" style="text-align:center;margin:20px 0"><img src="${esc(imageURL(copying&&b.copySrc?b.copySrc:b.src))}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p align="${b.align||'center'}" style="text-align:${b.align||'center'};font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;line-height:1.75;margin:0;word-break:keep-all;overflow-wrap:anywhere"><span style="font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;font-size:${b.size}px;color:${b.color==='green'?'#007443':'#202632'};font-weight:${b.bold?700:400}">${b.href?'<a href="'+esc(b.href)+'">':''}${(esc(b.text).replace(/\n/g,'<br>')||'<br>')}${b.href?'</a>':''}</span></p>`).join('');}
 function plainBody(t,images=[]){return postBlocks(t,images).filter(b=>b.type==='text').map(b=>b.href?b.text+'\n'+b.href:b.text).join('\n');}
 function preview(id){template=state.templates.find(t=>t.id===id);if(!template){error('보관된 원고입니다. 운영자에게 문의해 주세요.');return;}
  partnerMode='all';partnerRegions=new Set();partnerImages=[];partnerReady=false;
  $('post-title').textContent=template.title;$('copy-status').textContent='';
  for(const radio of document.querySelectorAll('[name="partner-mode"]'))radio.checked=radio.value===partnerMode;
  showPartnerRegions();drawPost();trigger=document.activeElement;$('detail').showModal();$('detail').querySelector('.dialog-scroll').scrollTop=0;updatePartners();
 }
 function syncCopyButtons(){$('copy-title').disabled=copying;$('copy-body').disabled=copying||!partnerReady;$('copy-mobile-text').disabled=copying||!partnerReady;$('prepare-images').disabled=copying||!partnerReady||!!imageBundleController;$('partner-controls').disabled=copying;$('partner-refresh').disabled=copying;}
 function drawPost(){
  clearImageBundle();
  $('post-preview').innerHTML=bodyHTML(template,false,partnerImages);
  $('downloads').innerHTML=postBlocks(template,partnerImages).filter(b=>b.type==='image').map((b,i)=>`<a download target="_blank" rel="noopener" href="${esc(imageURL(b.src))}">이미지 ${i+1} 다운로드 · ${esc(b.alt)}</a>`).join('');
  syncCopyButtons();
 }
 function showPartnerRegions(){
  $('partner-regions').hidden=partnerMode!=='regions';
  const regions=state.partners?.regions||[],signature=JSON.stringify(regions),host=$('partner-region-options');
  if(host.dataset.signature!==signature){const focused=host.contains(document.activeElement)?document.activeElement.value:null;host.innerHTML=regions.map(r=>`<label><input type="checkbox" value="${r.id}">${esc(r.name)} <span>${r.count}개 브랜드</span></label>`).join('');host.dataset.signature=signature;if(focused!==null)host.querySelector(`input[value="${Number(focused)}"]`)?.focus();}
  for(const input of host.querySelectorAll('input'))input.checked=partnerRegions.has(Number(input.value));
 }
 async function updatePartners(){
  const sequence=++partnerSequence,mode=partnerMode,regions=[...partnerRegions];partnerImages=[];partnerReady=mode==='none';$('copy-status').textContent='';$('partner-refresh').hidden=mode==='none';$('partner-retry').hidden=true;$('partner-status').removeAttribute('aria-busy');drawPost();
  const current=()=>sequence===partnerSequence&&$('detail').open;
  if(mode==='none'){$('partner-status').textContent='업체 이미지 없이 복사합니다. 첫 방송 서울·인천 편 배송비 티켓은 항상 포함됩니다.';return;}
  if(mode==='regions'&&!regions.length){$('partner-status').textContent='소개할 지역을 한 곳 이상 선택해 주세요.';return;}
  $('partner-status').textContent='최신 참여업체로 이미지를 준비하고 있어요';$('partner-status').setAttribute('aria-busy','true');
  try{
   const latest=await request();if(!current())return;state.partners=latest.partners;showPartnerRegions();
   const result=await request({action:'partner-image',requestId:crypto.randomUUID(),catalogVersion:state.partners.version,mode,regions});if(!current())return;
   await Promise.all(result.images.map(i=>new Promise((resolve,reject)=>{const image=new Image(),timeout=setTimeout(()=>reject(Error('image timeout')),20000);image.onload=()=>{clearTimeout(timeout);resolve();};image.onerror=()=>{clearTimeout(timeout);reject(Error('image load'));};image.src=imageURL(i.src);})));if(!current())return;
   partnerImages=result.images;partnerReady=true;drawPost();
   $('partner-status').textContent=`${result.count}개 브랜드 · ${result.images.length}장 포함 · ${mode==='all'?'4열':'지역별 3열'} 구성. 업체별 일정에 따라 순차 출연합니다.`;
  }catch(e){if(!current())return;$('partner-status').textContent=e.status?e.message:'업체 이미지를 준비하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';$('partner-retry').hidden=false;}
  finally{if(current()){$('partner-status').removeAttribute('aria-busy');syncCopyButtons();}}
 }
 async function copy(withFormatting){
  if(copying||(withFormatting&&!partnerReady))return;copying=true;syncCopyButtons();
  const t=template,html=bodyHTML(t,true,partnerImages),plain=plainBody(t,partnerImages);
  $('copy-status').textContent='';
  try {
   if(withFormatting==='plain')await navigator.clipboard.writeText(plain);
   else if(withFormatting){
    if(navigator.clipboard?.write&&window.ClipboardItem)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);
    else {const host=document.createElement('div');host.innerHTML=html;host.style.cssText='position:fixed;inset:0;opacity:0;pointer-events:none';$('detail').append(host);try{const range=document.createRange();range.selectNodeContents(host);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);if(!document.execCommand('copy'))throw Error('본문을 직접 선택해 복사해 주세요.');selection.removeAllRanges();}finally{host.remove();}}
   }else await navigator.clipboard.writeText(t.title);
   $('copy-status').textContent=withFormatting==='plain'?'글을 복사했어요.':withFormatting?'본문을 복사했어요. 붙여넣은 뒤 이미지·로고와 서식을 확인해 주세요.':'제목을 복사했어요.';
  if(withFormatting&&!admin&&!library){try{await request({action:'copy',requestId:crypto.randomUUID(),templateId:t.id,version:t.version});await refresh();}catch{$('copy-status').textContent='본문은 복사했지만 사용 이력을 저장하지 못했어요. 연결을 확인하고 다시 복사해 주세요.';}}
  }catch(e){$('copy-status').textContent='복사하지 못했어요. 본문을 직접 선택해 복사하거나 PC 브라우저에서 다시 시도해 주세요.';}
  finally{copying=false;syncCopyButtons();if($('detail').open)$(withFormatting==='plain'?'copy-mobile-text':withFormatting?'copy-body':'copy-title').focus();}
 }
 let imageBundleController=null,imageBundleURL='';
 function clearImageBundle(){
  imageBundleController?.abort();imageBundleController=null;
  $('mobile-post-help').removeAttribute('aria-busy');
  if(imageBundleURL)URL.revokeObjectURL(imageBundleURL);imageBundleURL='';
  $('save-images').hidden=true;$('save-images').removeAttribute('href');$('mobile-image-status').textContent='';$('prepare-images').textContent='사진·로고 받기';
 }
 async function prepareImages(){
  if(copying||!partnerReady||imageBundleController)return;
  clearImageBundle();const controller=new AbortController(),sequence=partnerSequence;imageBundleController=controller;syncCopyButtons();
  let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},45000);
  $('prepare-images').textContent='사진 준비 중';$('mobile-image-status').textContent='사진과 업체 로고를 준비하고 있어요';$('mobile-post-help').setAttribute('aria-busy','true');
  try{
   const blocks=postBlocks(template,partnerImages),result=await window.CreoPromoImageBundle.prepare(blocks.filter(b=>b.type==='image').map(b=>({src:imageURL(b.src),alt:b.alt})),{signal:controller.signal,text:plainBody(template,partnerImages)});
   if(controller.signal.aborted||sequence!==partnerSequence||!$('detail').open)return;
   imageBundleURL=URL.createObjectURL(result.blob);const link=$('save-images');link.href=imageBundleURL;link.download='전국크레자랑_사진로고.zip';link.textContent='전체 '+result.count+'장 저장';link.hidden=false;
   $('mobile-image-status').textContent='저장한 ZIP을 파일 앱에서 압축 해제한 뒤 카페에 사진을 첨부해 주세요. 사진 순서와 본문도 함께 담았습니다.';link.focus();
  }catch(e){if(timedOut&&imageBundleController===controller)$('mobile-image-status').textContent='사진을 받는 시간이 길어졌어요. 연결을 확인하고 다시 시도해 주세요.';else if(!controller.signal.aborted)$('mobile-image-status').textContent=e instanceof TypeError?'사진을 준비하지 못했어요. 연결을 확인하거나 아래 이미지 따로 받기를 이용해 주세요.':e.message||'사진을 준비하지 못했어요. 아래 이미지 따로 받기를 이용해 주세요.';}
  finally{clearTimeout(timeout);if(imageBundleController===controller){imageBundleController=null;$('mobile-post-help').removeAttribute('aria-busy');$('prepare-images').textContent='사진·로고 받기';syncCopyButtons();}}
 }
 function openForm(title,html,save){
  trigger=document.activeElement;$('form-title').textContent=title;$('fields').innerHTML=html;$('form-error').hidden=true;$('form-reload').hidden=true;$('save').textContent=title==='배정 취소'?'배정 취소':title==='게시 완료 등록'?'게시 완료 등록':'저장';
  $('edit-form').onsubmit=async e=>{
   e.preventDefault();if(busy)return;busy=true;$('save').disabled=true;$('edit-form').setAttribute('aria-busy','true');$('form-error').hidden=true;
   try{await save();$('form-dialog').close();$('status').textContent='저장했습니다.';try{await refresh();}catch{error('저장은 완료됐지만 화면을 갱신하지 못했어요. 새로고침해 주세요.');}}
   catch(e){$('form-error').textContent=e.status?e.message:'연결을 확인하고 다시 저장해 주세요. 입력한 내용은 유지됩니다.';$('form-error').hidden=false;$('form-reload').hidden=e.status!==409;}
   finally{busy=false;$('save').disabled=false;$('edit-form').removeAttribute('aria-busy');}
  };$('form-dialog').showModal();
 }
 const options=(items,id)=>items.map(([v,n])=>`<option value="${esc(v)}" ${v===id?'selected':''}>${esc(n)}</option>`).join('');
 function assignment(id){const a=state.assignments.find(a=>a.id===id)||{date:selected,slot:'afternoon'},revision=state.revision;openForm(id?'배정 변경':'일정 배정',`<label>게시 날짜<input id="a-date" type="date" value="${a.date}" required></label><label>시간대<select id="a-slot">${options(Object.entries(state.slots).map(([k,s])=>[k,s.label+' '+s.start+'–'+s.end]),a.slot)}</select></label><label>담당 업체<select id="a-vendor" required><option value="">업체 선택</option>${options(state.vendors.map(v=>[v.id,v.name]),a.vendorId)}</select></label><label>기본 원고<select id="a-template" required>${options(state.templates.filter(t=>t.active!==false).map(t=>[t.id,t.name]),a.templateId)}</select></label>`,()=>request({action:'assign',requestId:crypto.randomUUID(),revision,...(id?{id}:{}),date:$('a-date').value,slot:$('a-slot').value,vendorId:$('a-vendor').value,templateId:$('a-template').value}));}
 function complete(id){const a=state.assignments.find(a=>a.id===id)||(state.pending||[]).find(a=>a.id===id);if(!a)return;
  if(state.now+Date.now()-loadedAt<Date.parse(`${a.date}T${state.slots[a.slot].start}:00+09:00`)){openForm('게시 시간 안내',`<p>${format(a.date)} ${state.slots[a.slot].start}부터 게시할 수 있어요.</p><p class="muted">지금은 원고를 미리 확인하고 준비해 주세요. 글을 게시한 뒤 이곳에 주소를 등록하면 됩니다.</p>`,async()=>{});$('save').hidden=true;return;}
  $('save').hidden=false;openForm('게시 완료 등록',`<p>${format(a.date)} ${state.slots[a.slot].label} · ${esc(vendorName(a.vendorId))}</p><label>사용한 원고<select id="c-template">${options(state.templates.filter(t=>t.active!==false).map(t=>[t.id,t.name]),a.templateId)}</select></label><label>게시한 카페 글 주소<input id="c-url" type="url" placeholder="https://cafe.naver.com/…/12345" required></label><p class="muted">카페 글의 공유 → URL 복사로 가져와 주세요. 원고를 복사한 것만으로는 게시 완료되지 않습니다.</p>`,()=>{const t=state.templates.find(t=>t.id===$('c-template').value);return request({action:'complete',requestId:crypto.randomUUID(),id,templateId:t.id,version:t.version,url:$('c-url').value});});}
 function editTemplate(id,clone=false){const t=structuredClone(state.templates.find(t=>t.id===id)||{name:'',title:'',blocks:[{type:'text',text:'',size:16,bold:false,align:'center',color:'ink'}]}),revision=state.revision;
  openForm(clone?'원고 복제':id?'원고 수정':'원고 추가',`<label>원고 이름<input id="t-name" value="${esc(t.name+(clone?' 복사본':''))}" maxlength="80" required></label><label>카페 글 제목<input id="t-title" value="${esc(t.title)}" maxlength="150" required></label><div id="blocks">${t.blocks.map((b,i)=>b.type==='image'?`<div class="block-editor"><p>이미지 ${i+1}</p><img src="${esc(imageURL(b.src))}" alt="${esc(b.alt)}"><label class="checkbox"><input type="checkbox" data-remove="${i}">이 이미지 제외</label></div>`:`<div class="block-editor"><label>문단 ${i+1}<textarea data-text="${i}">${esc(b.text)}</textarea></label><div class="style-controls"><label>크기<select data-size="${i}">${[16,18,20,24,26].map(n=>`<option ${n===b.size?'selected':''}>${n}</option>`).join('')}</select></label><label>강조<select data-color="${i}"><option value="ink">기본색</option><option value="green" ${b.color==='green'?'selected':''}>초록</option></select></label></div><label class="checkbox"><input type="checkbox" data-bold="${i}" ${b.bold?'checked':''}>굵게</label></div>`).join('')}</div><label>추가 문단<textarea id="t-extra" placeholder="빈 줄로 문단을 구분해 주세요"></textarea></label>${id&&!clone?`<label class="checkbox"><input id="t-active" type="checkbox" ${t.active!==false?'checked':''}>업체에게 공개</label>`:''}`,()=>{
   const blocks=t.blocks.map((b,i)=>b.type==='image'?document.querySelector('[data-remove="'+i+'"]').checked?null:b:{...b,text:document.querySelector('[data-text="'+i+'"]').value,size:Number(document.querySelector('[data-size="'+i+'"]').value),bold:document.querySelector('[data-bold="'+i+'"]').checked,color:document.querySelector('[data-color="'+i+'"]').value}).filter(Boolean);
   for(const p of $('t-extra').value.split(/\n\s*\n/).filter(p=>p.trim()))blocks.push({type:'text',text:p,size:16,bold:false,align:'center',color:'ink'});
   return request({action:'template',requestId:crypto.randomUUID(),revision,...(id&&!clone?{id}:{}),name:$('t-name').value,title:$('t-title').value,blocks,active:$('t-active')?.checked!==false});
  });
 }
 async function openAssignedPreview(){
  const id=query.get('assignment');if(admin||assignmentOpened||!id)return;assignmentOpened=true;
  const assigned=(state.pending||[]).find(a=>a.id===id&&a.vendorId===company);
  if(!assigned){$('status').textContent='이 일정은 이미 완료되었거나 변경됐어요. 현재 게시 일정을 확인해 주세요.';return;}
  selected=assigned.date;const assignedMonth=assigned.date.slice(0,7);
  if(month!==assignedMonth){month=assignedMonth;await refresh();}else render();
  // A fresh response may show that the operator cancelled/completed this assignment.
  const current=(state.pending||[]).find(a=>a.id===id&&a.vendorId===company);
  if(current)preview(current.templateId);else $('status').textContent='게시 일정이 변경됐어요. 현재 일정을 확인해 주세요.';
 }
 async function start(){
  $('refresh').disabled=true;$('loading').hidden=false;
  if(library){try{await refresh();window.CreoPromoGuide?.offer();}catch(e){error(e.status?e.message:'연결을 확인하고 새로고침해 주세요.');}finally{$('refresh').disabled=false;$('loading').hidden=true;}return;}
  try{if(admin){if(!await CreoPlatform.verifyAdmin()){$('content').hidden=true;$('login').hidden=false;$('login').querySelector('a').hidden=true;$('admin-login').hidden=false;return;}}
   else{const r=await fetch('/api/platform/vendor-access/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('로그인을 확인하지 못했어요. 새로고침해 주세요.');session=await r.json();if(!session.authenticated){$('content').hidden=true;$('login').hidden=false;return;}if(!company&&session.companies?.length===1){company=session.companies[0].id;history.replaceState(null,'','?company='+encodeURIComponent(company));}if(!company){$('content').hidden=true;$('login').hidden=false;return;}}
   await refresh();if(query.get('view')==='templates')$('tab-templates').click();await window.CreoPromoGuide?.offer();await openAssignedPreview();
  }catch(e){error(e.status?e.message:'연결을 확인하고 새로고침해 주세요.');if(e.status===401||e.status===403)$('login').hidden=false;}
  finally{$('refresh').disabled=false;$('loading').hidden=true;}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if('close'in d){b.closest('dialog').close();return;}if(d.date){selected=d.date;renderCalendar();renderDay();}if(d.preview)preview(d.preview);if(d.edit)assignment(d.edit);if(d.complete)complete(d.complete);if(d.templateEdit)editTemplate(d.templateEdit);if(d.templateClone)editTemplate(d.templateClone,true);if(d.cancel){const revision=state.revision;openForm('배정 취소','<p>이 배정을 취소할까요? 기록은 남고 업체에게 취소 상태가 표시됩니다.</p>',()=>request({action:'cancel',requestId:crypto.randomUUID(),revision,id:d.cancel}));}});
 enablePreviewDismiss($('detail'));
 $('detail').addEventListener('close',()=>{partnerSequence++;clearImageBundle();});
 $('partner-controls').addEventListener('change',e=>{if(e.target.name==='partner-mode'){partnerMode=e.target.value;showPartnerRegions();}else if(e.target.type==='checkbox'){const id=Number(e.target.value);if(e.target.checked)partnerRegions.add(id);else partnerRegions.delete(id);}updatePartners();});
 $('partner-retry').onclick=()=>updatePartners();$('partner-refresh').onclick=()=>updatePartners();
 for(const dialog of document.querySelectorAll('#detail, #form-dialog'))dialog.addEventListener('close',()=>{$('save').hidden=false;if(trigger?.isConnected)trigger.focus();else $('tab-templates').focus();});
 $('form-reload').onclick=async()=>{try{await refresh();$('form-dialog').close();$('status').textContent='최신 정보를 불러왔어요. 변경 내용을 확인하고 다시 입력해 주세요.';}catch{$('form-error').textContent='연결을 확인하고 다시 불러와 주세요.';}};
 $('copy-title').onclick=()=>copy(false);$('copy-body').onclick=()=>copy(true);$('refresh').onclick=()=>start();$('assign').onclick=()=>assignment();$('create-template').onclick=()=>editTemplate();
 $('copy-mobile-text').onclick=()=>copy('plain');$('prepare-images').onclick=prepareImages;
 for(const [id,step]of [['prev',-1],['next-month',1]])$(id).onclick=async()=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+step,1)).toISOString().slice(0,7);selected=month+'-01';try{await refresh();}catch(e){error(e.message);}};
 for(const view of ['calendar','templates'])$('tab-'+view).onclick=()=>{for(const v of ['calendar','templates']){$(v+'-view').hidden=v!==view;if(v===view)$('tab-'+v).setAttribute('aria-current','page');else $('tab-'+v).removeAttribute('aria-current');}};
 $('capacity-form').onsubmit=async e=>{e.preventDefault();try{await request({action:'capacity',requestId:crypto.randomUUID(),revision:state.revision,capacity:Number($('capacity').value)});await refresh();$('status').textContent='정원을 저장했습니다.';}catch(e){error(e.message);}};
 $('admin-login').onsubmit=async e=>{e.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await refresh();window.CreoPromoGuide?.offer();}catch(e){error(e.message);}};
 start();
})();

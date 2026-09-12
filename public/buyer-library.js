(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=CreoCheckoutClient.escapeHtml,money=CreoCheckoutClient.money;
 let session=null,list=null,records=[],preview=null,requestId='',busy=false,epoch=0,listEpoch=0,listLoading=false;
 let authVersion=0,checking=false,needsCheck=false,sessionMark='',displayEvent='',restoreEvent='',restoreConnect=false,restoreInput='';
 const requests=new Set(),signalKey='ongdong-buyer-session-change';let sessionBus=null;
 const params=new URLSearchParams(location.hash.slice(1)),reauth=new URLSearchParams(location.search).has('reauth');let pendingCode=params.get('link')||'';
 if(!/^[\w-]{8,24}$/.test(pendingCode))pendingCode='';
 let autoConnect=Boolean(pendingCode);
 history.replaceState(null,'',location.pathname);
 const viewer=CreoCheckoutItemView.createViewer({document,origin:location.origin});
 const inquiry=CreoCheckoutInquiry.create({document});
 const kakaoLogin=CreoBuyerKakaoLogin.create({form:$('login-form'),input:$('login-link'),status:$('login-status')});
 const message=(id,text,neutral=false)=>{if(id==='error'){$(id).dataset.neutral=String(neutral);$(id).setAttribute('role',neutral?'status':'alert');}$(id).textContent=text;$(id).hidden=!text;};
 function codeFrom(value){const text=String(value||'').trim();if(/^[\w-]{8,24}$/.test(text))return text;let url;try{url=new URL(text)}catch{throw Error('받은 낙찰 링크를 입력해 주세요.')}if(url.origin!==location.origin||url.username||url.password||!/^\/[ds]\/[\w-]{8,24}$/.test(url.pathname))throw Error('옹동2에서 받은 낙찰 링크를 입력해 주세요.');return url.pathname.split('/').pop();}
 const stale=()=>Object.assign(new Error('화면이 변경되었습니다.'),{stale:true});
 const report=error=>{if(!error.stale)message('error',error.message);};
 function clearPrivate(remember=false){
  if(remember&&session){restoreEvent=displayEvent;restoreConnect=$('connect-dialog').open;restoreInput=restoreConnect?$('link-input').value:'';}
  authVersion++;needsCheck=true;checking=false;for(const controller of requests)controller.abort();requests.clear();
  session=null;list=null;records=[];preview=null;requestId='';busy=listLoading=false;epoch++;listEpoch++;displayEvent='';
  viewer.clear();inquiry.clear();if($('connect-dialog').open)$('connect-dialog').close();
  for(const id of ['library','detail','login','logout','loading','retry','recovery-title','connection-preview'])$(id).hidden=true;
  for(const id of ['events','items','event-title','event-count','account-phone','connection-preview'])$(id).replaceChildren();
  $('link-input').value='';$('login-link').value='';$('link-input').readOnly=false;$('connect-submit').disabled=false;$('more').disabled=false;$('refresh').disabled=false;
  message('error','');message('connect-error','');
 }
 const loginAgain=()=>{clearPrivate();location.replace('/buyer-library.html?reauth=1'+(pendingCode?'#link='+pendingCode:''));};
 async function api(path,body,csrfToken=session?.csrfToken||''){
  const version=authVersion,controller=new AbortController();requests.add(controller);
  try{const response=await fetch('/api/platform/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json','X-Buyer-CSRF':csrfToken}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(version!==authVersion)throw stale();if(!response.ok){if(response.status===401&&session)loginAgain();throw Error(data.error||'잠시 후 다시 시도해 주세요.');}return data;}
  catch(error){if(version!==authVersion)throw stale();throw error;}finally{requests.delete(controller);}
 }
 async function identityMark(value){if(!value.authenticated)return 'signed-out';const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.csrfToken));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
 function publishSession(force=false){const signal={type:force?'check':'identity',mark:sessionMark,nonce:crypto.randomUUID()};if(sessionBus)sessionBus.postMessage(signal);else try{localStorage.setItem(signalKey,JSON.stringify(signal));}catch{/* Focus/visibility still revalidate when browser storage is unavailable. */}}
 function receiveSession(signal){if(!signal||!['identity','check'].includes(signal.type)||(signal.type==='identity'&&signal.mark===sessionMark))return;clearPrivate(true);if(!document.hidden)start();}
 function connectSessionBus(){if(sessionBus||!window.BroadcastChannel)return;try{sessionBus=new BroadcastChannel(signalKey);sessionBus.onmessage=event=>receiveSession(event.data);}catch{sessionBus=null;}}
 window.addEventListener('storage',event=>{if(event.key===signalKey&&event.newValue)try{receiveSession(JSON.parse(event.newValue));}catch{}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPrivate(true);else if(needsCheck)start();});
 window.addEventListener('pagehide',()=>{clearPrivate(true);sessionBus?.close();sessionBus=null;});
 window.addEventListener('pageshow',event=>{connectSessionBus();if(event.persisted){clearPrivate(true);if(!document.hidden)start();}});
 window.addEventListener('focus',()=>{if(!document.hidden&&!checking){clearPrivate(true);start();}});
 connectSessionBus();
 function renderEvents(){
  $('events').innerHTML=records.map(event=>`<button type="button" class="event-row" data-event="${esc(event.id)}"><div><b>${esc(event.channelName)}</b><small>${event.itemCount}개체${event.available?'':' · 새 링크로 연결 필요'}</small></div><span aria-hidden="true">›</span></button>`).join('');
  $('events').querySelectorAll('[data-event]').forEach(button=>button.onclick=()=>openEvent(button.dataset.event));$('empty').hidden=records.length>0;$('more').hidden=list.nextOffset===null;
 }
 async function loadEvents(append=false){
  if(append&&(listLoading||list?.nextOffset===null))return;
  const version=++listEpoch;listLoading=true;$('more').disabled=true;$('refresh').disabled=true;
  try{const value=await api('buyer-collection'+(append?'?offset='+list.nextOffset:''));if(version!==listEpoch)return;list=value;records=append?[...new Map([...records,...value.records].map(record=>[record.id,record])).values()]:value.records;renderEvents();}
  finally{if(version===listEpoch){listLoading=false;$('more').disabled=false;$('refresh').disabled=false;}}
 }
 async function openEvent(id){
  const version=++epoch;displayEvent=id;message('error','');$('retry').hidden=true;
  try{const data=await api('buyer-collection/'+encodeURIComponent(id));if(version!==epoch)return;$('library').hidden=true;$('detail').hidden=false;$('event-title').textContent=data.channel.name;$('event-count').textContent=`${data.items.length}개체${data.channel.status==='archived'?' · 지난 경매':''}`;
   $('items').innerHTML=data.items.map(item=>{const photos=CreoCheckoutItemView.pictures(item,location.origin),thumb=photos.find(p=>p.group==='개체'&&p.thumbnailUrl),traits=CreoCheckoutItemView.traitSummary(item),parents=CreoCheckoutItemView.parentDetails(item),photoLabel=photos.length?[...new Set(photos.map(photo=>photo.group==='개체'?'개체':'부모'))].join('·')+' 사진':'부모 정보',state=({changed:'거래 변경',archived:'보관 기록'})[item.recordState];return `<article class="library-item">${thumb?`<button type="button" class="library-thumb" data-photo="${esc(item.id)}" aria-label="${esc(item.name)} 사진 보기"><img src="${esc(thumb.thumbnailUrl)}" alt="" loading="lazy"></button>`:''}<div><small>${esc(item.vendorName)}</small>${state?`<span class="library-record-state">${state}</span>`:''}<h2>${esc(CreoCheckoutItemView.itemTitle(item))}</h2>${traits?`<p>${esc(traits)}</p>`:''}<strong>${money(item.soldAmount)}</strong>${photos.length||parents.length?`<button class="photo-link" type="button" data-photo="${esc(item.id)}">${photoLabel}</button>`:''}</div></article>`;}).join('');
   $('items').querySelectorAll('.library-item').forEach((row,index)=>{const item=data.items[index],photos=row.querySelector('.photo-link');if(!CreoCheckoutInquiry.contact(item.inquiry))return;const actions=document.createElement('div');actions.className='item-actions';row.querySelector('div').append(actions);if(photos)actions.append(photos);const button=document.createElement('button');button.type='button';button.className='inquiry-link';button.dataset.itemInquiry=item.id;button.textContent='업체 문의';button.setAttribute('aria-label',CreoCheckoutItemView.itemTitle(item)+' 업체 문의');button.onclick=()=>inquiry.open(item,data.channel.name,button);actions.append(button);});
   $('items').querySelectorAll('.library-thumb img').forEach(img=>{const hide=()=>{const button=img.closest('button');if(document.activeElement===button)button.parentElement.querySelector('.photo-link')?.focus();button.hidden=true;};img.onerror=hide;if(img.complete&&!img.naturalWidth)hide();});
   $('items').querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>viewer.open(data.items.find(item=>item.id===button.dataset.photo),button));$('event-title').focus();window.scrollTo(0,0);
  }catch(error){if(version===epoch)report(error);}
 }
 function openConnect(){if(busy||!session||needsCheck)return;preview=null;requestId='';$('connection-preview').hidden=true;$('connect-submit').textContent='내역 확인';message('connect-error','');$('link-input').value=pendingCode?location.origin+'/d/'+pendingCode:'';$('connect-dialog').showModal();$('link-input').focus();}
 $('back').onclick=()=>{++epoch;displayEvent='';$('detail').hidden=true;$('library').hidden=false;$('items').replaceChildren();viewer.clear();inquiry.clear();message('error','');$('open-connect').focus();};
 $('refresh').onclick=()=>loadEvents().catch(report);
 $('more').onclick=async()=>{if(busy)return;const version=authVersion;busy=true;$('more').disabled=true;try{await loadEvents(true)}catch(error){report(error)}finally{if(version===authVersion){busy=false;$('more').disabled=false}}};
 $('open-connect').onclick=openConnect;$('close-connect').onclick=()=>{if(!busy)$('connect-dialog').close();};
 $('connect-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 let outside=false;$('connect-dialog').addEventListener('pointerdown',event=>{outside=event.target===$('connect-dialog')&&(()=>{const r=$('connect-dialog').getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;})()});$('connect-dialog').addEventListener('click',()=>{if(outside&&!busy)$('connect-dialog').close();outside=false;});
 $('link-input').oninput=()=>{preview=null;requestId='';$('connection-preview').hidden=true;$('connect-submit').textContent='내역 확인';};
 $('connect-form').onsubmit=async event=>{event.preventDefault();if(busy||!session)return;const version=authVersion;busy=true;$('connect-submit').disabled=true;$('link-input').readOnly=true;message('connect-error','');
  try{pendingCode=codeFrom($('link-input').value);
   if(!preview){const value=await api('buyer-collection/preview',{code:pendingCode});if(version!==authVersion)return;preview=value;$('connection-preview').innerHTML=`<b>${esc(preview.channel.name)}</b><p>${preview.itemCount}개체 · ${money(preview.amount)}</p>`;$('connection-preview').hidden=false;$('connect-submit').textContent='내 보관함에 연결';requestId=crypto.randomUUID();}
   else{await api('buyer-collection/connect',{code:pendingCode,expectedRevision:list.revision,requestId});await loadEvents();if(version!==authVersion)return;pendingCode='';$('connect-dialog').close();$('open-connect').focus();}
  }catch(error){if(version===authVersion&&!error.stale){message('connect-error',error.message);if(preview)await loadEvents().catch(()=>{});}}
  finally{if(version===authVersion){busy=false;$('connect-submit').disabled=false;$('link-input').readOnly=false;}}
 };
 $('logout').onclick=async()=>{if(!session)return;const csrf=session.csrfToken;clearPrivate();pendingCode=restoreEvent=restoreInput='';restoreConnect=autoConnect=false;busy=true;
  try{await api('buyer-account/logout',{},csrf);sessionMark='signed-out';publishSession();location.replace('/buyer-library.html');}
  catch(error){publishSession(true);if(!error.stale){$('recovery-title').textContent='로그아웃 확인 필요';$('recovery-title').hidden=false;message('error','로그아웃 결과를 확인하지 못했어요. 다시 확인해 주세요.');$('retry').hidden=false;busy=false;}}
 };
 $('phone-relogin').onclick=loginAgain;
 async function start(){if(checking||document.hidden)return;if(!needsCheck)clearPrivate(true);const version=authVersion;checking=true;needsCheck=false;message('error','');$('retry').hidden=true;$('loading').hidden=false;try{const value=await api('buyer-account/session'),mark=await identityMark(value);if(version!==authVersion)return;const changed=sessionMark&&sessionMark!==mark;if(changed){pendingCode=restoreEvent=restoreInput='';restoreConnect=autoConnect=false;}const announce=mark!==sessionMark;sessionMark=mark;session=value.authenticated&&!reauth?value:null;$('login').hidden=Boolean(session);$('library').hidden=!session;$('logout').hidden=!session;$('login-form').hidden=!value.available;$('unavailable').hidden=value.available;$('login-link').value=pendingCode;$('return-library').hidden=!(value.authenticated&&reauth);if(announce)publishSession();
   kakaoLogin.configure(!session&&value.available?value.kakao?.javascriptKey:'');
   if(session){$('account-phone').textContent=session.phoneLast4?'휴대폰 끝자리 '+session.phoneLast4:'';$('phone-required').hidden=session.canLink;$('phone-relogin').hidden=session.canLink;$('open-connect').disabled=!session.canLink;await loadEvents();if(version!==authVersion)return;const reopen=restoreEvent;restoreEvent='';if(reopen)await openEvent(reopen);if(version!==authVersion)return;if(session.canLink&&(restoreConnect||autoConnect&&pendingCode)){openConnect();if(restoreConnect)$('link-input').value=restoreInput;}restoreConnect=autoConnect=false;restoreInput='';}
   if(reauth)message('error',pendingCode?'내역을 연결하려면 다시 로그인해 주세요.':'다시 로그인해 주세요.');
   if(params.get('error'))message('error',({login_cancelled:'로그인을 취소했어요.',login_expired:'로그인 시간이 지났어요. 다시 로그인해 주세요.',login_limited:'로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.',login_unavailable:'보관함 로그인을 준비하고 있어요.'})[params.get('error')]||'로그인을 완료하지 못했어요. 다시 시도해 주세요.',params.get('error')==='login_cancelled');
  }catch(error){if(version===authVersion&&!error.stale){clearPrivate();$('recovery-title').textContent='보관함을 열지 못했어요';$('recovery-title').hidden=false;message('error',error.message);$('retry').hidden=false;}}finally{if(version===authVersion){checking=false;$('loading').hidden=true;}}}
 $('retry').onclick=start;start();
})();

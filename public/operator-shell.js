document.addEventListener('DOMContentLoaded',()=>{
 'use strict';const $=id=>document.getElementById(id),Model=CreoOperatorShell,esc=CreoPlatform.escapeHtml;
 let state=null,current='home',source='',dirty=false,busy=false,contextOpen=false,contextScope='round';
 $('operator-frame').setAttribute('allowfullscreen','');
 const desktop=window.matchMedia('(min-width:761px)');const syncMenu=()=>{$('operator-menu').open=desktop.matches;};syncMenu();desktop.addEventListener('change',syncMenu);
 function syncContext(){
  const compact=Boolean(state)&&current!=='home'&&contextScope!=='global',toggle=$('operator-context-toggle'),panel=$('selection-panel');
  toggle.hidden=!compact;toggle.setAttribute('aria-expanded',String(compact&&contextOpen));toggle.textContent=contextOpen?'선택 닫기':contextScope==='program'?'프로그램 변경':'방송일 변경';
  panel.classList.toggle('compact-closed',compact&&!contextOpen);
  if(compact&&!contextOpen&&panel.contains(document.activeElement))toggle.focus();
 }
 desktop.addEventListener('change',syncContext);
 $('operator-context-toggle').addEventListener('click',()=>{contextOpen=!contextOpen;syncContext();if(contextOpen)$('quick-channel').focus();});
 function allowed(){if(busy){$('operator-frame').contentWindow.postMessage({type:'creo:operator-navigation-blocked'},location.origin);return false;}return !dirty||window.confirm('저장하지 않은 입력이 있습니다. 이 화면을 떠날까요?');}
 function clear(){source='';dirty=false;busy=false;$('operator-frame').removeAttribute('src');$('operator-content').hidden=true;}
 function navigate(search,push=true){if(!allowed())return false;dirty=false;document.dispatchEvent(new CustomEvent('creo:operator-navigate',{detail:{search,push}}));return true;}
 function render(detail){state=detail.state;const previous=current,q=new URLSearchParams(location.search);current=q.get('view')||'home';if(current==='bookings'&&q.get('action')==='region')current='regions';const e=Model.entry(state,current);if(current!==previous)contextOpen=false;contextScope=e?.scope||'round';
  $('admin-nav').innerHTML=`<a class="nav-home" href="${esc(Model.home(state))}"${current==='home'?' aria-current="page"':''}>운영 홈</a>`+Model.menu(state).map(g=>`<details name="operator-section"${g.id===e?.group||current==='home'&&state.finished&&g.id==='finance'?' open':''}><summary data-work-group="${g.id}">${esc(g.label)}</summary><nav aria-label="${esc(g.label)}">${g.entries.map(n=>`<a data-work-key="${n.key}" href="${esc(Model.home(state,n.key))}"${n.key===current?' aria-current="page"':''}>${esc(n.label)}</a>`).join('')}</nav></details>`).join('');
  const program=CreoOperatorHome.families(detail.catalog,state.channel.id).find(p=>p.id===CreoOperatorHome.family(state.channel))?.name||'';
  $('selection-panel').hidden=e?.scope==='global';if(e?.scope==='program'){$('round-field').hidden=true;$('manage-rounds').hidden=true;}$('work-panel').hidden=current!=='home';$('operator-content').hidden=current==='home';$('operator-page-title').textContent=e?.label||'열 수 없는 메뉴';$('operator-breadcrumb').textContent=e?.scope==='global'?'전체 운영':e?.scope==='program'?(program||'전체 업체'):program&&!state.label.includes(program)?program+' · '+state.label:state.label;syncContext();
  document.title=(e?.label||'운영 홈')+' · CREO';
  $('refresh-home').hidden=current!=='home';$('operator-reload').hidden=current==='home';$('operator-page-title').hidden=current==='home';document.body.classList.toggle('operator-working',current!=='home');document.querySelector('.operator-more').open=false;
  document.querySelector('.skip').href=current==='home'?'#work-title':'#operator-page-title';
  if(current==='home'){$('operator-standalone').hidden=true;clear();return;}
  // The installed Parge extension is scoped to a top-level dispatch page.
  // Its native page supplies the same navigation without changing that contract.
  if(current==='parge'&&e?.href){location.replace(e.href);return;}
  const next=Model.frame(state,current,location.search);$('operator-unavailable').hidden=Boolean(next);$('operator-frame').hidden=!next;$('operator-standalone').hidden=!next;
  if(!next){source='';$('operator-loading').hidden=true;$('operator-frame').removeAttribute('src');return;}
  const standalone=new URL(next,location.origin);standalone.searchParams.delete('embedded');standalone.searchParams.delete('adminShell');$('operator-standalone').href=standalone.pathname+standalone.search+standalone.hash;$('operator-frame').title=e.label;
  if(source!==next){source=next;dirty=false;busy=false;$('operator-loading').hidden=false;$('operator-frame').src=next;}
 }
 document.addEventListener('creo:operator-ready',e=>render(e.detail));
 document.addEventListener('creo:operator-reset',clear);
 document.addEventListener('creo:operator-before-navigate',e=>{if(!allowed())e.preventDefault();else dirty=false;});
 $('operator-frame').addEventListener('load',()=>{try{const doc=$('operator-frame').contentDocument;if(doc&&!doc.documentElement.classList.contains('operator-embedded')){const bridge=doc.createElement('script');bridge.src='/operator-embed.js?v=20261028-band-members';doc.head.appendChild(bridge);}}catch(_){}$('operator-loading').hidden=true;});
 $('operator-reload').addEventListener('click',()=>{if(!allowed())return;dirty=false;if(source){$('operator-loading').hidden=false;$('operator-frame').src=source;}});
 document.addEventListener('click',event=>{const a=event.target.closest?.('a');if(!a||!state||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
  const url=new URL(a.href,location.href);if(url.origin!==location.origin)return;
  const resolved=Model.resolve(url.pathname+url.search,state);if(!resolved)return;event.preventDefault();let search;
  if(['/main','/main/','/index.html'].includes(url.pathname))search=url.search||Model.home(state).split('?')[1];
  else search=Model.home(state,resolved.key).split('?')[1];
  if(navigate('?'+String(search).replace(/^\?/,''))){if(!desktop.matches)$('operator-menu').open=false;$(current==='home'?'work-title':'operator-page-title').focus();}
 });
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('operator-frame').contentWindow)return;const data=event.data;if(data?.type==='creo:operator-dirty'){dirty=data.dirty===true;if(typeof data.busy==='boolean')busy=data.busy;return;}if(data?.type!=='creo:operator-link'||!state)return;
  const resolved=Model.resolve(data.href,state);if(!resolved)return;const q=new URLSearchParams(location.search),target=resolved.url.searchParams;
  q.set('view',resolved.key);for(const key of ['vendor','action','status'])q.delete(key);
  // Booking/intake use the common reception channel; that is not a round switch.
  if((['/main','/main/','/index.html'].includes(resolved.url.pathname)||!['intake','bookings','regions','vendors','access','rates'].includes(resolved.key))&&target.has('channel')){q.set('channel',target.get('channel'));if(target.has('archive'))q.set('archive',target.get('archive'));else q.delete('archive');}
  if(target.get('vendor')&&['items','members','bookings','regions','intake'].includes(resolved.key))q.set('vendor',target.get('vendor'));
  if(resolved.key==='bookings'&&target.get('action')==='region')q.set('action','region');
  if(resolved.key==='intake'&&target.get('status')==='approved')q.set('status','approved');
  navigate('?'+q);
 });
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
});

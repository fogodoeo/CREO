document.addEventListener('DOMContentLoaded',()=>{
 'use strict';const $=id=>document.getElementById(id),Model=CreoOperatorHome,esc=CreoPlatform.escapeHtml;
 let catalog={channels:[]},rounds=[],activeId='',state=null,sequence=0,lastUrl='';
 const emit=(name,detail)=>{if(typeof CustomEvent!=='undefined')document.dispatchEvent(new CustomEvent(name,{detail}));};
 function login(message=''){emit('creo:operator-reset');$('dashboard').hidden=true;$('login-gate').hidden=false;$('login-error').textContent=message;$('login-submit').disabled=false;$('admin-password').focus()}
 function link(id,href){$(id).hidden=!href;if(href)$(id).href=href;else $(id).removeAttribute('href')}
 function render(search=location.search,push=false){
  $('work-panel').hidden=true;state=Model.selection(catalog,rounds,activeId,search);const {channel,round,archiveId}=state,links=Model.links(state),isNational=Model.national(channel);
  $('quick-channel').value=Model.family(channel);$('round-field').hidden=rounds.filter(r=>r.familyId===Model.family(channel)).length<2;
  $('quick-round').innerHTML=rounds.filter(r=>r.familyId===Model.family(channel)).map(r=>`<option value="${esc(Model.key(r))}">${esc(r.name)} · ${r.archiveId?'이전 기록':r.status==='draft'?'준비 중':r.active?'현재 송출':'결제·배송'}</option>`).join('');if(round)$('quick-round').value=Model.key(round);
  for(const [id,name] of Object.entries({'quick-workspace':'workspace','quick-broadcast':'broadcast','quick-shipping':'shipping','quick-print':'print','quick-shipping-status':'shippingStatus','quick-parge':'parge','quick-pinball':'pinball','quick-captures':'captures','quick-survey':'survey','quick-settings':'settings','quick-rounds':'archives','quick-intake':'intake','quick-bookings':'bookings','manage-rounds':'rounds'}))link(id,links[name]);
  link('quick-report',links.report);
  if(links.workspace)link('quick-workspace',links.workspace+'&tab=items');
  document.querySelector('.pipeline').style.setProperty('--operation-count',Math.max(1,document.querySelectorAll('.pipeline a:not([hidden])').length));
  $('round-tools').hidden=![...$('round-tools').querySelectorAll('a')].some(a=>!a.hidden);
  $('manage-rounds').textContent=isNational?'회차 준비·방송 전환':'결과 보관·순위';$('national-intake').hidden=!isNational;
  $('work-title').textContent=state.label;$('work-badge').textContent=archiveId?'이전 회차 기록':state.active?'현재 송출 회차':channel.status==='draft'?'준비 중':'결제·배송 처리';$('work-badge').dataset.active=String(state.active);
  $('scope-note').textContent=archiveId?'이 회차의 낙찰·배송·인쇄 자료를 확인합니다.':channel.status==='draft'?'출품과 순서를 확인한 뒤, 회차 관리에서 방송을 전환하세요.':'아래 메뉴는 모두 선택한 회차의 자료로 열립니다.';
  $('onair-name').textContent=rounds.find(r=>r.channelId===activeId&&!r.archiveId)?.name||catalog.channels.find(c=>c.id===activeId)?.name||'방송 회차 없음';
  $('selection-panel').hidden=false;$('work-panel').hidden=false;$('load-error').hidden=true;$('platform-status').textContent='';document.title=state.label+' · 운영 홈';
  const params=new URLSearchParams(search),shellParams=new URLSearchParams(state.home.split('?')[1]);for(const k of ['view','vendor'])if(params.get(k))shellParams.set(k,params.get(k));
  history[push?'pushState':'replaceState'](null,'','/main?'+shellParams);
  lastUrl='/main?'+shellParams;
  document.querySelector('.topbar .brand').href=state.home;
  emit('creo:operator-ready',{state,catalog,rounds});
 }
 function failure(e){emit('creo:operator-reset');$('work-panel').hidden=true;$('load-error').hidden=false;$('load-error-text').textContent=e.message||'자료를 불러오지 못했습니다. 새로고침해 주세요.';$('platform-status').textContent='';}
 async function load(){const seq=++sequence;$('work-panel').hidden=true;$('selection-panel').hidden=true;$('load-error').hidden=true;$('platform-status').textContent='운영 정보를 불러오는 중…';$('refresh-home').disabled=true;
  try{const data=await CreoPlatform.api('operation-rounds');if(seq!==sequence)return;
   catalog=data;rounds=data.rounds;activeId=data.activeChannelId;
   $('quick-channel').innerHTML=Model.families(catalog).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');render();
  }catch(e){if(seq!==sequence)return;if(e.status===401)return login('다시 로그인해 주세요.');failure(e)}finally{if(seq===sequence)$('refresh-home').disabled=false}}
 async function dashboard(){$('login-gate').hidden=true;$('dashboard').hidden=false;await load()}
 function changeScope(search){if(typeof CustomEvent!=='undefined'&&!document.dispatchEvent(new CustomEvent('creo:operator-before-navigate',{cancelable:true}))){render();return;}const q=new URLSearchParams(search),view=new URLSearchParams(location.search).get('view');if(view)q.set('view',view);try{render('?'+q,true)}catch(e){failure(e)}}
 $('quick-channel').addEventListener('change',()=>{const id=$('quick-channel').value,choices=rounds.filter(r=>r.familyId===id),chosen=choices.find(r=>r.channelId===activeId&&!r.archiveId)||choices.find(r=>!r.archiveId)||choices[0];changeScope(new URLSearchParams({channel:chosen?.channelId||id,...(chosen?.archiveId?{archive:chosen.archiveId}:{})}));});
 $('quick-round').addEventListener('change',()=>{const r=rounds.find(r=>Model.key(r)===$('quick-round').value);if(r)changeScope(new URLSearchParams({channel:r.channelId,...(r.archiveId?{archive:r.archiveId}:{})}));});
 document.addEventListener('creo:operator-navigate',e=>{try{render(e.detail.search,e.detail.push)}catch(error){failure(error)}});
 $('refresh-home').addEventListener('click',load);window.addEventListener('popstate',()=>{if(typeof CustomEvent!=='undefined'&&!document.dispatchEvent(new CustomEvent('creo:operator-before-navigate',{cancelable:true}))){if(lastUrl)history.pushState(null,'',lastUrl);return;}try{render()}catch(e){failure(e)}});
 $('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-submit').disabled=true;try{if(!await CreoPlatform.verifyAdmin($('admin-password').value))throw Error('비밀번호를 확인해 주세요.');$('admin-password').value='';await dashboard()}catch(e){login(e.message)}});
 async function logout(){++sequence;emit('creo:operator-reset');$('dashboard').hidden=true;try{await CreoPlatform.logout();location.replace('/main'+location.search)}catch(e){login('로그아웃하지 못했습니다. 다시 시도해 주세요.');$('logout-retry').hidden=false}}
 $('logout-button').addEventListener('click',logout);$('logout-retry').addEventListener('click',logout);
 window.addEventListener('pagehide',()=>{$('dashboard').hidden=true});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload()});
 (async()=>{try{if(await CreoPlatform.verifyAdmin())return dashboard();login()}catch(e){login('연결을 확인한 뒤 다시 로그인해 주세요.')}})();
});

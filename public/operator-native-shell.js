// Native host for pages whose installed browser extension must run at top level.
// Task controls stay in their original document; only navigation is shared.
document.addEventListener('creo:native-operator-ready',async()=>{
 'use strict';if(window.parent!==window||document.getElementById('native-operator-shell'))return;
 try{
  const catalog=await CreoPlatform.api('operation-rounds'),Model=CreoOperatorShell,Home=CreoOperatorHome,esc=CreoPlatform.escapeHtml;
  const state=Home.selection(catalog,catalog.rounds,catalog.activeChannelId,location.search),key='parge';if(!Model.entry(state,key))return;
  const content=document.querySelector('body>main');if(!content)return;
  const shell=document.createElement('div');shell.id='native-operator-shell';shell.className='native-operator-shell';
  shell.innerHTML=`<aside class="native-sidebar" aria-label="관리 메뉴"><a class="native-brand" href="${esc(state.home)}">CREO<small>운영 관리</small></a><details id="native-menu"><summary>메뉴</summary><nav aria-label="전체 관리 메뉴"><a href="${esc(state.home)}">운영 홈</a>${Model.menu(state).map(g=>`<details name="native-section"${g.entries.some(e=>e.key===key)?' open':''}><summary>${esc(g.label)}</summary><nav>${g.entries.map(e=>`<a href="${esc(e.key===key?e.href:Model.home(state,e.key))}"${e.key===key?' aria-current="page"':''}>${esc(e.label)}</a>`).join('')}</nav></details>`).join('')}</nav></details></aside><div class="native-main"><header class="native-top"><span>${esc(state.label)}</span><a href="${esc(state.home)}">운영 홈</a></header><section class="native-scope" aria-label="작업 회차"><label>프로그램<select id="native-family">${Home.families(catalog).map(c=>`<option value="${esc(c.id)}"${c.id===Home.family(state.channel)?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>회차<select id="native-round">${catalog.rounds.filter(r=>r.familyId===Home.family(state.channel)).map(r=>`<option value="${esc(Home.key(r))}"${Home.key(r)===Home.key(state.round)?' selected':''}>${esc(r.name)}</option>`).join('')}</select></label></section><div id="native-work"></div></div>`;
  document.body.appendChild(shell);shell.querySelector('#native-work').appendChild(content);document.body.classList.add('native-operator');document.querySelector('body>creo-operator-pipeline')?.setAttribute('hidden','');
  const style=document.createElement('link');style.rel='stylesheet';style.href='/operator-native-shell.css?v=20261023-admin-shell';document.head.appendChild(style);
  const desktop=window.matchMedia('(min-width:761px)'),menu=shell.querySelector('#native-menu');menu.open=desktop.matches;desktop.addEventListener('change',()=>{menu.open=desktop.matches;});
  const open=round=>{if(!round)return;const next=Home.selection(catalog,catalog.rounds,catalog.activeChannelId,'?'+new URLSearchParams({channel:round.channelId,...(round.archiveId?{archive:round.archiveId}:{})}));location.assign(Model.routes(next).parge||Model.home(next,'shipping'));};
  shell.querySelector('#native-round').addEventListener('change',e=>open(catalog.rounds.find(r=>Home.key(r)===e.target.value)));
  shell.querySelector('#native-family').addEventListener('change',e=>{const choices=catalog.rounds.filter(r=>r.familyId===e.target.value);open(choices.find(r=>r.channelId===catalog.activeChannelId&&!r.archiveId)||choices.find(r=>!r.archiveId)||choices[0]);});
 }catch(_){/* The dispatch page retains its own auth/error state and remains usable. */}
});

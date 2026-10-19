(()=>{'use strict';
 const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml;
 const q=new URLSearchParams(location.search);if(/^national-cre(?:-\d{8})?$/.test(q.get('channel')||''))document.querySelector('header a').href='/main?'+new URLSearchParams({channel:q.get('channel'),...(q.get('archive')?{archive:q.get('archive')}:{})});
 let state=null,busy=false,selection=null;
 const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error)};
 const path=(page,round)=>'/'+page+'?'+new URLSearchParams({channel:round.channelId,...(round.archiveId?{archive:round.archiveId}:{}),...(page==='roulette/'?{theme:'national',title:'전국크레자랑 추첨',channelName:round.name}:{})});
 function render(){
  $('rounds').innerHTML=state.rounds.map((r,index)=>`<article class="${r.active?'active':''}"><div class="round-head"><div><span class="badge">${r.active?'현재 방송':r.status==='draft'?'준비 중':r.status==='history'?'이전 회차':'결제·배송'}</span><h3>${esc(r.name)}</h3><span class="date">${esc(r.date||'날짜 미지정')} · 개체 ${r.itemCount} · 낙찰 ${r.soldCount}</span></div>${!r.archiveId&&r.channelId!=='national-cre'&&!r.active&&['draft','active'].includes(r.status)?`<button class="secondary" data-switch="${index}">방송 회차로 선택</button>`:''}</div><div class="links"><a href="${path('main',r)}">이 회차 작업하기</a>${r.status==='draft'?`<button class="secondary" data-import="${index}">추가 승인 개체 가져오기</button>`:''}</div></article>`).join('')||'<p>등록된 회차가 없습니다.</p>';
 }
 async function refresh(){state=await CreoPlatform.api('national-rounds');render();$('operator').hidden=false;$('login').hidden=true;}
 async function run(work){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work()}catch(e){message(e.message,true);if(e.status===401){$('login').hidden=false;$('operator').hidden=true}}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
 async function prepare(date){const r=await CreoPlatform.api('national-rounds',{method:'POST',body:JSON.stringify({action:'prepare',date})});await refresh();message(r.duplicate?'이미 가져온 개체입니다. 기존 수정 내용은 유지됩니다.':`회차를 준비했습니다. 새 개체 ${r.imported}마리를 가져왔습니다. 방송 회차는 아직 바뀌지 않았습니다.`)}
 $('prepare-form').addEventListener('submit',e=>{e.preventDefault();run(()=>prepare($('date').value))});
 $('login-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await refresh();message('')})});
 $('refresh').addEventListener('click',()=>run(refresh));
 $('rounds').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.dataset.import!==undefined)run(()=>prepare(state.rounds[Number(b.dataset.import)].date));if(b.dataset.switch!==undefined){selection=state.rounds[Number(b.dataset.switch)];$('switch-description').textContent=selection.name;$('switch-dialog').showModal()}});
 $('switch-cancel').addEventListener('click',()=>$('switch-dialog').close());
 $('switch-confirm').addEventListener('click',()=>run(async()=>{await CreoPlatform.api('national-rounds',{method:'POST',body:JSON.stringify({action:'activate',date:selection.date,expectedActiveChannelId:state.activeChannelId})});$('switch-dialog').close();await refresh();message('방송 회차를 전환했습니다. 경매 프로그램에서도 선택된 회차를 확인해 주세요.')}));
 const today=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'}));while(![1,3].includes(today.getDay()))today.setDate(today.getDate()+1);$('date').value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 run(refresh);
})();

document.addEventListener('DOMContentLoaded',async()=>{
 'use strict';
 const $=id=>document.getElementById(id),api=CreoPlatform.api,esc=CreoPlatform.escapeHtml,M=CreoNumberLabels,q=new URLSearchParams(location.search);
 let rounds=[],round=null,parts=[],plans=[],roundVendors=[],selectedPlan=null,labels=[],checked=new Set(),busy=false,sequence=0,dirty=false;
 const initial=()=>$('config-mode').value==='split'?[{name:'업체 순서',prefix:'A',start:1,defaultCount:4,vendors:[]}]:[{name:'1부',prefix:'A',start:1,vendors:[]},{name:'2부',prefix:'B',start:1,vendors:[]}];
 function configuration(){return $('config-mode').value==='split'?{mode:'split',setup:{vendors:parts[0]?.vendors||[],defaultCount:parts[0]?.defaultCount??4,reverse:$('reverse-second').checked,panels:parts.slice(1)}}:{mode:'parts',parts};}
 const endpoint=()=>`channels/${encodeURIComponent(round.channelId)}/number-label-plans`;
 const storageKey=()=>`creo.number-labels:${round.channelId}:${round.date}`;
 function error(e){$('error').textContent=e?.message||e||'';$('error').hidden=!$('error').textContent;}
 function message(t){$('status').textContent=t;}
 function lock(value){busy=value;document.querySelectorAll('main button,main input,main select').forEach(el=>el.disabled=value);$('setup').disabled=value;}
 function remember(){dirty=true;try{localStorage.setItem(storageKey(),JSON.stringify({parts,title:$('title').value,mode:$('config-mode').value,reverse:$('reverse-second').checked}));}catch{}labels=[];checked.clear();$('print-pages').innerHTML='';$('result').hidden=true;message('설정 변경 · 미리보기 후 저장해 주세요.');}
 function fit(){document.querySelectorAll('.fit').forEach(el=>{el.style.fontSize=el.dataset.base||'';const width=el.closest('.number-label').clientWidth;if(!width)return;let size=parseFloat(getComputedStyle(el).fontSize);while(size>1&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)){size-=.5;el.style.fontSize=size+'px';}if(el.style.fontSize)el.style.fontSize=(size/width*100)+'cqw';});}
 function renderParts(){
  $('parts').innerHTML=parts.map((p,i)=>`<section class="part" data-part="${i}"><div class="part-header"><label>부 이름<input data-field="name" value="${esc(p.name)}" maxlength="30"></label><label>앞글자<input data-field="prefix" value="${esc(p.prefix)}" maxlength="1"></label><label>시작번호<input data-field="start" type="number" min="1" max="999" value="${p.start}"></label><label>기본 개수<input data-default type="number" min="0" max="100" value="2"></label><button data-action="remove-part" type="button">부 삭제</button></div><div class="part-tools"><button data-action="add-vendor" type="button">업체 추가</button><button data-action="apply-count" type="button">기본 개수 일괄 적용</button>${i?'<button data-action="copy" type="button">앞 부 설정 복사</button>':''}<button data-action="reverse" type="button">업체 역순</button></div>${p.vendors.length?p.vendors.map((v,j)=>`<div class="vendor-row" data-vendor="${j}"><span class="position">${j+1}</span><label>업체명<input list="vendors" data-field="company" maxlength="80" value="${esc(v.company)}"></label><label>개수<input data-field="count" type="number" min="0" max="100" value="${v.count}"></label><div class="move"><button type="button" data-action="up" aria-label="${esc(v.company||'업체')} 위로" ${j===0?'disabled':''}>↑</button><button type="button" data-action="down" aria-label="${esc(v.company||'업체')} 아래로" ${j===p.vendors.length-1?'disabled':''}>↓</button><button type="button" data-action="remove-vendor">삭제</button></div></div>`).join(''):'<p class="part-empty">업체를 추가하고 추첨 순서대로 배치해 주세요.</p>'}</section>`).join('');
  document.querySelectorAll('[data-part]').forEach(card=>{
   const p=parts[Number(card.dataset.part)];card.querySelector('[data-default]').value=p.defaultCount??2;
   if(p.prefix!=='E'){const button=document.createElement('button');button.type='button';button.dataset.action='import-vendors';button.textContent='이 회차 업체 가져오기'+(roundVendors.length?' ('+roundVendors.length+'곳)':'');card.querySelector('.part-tools').prepend(button);}
  });
  const simple=$('config-mode').value==='split';$('editor').classList.toggle('simple-mode',simple);$('reverse-field').hidden=!simple;$('add-part').hidden=simple;
  $('setup-heading').textContent=simple?'업체 순서와 총 개체수':'부별 업체 순서와 개수';$('setup-hint').textContent=simple?'업체 순서대로 배정한 뒤 전체 수량을 절반씩 1·2부로 나눕니다. 홀수면 1부에 한 마리 더 배정합니다.':'위에서부터 한 업체씩 돌아갑니다. 수량이 끝난 업체는 건너뜁니다.';
  if(simple){const first=$('parts').querySelector('.part');if(first){first.querySelector('[data-default]').parentElement.firstChild.textContent='업체당 기본 총수';first.querySelectorAll('[data-field="count"]').forEach(el=>el.parentElement.firstChild.textContent='총 개체수');}}
 }
 function sample(){const l=labels.find(l=>checked.has(l.lot_number))||labels[0];$('sample').innerHTML=l?M.labelHtml(l,esc):'';$('selected-count').textContent=checked.size+'장 선택';fit();}
 function renderResult(){
  $('result').hidden=!labels.length;$('total').textContent='총 '+labels.length+'장';
  $('result-title').textContent=selectedPlan?selectedPlan.title:'번호표 미리보기';
  $('result-note').textContent=selectedPlan?'저장된 번호·업체명 그대로 출력합니다.':'아직 저장 전입니다. 목록을 확인하고 확정·저장해 주세요.';
  $('print-b1').hidden=$('print-browser').hidden=!selectedPlan;
  const filter=$('filter').value;
  const groups=[...new Map(labels.map(l=>[l.prefix,{prefix:l.prefix,name:l.part}])).values()];
  $('filter').innerHTML='<option value="">전체</option>'+groups.map(p=>`<option value="${esc(p.prefix)}">${esc(p.name)} · ${esc(p.prefix)} (${labels.filter(l=>l.prefix===p.prefix).length}장)</option>`).join('');$('filter').value=groups.some(p=>p.prefix===filter)?filter:'';
  renderRows();
 }
 function visible(){return labels.filter(l=>!$('filter').value||l.prefix===$('filter').value);}
 function renderRows(){ $('rows').innerHTML=visible().map(l=>`<label class="number-row"><input type="checkbox" value="${esc(l.lot_number)}" ${checked.has(l.lot_number)?'checked':''}><span><strong>${esc(l.lot_number)}</strong><small>${esc(l.company)}</small></span></label>`).join('');sample();}
 function openPlan(id){
  error('');message('');$('print-status').textContent='';$('print-pages').innerHTML='';selectedPlan=plans.find(p=>p.id===id)||null;checked.clear();dirty=false;
  $('editor').hidden=!!selectedPlan;$('edit-plan').hidden=!selectedPlan;
  if(selectedPlan){parts=structuredClone(selectedPlan.parts);labels=structuredClone(selectedPlan.labels);$('saved').value=selectedPlan.id;renderResult();}
  else{$('config-mode').value='split';$('reverse-second').checked=true;parts=initial();$('title').value='';try{const draft=JSON.parse(localStorage.getItem(storageKey()));if(draft&&Array.isArray(draft.parts)&&draft.parts.length<=8){parts=draft.parts;$('config-mode').value=draft.mode||'parts';$('reverse-second').checked=draft.reverse!==false;$('title').value=draft.title||'';dirty=true;}}catch{}labels=[];$('saved').value='';$('result').hidden=true;renderParts();}
 }
 async function load(){
  const seq=++sequence;error('');message('번호표를 불러오는 중…');lock(true);$('editor').hidden=$('result').hidden=true;selectedPlan=null;plans=[];
  try{M.date(round.date);const data=await api(endpoint()+'?'+new URLSearchParams({date:round.date}));if(seq!==sequence)return;
   plans=data.plans;roundVendors=data.roundVendors||[];$('vendors').innerHTML=data.vendors.map(v=>`<option value="${esc(v.name)}"></option>`).join('');
   $('saved').innerHTML='<option value="">새 번호표</option>'+plans.map(p=>`<option value="${esc(p.id)}">${esc(p.title)} · ${new Date(p.createdAt).toLocaleString('ko-KR')} · ${p.labels.length}장</option>`).join('');
   openPlan(plans[0]?.id||'');
  }catch(e){error(e);message('날짜와 연결 상태를 확인한 뒤 새로고침해 주세요.');}finally{if(seq===sequence)lock(false);}
 }
 function updateScope(){
  $('scope-name').textContent=round.name+(round.date?' · '+round.date:'');$('date-field').hidden=!!round.fixedDate;$('date').value=round.date||'';
  const url=new URL(location.href);url.searchParams.set('channel',round.channelId);if(round.date)url.searchParams.set('date',round.date);else url.searchParams.delete('date');url.searchParams.delete('archive');history.replaceState(null,'',url);
  $('home').href='/main?'+new URLSearchParams({channel:round.channelId,view:'numberLabels'});
 }
 $('parts').addEventListener('input',e=>{if(busy)return;const card=e.target.closest('[data-part]');if(!card)return;const p=parts[Number(card.dataset.part)];if(e.target.hasAttribute('data-default')){p.defaultCount=Number(e.target.value);remember();return;}if(!e.target.dataset.field)return;const row=e.target.closest('[data-vendor]'),field=e.target.dataset.field;const target=row?p.vendors[Number(row.dataset.vendor)]:p;target[field]=['count','start'].includes(field)?Number(e.target.value):field==='prefix'?e.target.value.toUpperCase():e.target.value;remember();});
 $('parts').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||busy)return;const card=b.closest('[data-part]'),i=Number(card.dataset.part),p=parts[i],j=Number(b.closest('[data-vendor]')?.dataset.vendor),a=b.dataset.action;
  if(a==='remove-part'){if(!confirm(p.name+' 설정을 삭제할까요? 저장본은 유지됩니다.'))return;parts.splice(i,1);}
  if(a==='add-vendor')p.vendors.push({company:'',count:Number(card.querySelector('[data-default]').value)});
  if(a==='import-vendors'){
   error('');if(!roundVendors.length){error('이 회차에 연결된 업체가 없습니다. 참여 업체 메뉴에서 배정을 확인하거나 업체 추가로 직접 입력해 주세요.');return;}
   try{const next=M.importVendors(p.vendors,roundVendors,Number(card.querySelector('[data-default]').value)),added=next.length-p.vendors.length;
    if(!added){message('이 회차 업체가 이미 모두 들어가 있어요. 입력한 순서와 개수는 유지됩니다.');return;}
    p.vendors=next;remember();renderParts();message(added+'곳을 추가했어요. 추첨 순서대로 정렬하고 업체별 개수를 확인해 주세요.');
   }catch(e){error(e);}return;
  }
  if(a==='apply-count'){const count=Number(card.querySelector('[data-default]').value);if(!Number.isInteger(count)||count<0||count>100){error('개수는 0~100개로 정해 주세요.');return;}p.vendors.forEach(v=>v.count=count);}
  if(a==='copy'){if(p.vendors.length&&!confirm('이 부의 업체 순서·개수를 앞 부 설정으로 바꿀까요?'))return;p.vendors=structuredClone(parts[i-1].vendors);p.defaultCount=parts[i-1].defaultCount??2;}
  if(a==='reverse')p.vendors.reverse();if(a==='remove-vendor')p.vendors.splice(j,1);
  if(a==='up'&&j>0)[p.vendors[j-1],p.vendors[j]]=[p.vendors[j],p.vendors[j-1]];
  if(a==='down'&&j<p.vendors.length-1)[p.vendors[j+1],p.vendors[j]]=[p.vendors[j],p.vendors[j+1]];
  remember();renderParts();
 });
 function addPart(panel){if(parts.length>=8){error('부 구성은 8개까지 추가할 수 있어요.');return;}const prefix=panel?'E':'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c=>c!=='E'&&!parts.some(p=>p.prefix===c));if(parts.some(p=>p.prefix===prefix)){error('E 패널은 이미 추가돼 있어요.');return;}parts.push({name:panel?'패널':(parts.length+1)+'부',prefix,start:1,vendors:panel?[{company:'패널',count:2}]:[]});remember();renderParts();}
 $('add-part').onclick=()=>addPart(false);$('add-panel').onclick=()=>addPart(true);$('title').oninput=remember;
 $('preview').onclick=()=>{error('');try{const generated=M.build(configuration());labels=generated.labels;checked.clear();renderResult();message('총 '+labels.length+'장 · 업체 순서와 개수를 확인해 주세요.');}catch(e){error(e);}};
 $('save').onclick=async()=>{
  if(busy)return;error('');let input;
  try{const generated=M.build(configuration());input={date:M.date(round.date),title:$('title').value||round.name+' 번호표',mode:generated.mode,setup:generated.setup,parts:generated.parts};}catch(e){error(e);return;}
  const signature=JSON.stringify(input),key=storageKey()+':pending';let pending;
  try{pending=JSON.parse(localStorage.getItem(key));}catch{}
  if(!pending||pending.signature!==signature){pending={signature,requestId:crypto.randomUUID()};try{localStorage.setItem(key,JSON.stringify(pending));}catch{}}
  lock(true);message('번호표 저장 중…');
  try{const {plan}=await api(endpoint(),{method:'POST',body:JSON.stringify({...input,requestId:pending.requestId})});plans=[plan,...plans.filter(p=>p.id!==plan.id)];const option=document.createElement('option');option.value=plan.id;option.textContent=plan.title+' · '+plan.labels.length+'장';$('saved').prepend(option);try{localStorage.removeItem(key);localStorage.removeItem(storageKey());}catch{}openPlan(plan.id);message('번호표를 저장했어요. 출력할 번호를 선택해 주세요.');}
  catch(e){error(e);message('저장 여부를 확인하지 못했어요. 같은 내용으로 다시 저장해도 중복되지 않습니다.');}finally{lock(false);}
 };
 $('new-plan').onclick=()=>{if(dirty&&!confirm('작성 중인 설정을 비우고 새로 만들까요?'))return;try{localStorage.removeItem(storageKey());}catch{}openPlan('');};
 $('edit-plan').onclick=()=>{if(!selectedPlan)return;const prior=selectedPlan;selectedPlan=null;$('saved').value='';$('config-mode').value=prior.mode||'parts';$('reverse-second').checked=prior.setup?.reverse!==false;parts=prior.mode==='split'?[{name:'업체 순서',prefix:'A',start:1,defaultCount:prior.setup.defaultCount,vendors:structuredClone(prior.setup.vendors)},...structuredClone(prior.setup.panels)]:structuredClone(prior.parts);$('title').value=prior.title+' 수정';$('editor').hidden=false;$('edit-plan').hidden=true;remember();renderParts();};
 $('config-mode').onchange=()=>{if(dirty&&!confirm('구성 방식을 바꾸면 현재 입력을 새로 시작합니다. 변경할까요?')){$('config-mode').value=$('config-mode').value==='split'?'parts':'split';return;}parts=initial();remember();renderParts();};$('reverse-second').onchange=remember;
 $('saved').onchange=()=>openPlan($('saved').value);$('filter').onchange=renderRows;
 $('rows').onchange=e=>{if(e.target.type==='checkbox'){if(e.target.checked)checked.add(e.target.value);else checked.delete(e.target.value);sample();}};
 $('select-all').onclick=()=>{visible().forEach(l=>checked.add(l.lot_number));renderRows();};$('select-none').onclick=()=>{checked.clear();renderRows();};
 async function print(browser){
  if(busy||!selectedPlan)return;error('');const chosen=labels.filter(l=>checked.has(l.lot_number));
  if(!chosen.length){error('출력할 번호를 선택해 주세요.');return;}
  if(!browser&&chosen.length>120){error('B1 PRO는 한 번에 120장까지 출력해 주세요. 부별로 나누어 선택할 수 있어요.');return;}
  lock(true);let submitted=false;$('print-status').textContent='저장본 확인 중…';
  try{const fresh=await api(endpoint()+'?'+new URLSearchParams({date:round.date}));const saved=fresh.plans.find(p=>p.id===selectedPlan.id);if(!saved||JSON.stringify(saved.labels)!==JSON.stringify(selectedPlan.labels))throw Error('저장본이 달라졌어요. 새로고침한 뒤 다시 선택해 주세요.');
   if(browser){$('print-pages').innerHTML=chosen.map(l=>M.labelHtml(l,esc)).join('');fit();$('print-status').textContent='용지 50×30 mm · 배율 100% · 머리글/바닥글 끄기';window.print();return;}
   const base='http://127.0.0.1:17876',status=await fetch(base+'/v1/status',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
   if(!status.identificationLabelFormats?.includes('numbering'))throw Error('새 번호라벨을 출력하려면 업데이트된 밴드 모니터 앱을 다시 열어 주세요.');
   if(status.ready===false)throw Error('모니터 앱에서 B1 PRO 연결을 확인해 주세요.');
   submitted=true;const response=await fetch(base+'/v1/labels',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({labels:chosen}),signal:AbortSignal.timeout(15000)}),result=await response.json();
   if(!response.ok||!result.ok||result.accepted!==chosen.length)throw Error('출력 접수를 확인하지 못했어요.');
   $('print-status').textContent=result.accepted+'장 출력 대기열에 추가했어요. 재출력은 필요한 번호만 선택하세요.';
  }catch(e){error(submitted?'접수 결과가 불확실합니다. 모니터 앱의 출력 대기열을 확인한 뒤 재출력해 주세요.':e.message==='Failed to fetch'?'밴드 모니터 앱과 프린터 연결을 확인해 주세요.':e.message);$('print-status').textContent='';}finally{lock(false);}
 }
 $('print-b1').onclick=()=>print(false);$('print-browser').onclick=()=>print(true);$('reload').onclick=load;
 $('round').onchange=()=>{round=structuredClone(rounds[Number($('round').value)]);dirty=false;updateScope();load();};$('date').onchange=()=>{round.date=$('date').value;updateScope();load();};
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
 try{
  if(!await CreoPlatform.verifyAdmin()){location.replace('/operator-login.html?next='+encodeURIComponent(location.pathname+location.search));return;}
  const data=await api('operation-rounds'),seen=new Set();
  rounds=data.rounds.filter(r=>data.channels.some(c=>c.id===r.channelId&&c.dataAdapter==='platform'&&c.features?.auction!==false)&&!r.scopeError).filter(r=>{const key=r.channelId+'@'+r.date;if(seen.has(key))return false;seen.add(key);return true;}).map(r=>({...r,fixedDate:!!r.date}));
  if(!rounds.length)throw Error('사용할 회차가 없습니다. 운영 홈에서 회차를 준비해 주세요.');
  let index=rounds.findIndex(r=>r.channelId===(q.get('channel')||data.activeChannelId)&&(!q.get('date')||!r.date||r.date===q.get('date'))&&(!q.get('archive')||r.archiveId===q.get('archive')));
  if(index<0&&q.has('channel'))throw Error('선택한 회차를 찾을 수 없습니다. 운영 홈에서 다시 선택해 주세요.');
  if(index<0)index=0;round=structuredClone(rounds[index]);if(!round.date&&q.get('date'))round.date=q.get('date');
  $('round').innerHTML=rounds.map((r,i)=>`<option value="${i}">${esc(r.name)}</option>`).join('');$('round').value=String(index);updateScope();await load();
 }catch(e){error(e);message('운영 홈에서 회차를 확인한 뒤 다시 열어 주세요.');}
});

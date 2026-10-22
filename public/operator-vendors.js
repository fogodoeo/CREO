document.addEventListener('DOMContentLoaded',()=>{
 'use strict';
 const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml,query=new URLSearchParams(location.search);
 const program=id=>id==='national-cre'?'전국크레자랑':id==='clab'?'씨랩 · 크레용':id;
 const day=date=>date?Number(date.slice(5,7))+'/'+Number(date.slice(8)):'날짜 미지정';
 const route=(page,params)=>'/'+page+'?'+new URLSearchParams(params);
 let vendors=[],rounds=[],sequence=0,loaded=false;
 function intake(v,b,root){
  const round=rounds.find(r=>r.familyId==='national-cre'&&r.date===b.date&&!r.scopeError);
  const params={...(root?{vendor:root.vendorId}:{}),...(b.itemCount?{status:'approved'}:{})};
  const href=round?route('main',{channel:round.channelId,...(round.archiveId?{archive:round.archiveId}:{}),view:'intake',...params}):route('vendor-entry-review.html',{channel:'national-cre',broadcastDate:b.date,...params});
  return `<a href="${esc(href)}"${round?'':' target="_blank" rel="noopener"'}>출품 확인</a>`;
 }
 function dates(){
  const current=$('date').value,family=$('family').value,values=new Map();
  vendors.forEach(v=>v.broadcasts.filter(b=>!family||b.familyId===family).forEach(b=>{if(b.date)values.set(b.date,b.region);}));
  $('date').innerHTML='<option value="">모든 방송일</option>'+[...values].sort(([a],[b])=>a.localeCompare(b)).map(([d,r])=>`<option value="${esc(d)}">${esc(d+' '+(family==='national-cre'?r:''))}</option>`).join('');
  $('date').value=values.has(current)?current:'';
 }
 function render(){
  const search=$('search').value.trim().toLowerCase(),family=$('family').value,date=$('date').value;
  const rows=vendors.filter(v=>(!family||v.members.some(m=>m.familyId===family))&&(!date||v.broadcasts.some(b=>b.date===date&&(!family||b.familyId===family)))&&[v.name,v.manager,v.phone,...v.members.map(m=>m.region)].join(' ').toLowerCase().includes(search));
  $('heading').textContent=(family?program(family)+' ':'')+'전체 업체';
  $('scope').textContent=date?day(date)+' 방송에 배정되거나 참여한 업체입니다.':'업체를 한 번 등록하고 방송일별로 관리합니다.';
  $('status').textContent=rows.length+'개 업체';$('reset').hidden=!search&&!date;$('access').hidden=family!=='national-cre';
  $('rows').innerHTML=rows.map(v=>{
   const members=v.members.filter(m=>!family||m.familyId===family),root=members.find(m=>m.channelId==='national-cre'),primary=root||members.find(m=>['active','draft'].includes(m.status))||members[0];
   const broadcasts=v.broadcasts.filter(b=>(!family||b.familyId===family)&&(!date||b.date===date));
   const regions=[...new Set(members.map(m=>m.region).filter(Boolean))];
   const title=family==='national-cre'?root?.region||regions[0]||'지역 미등록':[...new Set(members.map(m=>program(m.familyId)))].join(' · ');
   const info=primary&&['active','draft'].includes(primary.status)?route('channel-workspace.html',{channel:primary.channelId,tab:'vendors',vendor:primary.vendorId}):'';
   return `<article class="vendor-row"><header><div><h2>${esc(v.name)}</h2><p>${esc(title)}${members.every(m=>!m.active)?' · 사용 중지':''}</p></div></header><ul class="vendor-broadcasts">${broadcasts.map(b=>{
    const status=b.itemCount?`경매 편성 ${b.itemCount}마리`:b.requested?'출품 신청 완료':b.rounds.length?'방송 배정 완료':'지역 배정';
    return `<li><div><strong>${esc(day(b.date)+' '+(b.region||program(b.familyId)))}</strong><span>${esc(status)}</span></div><nav aria-label="${esc(v.name+' '+day(b.date)+' 작업')}">${b.rounds.map(r=>`<a href="${esc(route('main',{channel:r.channelId,...(r.archiveId?{archive:r.archiveId}:{}),view:r.itemCount&&r.status!=='draft'?'organizer':'members',...(!r.itemCount||r.status==='draft'?{vendor:r.vendorId}:{})}))}">${r.itemCount&&r.status!=='draft'?'이 회차 정산':'참여 정보'}</a>`).join('')}${b.familyId==='national-cre'&&b.date?intake(v,b,root):''}</nav></li>`;
   }).join('')||'<li class="empty-broadcast">방송일이 배정되지 않았습니다.</li>'}</ul><details><summary>연락처·계좌·업체 정보</summary><div class="vendor-detail"><dl><dt>담당자 · 연락처</dt><dd>${esc(v.manager||'담당자 미등록')} · ${esc(v.phone||'번호 미등록')}</dd></dl><dl><dt>입금 계좌</dt><dd>${esc([v.bankName,v.bankAccount,v.bankHolder].filter(Boolean).join(' · ')||'미등록')}</dd></dl><nav class="vendor-actions">${info?`<a href="${esc(info)}">업체 정보 수정</a>`:''}${root?`<a href="${esc(route('organizer-bookings.html',{channel:'national-cre',vendor:root.vendorId,action:'region'}))}">방송 지역 배정</a>`:''}</nav></div></details></article>`;
  }).join('')||'<p class="directory-empty">조건에 맞는 업체가 없습니다. 검색어나 방송일을 바꿔 주세요.</p>';
 }
 async function load(){
  const seq=++sequence;$('reload').disabled=true;$('rows').replaceChildren();$('status').textContent='업체를 불러오는 중…';$('status').setAttribute('role','status');
  try{
   const data=await CreoPlatform.api('operator-vendors');if(seq!==sequence)return;vendors=data.vendors;rounds=data.rounds||[];
   const current=loaded?$('family').value:query.get('program')||'',families=new Map();
   vendors.forEach(v=>v.members.forEach(m=>families.set(m.familyId,program(m.familyId))));
   $('family').innerHTML='<option value="">전체 프로그램</option>'+[...families].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
   $('family').value=families.has(current)?current:'';loaded=true;dates();render();
  }catch(e){if(seq===sequence){$('status').setAttribute('role','alert');$('status').textContent=e.status===401?'로그인이 만료됐습니다. 운영 홈에서 다시 로그인해 주세요.':'업체를 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.';}}
  finally{if(seq===sequence)$('reload').disabled=false;}
 }
 $('reload').addEventListener('click',load);$('search').addEventListener('input',render);$('date').addEventListener('change',render);
 $('family').addEventListener('change',()=>{$('date').value='';dates();render();});
 $('reset').addEventListener('click',()=>{$('search').value='';$('date').value='';render();$('search').focus();});
 load();
});

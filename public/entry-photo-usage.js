(function(){
 'use strict';
 const trigger=document.getElementById('open-photo-usage');if(!trigger)return;
 const esc=CreoPlatform.escapeHtml,dialog=document.createElement('dialog');dialog.className='photo-usage-dialog';dialog.setAttribute('aria-labelledby','photo-usage-title');
 dialog.innerHTML='<header><h2 id="photo-usage-title">사진 저장량</h2><button type="button" data-close aria-label="사진 저장량 닫기">×</button></header><div class="photo-usage-content"><p data-loading role="status" hidden>집계 중…</p><p data-error role="alert" hidden></p><div data-result></div></div><footer><button class="secondary" type="button" data-reload>다시 조회</button></footer>';
 document.body.append(dialog);const $=query=>dialog.querySelector(query);let sequence=0,controller,needsLogin=false;
 function size(value){if(value<1000000)return (value/1000).toLocaleString('ko-KR',{maximumFractionDigits:1})+' KB';return (value/1000000).toLocaleString('ko-KR',{maximumFractionDigits:1})+' MB';}
 const count=value=>value===null?'확인 필요':value.toLocaleString('ko-KR')+'장';
 function render(data){
  const total=data.totals,labels={entries:'출품 개체',parents:'부모·변경 이력',library:'구매자 보관함',auction:'경매 기록'};
  const reasons=[!data.consistent?'조회 중 정보 변경':null,data.unresolved.unreadableBuyerRecords?'보관함 참조 확인 필요':null,data.unresolved.missingMetadata||data.unresolved.invalidReferences?'등록 정보 확인 필요':null].filter(Boolean);
  $('[data-result]').innerHTML=`<p class="usage-scope">전체 경매 · 출품 사진</p><strong class="usage-total">${size(total.registeredBytes)}</strong><p class="usage-count">${count(total.photoCount)}</p><p class="usage-basis">등록 정보 기준 · Storage 파일 대조 전</p>${reasons.length?`<p class="usage-incomplete">${reasons.map(esc).join(' · ')}</p>`:''}<dl class="usage-summary"><div><dt>연결 중</dt><dd>${count(total.linkedPhotoCount)}</dd></div><div><dt>미연결</dt><dd>${count(total.unlinkedPhotoCount)}</dd></div></dl><details class="usage-breakdown"><summary>연결 용도 <small>중복 포함</small></summary><dl>${data.uses.map(use=>`<div><dt>${labels[use.id]}</dt><dd>${count(use.photoCount)}</dd></div>`).join('')}</dl></details>${data.vendors.length?`<section class="usage-vendors"><h3>업체별 저장량</h3>${data.vendors.map(v=>`<details><summary><b>${esc(v.name)}</b><span>${size(v.registeredBytes)}</span></summary><dl><div><dt>등록 사진</dt><dd>${count(v.photoCount)}</dd></div><div><dt>연결 중</dt><dd>${count(v.linkedPhotoCount)}</dd></div><div><dt>미연결</dt><dd>${count(v.unlinkedPhotoCount)}</dd></div></dl></details>`).join('')}</section>`:'<p class="usage-empty">등록된 출품 사진이 없어요</p>'}<p class="usage-footnote">큰 사진·미리보기 포함${total.externalPhotoCount?' · 외부 사진 '+count(total.externalPhotoCount)+' 제외':''}<br>자동 삭제 없음</p><p class="usage-checked">조회 ${esc(new Date(data.checkedAt).toLocaleString('ko-KR'))}</p>`;
 }
 async function load(){
  if(needsLogin){location.reload();return;}
  controller?.abort();controller=new AbortController();const current=++sequence;
  $('[data-loading]').hidden=false;$('[data-error]').hidden=true;$('[data-result]').replaceChildren();$('[data-reload]').disabled=true;
  try{const data=await CreoPlatform.api('entry-photo-usage',{signal:controller.signal,cache:'no-store'});if(current!==sequence||!dialog.open)return;render(data);}
  catch(error){if(current!==sequence||!dialog.open)return;$('[data-error]').textContent=error.message;$('[data-error]').hidden=false;if(error.status===401){needsLogin=true;$('[data-reload]').textContent='로그인 화면으로';}}
  finally{if(current===sequence){$('[data-loading]').hidden=true;$('[data-reload]').disabled=false;}}
 }
 trigger.onclick=()=>{needsLogin=false;$('[data-reload]').textContent='다시 조회';dialog.showModal();load();};
 $('[data-close]').onclick=()=>dialog.close();$('[data-reload]').onclick=load;
 dialog.addEventListener('close',()=>{sequence++;controller?.abort();$('[data-result]').replaceChildren();trigger.focus();});
 const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};let beganOutside=false;
 dialog.addEventListener('pointerdown',event=>beganOutside=outside(event));dialog.addEventListener('click',event=>{if(beganOutside&&outside(event))dialog.close();beganOutside=false;});
})();

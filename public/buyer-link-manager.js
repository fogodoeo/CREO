(() => {
  'use strict';
  function safeUrl(raw,origin=location.origin){
    const url=new URL(raw,origin);
    if(url.origin!==origin||url.username||url.password||!/^\/(?:d|s)\/[A-Za-z0-9_-]{8,24}$/.test(url.pathname))throw Error('낙찰자 페이지 주소를 확인할 수 없어요.');
    return url.href;
  }
  function create({api,getContext}){
    const dialog=document.createElement('dialog');dialog.className='buyer-link-dialog';dialog.setAttribute('aria-labelledby','buyer-link-title');
    dialog.innerHTML='<header><h2 id="buyer-link-title" tabindex="-1">구매자 링크 관리</h2><button type="button" aria-label="링크 관리 닫기" data-link-close>×</button></header><div data-link-body></div>';
    document.body.append(dialog);
    const body=dialog.querySelector('[data-link-body]'),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let context,state,opener,busy=false,pending=null,sequence=0,outside=false;
    const endpoint=()=>`channels/${encodeURIComponent(context.channelId)}/buyer-link-access`;
    const sameContext=()=>{const next=getContext();return next?.channelId===context?.channelId&&next?.itemId===context?.itemId};
    const date=value=>new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
    function message(text,isError=false){const el=body.querySelector(isError?'[role=alert]':'[role=status]');el.textContent=text;el.hidden=!text;}
    function setBusy(value){busy=value;dialog.querySelectorAll('button').forEach(button=>button.disabled=value);}
    function close(){if(busy)return;sequence++;dialog.close();opener?.focus({preventScroll:true});}
    function render(note=''){
      pending=null;
      const labels={active:'사용 중',expired:'기간 만료',revoked:'사용 중지',not_issued:'발급 필요'};
      body.innerHTML=`<p class="link-person">${esc(state.channel.name)}<br>${esc(state.buyer.name)} · ${esc(state.buyer.phoneLast4)}</p><div class="link-state"><b>${labels[state.status]}</b>${state.expiresAt?`<span>${esc(date(state.expiresAt))}까지</span>`:''}</div>
      ${state.url?`<label for="buyer-link-url">현재 링크</label><input id="buyer-link-url" readonly value="${esc(state.url)}"><div class="link-actions"><button data-copy type="button">링크 복사</button><button data-open type="button">페이지 보기</button></div>`:''}
      ${state.status==='expired'?'<div class="link-actions"><button type="button" class="link-primary" data-renew>기간 연장</button></div>':''}
      <div class="link-actions"><button type="button" class="${state.status==='expired'?'':'link-primary'}" data-rotate>새 링크 발급</button>${state.status!=='revoked'?'<button type="button" class="link-danger" data-revoke>사용 중지</button>':''}</div>
      ${state.history.length?`<details><summary>변경 내역</summary><ul>${state.history.map(row=>`<li><span>${({rotate:'새 링크 발급',revoke:'사용 중지',renew:'기간 연장'})[row.action]||'링크 변경'}</span><span>${esc(date(row.at))}</span></li>`).join('')}</ul></details>`:''}
      <p role="status" ${note?'':'hidden'}>${esc(note)}</p><p role="alert" hidden></p>`;
      body.querySelector('[data-rotate]').onclick=()=>confirmAction('rotate');
      body.querySelector('[data-renew]')?.addEventListener('click',()=>confirmAction('renew'));
      body.querySelector('[data-revoke]')?.addEventListener('click',()=>confirmAction('revoke'));
      body.querySelector('[data-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(safeUrl(state.url));message('링크를 복사했어요');}catch{body.querySelector('input')?.select();message('링크를 선택했어요. 복사해 주세요.');}});
      body.querySelector('[data-open]')?.addEventListener('click',()=>{try{window.open(safeUrl(state.url),'_blank','noopener,noreferrer');}catch(error){message(error.message,true);}});
    }
    async function load(){
      const current=++sequence;body.innerHTML='<p role="status">링크를 불러오는 중…</p>';setBusy(true);
      try{
        const next=await api(endpoint()+'?itemId='+encodeURIComponent(context.itemId));
        if(current!==sequence)return;
        if(!sameContext())throw Error('선택한 구매자가 바뀌었어요. 창을 닫고 다시 열어 주세요.');
        state=next;render();
      }catch(error){if(current===sequence){body.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" data-retry>다시 확인</button>`;body.querySelector('[data-retry]').onclick=load;}}
      finally{if(current===sequence)setBusy(false);}
    }
    function confirmAction(action){
      pending={action,requestId:crypto.randomUUID(),expectedRevision:state.revision,itemId:context.itemId};
      const label=({rotate:'새 링크 발급',renew:'기간 연장',revoke:'사용 중지'})[action];
      const explanation=({rotate:'기존 주소가 닫혀요. 보관함도 새 링크로 다시 연결해야 해요.',renew:'기존 주소를 14일 더 사용할 수 있어요. 보관함 연결은 그대로 유지돼요.',revoke:'기존 링크와 보관함 연결을 중지해요.'})[action];
      body.innerHTML=`<p class="link-person">${esc(state.channel.name)}<br>${esc(state.buyer.name)} · ${esc(state.buyer.phoneLast4)}</p><p>${explanation}</p><p>낙찰·배송·결제 기록은 유지돼요.</p><div class="link-actions"><button type="button" data-cancel>취소</button><button type="button" class="${action==='revoke'?'link-danger':'link-primary'}" data-confirm>${label}</button></div><p role="alert" hidden></p><p role="status" hidden></p><button data-refresh type="button" hidden>최신 상태 확인</button>`;
      body.querySelector('[data-cancel]').onclick=()=>render();body.querySelector('[data-refresh]').onclick=load;
      body.querySelector('[data-confirm]').onclick=async()=>{
        if(busy)return;
        if(!sameContext()){message('선택한 구매자가 바뀌었어요. 창을 닫고 다시 열어 주세요.',true);return;}
        setBusy(true);
        try{const next=await api(endpoint(),{method:'POST',body:JSON.stringify(pending)});state=next;render(({rotate:'새 링크를 구매자에게 전달해 주세요.',renew:'기존 링크의 기간을 연장했어요.',revoke:'기존 링크 사용을 중지했어요.'})[action]);}
        catch(error){message(error.message,true);if(error.status===409)body.querySelector('[data-refresh]').hidden=false;}
        finally{setBusy(false);}
      };
      body.querySelector('[data-cancel]').focus();
    }
    dialog.querySelector('[data-link-close]').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    const isOutside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
    dialog.addEventListener('pointerdown',event=>outside=isOutside(event));dialog.addEventListener('click',event=>{if(outside&&isOutside(event))close();outside=false;});
    return {async open(){if(dialog.open)return;context=getContext();if(!context?.channelId||!context?.itemId)throw Error('구매자를 먼저 선택해 주세요.');opener=document.activeElement;dialog.showModal();dialog.querySelector('h2').focus();await load();},isOpen:()=>dialog.open};
  }
  window.CreoBuyerLinkManager={create,safeUrl};
})();

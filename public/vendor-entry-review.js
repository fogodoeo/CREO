(function () {
  'use strict';
  const $=id=>document.getElementById(id), client=window.CreoPlatform, esc=client.escapeHtml, View=window.CreoCheckoutItemView;
  const viewer=View.createViewer({document,origin:location.origin});
  const dialog=$('review-dialog');
  $('review-form').querySelectorAll('input,textarea,select').forEach(input=>input.setAttribute('aria-describedby','review-error'));
  let channelId=new URLSearchParams(location.search).get('channel')||'', data=null, status='submitted', vendorId='', selected=null;
  let busy=false, loading=false, sequence=0, reviewMode='approve', opener=null, pending=null, outside=false;
  const endpoint=()=>`channels/${encodeURIComponent(channelId)}/entries`;
  const canReview=()=>data&&['draft','active'].includes(data.channel.status);
  const source=entry=>entry.submission||entry.approved||entry;
  const rows=()=>data?.groups.flatMap(group=>group.entries.map(entry=>({entry,group})))||[];
  function error(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
  function notice(message){$('notice').textContent=message;}
  function setBusy(value){
    busy=value;
    for(const id of ['toggle-intake','review-event','refresh','change-review-mode','confirm-review','close-review','reload-entry'])$(id).disabled=value;
    $('review-form').querySelectorAll('input,textarea,select').forEach(input=>{input.disabled=value;});
  }
  function setLinks(){
    $('workspace-link').href=channelId?'/channel-workspace.html?channel='+encodeURIComponent(channelId):'/channel-manager.html';
    $('workspace-link').textContent=channelId?'경매 운영':'경매 관리';
  }
  function itemView(row){
    const s=source(row.entry), group=row.group;
    const photos=ids=>(ids||[]).map(id=>group.media.find(m=>m.id===id)).filter(Boolean);
    const parents=['sire','dam'].map(role=>{
      const parent=group.parents.find(p=>p.id===s[role+'Id']);
      if(parent)return {role,name:parent.name||parent.code,morph:parent.morph,media:photos([parent.photoId])};
      return s.parents?.find(p=>p.role===role)||null;
    }).filter(Boolean);
    return {id:row.entry.id,name:s.morph,media:photos(s.photoIds),parents};
  }
  function renderList(){
    const all=rows(), visible=all.filter(row=>row.entry.status===status&&(!vendorId||row.group.vendor.id===vendorId));
    $('filters').querySelectorAll('[data-status]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.status===status));
      button.querySelector('span').textContent=all.filter(row=>row.entry.status===button.dataset.status&&(!vendorId||row.group.vendor.id===vendorId)).length;
    });
    $('entry-list').innerHTML=visible.length?visible.map(row=>{
      const entry=row.entry,s=source(entry),picture=View.pictures(itemView(row),location.origin).find(p=>p.group==='개체'&&p.thumbnailUrl);
      const traits=View.traitSummary({traits:{...s,morph:''}});
      return `<button class="entry-row" type="button" data-entry="${esc(entry.id)}" data-vendor="${esc(row.group.vendor.id)}">${picture?`<img src="${esc(picture.thumbnailUrl)}" alt="" loading="lazy">`:''}<span class="row-text"><small>${esc(row.group.vendor.name)}${entry.approved&&entry.status==='submitted'?' · 변경안':''}</small><strong>${esc(entry.lot||entry.code)} · ${esc(s.morph||'개체 정보')}</strong>${traits?`<span class="traits">${esc(traits)}</span>`:''}</span><span class="chevron" aria-hidden="true">›</span></button>`;
    }).join(''):`<p class="empty">${{submitted:'검토할 개체가 없어요',changes_requested:'수정 요청한 개체가 없어요',approved:'편성한 개체가 없어요'}[status]}</p>`;
  }
  function render(){
    $('intake').hidden=!data;
    if(!data){$('entry-list').innerHTML='<p class="empty">검토할 경매를 선택해 주세요</p>';return;}
    $('intake-status').textContent=data.policy.open&&canReview()?'접수 중':'접수 마감';
    $('toggle-intake').textContent=data.policy.open?'접수 마감':'접수 시작';
    $('toggle-intake').hidden=!canReview();
    $('review-vendor').innerHTML='<option value="">전체 업체</option>'+data.groups.map(group=>`<option value="${esc(group.vendor.id)}">${esc(group.vendor.name)}</option>`).join('');
    if(!data.groups.some(group=>group.vendor.id===vendorId))vendorId='';
    $('review-vendor').value=vendorId;
    renderList();
  }
  async function load(){
    if(busy)return false;
    const current=++sequence,requested=channelId;
    loading=true;error('list-message','');$('refresh').disabled=true;
    try{
      if(!requested){data=null;render();return true;}
      const next=await client.api(endpoint());
      if(current!==sequence||requested!==channelId)return false;
      if(next.channel?.id!==requested)throw Error('다른 경매의 응답입니다. 다시 불러와 주세요.');
      data=next;render();return true;
    }catch(e){
      if(current===sequence){error('list-message',e.message);if(e.status===401){$('login-section').hidden=false;$('review-section').hidden=true;}}
      return false;
    }finally{if(current===sequence){loading=false;$('refresh').disabled=false;}}
  }
  function renderInformation(row){
    const s=source(row.entry), item=itemView(row), pictures=View.pictures(item,location.origin);
    const children=pictures.filter(p=>p.group==='개체');
    const photo=(p,label)=>`<button type="button" class="entry-photo" data-photo="${pictures.indexOf(p)}" aria-label="${esc(label)} 사진 보기"><img src="${esc(p.thumbnailUrl||p.url)}" alt="" loading="lazy"></button>`;
    const pairs=[['모프',s.morph],['성별',{male:'수컷',female:'암컷',unknown:'미구분'}[s.sex]],['체중',s.weight?s.weight+'g':''],['크기',s.size],['해칭일',s.hatchDate]];
    $('entry-information').innerHTML=(children.length?`<div class="entry-photos">${children.map(p=>photo(p,'개체')).join('')}</div>`:'')+`<dl class="facts">${pairs.filter(([,v])=>v).map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${s.note?`<p class="entry-note">${esc(s.note)}</p>`:''}`+(item.parents.length?`<section class="parent-information"><h3>부모 정보</h3>${item.parents.map(parent=>{
      const label=parent.role==='sire'?'부':'모',picture=pictures.find(p=>p.group===label);
      return `<div>${picture?photo(picture,label+' '+(parent.name||'')):''}<p><span class="parent-role">${label}</span><strong>${esc(parent.name||'')}</strong>${parent.morph?`<small>${esc(parent.morph)}</small>`:''}</p></div>`;
    }).join('')}</section>`:'');
    $('entry-information').querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>viewer.open(item,button,pictures[Number(button.dataset.photo)]));
  }
  function showMode(mode){
    reviewMode=mode;pending=null;
    $('allocation-fields').hidden=mode!=='approve';$('reason-fields').hidden=mode==='approve';
    $('change-review-mode').textContent=mode==='approve'?'수정 요청':'편성하기';
    $('confirm-review').textContent=mode==='approve'?'경매에 반영':'수정 요청 보내기';
    error('review-error','');
  }
  function openEntry(row,button){
    selected=row;opener=button||opener;pending=null;
    $('review-company').textContent=row.group.vendor.name;
    $('review-title').textContent=(row.entry.lot||row.entry.code)+' · '+(source(row.entry).morph||'개체 정보');
    $('revision-note').hidden=!(row.entry.approved&&row.entry.status==='submitted');
    renderInformation(row);showMode('approve');
    const reviewable=canReview()&&row.entry.status==='submitted';
    $('review-form').hidden=!reviewable;$('review-actions').hidden=!reviewable;$('reload-entry').hidden=true;
    const existing=data.allocation.find(item=>item.id===row.entry.itemId);
    $('lot-code').value=existing?.code||row.entry.lot||'';
    $('lot-order').value=existing?.order||Math.max(0,...data.allocation.map(item=>item.order))+1;
    $('lot-price').value=existing?.startPrice||0;$('lot-team').value=existing?.teamName||row.group.vendor.teamName||'';$('review-reason').value='';
    const groups=data.channel.groups||[];
    $('lot-team-label').hidden=groups.length>0;$('lot-group-label').hidden=!groups.length;
    $('lot-group').innerHTML='<option value="">팀 없음</option>'+groups.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
    $('lot-group').value=existing?.groupId??row.group.vendor.groupId??'';
    $('review-form').querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
    if(row.entry.status==='changes_requested'){
      const reason=document.createElement('p');reason.className='entry-note';reason.textContent=row.entry.reason||'';$('entry-information').append(reason);
    }
    if(!dialog.open)dialog.showModal();$('review-title').focus();
  }
  function closeEntry(){if(busy||viewer.isOpen())return;dialog.close();}
  $('close-review').onclick=closeEntry;
  dialog.addEventListener('cancel',event=>{if(busy||viewer.isOpen())event.preventDefault();});
  dialog.addEventListener('close',()=>{selected=null;pending=null;if(opener?.isConnected)opener.focus();else $('refresh').focus();});
  function isOutside(event){const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);}
  dialog.addEventListener('pointerdown',event=>{outside=isOutside(event);});
  dialog.addEventListener('click',event=>{if(outside&&isOutside(event))closeEntry();outside=false;});
  $('entry-list').onclick=event=>{
    const button=event.target.closest('[data-entry]');if(!button||busy||loading)return;
    const row=rows().find(row=>row.entry.id===button.dataset.entry&&row.group.vendor.id===button.dataset.vendor);if(row)openEntry(row,button);
  };
  $('filters').onclick=event=>{const button=event.target.closest('[data-status]');if(!button)return;status=button.dataset.status;renderList();};
  $('review-vendor').onchange=event=>{vendorId=event.target.value;renderList();};
  $('change-review-mode').onclick=()=>{showMode(reviewMode==='approve'?'request-changes':'approve');(reviewMode==='approve'?$('lot-code'):$('review-reason')).focus();};
  $('review-form').oninput=event=>{pending=null;event.target.removeAttribute('aria-invalid');error('review-error','');};
  $('review-form').onsubmit=async event=>{
    event.preventDefault();if(busy||!selected||selected.entry.status!=='submitted')return;
    error('review-error','');
    const lot=$('lot-code').value.trim().toUpperCase(),order=Number($('lot-order').value),startPrice=Number($('lot-price').value),reason=$('review-reason').value.trim();
    const checks=reviewMode==='approve'?[['lot-code',/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(lot),'경매 번호를 입력해 주세요.'],['lot-order',Number.isInteger(order)&&order>0&&order<=10000,'진행 순서는 1~10,000 사이로 입력해 주세요.'],['lot-price',$('lot-price').value!==''&&Number.isSafeInteger(startPrice)&&startPrice>=0,'시작가를 0원 이상으로 입력해 주세요.']]:[['review-reason',Boolean(reason),'수정할 내용을 입력해 주세요.']];
    const invalid=checks.find(([,valid])=>!valid);if(invalid){$(invalid[0]).setAttribute('aria-invalid','true');error('review-error',invalid[2]);$(invalid[0]).focus();return;}
    const team=(data.channel.groups||[]).length?{groupId:$('lot-group').value,teamName:''}:{groupId:'',teamName:$('lot-team').value.trim()};
    const command={vendorId:selected.group.vendor.id,type:reviewMode,id:selected.entry.id,expectedVersion:selected.entry.version,...(reviewMode==='approve'?{lot,order,startPrice,...team}:{reason})};
    const signature=JSON.stringify(command);
    if(!pending||pending.signature!==signature)pending={signature,requestId:crypto.randomUUID()};
    setBusy(true);
    try{
      await client.api(endpoint()+'/review',{method:'POST',body:JSON.stringify({...command,requestId:pending.requestId})});
      const approved=reviewMode==='approve';setBusy(false);dialog.close();notice(approved?'경매 대기 목록에 반영했어요':'업체 출품 화면에 수정 요청을 남겼어요');await load();
    }catch(e){
      error('review-error',e.message);
      // Keep the same request id on a transport failure so retrying is safe.
      // A newer entry must be explicitly re-opened before any version changes.
      if(e.status===409){$('reload-entry').hidden=false;}
    }finally{setBusy(false);}
  };
  $('reload-entry').onclick=async()=>{
    if(busy||!selected)return;const id=selected.entry.id,owner=selected.group.vendor.id;
    if(await load()){const row=rows().find(row=>row.entry.id===id&&row.group.vendor.id===owner);if(row)openEntry(row);else{dialog.close();notice('출품 상태가 변경됐어요. 목록을 확인해 주세요.');}}
  };
  $('toggle-intake').onclick=async()=>{
    if(busy||loading||!data||!canReview())return;
    const next=!data.policy.open;setBusy(true);
    try{await client.api(`channels/${encodeURIComponent(channelId)}/entry-policy`,{method:'PUT',body:JSON.stringify({open:next,expectedRevision:data.policy.revision})});setBusy(false);await load();notice(next?'업체 출품 접수를 시작했어요':'출품 접수를 마감했어요. 제출된 개체는 계속 검토할 수 있어요.');}
    catch(e){error('list-message',e.message);setBusy(false);if(e.status===409)await load();}
    finally{setBusy(false);}
  };
  $('refresh').onclick=load;
  $('review-event').onchange=event=>{
    if(busy)return;channelId=event.target.value;data=null;vendorId='';status='submitted';
    const url=new URL(location.href);url.searchParams.set('channel',channelId);history.replaceState(null,'',url);setLinks();render();load();
  };
  $('login-form').onsubmit=async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;error('login-error','');
    try{if(!await client.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await start();}
    catch(e){error('login-error',e.message);}finally{button.disabled=false;}
  };
  async function start(){
    try{
      if(!await client.verifyAdmin()){$('login-section').hidden=false;$('review-section').hidden=true;return;}
      $('login-section').hidden=true;$('review-section').hidden=false;
      const catalog=await client.api('channels?includeArchived=1');
      const channels=catalog.channels.filter(channel=>channel.dataAdapter==='platform');
      $('review-event').innerHTML='<option value="">경매 선택</option>'+channels.map(channel=>`<option value="${esc(channel.id)}">${esc(channel.name)}${channel.status==='archived'?' · 지난 경매':''}</option>`).join('');
      if(channelId&&!channels.some(channel=>channel.id===channelId)){data=null;render();throw Error('요청한 경매를 찾을 수 없어요. 경매를 다시 선택해 주세요.');}
      $('review-event').value=channelId;setLinks();await load();
    }catch(e){error($('review-section').hidden?'login-error':'list-message',e.message);}
  }
  window.addEventListener('focus',()=>{if(!dialog.open&&!busy&&!loading&&!$('review-section').hidden)load();});
  start();
})();

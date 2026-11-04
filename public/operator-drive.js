/* global CreoPlatform */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml;
 let data={entries:[]},folder=null,trash=false,selected=new Set(),busy=false,uploading=false,controller=null,canceled=false,dialogAction='',dialogEntries=[],loadSeq=0;
 const fmt=bytes=>{if(bytes<1024)return `${bytes} B`;const i=Math.min(3,Math.floor(Math.log(bytes)/Math.log(1024)));return `${(bytes/1024**i).toLocaleString('ko-KR',{maximumFractionDigits:1})} ${['B','KB','MB','GB'][i]}`;};
 const icon=kind=>`<svg class="file-icon ${kind==='folder'?'folder':''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${kind==='folder'?'<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/>':'<path d="M14 3H5v18h14V8l-5-5Z M14 3v5h5 M8 13h8 M8 17h6"/>'}</svg>`;
 const content=(e,preview=false)=>`/api/operator-drive/entries/${e.id}/content${preview?'?preview=1':''}`;
 function error(message){$('error').textContent=message||'';$('error').hidden=!message;}
 function notice(message){$('status').textContent=message;}
 function dirty(value){if(parent!==window)parent.postMessage({type:'creo:operator-dirty',dirty:value},location.origin);}
 async function api(route,method='GET',body,signal){
  const response=await fetch('/api/operator-drive/'+route,{method,credentials:'same-origin',signal,headers:method==='GET'?{}:{'Content-Type':body instanceof Blob?'application/octet-stream':'application/json'},body:method==='GET'?undefined:body instanceof Blob?body:JSON.stringify(body||{})});
  const result=await response.json();if(!response.ok){if(response.status===401){$('login').hidden=false;$('drive').hidden=true;}const e=Error(result.error||'요청을 완료하지 못했습니다.');e.status=response.status;throw e;}return result;
 }
 function visible(){const q=$('search').value.trim().toLocaleLowerCase();return data.entries.filter(e=>(trash?e.trashRoot===e.id:!e.trashRoot&&e.parent===folder)&&e.name.toLocaleLowerCase().includes(q)).sort((a,b)=>Number(b.kind==='folder')-Number(a.kind==='folder')||a.name.localeCompare(b.name,'ko'));}
 function breadcrumb(){const chain=[];let id=folder,seen=new Set();while(id&&!seen.has(id)){seen.add(id);const e=data.entries.find(e=>e.id===id);if(!e)break;chain.unshift(e);id=e.parent;}return chain;}
 function controls(){
  const entries=data.entries.filter(e=>selected.has(e.id)),ready=entries.every(e=>e.state==='ready'),none=!entries.length;
  $('selection-count').textContent=none?'전체 선택':`${entries.length}개 선택`;
  $('rename').disabled=busy||entries.length!==1||!ready;$('move').disabled=busy||none||!ready;$('delete').disabled=busy||none||!ready;
  $('restore').disabled=busy||none||!ready;$('purge').disabled=busy||none;
  const shown=visible();$('select-all').checked=shown.length>0&&shown.every(e=>selected.has(e.id));$('select-all').indeterminate=selected.size>0&&!$('select-all').checked;
  for(const id of ['rename','move','delete','new-folder','upload','drop-zone'])$(id).hidden=trash;
  for(const id of ['restore','purge'])$(id).hidden=!trash;
  for(const id of ['upload','new-folder','refresh','all','trash','search','select-all'])$(id).disabled=busy;
  document.querySelectorAll('[data-open],[data-select],[data-cancel]').forEach(el=>el.disabled=busy);
  document.querySelectorAll('[data-folder]').forEach(el=>el.disabled=busy);
 }
 function render(){
  if(folder&&!data.entries.some(e=>e.id===folder&&!e.trashRoot&&e.kind==='folder'))folder=null;
  const entries=visible();selected=new Set([...selected].filter(id=>entries.some(e=>e.id===id)));
  $('all').setAttribute('aria-pressed',String(!trash));$('trash').setAttribute('aria-pressed',String(trash));
  $('usage').textContent=`파일함 사용량 ${fmt(data.usedBytes||0)} · 파일 ${data.entries.filter(e=>e.kind==='file'&&e.state==='ready').length.toLocaleString()}개`;
  $('breadcrumbs').innerHTML=trash?'<strong>휴지통</strong>':`<button type="button" data-folder="" ${!folder?'aria-current="page"':''}>내 파일</button>`+breadcrumb().map(e=>`<span aria-hidden="true">/</span><button type="button" data-folder="${e.id}" ${e.id===folder?'aria-current="page"':''}>${esc(e.name)}</button>`).join('');
  $('file-list').innerHTML=entries.map(e=>`<li class="file-row ${selected.has(e.id)?'selected':''}"><div class="file-name"><label><input type="checkbox" data-select="${e.id}" aria-label="${esc(e.name)} 선택" ${selected.has(e.id)?'checked':''}></label>${icon(e.kind)}<div class="name-stack"><button class="name-button" type="button" data-open="${e.id}">${esc(e.name)}</button>${e.state!=='ready'?`<small>${['canceling','deleting'].includes(e.state)?'삭제 미완료 · 다시 시도':'미완료 업로드'}</small>`:''}</div></div><span class="size">${e.kind==='folder'?'폴더':fmt(e.size)}</span><time class="date" datetime="${esc(e.updatedAt)}">${new Date(e.updatedAt).toLocaleDateString('ko-KR')}</time>${!trash&&e.kind==='file'?(e.state==='ready'?`<a class="row-action" href="${content(e)}" download>다운로드</a>`:`<button class="row-action" type="button" data-cancel="${e.id}">업로드 취소</button>`):'<span></span>'}</li>`).join('');
  $('empty').hidden=entries.length>0;$('empty').innerHTML=$('search').value?'<strong>검색 결과가 없습니다</strong>검색어를 바꾸거나 지워 주세요.':trash?'<strong>휴지통이 비어 있습니다</strong>삭제한 파일과 폴더가 여기에 표시됩니다.':'<strong>첫 파일을 올려보세요</strong>새 폴더를 만들거나 파일을 끌어놓으세요.';
  controls();
 }
 async function load(){const seq=++loadSeq;const result=await api('entries');if(seq!==loadSeq)return;data=result;render();}
 async function run(fn){if(busy)return;busy=true;controls();error('');try{await fn();}catch(e){error(e.message);}finally{busy=false;controls();}}
 function openDialog(action,entries=[]){
  dialogAction=action;dialogEntries=entries;
  const text={folder:['새 폴더','이름을 정해 자료를 구분하세요.','만들기'],rename:['이름 변경',entries[0]?.name,'변경'],move:['폴더로 이동',`${entries.length}개 항목을 이동합니다.`,'이동'],trash:['휴지통으로 보낼까요?',`${entries.length}개 항목과 그 안의 파일을 휴지통으로 보냅니다. 나중에 복원할 수 있습니다.`,'휴지통으로'],purge:['영구 삭제할까요?',`${entries.length}개 항목과 그 안의 파일을 저장소에서 삭제합니다. 복원할 수 없습니다.`,'영구 삭제'],restore:['선택 항목 복원',`${entries.length}개 항목을 원래 폴더로 복원합니다. 원래 폴더가 없으면 내 파일로 복원합니다.`,'복원'],cancel:['미완료 업로드를 지울까요?','이미 전송된 조각도 함께 삭제됩니다.','업로드 취소']}[action];
  $('edit-title').textContent=text[0];$('edit-description').textContent=text[1];$('dialog-submit').textContent=text[2];$('dialog-submit').className=['purge','trash','cancel'].includes(action)?'danger':'primary';
  $('name-field').hidden=!['folder','rename'].includes(action);$('entry-name').value=action==='rename'?entries[0].name:'';
  $('entry-name').required=!$('name-field').hidden;$('destination-field').hidden=action!=='move';$('dialog-error').hidden=true;
  if(action==='move'){
   const excluded=new Set(entries.map(e=>e.id));let added=true;while(added){added=false;for(const e of data.entries)if(excluded.has(e.parent)&&!excluded.has(e.id)){excluded.add(e.id);added=true;}}
   const fullName=e=>{let names=[e.name],p=e.parent;for(let n=0;p&&n<100;n++){const row=data.entries.find(r=>r.id===p);if(!row)break;names.unshift(row.name);p=row.parent;}return names.join(' / ');};
   $('destination').innerHTML='<option value="">내 파일</option>'+data.entries.filter(e=>e.kind==='folder'&&!e.trashRoot&&e.state==='ready'&&!excluded.has(e.id)).map(e=>`<option value="${e.id}">${esc(fullName(e))}</option>`).join('');
  }
  $('edit-dialog').showModal();($('name-field').hidden?$('dialog-cancel'):$('entry-name')).focus();
 }
 $('edit-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;controls();$('dialog-submit').disabled=true;$('dialog-cancel').disabled=true;$('dialog-error').hidden=true;
  let done=0;
  try{
   if(dialogAction==='folder')await api('folders','POST',{id:crypto.randomUUID(),name:$('entry-name').value,parent:folder});
   else for(const e of dialogEntries){
    if(dialogAction==='rename'||dialogAction==='move')await api(`entries/${e.id}`,'PATCH',{revision:e.revision,...(dialogAction==='rename'?{name:$('entry-name').value}:{parent:$('destination').value||null})});
    else await api(`entries/${e.id}/${dialogAction}`,'POST');done++;
   }
   $('edit-dialog').close();selected.clear();await load();notice('저장했습니다.');
  }catch(e){$('dialog-error').textContent=(done?`${done}개 처리됨. `:'')+e.message;$('dialog-error').hidden=false;dialogEntries=dialogEntries.slice(done);await load().catch(()=>{});}
  finally{busy=false;controls();$('dialog-submit').disabled=false;$('dialog-cancel').disabled=false;}
 });
 $('edit-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('dialog-cancel').onclick=()=>$('edit-dialog').close();
 for(const action of ['rename','move','delete','restore','purge'])$(action).onclick=()=>openDialog(action==='delete'?'trash':action,data.entries.filter(e=>selected.has(e.id)));
 $('new-folder').onclick=()=>openDialog('folder');$('upload').onclick=()=>$('file-input').click();
 for(const [id,value]of [['all',false],['trash',true]])$(id).onclick=()=>{trash=value;folder=null;selected.clear();$('search').value='';render();};
 $('search').oninput=()=>{selected.clear();render();};$('refresh').onclick=()=>run(load);
 $('select-all').onchange=()=>{selected=$('select-all').checked?new Set(visible().map(e=>e.id)):new Set();render();};
 $('breadcrumbs').onclick=event=>{const button=event.target.closest('[data-folder]');if(button&&!busy){folder=button.dataset.folder||null;selected.clear();$('search').value='';render();}};
 $('file-list').onchange=event=>{const id=event.target.dataset.select;if(!id)return;if(event.target.checked)selected.add(id);else selected.delete(id);event.target.closest('li').classList.toggle('selected',event.target.checked);controls();};
 $('file-list').onclick=event=>{
  const button=event.target.closest('[data-open],[data-cancel]');if(!button||busy)return;
  const e=data.entries.find(e=>e.id===(button.dataset.open||button.dataset.cancel));
  if(button.dataset.cancel){openDialog('cancel',[e]);return;}
  if(trash||e.state!=='ready')return;
  if(e.kind==='folder'){folder=e.id;selected.clear();$('search').value='';render();return;}
  $('preview-title').textContent=e.name;$('preview-download').href=content(e);$('preview-media').replaceChildren();
  let media;if(/^image\/(png|jpeg|webp|gif|avif)$/.test(e.mime)){media=document.createElement('img');media.alt=e.name;}
  else if(/^video\/(mp4|webm)$/.test(e.mime)){media=document.createElement('video');media.controls=true;}
  else if(/^audio\/(mpeg|mp4|wav|ogg)$/.test(e.mime)){media=document.createElement('audio');media.controls=true;}
  if(media){media.src=content(e,true);media.onerror=()=>{$('preview-media').textContent='미리보기를 불러오지 못했습니다. 다운로드해서 확인해 주세요.';};$('preview-media').append(media);}else $('preview-media').textContent='이 파일은 다운로드해서 확인할 수 있습니다.';
  $('preview-dialog').showModal();
 };
 $('preview-close').onclick=()=>$('preview-dialog').close();$('preview-dialog').onclose=()=>$('preview-media').replaceChildren();
 async function uploadFiles(files){
  if(busy||trash||!files.length)return;
  const invalid=files.find(f=>f.size===0||f.size>data.maxFileBytes);if(invalid){error(`${invalid.name}: 파일은 0바이트보다 크고 20GB 이하여야 합니다.`);return;}
  busy=true;uploading=true;canceled=false;dirty(true);controls();error('');$('transfer').hidden=false;
  let current=null,done=0;
  try{
   for(const file of files){
    if(canceled)break;
    current=crypto.randomUUID();$('transfer-name').textContent=file.name;$('progress').value=0;
    const upload=await api('uploads','POST',{id:current,name:file.name,size:file.size,mime:file.type,parent:folder});
    for(let start=0;start<file.size;start+=upload.chunkSize){
     if(canceled)break;
     const chunk=file.slice(start,start+upload.chunkSize);let sent=false;
     for(let attempt=0;attempt<3&&!sent;attempt++){
      controller=new AbortController();
      try{await api(`entries/${current}/parts/${Math.floor(start/upload.chunkSize)+1}`,'PUT',chunk,controller.signal);sent=true;}
      catch(e){if(canceled||attempt===2||e.status&&![429,502,503,504].includes(e.status))throw e;}
     }
     const bytes=Math.min(file.size,start+upload.chunkSize),percent=Math.round(bytes/file.size*100);$('progress').value=percent;
     $('transfer-status').textContent=`${done+1}/${files.length}개 · ${fmt(bytes)} / ${fmt(file.size)} · ${percent}%`;
    }
    if(canceled)break;
    $('transfer-status').textContent='저장 확인 중…';await api(`entries/${current}/complete`,'POST');current=null;done++;
   }
   notice(canceled?`${done}개 저장 · 나머지 업로드를 취소했습니다.`:`${done}개 파일을 저장했습니다.`);
  }catch(e){error(canceled?'업로드를 취소했습니다.':`${done}개 저장됨. ${e.message} 미완료 항목을 취소한 뒤 다시 올릴 수 있습니다.`);}
  finally{
   if(canceled&&current)await api(`entries/${current}/cancel`,'POST').catch(e=>error('전송은 중지했지만 취소 처리에 실패했습니다. 목록에서 업로드 취소를 다시 눌러 주세요. '+e.message));
   controller=null;uploading=false;busy=false;dirty(false);$('transfer').hidden=true;$('file-input').value='';await load().catch(e=>error(e.message));controls();
  }
 }
 $('file-input').onchange=()=>uploadFiles([...$('file-input').files]);$('cancel-upload').onclick=()=>{canceled=true;controller?.abort();$('transfer-status').textContent='업로드 취소 중…';};
 const drop=$('drop-zone');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();if(!busy)drop.classList.add('drag');});
 for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag');});drop.addEventListener('drop',e=>uploadFiles([...e.dataTransfer.files]));
 window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
 window.addEventListener('beforeunload',e=>{if(uploading){e.preventDefault();e.returnValue='';}});
 $('login').onsubmit=async event=>{event.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';$('login').hidden=true;$('drive').hidden=false;error('');await load();}catch(e){error(e.message);}};
 (async()=>{try{if(!await CreoPlatform.verifyAdmin()){$('login').hidden=false;return;}$('drive').hidden=false;await run(load);}catch(e){error(e.message);}})();
})();

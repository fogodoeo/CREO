(()=>{
 'use strict';
 const channelId=new URLSearchParams(location.search).get('channel')||'';
 const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml,form=$('upload'),name=$('banner-name'),fileInput=$('banner-file');
 let banners=[],selected=new Set(),busy=false,loaded=false,uploaded=null,previewUrl='',retryAction=null,discardAction=null,discardTrigger=null;
 const file=()=>fileInput.files?.[0];
 const dirty=()=>Boolean(name.value.trim()||file()||uploaded);
 const post=data=>{if(window.parent!==window)window.parent.postMessage({...data,channelId},location.origin);};
 const report=()=>post({type:'creo-banner-draft',dirty:dirty(),saving:busy});
 function setBusy(value){
  busy=value;$('upload-fields').disabled=value||!loaded;
  for(const id of ['save','reset-upload','close','retry'])$(id).disabled=value;
  $('save').textContent=value?'등록 중…':'배너 등록';report();
 }
 function status(text){$('status').textContent=text;}
 function clearError(){
  $('error-box').hidden=true;$('error').textContent='';retryAction=null;
  for(const el of [name,fileInput]){el.removeAttribute('aria-invalid');el.removeAttribute('aria-errormessage');}
 }
 function showLogin(){ $('login').hidden=false;$('main').hidden=true;$('password').focus(); }
 function failure(error,retry){
  $('error').textContent=(error.message||'처리하지 못했습니다. 다시 시도해 주세요.')+(dirty()?' 입력한 내용은 유지됩니다.':'');
  $('error-box').hidden=false;retryAction=retry;$('retry').hidden=!retry;
  if(error.status===401){$('login-error').textContent='로그인이 만료됐습니다. 다시 로그인한 뒤 등록을 계속해 주세요.';$('login-error').hidden=false;showLogin();}
  else $('error').focus();
 }
 function render(focusId){
  $('library').hidden=!loaded||!banners.length;$('upload-panel').hidden=!loaded;
  if(loaded&&!banners.length)$('upload-panel').open=true;
  if(!loaded)return;
  const query=$('search').value.trim().toLowerCase(),onlySelected=$('filter').value==='selected';
  const rows=banners.filter(row=>(!onlySelected||selected.has(row.id))&&row.name.toLowerCase().includes(query));
  $('count').textContent=rows.length+'개 배너 · 이 회차에 '+banners.filter(row=>selected.has(row.id)).length+'개 표시 중';
  $('grid').innerHTML=rows.length?rows.map(row=>{
   const on=selected.has(row.id),media=/\.(mp4|mov|webm)([?#]|$)/i.test(row.imageUrl)
    ?'<video src="'+esc(row.imageUrl)+'" controls playsinline preload="metadata" aria-label="'+esc(row.name)+' 미리보기"></video>'
    :'<img src="'+esc(row.imageUrl)+'" alt="" loading="lazy">';
   return '<article class="card '+(on?'selected':'')+'"><div class="media">'+media+'</div><label><input type="checkbox" data-banner="'+esc(row.id)+'" '+(on?'checked ':'')+(busy?'disabled':'')+'><span><strong>'+esc(row.name)+'</strong><small>'+(on?'이 회차에 표시 중':'표시 안 함')+'</small></span></label></article>';
  }).join(''):'<div class="empty"><p>'+(banners.length?'조건에 맞는 배너가 없습니다.':'등록된 배너가 없습니다.')+'</p><button type="button" data-empty-action="'+(banners.length?'reset':'add')+'">'+(banners.length?'검색 초기화':'새 배너 추가')+'</button></div>';
  if(focusId)[...$('grid').querySelectorAll('[data-banner]')].find(el=>el.dataset.banner===focusId)?.focus();
 }
 async function load(){
  if(busy)return;clearError();setBusy(true);
  try{
   if(!channelId)throw Error('방송 도구에서 회차를 선택한 뒤 배너 선택을 열어 주세요.');
   const library=await CreoPlatform.api('banner-library/import',{method:'POST',body:'{}'});
   const data=await CreoPlatform.api('channels/'+encodeURIComponent(channelId)+'/broadcast?page=1');
   if(data.channel?.id!==channelId)throw Error('방송 정보가 일치하지 않습니다. 다시 시도해 주세요.');
   banners=library.banners;selected=new Set(data.state.selectedBannerIds||[]);loaded=true;
   $('channel-label').textContent=data.channel.name;$('main').hidden=false;$('login').hidden=true;
  }catch(error){$('main').hidden=false;failure(error,load);}
  finally{setBusy(false);render();}
 }
 async function selectBanner(id,checked){
  if(busy||!loaded)return;clearError();setBusy(true);render();status('송출에 반영하는 중…');let success=false;
  try{
   const result=await CreoPlatform.api('channels/'+encodeURIComponent(channelId)+'/banner-selection',{method:'PUT',body:JSON.stringify({id,selected:checked})});
   selected=new Set(result.state.selectedBannerIds||[]);success=true;
   status(checked?'이 회차에 표시했습니다.':'이 회차에서 숨겼습니다.');post({type:'creo-broadcast-settings-saved'});
  }catch(error){status('송출 반영을 확인하지 못했습니다.');failure(error,()=>selectBanner(id,checked));}
  finally{setBusy(false);render(success?id:'');}
 }
 function fileType(value){return value.type||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',mov:'video/quicktime'}[value.name.split('.').pop().toLowerCase()]||'');}
 function preview(){
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';$('preview').replaceChildren();$('preview').hidden=!file();
  if(!file())return;
  previewUrl=URL.createObjectURL(file());const video=fileType(file()).startsWith('video/'),media=document.createElement(video?'video':'img');media.src=previewUrl;
  if(video){media.controls=true;media.preload='metadata';media.playsInline=true;media.setAttribute('aria-label','선택한 영상 미리보기');}
  else media.alt='선택한 배너 미리보기';$('preview').append(media);
 }
 function reset(){
  form.reset();uploaded=null;preview();clearError();$('upload-status').textContent='등록 후 표시할 배너를 체크해 주세요.';report();
 }
 function invalid(el,message){
  failure(Error(message),null);el.setAttribute('aria-invalid','true');el.setAttribute('aria-errormessage','error');el.focus();
 }
 async function upload(){
  if(busy||!loaded)return;clearError();const chosen=file(),title=name.value.trim();
  if(!chosen){invalid(fileInput,'등록할 이미지나 영상을 선택해 주세요.');return;}
  if(!title){invalid(name,'배너 이름을 입력해 주세요.');return;}
  if(!chosen.size||chosen.size>8*1024*1024){invalid(fileInput,'내용이 있는 8MB 이하 파일을 선택해 주세요.');return;}
  const mimeType=fileType(chosen);
  if(!['image/png','image/jpeg','image/gif','image/webp','video/mp4','video/quicktime'].includes(mimeType)){invalid(fileInput,'PNG, JPG, GIF, WEBP, MP4, MOV 파일을 선택해 주세요.');return;}
  setBusy(true);render();let focusId='';
  try{
   if(uploaded?.file!==chosen){
    $('upload-status').textContent='파일을 올리는 중…';
    const bytes=new Uint8Array(await chosen.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    const response=await fetch('/api/broadcast-assets/shared-banners',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({mimeType,dataBase64:btoa(binary)})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(Error(result.error||'파일을 올리지 못했습니다. 다시 시도해 주세요.'),{status:response.status});
    if(!result.url)throw Error('파일 주소를 받지 못했습니다. 다시 시도해 주세요.');
    uploaded={file:chosen,url:result.url};
   }
   $('upload-status').textContent='배너를 보관함에 등록하는 중…';
   // The server derives the record ID from this URL, so a metadata retry is idempotent.
   const result=await CreoPlatform.api('banner-library',{method:'POST',body:JSON.stringify({record:{name:title,imageUrl:uploaded.url,sortOrder:banners.length}})});
   if(!result.record?.id)throw Error('등록 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
   banners=banners.filter(row=>row.id!==result.record.id).concat(result.record);focusId=result.record.id;
   reset();$('search').value='';$('filter').value='all';$('upload-panel').open=false;status('배너를 등록했습니다. 체크하면 이 회차에 표시됩니다.');
  }catch(error){$('upload-status').textContent='등록하지 못했습니다. 다시 시도해 주세요.';failure(error,upload);}
  finally{setBusy(false);render(focusId);}
 }
 function add(){if(!loaded)return;$('upload-panel').open=true;fileInput.focus();}
 function discardThen(action){
  if(busy){status('처리가 끝난 뒤 닫아 주세요.');return;}
  if(!dirty()){action();return;}
  discardAction=action;discardTrigger=document.activeElement;$('discard-dialog').showModal();$('keep-editing').focus();
 }
 function close(){discardThen(()=>{reset();if(window.parent!==window)post({type:'creo-close-banner-library'});else location.href='broadcast-studio.html?'+new URLSearchParams({channel:channelId,view:'layout-1'});});}
 $('search').addEventListener('input',()=>render());$('filter').addEventListener('change',()=>render());
 $('grid').addEventListener('change',event=>{const id=event.target.dataset.banner;if(id)void selectBanner(id,event.target.checked);});
 $('grid').addEventListener('click',event=>{const action=event.target.closest('[data-empty-action]')?.dataset.emptyAction;if(action==='add')add();if(action==='reset'){$('search').value='';$('filter').value='all';render();$('search').focus();}});
 form.onsubmit=event=>{event.preventDefault();return upload();};form.addEventListener('input',report);
 fileInput.addEventListener('change',()=>{uploaded=null;clearError();if(file()&&!name.value.trim())name.value=file().name.replace(/\.[^.]+$/,'').slice(0,80);preview();report();});
 $('add-banner').onclick=add;$('retry').onclick=()=>retryAction?.();$('close').onclick=close;
 $('reset-upload').onclick=()=>discardThen(()=>{reset();fileInput.focus();});
 $('keep-editing').onclick=()=>{$('discard-dialog').close();discardAction=null;discardTrigger?.focus();};
 $('discard-dialog').addEventListener('cancel',()=>{discardAction=null;discardTrigger?.focus();});
 $('discard-upload').onclick=()=>{const action=discardAction;discardAction=null;$('discard-dialog').close();action?.();};
 window.addEventListener('beforeunload',event=>{if((dirty()||busy)&&window.frameElement?.dataset.layoutDraftHost!=='1'){event.preventDefault();event.returnValue='';}});
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent)return;if(event.data?.type==='creo-close-banner-request')close();if(event.data?.type==='creo-refresh-banner-library'&&!dirty())void load();});
 $('login').onsubmit=async event=>{
  event.preventDefault();const button=$('login').querySelector('button');button.disabled=true;$('login-error').hidden=true;
  try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await load();}
  catch(error){$('login-error').textContent=error.message;$('login-error').hidden=false;}
  finally{button.disabled=false;}
 };
 (async()=>{try{if(await CreoPlatform.verifyAdmin())await load();else showLogin();}catch(error){showLogin();$('login-error').textContent='로그인을 확인하지 못했습니다. 다시 로그인해 주세요.';$('login-error').hidden=false;}})();
})();

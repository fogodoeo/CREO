'use strict';
let assetFile=null,assetPreviewUrl='',assetBaseline='',assetDraftChannel='',assetReturnFocus=null,assetDiscardAction=null;
const assetDialog=$('asset-manager');
function assetKindLabel(kind){return{banner:'회전 배너',sponsor:'협찬 로고',vendor:'업체 로고',dice:'주사위 영상'}[kind]||kind;}
function assetPageLabel(asset){if(asset.kind==='vendor')return asset.targetName||'업체 미지정';if(asset.kind==='dice')return `${asset.targetName||'?'}번 눈금`;return asset.page==='1'?'1P 진행 화면':asset.page==='2'?'2P 경매 화면':'1P·2P 공통';}
function assetMedia(url,name='',video=false){return video||/\.(?:mp4|mov|webm)(?:[?#]|$)/i.test(String(url||''))?`<video src="${esc(url)}" muted playsinline controls preload="metadata" aria-label="${esc(name)}"></video>`:`<img src="${esc(url)}" alt="${esc(name)}">`;}
function assetRecord(){return Object.fromEntries(['kind','page','name','targetName','imageUrl','linkUrl','sortOrder'].map(key=>[key,assetForm.elements[key].value.trim()]).concat([['active',assetForm.elements.active.checked]]));}
function assetMessage(message='',error=false){const el=$('asset-status');el.textContent=message;el.hidden=!message;el.classList.toggle('error',error);if(error)el.focus();}
function assetDraftChanged(){assetDirty=!assetForm.hidden&&(Boolean(assetFile)||JSON.stringify(assetRecord())!==assetBaseline);settingsStatus(settingsDraft?.status()||{dirty:false,saving:false,error:''});}
function assetLock(busy){assetSaving=busy;assetDialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=busy);assetDialog.setAttribute('aria-busy',String(busy));$('save-asset').textContent=busy?'저장 중…':'저장';settingsStatus(settingsDraft?.status()||{dirty:false,saving:false,error:''});}
function renderAssets(){
 const rows=visibleAssets().filter(asset=>asset.kind!=='banner'&&(assetFilter==='all'||asset.kind===assetFilter)).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name,'ko'));
 $('asset-count').textContent=rows.filter(asset=>asset.active!==false).length;
 $('asset-grid').innerHTML=rows.length?rows.map(asset=>`<article class="asset-card ${asset.active===false?'off':''}"><div class="asset-thumb">${assetMedia(asset.imageUrl,asset.name,asset.kind==='dice')}</div><div class="asset-info"><strong>${esc(asset.name)}</strong><span>${esc(assetKindLabel(asset.kind))} · ${esc(assetPageLabel(asset))}</span><em>${asset.demo?'예시':asset.active===false?'사용 안 함':'방송에 사용'}</em></div><div class="asset-card-actions">${asset.demo?'<button class="icon-btn" type="button" data-seed-example>예시 추가</button>':`<button class="icon-btn" type="button" data-edit-asset="${esc(asset.id)}" aria-label="${esc(asset.name)} 수정">수정</button><button class="icon-btn" type="button" data-delete-asset="${esc(asset.id)}" aria-label="${esc(asset.name)} 삭제">삭제</button>`}</div></article>`).join(''):'<div class="empty-library">등록된 로고·영상이 없습니다.<br>위의 추가 버튼에서 등록해 주세요.</div>';
 document.querySelectorAll('[data-edit-asset]').forEach(button=>button.onclick=()=>editAsset(button.dataset.editAsset));
 document.querySelectorAll('[data-delete-asset]').forEach(button=>button.onclick=()=>deleteAsset(button.dataset.deleteAsset));
 document.querySelectorAll('[data-seed-example]').forEach(button=>button.onclick=seedCrewartAssets);
 if(assetSaving)assetLock(true);
}
function updateAssetForm(){
 const kind=assetForm.elements.kind.value,vendor=kind==='vendor',dice=kind==='dice';
 $('asset-page-field').hidden=vendor||dice;$('target-name-field').hidden=!vendor&&!dice;
 $('target-name-label').textContent=dice?'주사위 눈금 (1~6)':'연결할 업체명';
 const target=assetForm.elements.targetName;target.required=vendor||dice;target.placeholder=dice?'1~6 중 하나':'개체 정보에 등록한 업체명';target.removeAttribute('list');if(vendor)target.setAttribute('list','vendor-names');
 $('asset-file').accept=dice?'video/mp4,video/quicktime,.mp4,.mov':'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
 $('asset-file-hint').textContent=dice?'MP4·MOV, 원본 100MB 이하. 저장할 때 자동 압축하며 최종 파일은 8MB 이하여야 합니다.':'PNG·JPG·WEBP·GIF·SVG, 8MB 이하';
 updateAssetPreview();
}
function updateAssetPreview(){
 if(assetPreviewUrl){URL.revokeObjectURL(assetPreviewUrl);assetPreviewUrl='';}
 const url=assetFile?(assetPreviewUrl=URL.createObjectURL(assetFile)):assetForm.elements.imageUrl.value.trim();
 $('asset-preview').innerHTML=url?assetMedia(url,'선택한 파일 미리보기',assetFile?CreoStudioAssetSave.mime(assetFile).startsWith('video/'):assetForm.elements.kind.value==='dice'):'파일을 선택하면 미리 보입니다.';
 $('asset-file-note').hidden=!assetFile;$('asset-file-note').textContent=assetFile?`${assetFile.name} · ${(assetFile.size/1024/1024).toFixed(1)}MB`:'';
}
function resetAssetForm(){
 assetForm.reset();assetForm.elements.id.value='';assetForm.elements.kind.value=['sponsor','vendor','dice'].includes(assetFilter)?assetFilter:'sponsor';assetForm.elements.page.value='all';assetForm.elements.sortOrder.value='0';assetForm.elements.active.checked=true;
 assetFile=null;assetSaver.reset();assetDraftChannel=channelId;$('asset-options').open=false;$('asset-form-title').textContent='로고·영상 추가';updateAssetForm();assetBaseline=JSON.stringify(assetRecord());assetDirty=false;settingsStatus(settingsDraft?.status()||{dirty:false,saving:false,error:''});
}
function showAssetEditor(){assetForm.hidden=false;$('asset-library').hidden=true;assetMessage();$('asset-form-title').focus();}
function showAssetLibrary(){assetForm.hidden=true;$('asset-library').hidden=false;renderAssets();$('new-asset').focus();}
function leaveAssetDraft(action){
 if(assetSaving){assetMessage('저장이 끝난 뒤 이동해 주세요.');return false;}
 if(!assetDirty){action();return true;}
 assetDiscardAction=action;$('asset-discard').showModal();return false;
}
function editAsset(id){leaveAssetDraft(()=>{
 const asset=(workspace.assets||[]).find(row=>row.id===id);if(!asset)return;resetAssetForm();
 for(const key of ['id','kind','page','name','targetName','imageUrl','linkUrl','sortOrder','active']){const el=assetForm.elements[key];if(el.type==='checkbox')el.checked=asset[key]!==false;else el.value=asset[key]??'';}
 $('asset-form-title').textContent='로고·영상 수정';updateAssetForm();assetBaseline=JSON.stringify(assetRecord());showAssetEditor();assetDraftChanged();
 });}
async function uploadAsset(file,kind,scope){
 assetMessage(kind==='dice'?'영상을 준비하는 중…':'파일을 올리는 중…');
 const prepared=kind==='dice'?await optimizeDiceVideo(file,percent=>assetMessage(`영상 압축 중… ${percent}%`)):file;
 if(prepared.size>8*1024*1024)throw new Error('압축 후에도 8MB를 넘습니다. 영상을 더 짧게 잘라서 다시 선택해 주세요.');
 const response=await fetch(`/api/broadcast-assets/${encodeURIComponent(scope)}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:prepared.name,mimeType:CreoStudioAssetSave.mime(prepared),dataBase64:await fileToBase64(prepared)})});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(result.error||`파일을 올리지 못했습니다. (${response.status})`),{status:response.status});return result;
}
const assetSaver=CreoStudioAssetSave.create({
 context:()=>channelId,upload:uploadAsset,
 write:(scope,record,existing)=>{assetMessage('방송에 사용할 정보를 저장하는 중…');return CreoPlatform.api(`channels/${encodeURIComponent(scope)}/assets${existing?'/'+encodeURIComponent(record.id):''}`,{method:existing?'PUT':'POST',body:JSON.stringify({record})});},
 onChange(busy){assetLock(busy);if(!busy&&!assetDirty&&assetForm.hidden&&assetDialog.open)$('new-asset').focus();},
 onSaved(record,scope){
  if(scope!==channelId)return;workspaceLoadSequence++;workspace.assets=[...(workspace.assets||[]).filter(row=>row.id!==record.id),record];
  resetAssetForm();showAssetLibrary();syncDiceVideoSlots();syncPreview(true);assetMessage('저장했습니다. 선택한 방송일에 반영되었습니다.');
 },
 onError(error,{saved=false}={}){if(error.status===401)window.parent.postMessage({type:'creo-admin-required'},location.origin);assetMessage(saved?'저장은 완료됐지만 목록을 표시하지 못했습니다. 창을 다시 열어 주세요.':`${error.message} 입력한 내용은 유지됩니다. 확인 후 저장을 다시 눌러 주세요.`,true);}
});
function openAssetManager(filter='all'){
 if(assetSaving)return;
 if(filter==='banner'){openSharedBannerLibrary();return;}
 assetFilter=['all','sponsor','vendor','dice'].includes(filter)?filter:'all';
 $('asset-scope').textContent=typeof selectedChannel==='function'?selectedChannel()?.name||'선택한 방송일':'선택한 방송일';
 document.querySelectorAll('.asset-filter').forEach(row=>{const selected=row.dataset.filter===assetFilter;row.classList.toggle('active',selected);row.setAttribute('aria-pressed',String(selected));});
 if(!assetDialog.open){assetReturnFocus=document.activeElement;assetDialog.showModal();}
 if(!assetDirty)showAssetLibrary();
 renderAssets();window.parent.postMessage({type:'creo-asset-manager',channelId,page,open:true},location.origin);
}
function closeAssetManager(){leaveAssetDraft(()=>{resetAssetForm();assetDialog.close();window.parent.postMessage({type:'creo-asset-manager',channelId,page,open:false},location.origin);assetReturnFocus?.focus();});}
function uploadDiceVideo(face,file){
 if(!file||assetSaving)return;
 leaveAssetDraft(()=>{openAssetManager('dice');const existing=(workspace.assets||[]).find(row=>row.kind==='dice'&&String(row.targetName)===String(face));if(existing)editAsset(existing.id);else{resetAssetForm();assetForm.elements.kind.value='dice';assetForm.elements.targetName.value=String(face);assetForm.elements.name.value=`주사위 ${face}번`;showAssetEditor();}
 assetFile=file;updateAssetForm();assetDraftChanged();});
}
async function assetLibraryTask(task){
 if(assetSaving)return;assetLock(true);assetMessage('처리 중…');
 try{await task();workspaceLoadSequence++;renderAssets();syncDiceVideoSlots();syncPreview(true);assetMessage('목록에 반영했습니다.');}
 catch(error){if(error.status===401)window.parent.postMessage({type:'creo-admin-required'},location.origin);assetMessage(`${error.message} 다시 시도해 주세요.`,true);}
 finally{assetLock(false);}
}
async function deleteAsset(id){
 if(assetSaving)return;const asset=workspace.assets.find(row=>row.id===id);if(!asset||!confirm(`‘${asset.name}’을 삭제할까요? 방송에서도 제거됩니다.`))return;
 return assetLibraryTask(async()=>{await CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/assets/${encodeURIComponent(id)}`,{method:'DELETE'});workspace.assets=workspace.assets.filter(row=>row.id!==id);});
}
async function addAssetRecords(candidates){
 for(const record of candidates){if((workspace.assets||[]).some(row=>row.id===record.id))continue;const result=await CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/assets`,{method:'POST',body:JSON.stringify({record})});workspace.assets.push(result.record);}
}
async function seedCrewartAssets(){if(!isCrewart())return;return assetLibraryTask(()=>addAssetRecords(crewartSampleAssets.map(asset=>({...asset,imageUrl:sampleAssetUrl(asset)}))));}
async function importLegacyAssets(){
 return assetLibraryTask(async()=>{
  if(typeof getRuntimeConfigMap!=='function')throw new Error('기존 설정을 읽을 수 없습니다.');const map=await getRuntimeConfigMap(false),candidates=[];
  for(let i=1;i<=10;i++){const banner=String(map?.['banner'+i]||'').trim();if(banner)candidates.push({id:`legacy_banner_${i}`,name:`기존 배너 ${i}`,kind:'banner',page:'all',imageUrl:banner,sortOrder:i,active:true});const sponsor=String(map?.['ticker_sponsor'+i]||'').trim();if(sponsor)candidates.push({id:`legacy_sponsor_${i}`,name:`기존 협찬 ${i}`,kind:'sponsor',page:'all',imageUrl:sponsor,sortOrder:i,active:true});}
  for(let i=1;i<=64;i++){try{const logo=JSON.parse(map?.['team_logo'+i]||'{}');if(logo.name&&logo.url)candidates.push({id:`legacy_vendor_${i}`,name:`${logo.name} 로고`,kind:'vendor',page:'all',targetName:String(logo.name),imageUrl:String(logo.url),sortOrder:i,active:true});}catch(_){}}
  await addAssetRecords(candidates);
 });
}
$('open-assets').onclick=()=>openAssetManager();
$('new-asset').onclick=()=>leaveAssetDraft(()=>{resetAssetForm();showAssetEditor();});
$('close-assets').onclick=closeAssetManager;
assetDialog.addEventListener('cancel',event=>{event.preventDefault();closeAssetManager();});
$('asset-keep').onclick=()=>{$('asset-discard').close();assetDiscardAction=null;};
$('asset-discard-confirm').onclick=()=>{const action=assetDiscardAction;assetDiscardAction=null;$('asset-discard').close();resetAssetForm();action?.();};
$('reset-asset').onclick=()=>leaveAssetDraft(()=>{resetAssetForm();showAssetLibrary();assetMessage();});
document.querySelectorAll('.asset-filter').forEach(button=>button.onclick=()=>{if(assetSaving)return;openAssetManager(button.dataset.filter);});
document.addEventListener('click',event=>{if(assetSaving)return;if(event.target.closest('[data-open-banner-assets]'))openSharedBannerLibrary();if(event.target.closest('[data-open-logo-assets]'))openAssetManager();});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='creo-open-assets')openAssetManager(event.data.filter||'all');});
$('asset-kind').onchange=()=>{updateAssetForm();assetDraftChanged();};
$('asset-image-url').oninput=()=>{updateAssetPreview();assetDraftChanged();};
$('asset-file').onchange=()=>{if(assetSaving)return;assetFile=$('asset-file').files?.[0]||null;if(assetFile&&!assetForm.elements.name.value.trim())assetForm.elements.name.value=assetFile.name.replace(/\.[^.]+$/,'').slice(0,80);updateAssetPreview();assetDraftChanged();};
assetForm.addEventListener('input',assetDraftChanged);assetForm.addEventListener('change',assetDraftChanged);
assetForm.onsubmit=event=>{event.preventDefault();if(assetDraftChannel!==channelId){assetMessage('방송일이 바뀌었습니다. 원래 방송일에서 다시 저장해 주세요.',true);return Promise.resolve(false);}const record=assetRecord(),existingId=assetForm.elements.id.value||(record.kind==='dice'?(workspace.assets||[]).find(row=>row.kind==='dice'&&String(row.targetName)===record.targetName)?.id:'');return assetSaver.save({record,file:assetFile,existingId});};
$('seed-crewart-assets').onclick=seedCrewartAssets;$('seed-crewart-assets-dialog').onclick=seedCrewartAssets;$('import-legacy').onclick=importLegacyAssets;
document.querySelectorAll('[data-dice-upload]').forEach(button=>button.onclick=()=>{if(!assetSaving)document.querySelector(`[data-dice-file="${button.dataset.diceUpload}"]`)?.click();});
document.querySelectorAll('[data-dice-file]').forEach(input=>input.onchange=()=>{uploadDiceVideo(Number(input.dataset.diceFile),input.files?.[0]);input.value='';});

const channelId=new URLSearchParams(location.search).get('channel')||'';
const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml;
let banners=[],selected=new Set(),saving=false;
function status(text){$('status').textContent=text}
function render(){
 $('grid').innerHTML=banners.length?banners.map(row=>`<article class="card ${selected.has(row.id)?'selected':''}"><div class="media">${/\.(mp4|mov|webm)([?#]|$)/i.test(row.imageUrl)?`<video src="${esc(row.imageUrl)}" muted playsinline preload="metadata"></video>`:`<img src="${esc(row.imageUrl)}" alt="${esc(row.name)}" loading="lazy">`}</div><label><input type="checkbox" data-banner="${esc(row.id)}" ${selected.has(row.id)?'checked':''} ${saving?'disabled':''}><span><strong>${esc(row.name)}</strong><small>${selected.has(row.id)?'이 방송에 표시 중':'보관 중'}</small></span></label></article>`).join(''):'<div class="empty">첫 배너를 공용 보관함에 저장하세요.</div>';
}
async function readState(){const data=await CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/broadcast?page=1`);selected=new Set(data.state.selectedBannerIds||[]);$('channel-label').textContent=`${data.channel.name} · 체크한 배너만 1P·2P에 표시됩니다.`;render()}
async function load(){if(!channelId)throw Error('방송 채널을 선택해 주세요.');const library=await CreoPlatform.api('banner-library/import',{method:'POST',body:'{}'});banners=library.banners;await readState();$('main').hidden=false;$('login').hidden=true}
$('grid').addEventListener('change',async event=>{
 const id=event.target.dataset.banner;if(!id||saving)return;
 const checked=event.target.checked;saving=true;render();status('송출에 반영 중…');
 try{const result=await CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/banner-selection`,{method:'PUT',body:JSON.stringify({id,selected:checked})});selected=new Set(result.state.selectedBannerIds||[]);status(checked?'방송에 표시했습니다.':'방송에서 숨겼습니다.');window.parent.postMessage({type:'creo-broadcast-settings-saved'},location.origin)}catch(error){status(error.message);await readState().catch(()=>{})}finally{saving=false;render()}
});
$('upload').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,file=form.elements.file.files[0];if(!file)return;
 if(file.size>8*1024*1024){status('8MB 이하의 파일을 선택해 주세요.');return}
 $('save').disabled=true;status('업로드 중…');
 try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 const response=await fetch('/api/broadcast-assets/shared-banners',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({mimeType:file.type||(/\.mov$/i.test(file.name)?'video/quicktime':'video/mp4'),dataBase64:btoa(binary)})});const uploaded=await response.json();if(!response.ok)throw Error(uploaded.error||'업로드 실패');
 await CreoPlatform.api('banner-library',{method:'POST',body:JSON.stringify({record:{name:form.elements.name.value,imageUrl:uploaded.url,sortOrder:banners.length}})});
 banners=(await CreoPlatform.api('banner-library')).banners;form.reset();render();status('저장했습니다. 표시하려면 배너를 체크하세요.');
 }catch(error){status(error.message)}finally{$('save').disabled=false}
};
$('close').onclick=()=>{if(window.parent!==window)window.parent.postMessage({type:'creo-close-banner-library'},location.origin);else location.href=`auction-control.html?channel=${encodeURIComponent(channelId)}&page=1`};
$('login').onsubmit=async event=>{event.preventDefault();try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');await load()}catch(error){$('main').hidden=false;status(error.message)}};
(async()=>{try{if(await CreoPlatform.verifyAdmin())await load();else $('login').hidden=false}catch(error){$('main').hidden=false;status(error.message)}})();

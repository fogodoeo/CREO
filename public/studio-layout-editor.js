(() => {
 'use strict';
 const params=new URLSearchParams(location.search),channelId=String(params.get('channel')||'').replace(/[^a-z0-9-]/g,''),page=Math.max(1,Math.min(3,Number(params.get('page'))||1));
 const $=id=>document.getElementById(id),frame=$('frame'),settingsFrame=$('settings-frame'),model=CreoLayoutDraft.create();
 const labels={'p1-host-1':'네임택 1','p1-host-2':'네임택 2','p1-host-3':'네임택 3','p1-banner':'배너','p1-ticker':'자막','p2-progress':'경매 진행률','p2-info':'개체 정보','p2-bidders':'실시간 입찰자','p2-photo':'개체 사진','p2-price':'가격','p2-sold':'낙찰 알림','p2-banner':'배너','p2-ticker':'자막','p3-board':'집계판','p3-effect':'낙찰·결과 연출'};
 const fields=['x','y','width','height','font','opacity','visible'];
 let selected='',drag=null,saving=false,ready=false,toastTimer,loadTimer,pendingTheme=null;
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
 const doc=()=>frame.contentDocument;
 const target=(slot=selected)=>doc()?.querySelector(`[data-layout-slot="${slot}"]`);
 function status(){const dirty=model.dirty();$('save-status').textContent=saving?'저장 중…':dirty?'저장 전 변경사항':ready?'저장됨':'불러오는 중…';$('save-status').dataset.dirty=String(dirty);$('save').disabled=!ready||saving||!dirty;}
 function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400);}
 function currentBox(element){const rect=element.getBoundingClientRect(),view=doc().documentElement;return {x:rect.left/view.clientWidth*100,y:rect.top/view.clientHeight*100,width:rect.width/view.clientWidth*100,height:rect.height/view.clientHeight*100,fontScale:Number(element.style.getPropertyValue('--layout-font-scale'))||1,opacity:100,visible:true};}
 function box(slot=selected){return model.values()[slot]||(target(slot)?currentBox(target(slot)):null);}
 function paint(slot,value){
  const element=target(slot);if(!element)return;
  if(value===null){delete element.dataset.layoutCustom;delete element.dataset.layoutHidden;for(const name of ['x','y','width','height','font-scale','opacity','content-width','content-height'])element.style.removeProperty('--layout-'+name);return;}
  element.dataset.layoutCustom='1';element.dataset.layoutHidden=value.visible?'0':'1';
  for(const name of ['x','y','width','height'])element.style.setProperty('--layout-'+name,value[name]+'%');
  element.style.setProperty('--layout-font-scale',value.fontScale);element.style.setProperty('--layout-opacity',value.opacity/100);
  // Match the renderer's existing content sizing contract exactly.
  if(slot==='p2-info'||slot==='p2-progress')element.style.setProperty('--layout-content-width',Math.min(slot==='p2-info'?92:100-value.x,value.width*1.2)+'%');
  if(slot==='p2-progress')element.style.setProperty('--layout-content-height',Math.min(100-value.y,value.height*1.2)+'%');
  if(slot==='p1-ticker'||slot==='p2-ticker')frame.contentWindow?.CreoApplyTickerFontScale?.(element,value.fontScale);
 }
 function change(slot,value){
  const next={x:clamp(value.x,0,96),y:clamp(value.y,0,96),width:clamp(value.width,4,100),height:clamp(value.height,4,100),fontScale:clamp(value.fontScale,.5,2.5),opacity:clamp(value.opacity??100,0,100),visible:value.visible!==false};
  model.change(slot,next);paint(slot,next);
  const peer=slot==='p1-ticker'?'p2-ticker':slot==='p2-ticker'?'p1-ticker':'';
  if(peer&&model.values()[peer])model.change(peer,{...model.values()[peer],fontScale:next.fontScale});
  syncFields();status();
 }
 function syncFields(){
  const value=box();for(const id of fields)$(id).disabled=!value;
  for(const name of ['x','y','width','height'])$(name).value=value?value[name].toFixed(1):'';
  $('font').disabled=!value||selected.endsWith('-brand');$('font').value=value?.fontScale||1;$('font-value').textContent=Math.round((value?.fontScale||1)*100)+'%';
  $('font-label').textContent=selected.endsWith('-ticker')?'글자 크기 · P1/P2 공용':'글자 크기';
  $('opacity').value=value?.opacity??100;$('opacity-value').textContent=Math.round(value?.opacity??100)+'%';$('visible').checked=value?.visible!==false;
  $('reset').disabled=!value||!model.values()[selected];
  requestAnimationFrame(()=>{$('fit-note').hidden=![...(target()?.querySelectorAll('.host-role,.host-name,.item-inline-pill,h1,h2,.live-bid-name,.ticker-text')||[])].some(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2)});
 }
 function select(slot){selected=target(slot)?slot:'';$('slot').value=selected;doc()?.querySelectorAll('[data-layout-slot]').forEach(el=>el.classList.toggle('layout-selected',el.dataset.layoutSlot===selected));syncFields();}
 function install(){
  const document=doc();if(!document)return;
  if(pendingTheme)frame.contentWindow?.CreoApplyBroadcastTheme?.(pendingTheme);
  const elements=[...document.querySelectorAll('[data-layout-slot]')];
  $('slot').replaceChildren(new Option(elements.length?'요소 선택':'표시할 요소 없음',''),...elements.map(el=>new Option(labels[el.dataset.layoutSlot]||el.dataset.layoutSlot,el.dataset.layoutSlot)));
  let style=document.getElementById('creo-layout-editor-style');
  if(!style){style=document.createElement('style');style.id='creo-layout-editor-style';style.textContent='body[data-layout-editor="1"] [data-layout-slot]{outline:1px dashed #91b4ff99;outline-offset:4px}body[data-layout-editor="1"] [data-layout-slot].layout-selected{outline:3px solid #91b4ff;box-shadow:0 0 0 5px #3370f529}body[data-layout-editor="1"] [data-layout-slot]:focus-visible{outline:4px solid #fff}.creo-layout-handle{position:absolute!important;right:-10px!important;bottom:-10px!important;width:20px!important;height:20px!important;border:3px solid #10151d!important;border-radius:5px!important;background:#91b4ff!important;cursor:nwse-resize!important;z-index:9999!important;zoom:1!important;touch-action:none}.layout-selected>.creo-layout-handle{display:block!important}[data-layout-slot]:not(.layout-selected)>.creo-layout-handle{display:none!important}';document.head.appendChild(style);}
  for(const [slot,value] of Object.entries(model.pending()))paint(slot,value);
  for(const element of elements){
   const slot=element.dataset.layoutSlot;element.tabIndex=0;element.setAttribute('role','button');element.setAttribute('aria-label',(labels[slot]||slot)+' 위치 조절');element.style.touchAction='none';
   let handle=element.querySelector(':scope > .creo-layout-handle');if(!handle){handle=document.createElement('span');handle.className='creo-layout-handle';handle.setAttribute('aria-hidden','true');element.appendChild(handle);}
   element.onfocus=()=>select(slot);
   element.onkeydown=event=>{const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(event.key==='Enter'||event.key===' '){event.preventDefault();select(slot);return;}if(!steps[event.key])return;event.preventDefault();select(slot);const [dx,dy]=steps[event.key],value=box(),step=event.shiftKey?1:.1;change(slot,{...value,x:value.x+dx*step,y:value.y+dy*step});};
   const start=(event,type)=>{if(drag||event.button!==0)return;event.preventDefault();event.stopPropagation();select(slot);drag={slot,type,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,box:box()};event.currentTarget.setPointerCapture(event.pointerId);};
   element.onpointerdown=event=>{if(event.target!==handle)start(event,'move')};handle.onpointerdown=event=>start(event,'resize');
  }
  document.onpointermove=event=>{if(!drag||event.pointerId!==drag.pointer)return;const view=document.documentElement,dx=(event.clientX-drag.startX)/view.clientWidth*100,dy=(event.clientY-drag.startY)/view.clientHeight*100;change(drag.slot,drag.type==='move'?{...drag.box,x:drag.box.x+dx,y:drag.box.y+dy}:{...drag.box,width:drag.box.width+dx,height:drag.box.height+dy});};
  document.onpointerup=document.onpointercancel=()=>{drag=null};
  select(target(selected)?selected:elements[0]?.dataset.layoutSlot||'');ready=true;clearTimeout(loadTimer);$('preview-error').hidden=true;status();
 }
 function resize(){const surface=$('canvas-surface'),width=surface.clientWidth,height=surface.clientHeight,mobile=matchMedia('(max-width:660px)').matches;const scale=Math.max(.05,Math.min(width/1920,mobile?width/1920:height/1080));$('preview').style.width=1920*scale+'px';$('preview').style.height=1080*scale+'px';frame.style.transform=`scale(${scale})`;$('preview-scale').textContent=Math.round(scale*100)+'%';}
 async function save(showToast=true){
  if(saving)return false;if(!model.dirty())return true;
  const snapshot=model.snapshot();saving=true;$('save-error').hidden=true;status();
  try{const result=await CreoPlatform.api(`channels/${encodeURIComponent(channelId)}/broadcast-state`,{method:'PUT',body:JSON.stringify({layoutPlacements:snapshot.values})});model.saved(result.state?.layoutPlacements,snapshot);if(showToast)toast('송출 배치를 저장했어요');return true;}
  catch(error){if(error.status===401)window.parent.postMessage({type:'creo-admin-required'},location.origin);$('save-error').textContent=(error.message||'저장하지 못했어요.')+' 변경사항은 유지돼요. 배치 저장을 다시 눌러 주세요.';$('save-error').hidden=false;return false;}
  finally{saving=false;status();}
 }
 function loadPreview(){clearTimeout(loadTimer);ready=false;status();$('preview-error').hidden=true;frame.src=`auction-live.html?channel=${encodeURIComponent(channelId)}&page=${page}&editor=1&refresh=${Date.now()}`;loadTimer=setTimeout(()=>{if(!ready)$('preview-error').hidden=false},15000);}
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin)return;
  if(event.source===window.parent&&event.data?.type==='creo-broadcast-theme'&&event.data.channelId===channelId){pendingTheme=event.data.theme;frame.contentWindow?.CreoApplyBroadcastTheme?.(pendingTheme);settingsFrame.contentWindow?.postMessage(event.data,location.origin);return;}
  if(event.source===frame.contentWindow&&event.data?.type==='creo-layout-ready'&&Number(event.data.page)===page){model.receive(event.data.placements);requestAnimationFrame(install);return;}
  if(event.source===settingsFrame.contentWindow&&event.data?.type==='creo-asset-manager'){settingsFrame.classList.toggle('assets-open',event.data.open===true);return;}
  if(event.source===settingsFrame.contentWindow&&event.data?.type==='creo-broadcast-settings-saved'){if(model.dirty()&&!await save(false))return;loadPreview();toast('문구·표시 설정을 반영했어요');}
 });
 $('slot').onchange=()=>select($('slot').value);
 for(const name of ['x','y','width','height','opacity'])$(name).oninput=()=>{if(box()&&$(name).value!=='')change(selected,{...box(),[name]:$(name).value})};
 $('font').oninput=()=>box()&&change(selected,{...box(),fontScale:$('font').value});$('visible').onchange=()=>box()&&change(selected,{...box(),visible:$('visible').checked});
 $('reset').onclick=()=>{if(!selected)return;model.change(selected,null);paint(selected,null);syncFields();status();toast('배치 저장을 누르면 기본 위치로 반영돼요');};
 const settings=()=>$('settings-dock').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
 $('content').onclick=settings;$('banners').onclick=()=>{settingsFrame.classList.add('assets-open');settings();settingsFrame.contentWindow?.postMessage({type:'creo-open-assets',filter:'banner'},location.origin)};
 $('save').onclick=()=>save();$('retry-preview').onclick=loadPreview;
 $('page-chip').textContent=$('settings-page').textContent='P'+page;$('editor-title').textContent=({1:'진행 화면',2:'경매 화면',3:'집계 화면'})[page]+' 배치';if(page===3)$('banners').hidden=true;
 new ResizeObserver(resize).observe($('canvas-surface'));resize();loadPreview();settingsFrame.src=`auction-control.html?channel=${encodeURIComponent(channelId)}&page=${page}&embedded=1&compact=1`;
 window.addEventListener('beforeunload',event=>{if(model.dirty()){event.preventDefault();event.returnValue='';}});
})();

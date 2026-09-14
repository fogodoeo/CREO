(() => {
 'use strict';
 const $=id=>document.getElementById(id),menu=$('studio-theme'),options=$('theme-options');
 let current=null,busy=false;
 for(const preset of CreoBroadcastPalette.presets){const button=document.createElement('button');button.type='button';button.dataset.palette=preset.id;button.setAttribute('aria-pressed','false');const dot=document.createElement('i');dot.style.background=preset.theme.secondary;dot.setAttribute('aria-hidden','true');button.append(dot,document.createTextNode(preset.name));button.onclick=()=>save({theme:preset.theme});options.append(button);}
 for(const preset of CreoBroadcastThemes.presets){const button=document.createElement('button');button.type='button';button.dataset.style=preset.id;button.setAttribute('aria-pressed','false');button.innerHTML=`<span class="theme-style-sample" data-style="${preset.id}" aria-hidden="true"><span>낙찰 25만</span></span><strong>${preset.name}</strong>`;button.onclick=()=>save(preset.id==='pixel'&&current?.broadcastTheme!=='pixel'?{broadcastTheme:preset.id,theme:CreoBroadcastPalette.presets.find(p=>p.id==='retro').theme}:{broadcastTheme:preset.id});$('theme-styles').append(button);}
 function sync(){const found=CreoBroadcastPalette.match(current?.theme),style=CreoBroadcastThemes.resolve(current?.broadcastTheme);$('theme-name').textContent=style.name+' · '+(found?.name||'직접 지정');$('theme-color').value=current?.theme?.primary||'#315fbb';options.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(found?.id===b.dataset.palette));b.disabled=busy||!current});$('theme-styles').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(style.id===b.dataset.style));b.disabled=busy||!current});$('theme-custom-apply').disabled=busy||!current;menu.dataset.busy=String(busy);}
 async function save(patch){
  if(busy||!current)return;const channelId=current.id;busy=true;$('theme-message').textContent='적용 중…';sync();
  try{
   // Visual theme and palette are independent. Catalog CAS protects other edits.
   const catalog=await CreoPlatform.api('channels');
   if(current.id!==channelId)throw new Error('채널이 바뀌었어요. 다시 선택해 주세요.');
   const result=await CreoPlatform.api(`channels/${encodeURIComponent(channelId)}`,{method:'PUT',body:JSON.stringify({channel:patch,expectedVersion:catalog.version})});
   if(current.id!==channelId)return;
   current={...current,theme:result.channel.theme,broadcastTheme:result.channel.broadcastTheme};
   $('control-frame').contentWindow?.postMessage({type:'creo-broadcast-theme',channelId,theme:current.theme,broadcastTheme:current.broadcastTheme},location.origin);
   $('theme-message').textContent='P1 · P2 · P3 적용됨';
  }catch(error){if(current?.id===channelId)$('theme-message').textContent=error.status===409?'다른 설정이 변경됐어요. 다시 선택해 주세요.':(error.message||'적용하지 못했어요. 다시 선택해 주세요.');}
  finally{busy=false;sync();}
 }
 $('theme-custom-apply').onclick=()=>save({theme:CreoBroadcastPalette.custom($('theme-color').value)});
 window.CreoStudioTheme={setChannel(channel){current=channel;$('theme-message').textContent='선택하면 모든 송출 화면에 반영돼요';sync();}};
 document.addEventListener('pointerdown',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus()}});
})();

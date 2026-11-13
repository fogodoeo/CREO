(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreoCheckoutItemView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = value => String(value ?? '').trim();
  const escape = value => text(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  function imageUrl(value, origin) {
    try {
      if (!text(value) || text(value).length > 2048 || /[\u0000-\u001f]/.test(value)) return '';
      const url = new URL(value, origin);
      if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) return '';
      if (url.origin !== origin && !(url.protocol === 'https:' && (url.hostname.endsWith('.supabase.co') || url.hostname === 'api.feedle.me'))) return '';
      return url.href;
    } catch { return ''; }
  }
  function pictures(item, origin) {
    const photos = [], seen = new Set();
    const append = (source, group, fallback) => {
      for (const [index, photo] of (Array.isArray(source) ? source.slice(0,12) : source ? [source] : []).entries()) {
        const raw = typeof photo === 'string' ? { url:photo } : photo || {};
        const url = imageUrl(raw.url || raw.src, origin);
        if (!url || seen.has(group + ':' + url)) continue;
        seen.add(group + ':' + url);
        photos.push({ url, thumbnailUrl:imageUrl(raw.thumbnailUrl, origin), group, label:text(raw.label) || `${fallback} ${index + 1}` });
      }
    };
    append(item.media || item.photos || item.photoUrl || item.photoItem || item.photo_item, '개체', '개체');
    const parents = Array.isArray(item.parents) ? item.parents : [];
    for (const [role, key] of [['부','sire'], ['모','dam'], ['동배','sibling'], ['해츨링','hatchling']]) {
      const parent = parents.find(p => p && (p.role === key || p.role === role)) || item[key];
      append(parent?.media || parent?.photoUrl || (key === 'sire' ? item.photoSire : key === 'dam' ? item.photoDam : '') || item['photo_' + key] || item.attributes?.['photo_' + key], role, parent?.name ? `${role} · ${parent.name}` : role);
    }
    return photos.slice(0, 12).map(photo=>item.parentInfoState==='snapshot'&&photo.group!=='개체'?{...photo,label:photo.label+' · 등록 당시 자료'}:photo);
  }
  function lotLabel(item) {
    const code = text(item.displayNumber || item.lotCode || item.code || item.lotNumber);
    return !code || code === '0' ? '' : /^\d+$/.test(code) ? code.padStart(2,'0') : code;
  }
  function itemTitle(item) { const code=lotLabel(item),name=text(item.name);return name===code?name:[code,name].filter(Boolean).join(' · '); }
  function traitSummary(item) { const t=item.traits||{};return [t.morph,({male:'수컷',female:'암컷'})[t.sex],t.weight?`${t.weight}g`:'',t.size].filter(Boolean).join(' · '); }
  function parentDetails(item) { return (Array.isArray(item.parents)?item.parents:[]).filter(p=>p&&['sire','dam','sibling','hatchling','부','모','동배','해츨링'].includes(p.role)&&(text(p.name)||text(p.morph))); }
  function createViewer({ document, origin }) {
    const dialog = document.createElement('dialog'); dialog.className = 'checkout-photo-viewer';
    const titleId='checkout-photo-title-'+document.querySelectorAll('.checkout-photo-viewer').length;
    dialog.setAttribute('aria-labelledby',titleId);
    dialog.innerHTML = `<header><h2 id="${titleId}"></h2><button type="button" data-photo-close aria-label="사진 닫기">×</button></header><div class="checkout-parent-info" hidden></div><div class="checkout-photo-groups" role="group" aria-label="사진 종류"></div><div class="checkout-photo-stage"><img alt=""><p role="status" hidden>사진을 불러오지 못했어요</p><button type="button" data-photo-retry hidden>다시 불러오기</button></div><div class="checkout-photo-meta"><p class="checkout-photo-caption"></p><a data-photo-original target="_blank" rel="noopener noreferrer">원본 보기</a></div><footer><button type="button" data-photo-prev aria-label="이전 사진">←</button><span aria-live="polite"></span><button type="button" data-photo-next aria-label="다음 사진">→</button></footer>`;
    document.body.append(dialog);
    const $ = selector => dialog.querySelector(selector);
    let photos=[], index=0, opener=null, outside=false, swipe=null, sheetDrag=null;
    function preloadNeighbor(offset) {
      const target=photos[index+offset], Img=document.defaultView?.Image;
      if(target?.url&&typeof Img==='function'){const pre=new Img();pre.decoding='async';pre.src=target.url;}
    }
    function render() {
      const photo=photos[index];
      for(const selector of ['.checkout-photo-stage','.checkout-photo-groups','.checkout-photo-meta','footer'])$(selector).hidden=!photo;
      if(!photo){$('img').removeAttribute('src');$('[data-photo-original]').removeAttribute('href');return;}
      const img=$('img'); img.hidden=false; $('.checkout-photo-stage p').hidden=true;$('[data-photo-retry]').hidden=true;
      img.onerror=()=>{img.hidden=true;$('.checkout-photo-stage p').hidden=false;$('[data-photo-retry]').hidden=false;};
      img.alt=photo.label; img.src=photo.url;
      preloadNeighbor(1); preloadNeighbor(-1);
      $('[data-photo-original]').href=photo.url;
      $('[data-photo-original]').setAttribute('aria-label',photo.label+' 원본 보기 (새 창)');
      $('.checkout-photo-caption').textContent=photo.label;
      $('footer span').textContent=`${index+1} / ${photos.length}`;
      $('[data-photo-prev]').disabled=index===0; $('[data-photo-next]').disabled=index===photos.length-1;
      const groups=[...new Set(photos.map(p=>p.group))];
      if([...dialog.querySelectorAll('[data-photo-group]')].map(button=>button.dataset.photoGroup).join('|')!==groups.join('|'))$('.checkout-photo-groups').innerHTML=groups.map(group=>`<button type="button" data-photo-group="${escape(group)}">${escape(group)}</button>`).join('');
      dialog.querySelectorAll('[data-photo-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.photoGroup===photo.group)));
      dialog.querySelectorAll('[data-photo-group]').forEach(button=>button.onclick=()=>{index=photos.findIndex(p=>p.group===button.dataset.photoGroup);render();});
    }
    $('[data-photo-close]').onclick=()=>dialog.close();
    $('[data-photo-retry]').onclick=()=>{render();$('[data-photo-close]').focus();};
    $('[data-photo-prev]').onclick=()=>{if(index>0){index--;render();}};
    $('[data-photo-next]').onclick=()=>{if(index<photos.length-1){index++;render();}};
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')$('[data-photo-prev]').click();if(e.key==='ArrowRight')$('[data-photo-next]').click();});
    const stage=$('.checkout-photo-stage'), header=$('header');
    stage.addEventListener('pointerdown',e=>{if(photos.length>1&&typeof e.clientX==='number')swipe={id:e.pointerId,x:e.clientX,y:e.clientY};});
    stage.addEventListener('pointerup',e=>{if(!swipe||swipe.id!==e.pointerId)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(Math.abs(dx)>=42&&Math.abs(dx)>Math.abs(dy)*1.25)(dx<0?$('[data-photo-next]'):$('[data-photo-prev]')).click();});
    stage.addEventListener('pointercancel',()=>{swipe=null;});
    header.addEventListener('pointerdown',e=>{if(e.target?.closest?.('button')||typeof e.clientY!=='number'||(dialog.scrollTop||0)>0)return;sheetDrag={id:e.pointerId,y:e.clientY,dy:0};});
    header.addEventListener('pointermove',e=>{if(!sheetDrag||sheetDrag.id!==e.pointerId)return;const dy=Math.max(0,e.clientY-sheetDrag.y);sheetDrag.dy=dy;if(dy>6&&dialog.style)dialog.style.transform=`translateY(${Math.min(dy,220)}px)`;});
    const finishSheetDrag=e=>{if(!sheetDrag||(e&&e.pointerId!==undefined&&sheetDrag.id!==e.pointerId))return;const dy=sheetDrag.dy;sheetDrag=null;if(dialog.style)dialog.style.transform='';if(dy>88)dialog.close();};
    header.addEventListener('pointerup',finishSheetDrag);header.addEventListener('pointercancel',finishSheetDrag);
    const isOutside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
    dialog.addEventListener('pointerdown',e=>{outside=isOutside(e);});
    dialog.addEventListener('click',e=>{if(outside&&isOutside(e))dialog.close();outside=false;});
    dialog.addEventListener('close',()=>{if(dialog.style)dialog.style.transform='';$('img').removeAttribute('src');if(opener?.isConnected)opener.focus();});
    return { isOpen:()=>dialog.open, clear(){
      opener=null;photos=[];index=0;outside=false;swipe=null;sheetDrag=null;if(dialog.style)dialog.style.transform='';if(dialog.open)dialog.close();
      $('img').onerror=null;$('img').removeAttribute('src');$('img').alt='';
      $('[data-photo-original]').removeAttribute('href');$('[data-photo-original]').removeAttribute('aria-label');
      for(const selector of ['h2','.checkout-parent-info','.checkout-photo-groups','.checkout-photo-caption','footer span'])$(selector).replaceChildren();
    }, open(item, trigger, initialPhoto) {
      photos=pictures(item,origin);const parents=parentDetails(item);if(!photos.length&&!parents.length)return;
      index=Math.max(0,photos.findIndex(photo=>photo.url===initialPhoto?.url&&photo.group===initialPhoto?.group));opener=trigger;$('h2').textContent=itemTitle(item);
      $('.checkout-parent-info').hidden=!parents.length;
      $('.checkout-parent-info').innerHTML=parents.map(parent=>`<div><small>${({sire:'부',부:'부',dam:'모',모:'모',sibling:'동배',동배:'동배',hatchling:'해츨링',해츨링:'해츨링'})[parent.role]||'모'}</small>${parent.name?`<b>${escape(parent.name)}</b>`:''}${parent.morph?`<span>${escape(parent.morph)}</span>`:''}</div>`).join('');
      $('[data-photo-close]').setAttribute('aria-label',photos.length?'사진 닫기':'부모 정보 닫기');
      render();if(!dialog.open)dialog.showModal();
    } };
  }
  return { pictures, lotLabel, imageUrl, itemTitle, traitSummary, parentDetails, createViewer };
});

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBroadcastThemes=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // New visual concepts belong here and in broadcast-themes.css, never in auction rules.
 const presets=Object.freeze([
  Object.freeze({id:'base',name:'기본',description:'단정한 기본 박스',frame:''}),
  Object.freeze({id:'pixel',name:'픽셀',description:'레트로 게임기',frame:''}),
  Object.freeze({id:'national-stage',name:'전국크레자랑',description:'흰색 이름칸 · 번호 원 · 청록·자주 방송 자막',frame:''}),
  Object.freeze({id:'recessive-special',name:'열성모프 특집',description:'아이보리 · 차콜 · 세이지 포인트',frame:''}),
  Object.freeze({id:'jjun-boutique',name:'쭌이네 부티크',description:'에스프레소 · 샴페인 · 웜 아이보리',frame:''}),
  Object.freeze({id:'clab-gallery',name:'씨랩 갤러리',description:'포슬린 · 잉크 · 딥 세이지',frame:''})
 ]);
 function resolve(id){return presets.find(p=>p.id===id)||presets[0]}
 function apply(doc,id){const theme=resolve(id);if(doc.body)doc.body.dataset.broadcastTheme=theme.id;return theme.id}
 // Always mounted so changing themes can reveal/hide the frame without remounting media.
 function frame(channel){const name=String(channel?.shortName||channel?.name||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));return '<div class="broadcast-console" aria-hidden="true"><div class="console-shell"></div><div class="screen-bezel"></div><div class="console-stripes"><i></i><i></i><i></i><i></i></div><i class="console-power"></i><i class="console-dpad"></i><div class="console-buttons"><i></i><i></i></div><div class="console-speaker"><i></i><i></i><i></i><i></i><i></i></div></div>'+`<div class="recessive-brand"><span>${name}</span><strong>열성모프 특집</strong></div>`+studioFrame(channel)}
 function studioFrame(channel){
  if(!['jjun-boutique','clab-gallery'].includes(channel?.broadcastTheme))return '';
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=String(channel.shippingDefaults?.deliverySchedule?.auctionDate||'');
  // The event (auction) date, never a dispatch date. A valid YYYY-MM-DD shows as MM.DD plus its weekday; anything else is shown as entered.
  const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),day=parts?new Date(Date.UTC(+parts[1],+parts[2]-1,+parts[3])):null;
  const valid=Boolean(day&&day.getUTCMonth()===+parts[2]-1&&day.getUTCDate()===+parts[3]);
  const dateLabel=valid?`${parts[2]}.${parts[3]}`:date.replaceAll('-','.'),weekday=valid?'일월화수목금토'[day.getUTCDay()]+'요일':'';
  const dateBlock=dateLabel?`<div class="studio-date"><strong>${esc(dateLabel)}</strong>${weekday?`<span>${weekday}</span>`:''}</div>`:'';
  return `<header class="studio-masthead"><div class="studio-plate"><div class="studio-title"><span>${esc(channel.shortName||channel.name)}</span><strong>${esc(channel.broadcastDefaults?.notice||channel.name)}</strong></div>${dateBlock}</div></header>`;
 }
 function bannerFrame(){return '<div class="banner-tv-decor" aria-hidden="true"><div class="banner-tv-controls"><i class="banner-tv-dial"></i><i class="banner-tv-dial small"></i><i class="banner-tv-speaker"></i><i class="banner-tv-led"></i></div><i class="banner-tv-foot left"></i><i class="banner-tv-foot right"></i></div>';}
 return Object.freeze({presets,resolve,apply,frame,bannerFrame});
});

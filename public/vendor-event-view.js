(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoVendorEvents=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const ROOT='national-cre';
 const dated=event=>/^national-cre-\d{8}$/.test(event?.id||'');
 const latest=events=>events.filter(e=>dated(e)&&e.status==='active').sort((a,b)=>b.id.localeCompare(a.id))[0];
 function initialTarget(data,search){
  const query=new URLSearchParams(search);
  // Only an unscoped portal landing moves. Saved financial links retain their exact event/round.
  if(!query.get('portal')||query.has('round')||data.channel?.id!==ROOT)return '';
  return latest(data.events||[])?.id||'';
 }
 function label(event,hasRounds){
  if(event.id===ROOT&&hasRounds)return '이전 낙찰·결제 내역';
  return event.name+' · '+({active:'운영 중',draft:'준비 중',archived:'보관',paused:'일시정지'}[event.status]||'');
 }
 function render(select,data,change){
  const events=data.events||[data.channel],hasRounds=events.some(dated),root=events.find(e=>e.id===ROOT),separate=!!root&&hasRounds;
  select.replaceChildren();
  for(const event of events){const option=document.createElement('option');option.value=event.id;option.textContent=label(event,hasRounds);option.hidden=separate&&event.id===ROOT;option.selected=event.id===data.channel.id;select.append(option);}
  select.parentElement.hidden=events.filter(e=>!separate||e.id!==ROOT).length<2;
  let panel=document.getElementById('vendor-event-context');
  if(!panel){panel=document.createElement('div');panel.id='vendor-event-context';panel.className='vendor-event-context';select.parentElement.after(panel);}
  panel.hidden=!separate;panel.replaceChildren();if(!separate)return;
  const title=document.createElement('p');title.className='vendor-event-current';title.textContent=data.channel.id===ROOT?'이전 낙찰·결제 내역':data.channel.name;panel.append(title);
  const target=data.channel.id===ROOT?latest(events):root;
  if(target){const button=document.createElement('button');button.type='button';button.className='vendor-event-history';button.textContent=target.id===ROOT?'이전 낙찰·결제 내역 보기':target.name+' 열기';button.onclick=()=>change(target.id);panel.append(button);}
 }
 return {initialTarget,label,render};
});

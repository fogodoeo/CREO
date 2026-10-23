document.addEventListener('DOMContentLoaded',()=>{
 'use strict';let state=null,version=0,timer;
 const $=id=>document.getElementById(id),keys=['shipping','organizer','changes'];
 const hosts=key=>[...document.querySelectorAll('[data-work-key="'+key+'"]'),...(['shipping','organizer'].includes(key)?[$('quick-'+key)]:[])].filter(Boolean);
 function reset(){for(const badge of document.querySelectorAll('.operator-work-count'))badge.remove();for(const node of document.querySelectorAll('[data-work-pending]'))node.removeAttribute('data-work-pending');}
 function badge(host,count,label){if(!host||!count)return;const b=document.createElement('span');b.className='operator-work-count';b.textContent=host.classList.contains('operation')?label+' '+count+'건':count;b.setAttribute('aria-label',label+' '+count+'건');host.append(b);host.dataset.workPending='true';}
 async function refresh(){
  if(!state)return;const seq=++version,selected=state;reset();
  const message=$('work-summary-status');message.hidden=false;message.textContent='확인할 일을 불러오는 중…';
  try{
   const data=await CreoPlatform.api('channels/'+encodeURIComponent(selected.channel.id)+'/work-summary'+(selected.archiveId?'?archive='+encodeURIComponent(selected.archiveId):''));
   if(seq!==version||state!==selected)return;
   if(data.channelId!==selected.channel.id||(data.archiveId||'')!==(selected.archiveId||''))throw Error('회차를 다시 확인해 주세요.');
   const counts=data.counts;reset();for(const key of keys)for(const node of hosts(key))badge(node,counts[key],'확인 필요');
   badge(document.querySelector('[data-work-group="finance"]'),keys.reduce((n,k)=>n+(counts[k]||0),0),'확인 필요');
   message.hidden=true;message.textContent='';
  }catch{if(seq!==version)return;reset();message.hidden=false;message.innerHTML='할 일을 불러오지 못했어요. <button type="button">다시 확인</button>';message.querySelector('button').onclick=refresh;}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(refresh,300);}
 document.addEventListener('creo:operator-ready',event=>{state=event.detail.state;clearTimeout(timer);refresh();});
 document.addEventListener('creo:operator-reset',()=>{state=null;version++;clearTimeout(timer);reset();$('work-summary-status').hidden=true;});
 window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 $('operator-frame').addEventListener('load',schedule);
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===$('operator-frame').contentWindow&&event.data?.type==='creo:operator-dirty'&&event.data.dirty===false&&event.data.busy!==true)schedule();});
});

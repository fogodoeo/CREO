document.addEventListener('DOMContentLoaded',()=>{
 'use strict';let state=null,scopeKey='',lastCounts=null,version=0,timer;
 const $=id=>document.getElementById(id),keys=['shipping','organizer','changes'];
 const keyOf=s=>s?s.channel.id+'@'+(s.archiveId||''):'';
 const hosts=key=>[...document.querySelectorAll('[data-work-key="'+key+'"]'),...(['shipping','organizer'].includes(key)?[$('quick-'+key)]:[])].filter(Boolean);
 function reset(){for(const badge of document.querySelectorAll('.operator-work-count'))badge.remove();for(const node of document.querySelectorAll('[data-work-pending]'))node.removeAttribute('data-work-pending');for(const opt of document.querySelectorAll('#operator-task-select option[data-base-label]'))opt.textContent=opt.dataset.baseLabel;}
 function badge(host,count,label){if(!host||!count)return;const b=document.createElement('span');b.className='operator-work-count';b.textContent=host.classList.contains('operation')?label+' '+count+'건':count;b.setAttribute('aria-label',label+' '+count+'건');host.append(b);host.dataset.workPending='true';}
 function paint(counts){reset();if(!counts)return;for(const key of keys){for(const node of hosts(key))badge(node,counts[key],'확인 필요');const opt=document.querySelector('#operator-task-select option[value="'+key+'"]');if(opt&&counts[key]>0){opt.dataset.baseLabel||=opt.textContent;opt.textContent=opt.dataset.baseLabel+' ('+counts[key]+'건)';}}badge(document.querySelector('[data-work-group="finance"]'),keys.reduce((n,k)=>n+(counts[k]||0),0),'확인 필요');}
 async function refresh(){
  if(!state)return;const seq=++version,selected=state;
  // Background refresh keeps the current badges and never inserts a loading row.
  const message=$('work-summary-status');message.hidden=true;message.textContent='';
  try{
   const data=await CreoPlatform.api('channels/'+encodeURIComponent(selected.channel.id)+'/work-summary'+(selected.archiveId?'?archive='+encodeURIComponent(selected.archiveId):''));
   if(seq!==version||state!==selected)return;
   if(data.channelId!==selected.channel.id||(data.archiveId||'')!==(selected.archiveId||''))throw Error('회차를 다시 확인해 주세요.');
   lastCounts=data.counts;paint(lastCounts);
   message.hidden=true;message.textContent='';
  }catch{if(seq!==version)return;lastCounts=null;reset();message.hidden=false;message.innerHTML='할 일을 불러오지 못했어요. <button type="button">다시 확인</button>';message.querySelector('button').onclick=refresh;}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(refresh,300);}
 document.addEventListener('creo:operator-ready',event=>{const next=event.detail.state,nextKey=keyOf(next);if(nextKey!==scopeKey){scopeKey=nextKey;lastCounts=null;}state=next;paint(lastCounts);clearTimeout(timer);refresh();});
 document.addEventListener('creo:operator-reset',()=>{state=null;scopeKey='';lastCounts=null;version++;clearTimeout(timer);reset();$('work-summary-status').hidden=true;});
 window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 $('operator-frame').addEventListener('load',schedule);
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===$('operator-frame').contentWindow&&event.data?.type==='creo:operator-dirty'&&event.data.dirty===false&&event.data.busy!==true)schedule();});
});

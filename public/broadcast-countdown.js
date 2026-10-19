(function(root){
 'use strict';
 let badge,host,deadline=0,current=null;
 function visible(state,item){return !!(state?.mode==='live'&&item?.status==='live'&&state.activeItemId===item.id&&state.countdownDisplay?.running===true&&state.countdownDisplay.itemId===item.id&&Number.isFinite(Number(state.countdownDisplay.remainingMs))&&Number(state.countdownDisplay.remainingMs)>0);}
 function position(){
  if(!badge||!host)return;
  const anchor=host.querySelector('.live-bidders');
  badge.hidden=performance.now()>=deadline;
  if(badge.hidden)return;
  const box=host.getBoundingClientRect(),r=anchor?.getBoundingClientRect(),scale=box.width/1920;
  badge.style.fontSize=Math.max(13,42*scale)+'px';
  const hasAnchor=r&&r.width>0&&r.height>0;
  badge.style.left=Math.max(8,Math.min(hasAnchor?r.left-box.left:32*scale,box.width-badge.offsetWidth-8))+'px';
  badge.style.top=Math.max(8,Math.min(hasAnchor?r.top-box.top-badge.offsetHeight-14*scale:box.height*.16,box.height-badge.offsetHeight-8))+'px';
 }
 function sync(stage,state,item){
  host=stage;
  if(!visible(state,item)){badge?.remove();badge=null;current=null;return;}
  if(current!==state.countdownDisplay){current=state.countdownDisplay;deadline=performance.now()+Math.min(15000,Number(current.remainingMs));}
  if(!badge||!badge.isConnected){badge=document.createElement('div');badge.className='auction-countdown';badge.setAttribute('role','status');badge.innerHTML='<span class="auction-countdown-light" aria-hidden="true"></span><span>마감 카운트 진행 중</span>';stage.append(badge);}
  position();
 }
 root.CreoBroadcastCountdown={sync,visible};
 if(typeof module==='object'&&module.exports)module.exports={visible};
 if(typeof document==='object'){setInterval(position,250);root.addEventListener('resize',position);}
})(typeof window==='object'?window:globalThis);

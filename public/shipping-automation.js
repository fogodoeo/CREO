(function(global){
 'use strict';
 const $=id=>document.getElementById(id);
 let dirty=false,loading=false,initialized=false;
 function display(data){
  if(!initialized||!dirty){$('shipping-auto-enabled').checked=data.enabled;$('shipping-alert-phone').value=data.alertPhone||'';initialized=true;}
  $('shipping-auto-status').textContent=data.enabled?'하루 1회 · 거점·요금·일정':'자동 갱신 꺼짐';
  for(const [id,name] of [['parge','파르게'],['dodosi','도도시']]){
   const p=data.providers?.[id]||{};
   const stamp=p.checkedAt?new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(p.checkedAt)):'';
   $('shipping-auto-'+id).textContent=name+' · '+(p.failures?'갱신 실패 · 기존 자료 유지':stamp?'갱신 '+stamp:'첫 갱신 대기');
  }
 }
 async function refresh(){if(loading||document.body.dataset.authenticated!=='true')return;loading=true;try{display(await CreoPlatform.api('shipping-rates/automation'))}catch{$('shipping-auto-status').textContent='자동 갱신 상태 확인 필요'}finally{loading=false}}
 document.addEventListener('DOMContentLoaded',()=>{
  $('shipping-auto-form').addEventListener('input',()=>{dirty=true});
  $('shipping-auto-form').addEventListener('submit',async event=>{
   event.preventDefault();const button=$('shipping-auto-save');button.disabled=true;$('shipping-auto-message').textContent='';
   try{const data=await CreoPlatform.api('shipping-rates/automation',{method:'PUT',body:JSON.stringify({enabled:$('shipping-auto-enabled').checked,alertPhone:$('shipping-alert-phone').value})});dirty=false;display(data);$('shipping-auto-message').textContent='저장했어요'}
   catch(error){$('shipping-auto-message').textContent=error.message||'저장하지 못했어요'}finally{button.disabled=false}
  });
  setInterval(()=>{if(!document.hidden)void refresh()},60000);
 });
 global.CreoShippingAutomation={refresh};
})(window);

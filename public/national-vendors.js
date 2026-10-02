(() => {
 'use strict';
 const $=id=>document.getElementById(id),esc=CreoPlatform.escapeHtml;
 let data,editing=null,busy=false;
 const api=(body)=>CreoPlatform.api('national-vendor-directory',{cache:'no-store',signal:AbortSignal.timeout(20000),...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 function error(message){const el=$($('editor').open?'editor-error':'error');el.textContent=message||'';el.hidden=!message;}
 async function run(work){if(busy)return;busy=true;error('');try{await work();}catch(e){error(e.message);if(e.status===401){$('content').hidden=true;$('login').hidden=false;}}finally{busy=false;$('save').disabled=false;$('save').textContent='저장';}}
 async function load(){data=await api();$('login').hidden=true;$('content').hidden=false;$('companies').innerHTML=data.companies.length?data.companies.map(c=>`<button class="result" type="button" data-id="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.region)} · ${c.claimed?'대표 연결됨':c.registered?'대표 접속 전':'로그인 번호 미등록'}</small></span><span class="chevron" aria-hidden="true">›</span></button>`).join(''):'<p class="empty">등록된 업체가 없어요.</p>';for(const el of document.querySelectorAll('[data-id]'))el.onclick=()=>open(data.companies.find(c=>c.id===el.dataset.id));}
 function populate(c){
  editing={id:c?.id||'nv-'+crypto.randomUUID().replaceAll('-',''),revision:c?.revision||0,registered:!!c?.registered,claimed:!!c?.claimed};
  $('name').value=c?.name||'';$('name').readOnly=!!c;
  $('region').value=c?.region||'';$('region').disabled=!!c?.registered;
  $('phone').value=c?.loginPhone||'';$('phone').readOnly=!!c?.claimed;
  $('save').hidden=!!c?.claimed;$('editor-title').textContent=c?.claimed?'등록 정보':'업체 등록';
 }
 function open(c){
  if(busy)return;
  $('vendor-form').reset();$('editor-error').hidden=true;
  $('region').innerHTML='<option value="">지역 선택</option>'+data.regions.map(r=>`<option>${esc(r)}</option>`).join('');
  $('existing').innerHTML='<option value="">새 업체</option>'+data.companies.filter(v=>!v.registered).map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  $('existing').closest('label').hidden=!!c;$('existing').value=c?.id||'';
  populate(c);$('editor').showModal();
 }
 $('existing').onchange=()=>populate(data.companies.find(c=>c.id===$('existing').value));
 $('add').onclick=()=>open();$('close').onclick=()=>{if(!busy)$('editor').close();};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('vendor-form').onsubmit=e=>{e.preventDefault();const body={id:editing.id,revision:editing.revision,name:$('name').value.trim(),region:$('region').value,loginPhone:$('phone').value};run(async()=>{$('save').disabled=true;$('save').textContent='저장 중…';await api(body);$('editor').close();await load();});};
 $('login').onsubmit=e=>{e.preventDefault();run(async()=>{await CreoPlatform.api('auth/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';await load();});};
 run(load);
})();

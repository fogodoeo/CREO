'use strict';
document.getElementById('operator-login').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.getElementById('operator-password'),button=document.getElementById('operator-submit'),error=document.getElementById('operator-error');
 if(button.disabled||!input.value)return;button.disabled=true;input.disabled=true;button.textContent='확인 중…';error.hidden=true;
 try{
  const response=await fetch('/api/platform/auth/login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.authenticated)throw Error(data?.error||'로그인하지 못했어요. 다시 시도해 주세요.');
  input.value='';location.replace('/main'+location.search);
 }catch(failure){error.textContent=failure.message==='Failed to fetch'?'연결을 확인한 뒤 다시 시도해 주세요.':failure.message;error.hidden=false;button.disabled=false;input.disabled=false;button.textContent='로그인';input.focus();}
});

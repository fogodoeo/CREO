'use strict';
function operatorDestination(search){
 const params=new URLSearchParams(search),next=params.get('next')||'';
 const safeNext=next.startsWith('/')&&!next.startsWith('//')&&!next.startsWith('/\\')?next:'';
 if(safeNext)return safeNext;
 params.delete('next');
 return '/main'+(params.size?'?'+params:'');
}
document.getElementById('operator-login').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.getElementById('operator-password'),button=document.getElementById('operator-submit'),error=document.getElementById('operator-error');
 if(button.disabled||!input.value)return;button.disabled=true;input.disabled=true;button.textContent='확인 중…';error.hidden=true;
 try{
  const response=await fetch('/api/platform/auth/login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.authenticated)throw Error(data?.error||'로그인하지 못했어요. 다시 시도해 주세요.');
  input.value='';
  const target=operatorDestination(location.search);
  if(window.top&&window.top!==window){
   let topTarget=target;
   try{if(['/main','/main/','/index.html'].includes(window.top.location.pathname))topTarget=window.top.location.pathname+window.top.location.search;}catch{}
   window.top.location.replace(topTarget);return;
  }
  location.replace(target);
 }catch(failure){error.textContent=failure.message==='Failed to fetch'?'연결을 확인한 뒤 다시 시도해 주세요.':failure.message;error.hidden=false;button.disabled=false;input.disabled=false;button.textContent='로그인';input.focus();}
});

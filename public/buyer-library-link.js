(async function(){
 const host=document.getElementById('buyer-collection');if(!host)return;
 try{const response=await fetch('/api/platform/buyer-account/session',{credentials:'same-origin',cache:'no-store'});if(!response.ok||!(await response.json()).available)return;
  const recovery=document.getElementById('error-library');if(recovery)recovery.hidden=false;
  const code=new URLSearchParams(location.search).get('code')||(/^\/[ds]\/([\w-]{8,24})$/.exec(location.pathname)||[])[1]||'';
  const link=document.createElement('a');link.textContent='내 보관함';link.href='/buyer-library.html'+(/^[\w-]{8,24}$/.test(code)?'#link='+code:'');link.className='collection-photo-link';host.append(link);
 }catch{}
})();

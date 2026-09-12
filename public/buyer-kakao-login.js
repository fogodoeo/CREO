(function(global){
 'use strict';
 // Pin the official SDK and SRI together. No provider tokens enter this page.
 const SDK_URL='https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
 const SDK_INTEGRITY='sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';
 let sdkPromise=null;
 function loadSdk(){
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');let finished=false;
   const timer=setTimeout(()=>finish(Error('sdk_timeout')),8000);
   function finish(error){if(finished)return;finished=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve(global.Kakao);}
   script.src=SDK_URL;script.integrity=SDK_INTEGRITY;script.crossOrigin='anonymous';script.async=true;
   script.onload=()=>finish(typeof global.Kakao?.init==='function'&&typeof global.Kakao?.isInitialized==='function'?null:Error('sdk_invalid'));
   script.onerror=()=>finish(Error('sdk_load'));document.head.append(script);
  }).catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
 }
 function create({form,input,status}){
  const button=form.querySelector('button');let key='',mode='web',ready=null,generation=0,pending=null,refreshTimer=null,openingTimer=null,controller=null,paused=false;
  const now=()=>performance.now();
  const message=text=>{status.textContent=text;status.hidden=!text;};
  function clearTimers(){clearTimeout(refreshTimer);clearTimeout(openingTimer);refreshTimer=openingTimer=null;}
  function paint(next,text=''){
   mode=next;button.disabled=['loading','opening'].includes(next);button.setAttribute('aria-busy',String(button.disabled));
   button.textContent=next==='loading'?'로그인 준비 중…':next==='opening'?'카카오 연결 중…':next==='retry'?'다시 시도':next==='fallback'?'카카오계정으로 로그인':'카카오 로그인';
   message(text);
  }
  function fallback(text){clearTimers();ready=null;paint('fallback',text);}
  function initializeSdk(sdk){
   if(!sdk.isInitialized())sdk.init(key);
   if(!sdk.isInitialized()||typeof sdk.Auth?.authorize!=='function'||sdk.Auth.getAppKey()!==key)throw Error('sdk_app_mismatch');
   return sdk;
  }
  function prepare(){
   if(pending||!key||paused)return pending||Promise.resolve();
   const version=generation,requestedLink=input.value;clearTimers();ready=null;paint('loading');const requestController=new AbortController();controller=requestController;
   const timeout=setTimeout(()=>requestController.abort(),8000),signal=requestController.signal;
   pending=(async()=>{
    let sdk;
    try{sdk=initializeSdk(await loadSdk());}catch{if(version===generation&&!paused)fallback('카카오계정으로 계속 로그인할 수 있어요.');return;}
    if(version!==generation||paused)return;
    try{
     const response=await fetch('/api/platform/buyer-account/prepare',{method:'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({link:requestedLink}).toString()});
     const data=await response.json();if(!response.ok)throw Error(data.error||'로그인을 준비하지 못했어요. 다시 시도해 주세요.');
     const settings=data.authorize;
     if(!settings||settings.redirectUri!==location.origin+'/api/platform/buyer-account/callback'||!/^[-\w]{43}$/.test(settings.state)||settings.scope!=='openid,phone_number'||settings.throughTalk!==true||data.expiresIn!==300)throw Error('로그인 정보를 확인하지 못했어요. 다시 시도해 주세요.');
     if(version!==generation||paused)return;
     ready={sdk,settings:{redirectUri:settings.redirectUri,state:settings.state,scope:settings.scope,throughTalk:true},link:requestedLink,until:now()+290000};paint('ready');
     if(!document.hidden)refreshTimer=setTimeout(()=>{if(!document.hidden)void prepare();},240000);
    }catch(error){if(version===generation&&!paused)paint('retry',error.name==='AbortError'?'연결이 늦어지고 있어요. 다시 시도해 주세요.':error.message);}
   })().finally(()=>{clearTimeout(timeout);if(version===generation){pending=null;controller=null;}});
   return pending;
  }
  function configure(value){
   generation++;controller?.abort();pending=null;controller=null;clearTimers();ready=null;paused=false;
   key=/^[a-f0-9]{32}$/i.test(value||'')?value:'';
   if(key)void prepare();else paint('web');
  }
  form.addEventListener('submit',event=>{
   if(['loading','opening'].includes(mode)){event.preventDefault();return;}
   if(mode==='retry'){event.preventDefault();void prepare();return;}
   if(mode==='ready'){
    event.preventDefault();
    if(!ready||ready.until<=now()||ready.link!==input.value){void prepare();return;}
    const flow=ready,version=generation;ready=null;clearTimers();paint('opening');
    openingTimer=setTimeout(()=>{if(version===generation&&mode==='opening'&&!document.hidden)fallback('카톡이 열리지 않으면 카카오계정으로 로그인해 주세요.');},12000);
    // Run directly in the user's submit gesture; no fetch/await before authorize.
    try{const result=flow.sdk.Auth.authorize(flow.settings);result?.catch(()=>{if(version===generation&&mode==='opening')fallback('카카오계정으로 다시 로그인해 주세요.');});}
    catch{fallback('카카오계정으로 다시 로그인해 주세요.');}
    return;
   }
   // Native server form remains usable when JS SDK/config is unavailable.
   paint('opening');
  });
  function resume(){
   paused=false;
   if(key&&(mode==='opening'||mode==='loading'||mode==='ready'&&(!ready||ready.until<=now())))void prepare();
   else if(key&&mode==='ready'&&!document.hidden){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(!document.hidden)void prepare();},Math.max(1000,ready.until-now()-50000));}
   else if(!key)paint('web');
  }
  global.addEventListener('pagehide',()=>{paused=true;generation++;controller?.abort();controller=null;pending=null;ready=null;clearTimers();});
  global.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimers();else resume();});
  return {configure};
 }
 global.CreoBuyerKakaoLogin={create};
})(window);

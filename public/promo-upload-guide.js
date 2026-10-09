(() => {
 'use strict';
 const dialog=document.getElementById('upload-guide'),open=document.getElementById('upload-guide-open'),snooze=document.getElementById('upload-guide-snooze');
 const storageKey='creo-promo-upload-guide-v1',today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 let offered=false,returnFocus,closed=Promise.resolve(),resolveClose,outsideStart=false;
 function muted(){try{return localStorage.getItem(storageKey)===today();}catch{return false;}}
 function show(){
  if(dialog.open)return closed;
  returnFocus=document.activeElement;snooze.checked=muted();
  closed=new Promise(resolve=>{resolveClose=resolve;});
  dialog.showModal();dialog.querySelector('.dialog-scroll').scrollTop=0;document.getElementById('upload-guide-title').focus();
  return closed;
 }
 dialog.addEventListener('close',()=>{
  outsideStart=false;
  try{if(snooze.checked)localStorage.setItem(storageKey,today());else localStorage.removeItem(storageKey);}catch{}
  if(returnFocus?.isConnected&&returnFocus!==document.body&&!returnFocus.disabled)returnFocus.focus();else open.focus();
  resolveClose?.();resolveClose=null;
 });
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
 dialog.addEventListener('pointerdown',e=>{outsideStart=e.isPrimary&&e.button===0&&outside(e);});
 dialog.addEventListener('pointercancel',()=>{outsideStart=false;});
 dialog.addEventListener('click',e=>{const dismiss=outsideStart&&outside(e);outsideStart=false;if(dismiss)dialog.close();});
 open.addEventListener('click',show);
 for(const id of ['upload-guide-close','upload-guide-confirm'])document.getElementById(id).addEventListener('click',()=>dialog.close());
 window.CreoPromoGuide={offer(){if(dialog.open)return closed;if(offered)return Promise.resolve();offered=true;return muted()?Promise.resolve():show();}};
})();

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCheckoutActions=api})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const digits=value=>String(value||'').replace(/\D/g,'');
 function phoneHref(value){const n=digits(value);return /^0\d{8,10}$/.test(n)?'tel:'+n:''}
 function priority(status){return ({bank_transfer_reported:0,card_payment_reported:0,card_link_pending:1,additional_payment:2,awaiting_information:4,paid:9})[status]??3}
 async function copyAccount(value,button){
  const number=digits(value);if(!number)return;
  try{await navigator.clipboard.writeText(number);button.textContent='복사 완료';button.setAttribute('aria-live','polite')}
  catch{
   const dialog=document.createElement('dialog');dialog.style.cssText='max-width:90vw;border:1px solid #ddd;border-radius:16px;padding:24px';
   const title=document.createElement('p');title.textContent='계좌번호를 길게 눌러 복사해 주세요.';
   const input=document.createElement('input');input.value=number;input.readOnly=true;input.setAttribute('aria-label','복사할 계좌번호');input.style.cssText='width:100%;font-size:20px;padding:12px';
   const close=document.createElement('button');close.textContent='닫기';close.style.cssText='min-height:48px;margin-top:16px';close.onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.append(title,input,close);document.body.append(dialog);dialog.showModal();input.focus();input.select();
  }
 }
 return {digits,phoneHref,priority,copyAccount};
});

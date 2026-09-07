(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCheckoutActions=api})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
  const channel=document.getElementById('channel-name')||document.getElementById('channel');if(!channel)return;
  const guide=document.createElement('a');guide.href='https://www.youtube.com/shorts/CEhm37HkDqQ';guide.target='_blank';guide.rel='noopener noreferrer';guide.textContent='배송·결제 방법 영상으로 보기 ↗';guide.style.cssText='display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px;margin:12px 0 16px;border-radius:10px;background:#f0f2f5;color:#202225;font-size:16px;font-weight:700;text-decoration:none';
  const settings=document.getElementById('vendor-settings');if(settings)settings.before(guide);else {guide.textContent='이용 방법 ↗';guide.style.cssText='display:inline-block;margin-top:8px;color:#656b74;font-size:14px;text-decoration:underline';document.querySelector('main')?.append(guide)}
  const banner=document.createElement('div');banner.textContent='테스트 전용 · 실제 입금 금지 · 문자 자동 발송 없음';banner.style.cssText='position:sticky;top:0;z-index:100;padding:12px;background:#fff0b5;color:#392d00;text-align:center;font-weight:800';banner.hidden=true;document.body.prepend(banner);
  const update=()=>{banner.hidden=!channel.textContent.startsWith('[테스트·입금 금지]')};const observer=new MutationObserver(update);observer.observe(channel,{childList:true,characterData:true,subtree:true});update();window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 });
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

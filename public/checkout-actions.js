(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCheckoutActions=api})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
  const channel=document.getElementById('channel-name')||document.getElementById('channel');if(!channel)return;
  const footer=document.createElement('footer');footer.className='site-footer';
  const copyright=document.createElement('small');copyright.textContent='© 옹동2';
  footer.append(copyright);document.querySelector('main')?.append(footer);
  const banner=document.createElement('div');banner.textContent='테스트 전용 · 실제 입금 금지 · 문자 자동 발송 없음';banner.style.cssText='position:sticky;top:0;z-index:100;padding:12px;background:#fff0b5;color:#392d00;text-align:center;font-weight:800';banner.hidden=true;document.body.prepend(banner);
  const update=()=>{banner.hidden=!channel.textContent.startsWith('[테스트·입금 금지]');banner.textContent=channel.dataset.testDelivery==='true'?'테스트 전용 · 실제 입금 금지 · 알림 수신번호 끝자리 8600':'테스트 전용 · 실제 입금 금지 · 알림 자동 발송 없음'};const observer=new MutationObserver(update);observer.observe(channel,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-test-delivery']});update();window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 });
 const digits=value=>String(value||'').replace(/\D/g,'');
 function phoneHref(value){const n=digits(value);return /^0\d{8,10}$/.test(n)?'tel:'+n:''}
 function priority(status){return ({bank_transfer_reported:0,card_payment_reported:0,card_link_pending:1,additional_payment:2,awaiting_information:4,paid:9})[status]??3}
 function paymentConfirmationFeedback(notification={}){
  const base='결제 확인 완료';
  if(notification.status==='link_revoked')return {text:base+' · 구매자 링크 사용 중지',warning:true};
  if(notification.status==='configuration_pending'||notification.configured===false)return {text:base+' · 알림 설정 확인 필요',warning:true};
  if(notification.failed||['failed','expired','delivery_unknown'].includes(notification.status))return {text:base+' · 구매자 알림 확인 필요',warning:true};
  if(notification.suppressed)return {text:base+' · 테스트 알림 꺼짐',warning:false};
  if(['queued','sending'].includes(notification.status))return {text:base+' · 구매자 알림 발송 대기',warning:false};
  if(notification.status==='sent')return {text:base+' · 구매자 알림 접수',warning:false};
  return {text:base,warning:false};
 }
 function paymentReportFeedback(notification={}){
  const base='결제 신고 저장';
  if(notification.skipped==='missing_vendor_phone')return {text:base+' · 업체 연락처가 없어 알림을 보내지 못했어요. 운영자에게 문의해 주세요.',warning:true};
  if(notification.status==='configuration_pending'||notification.configured===false)return {text:base+' · 알림 설정을 운영자가 확인해야 해요.',warning:true};
  if(notification.failed||['failed','expired','delivery_unknown'].includes(notification.status))return {text:base+' · 업체 알림을 확인하지 못했어요. 업체에 문의해 주세요.',warning:true};
  if(notification.suppressed)return {text:base+' · 테스트 알림 꺼짐',warning:false};
  if(['queued','sending'].includes(notification.status))return {text:base+' · 업체 알림 발송 대기',warning:false};
  if(notification.status==='sent')return {text:base+' · 업체 알림 접수',warning:false};
  return {text:base,warning:false};
 }
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
 return {digits,phoneHref,priority,copyAccount,paymentConfirmationFeedback,paymentReportFeedback};
});

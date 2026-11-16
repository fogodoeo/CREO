(function(global){
 'use strict';
 function create({document,request}) {
  const banner=document.createElement('section');banner.className='buyer-delivery-notice';banner.hidden=true;
  banner.setAttribute('aria-label','배송 안내');
  const anchor=document.getElementById('change-banner');
  if(anchor)anchor.after(banner);else document.getElementById('shipping-section').before(banner);
  const dialog=document.createElement('dialog');dialog.className='buyer-delivery-notice-dialog';
  dialog.setAttribute('aria-labelledby','delivery-notice-title');document.body.append(dialog);
  let current=null,shown='',saving=false,returnFocus=null;
  const add=(host,tag,text)=>{const el=document.createElement(tag);el.textContent=text;host.append(el);return el;};
  function content(host,notice) {
   const title=add(host,'h2',notice.title);if(host===dialog)title.id='delivery-notice-title';
   add(host,'p',notice.description);
   if(notice.schedule){const schedule=document.createElement('div');schedule.innerHTML=global.CreoDeliverySchedule.html(notice.schedule);host.append(schedule);}
   add(host,'p',notice.combined);
  }
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  function update(data) {
   const notice=data.deliveryNotice;
   banner.replaceChildren();banner.hidden=!notice&&!data.combinedShipping;
   if(notice){add(banner,'h2',notice.title);add(banner,'p','11/18(수) 방송분과 함께 배송됩니다. 수요일 추가 낙찰분은 합배송해 드립니다.');}
   else if(data.combinedShipping){add(banner,'h2',data.combinedShipping.label);add(banner,'p',data.combinedShipping.review?'수령인·수령지를 확인한 뒤 합배송을 처리합니다.':'월요일과 같은 수령 지점을 선택하면 기본 배송비가 중복 청구되지 않습니다.');}
   current=notice;
   if(!notice){if(dialog.open)dialog.close();return;}
   if(notice.acknowledged||shown===notice.id)return;
   if(document.querySelector('dialog[open]'))return;
   shown=notice.id;dialog.replaceChildren();content(dialog,notice);
   const error=add(dialog,'p','');error.setAttribute('role','alert');
   const button=add(dialog,'button','확인했어요');button.type='button';button.className='delivery-notice-confirm';
   button.onclick=async()=>{
    saving=true;button.disabled=true;error.textContent='';
    try{await request('/delivery-notice-ack',{});if(current)current.acknowledged=true;dialog.close();}
    catch(e){error.textContent='확인을 저장하지 못했어요. 다시 눌러 주세요.';}
    finally{saving=false;button.disabled=false;}
   };
   returnFocus=document.activeElement;dialog.showModal();button.focus();
  }
  return {update};
 }
 global.CreoBuyerDeliveryNotice={create};
})(window);

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoCheckoutInquiry=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function kakaoUrl(value){
  if(typeof value!=='string'||value.length>200||/[\u0000-\u001f\u007f]/.test(value))return '';
  try{const url=new URL(value.trim());if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return '';
   if(url.host==='open.kakao.com')return /^\/(?:o\/s[a-zA-Z0-9_-]{1,80}|me\/[a-zA-Z0-9_-]{1,80})\/?$/.test(url.pathname)?url.origin+url.pathname.replace(/\/$/,''):'';
   if(url.host!=='pf.kakao.com')return '';
   const match=/^\/(_[a-zA-Z0-9]{1,80})(?:\/chat)?\/?$/.exec(url.pathname);return match?'https://pf.kakao.com/'+match[1]+'/chat':'';
  }catch{return '';}
 }
 function contact(vendor){
  if(!vendor||vendor.active===false)return null;
  const phone=String(vendor.phone||'').replace(/[ -]/g,''),number=/^0\d{8,10}$/.test(phone)?phone:'',chat=kakaoUrl(vendor.kakaoUrl);
  if(!number&&!chat)return null;
  return {name:String(vendor.name||'업체').trim().slice(0,100),phone:number,kakaoUrl:chat};
 }
 function inquiryPhone(vendor){
  if(vendor?.inquiryPhoneMode==='shared')return String(vendor.phone||'').replace(/[ -]/g,'');
  // Existing phone-only profiles already exposed this number for inquiry.
  // The first profile save freezes that value separately; new vendors start blank.
  return String(vendor?.inquiryPhone ?? vendor?.phone ?? '').replace(/[ -]/g,'');
 }
 function vendorContact(vendor){return vendor?contact({...vendor,phone:inquiryPhone(vendor)}):null;}
 function inquiryContext(data={}){return {channelId:data.channel?.id||'',channelName:data.channel?.name||'',roundName:data.round?.name||data.channel?.name||'',buyerName:data.buyer?.name||''};}
 function programName(context={}){
  const id=context.channelId||'';
  if(/^clab(?:-|$)/i.test(id))return '씨랩';
  if(/^national-cre(?:-|$)/i.test(id))return '전국크레자랑';
  return String(context.channelName||'경매').trim();
 }
 function inquiryMessage(item,context={}){
  if(typeof context==='string')context={channelName:context,roundName:context};
  return '['+programName(context)+' 개체 문의]\n낙찰자: '+String(context.buyerName||'').trim()+'\n회차: '+String(context.roundName||context.channelName||'').trim()+'\n업체: '+String(item.inquiry?.name||item.vendorName||'업체').trim()+'\n개체: '+rootItemTitle(item)+'\n문의내용: ';
 }
 function smsHref(phone,message,device={}){
  const number=String(phone||'').replace(/[ -]/g,'');
  if(!/^01[016789]\d{7,8}$/.test(number))return '';
  const ios=/iPad|iPhone|iPod/.test(device.userAgent||'')||device.platform==='MacIntel'&&device.maxTouchPoints>1;
  return 'sms:'+number+(ios?'&':'?')+'body='+encodeURIComponent(message);
 }
 function create({document}){
  const dialog=document.createElement('dialog');dialog.className='checkout-inquiry';dialog.setAttribute('aria-labelledby','inquiry-title');
  dialog.innerHTML='<header><h2 id="inquiry-title">업체 문의</h2><button type="button" data-close aria-label="업체 문의 닫기">×</button></header><p class="inquiry-vendor"></p><p class="inquiry-item"></p><div class="inquiry-message"><label for="inquiry-message">보낼 문의 내용</label><textarea id="inquiry-message" rows="7" maxlength="1500" aria-describedby="inquiry-help"></textarea><p id="inquiry-help">성함을 확인하고 문의 내용을 적어 주세요. 문자 앱에서 전송을 눌러야 업체에 전달돼요.</p><button type="button" data-copy-message>문의 내용 복사</button></div><div class="inquiry-actions"><a data-sms>업체에 문자 문의</a><a data-chat target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">카카오톡 문의 <span aria-hidden="true">↗</span></a><a data-call>전화 문의</a></div><p class="inquiry-fallback-help">문자 앱이 열리지 않거나 내용이 비어 있으면 문의 내용을 복사해 붙여넣어 주세요. 카카오톡 문의도 붙여넣기가 필요해요.</p><div class="inquiry-number"><span></span><button type="button" data-copy-phone>번호 복사</button></div><textarea data-copy-fallback rows="3" readonly hidden aria-label="직접 복사할 텍스트"></textarea><p class="inquiry-feedback" role="status"></p>';
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector);let opener=null,phone='',message='',outside=false,version=0;
  const format=value=>value.length===11?value.replace(/(\d{3})(\d{4})(\d{4})/,'$1-$2-$3'):value;
  async function copy(value){const current=version;try{await document.defaultView.navigator.clipboard.writeText(value);if(current===version&&dialog.open){$('[data-copy-fallback]').hidden=true;$('.inquiry-feedback').textContent='복사 완료';}}catch{if(current!==version||!dialog.open)return;const input=$('[data-copy-fallback]');input.hidden=false;input.value=value;input.focus();input.select();$('.inquiry-feedback').textContent='텍스트를 길게 눌러 복사해 주세요.';}}
  const updateSms=()=>{const link=$('[data-sms]'),url=smsHref(phone,message,document.defaultView.navigator);link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');};
  $('#inquiry-message').oninput=()=>{message=$('#inquiry-message').value;updateSms();};
  $('[data-close]').onclick=()=>dialog.close();$('[data-copy-phone]').onclick=()=>copy(phone);$('[data-copy-message]').onclick=()=>copy(message);
  const isOutside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',event=>{outside=isOutside(event);});dialog.addEventListener('click',event=>{if(outside&&isOutside(event))dialog.close();outside=false;});
  dialog.addEventListener('close',()=>{version++;if(opener?.isConnected)opener.focus();});
  return {isOpen:()=>dialog.open,clear(){
   version++;opener=null;phone=message='';outside=false;if(dialog.open)dialog.close();
   for(const selector of ['.inquiry-vendor','.inquiry-item','.inquiry-number span','.inquiry-feedback'])$(selector).textContent='';
   dialog.querySelectorAll('textarea').forEach(input=>input.value='');dialog.querySelectorAll('a').forEach(link=>link.removeAttribute('href'));
  },open(item,context,trigger){
   const vendor=contact(item.inquiry);if(!vendor)return;version++;opener=trigger;phone=vendor.phone;
   const title=String(rootItemTitle(item));message=inquiryMessage(item,context);$('#inquiry-title').textContent=programName(typeof context==='string'?{channelName:context}:context)+' 개체 문의';
   $('.inquiry-vendor').textContent=vendor.name;$('.inquiry-item').textContent=title;$('#inquiry-message').value=message;$('[data-copy-fallback]').hidden=true;$('.inquiry-feedback').textContent='';updateSms();
   for(const [selector,url]of [['[data-chat]',vendor.kakaoUrl],['[data-call]',phone?'tel:'+phone:'']]){const link=$(selector);link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');}
   $('.inquiry-number').hidden=!phone;$('.inquiry-number span').textContent=format(phone);if(!dialog.open)dialog.showModal();
  }};
 }
 function rootItemTitle(item){const title=typeof window!=='undefined'&&window.CreoCheckoutItemView?.itemTitle;return title?title(item):item.displayNumber||item.name||'개체';}
 return {kakaoUrl,contact,inquiryPhone,vendorContact,inquiryContext,programName,inquiryMessage,smsHref,create};
});

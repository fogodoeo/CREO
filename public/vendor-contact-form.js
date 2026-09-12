(function(root){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const digits=value=>String(value||'').replace(/[ -]/g,'');
 function markup(profile,{prefix='profile',compact=false}={}){
  const separate=Boolean(digits(profile.phone)||digits(profile.inquiryPhone))&&(profile.inquiryPhoneMode==='separate'||(profile.inquiryPhoneMode!=='shared'&&profile.inquiryPhone!==undefined&&digits(profile.inquiryPhone)!==digits(profile.phone)));
  return `<div class="vendor-contact-settings" data-contact-prefix="${prefix}">
   <label class="field" for="${prefix}-phone"><span>업체 연락처</span><input id="${prefix}-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="14" value="${esc(profile.phone)}" placeholder="010-0000-0000" aria-describedby="${prefix}-phone-hint ${prefix}-phone-error"><span class="field-error" id="${prefix}-phone-error" hidden></span><small id="${prefix}-phone-hint" class="muted"></small></label>
   <label class="contact-separate"><input id="${prefix}-separate" type="checkbox" ${separate?'checked':''} aria-controls="${prefix}-inquiry-panel"><span>문의 담당자 따로 설정</span></label>
   <div id="${prefix}-inquiry-panel" class="contact-inquiry-panel" ${separate?'':'hidden'}><label class="field" for="${prefix}-inquiry"><span>문의 담당자 전화</span><input id="${prefix}-inquiry" type="tel" inputmode="tel" maxlength="14" value="${esc(profile.inquiryPhone??'')}" placeholder="문의받을 직원 번호" aria-describedby="${prefix}-inquiry-error ${prefix}-inquiry-hint"><span class="field-error" id="${prefix}-inquiry-error" hidden></span><small class="muted" id="${prefix}-inquiry-hint">비워두면 전화 문의를 표시하지 않아요</small></label></div>
   ${compact?'':`<details class="contact-kakao"><summary>카카오톡 상담 <small>${profile.kakaoUrl?'등록됨':'선택'}</small></summary><label class="field" for="${prefix}-kakao"><span>문의받을 카카오톡 링크</span><input id="${prefix}-kakao" type="url" inputmode="url" maxlength="200" value="${esc(profile.kakaoUrl)}" placeholder="https://open.kakao.com/…"><small class="muted">개인 1:1 오픈채팅 또는 업체 채널</small></label></details>`}
  </div>`;
 }
 function bind(container){
  const prefix=container.dataset.contactPrefix,$=name=>container.querySelector('#'+prefix+'-'+name);
  const sync=()=>{const separate=$('separate').checked;$('inquiry-panel').hidden=!separate;$('separate').setAttribute('aria-expanded',String(separate));$('phone-hint').textContent=separate?'낙찰·결제 알림을 받아요':'업무 알림과 구매자 전화 문의를 받아요';if(!separate){$('inquiry').removeAttribute('aria-invalid');$('inquiry-error').hidden=true;}};
  $('separate').addEventListener('change',sync);sync();
 }
 function read(container){
  const prefix=container.dataset.contactPrefix,$=name=>container.querySelector('#'+prefix+'-'+name),phone=digits($('phone').value),separate=$('separate').checked;
  return {phone,inquiryPhoneMode:separate?'separate':'shared',inquiryPhone:separate?digits($('inquiry').value):phone,...($('kakao')?{kakaoUrl:$('kakao').value.trim()}: {})};
 }
 root.CreoVendorContactForm={markup,bind,read};
})(window);

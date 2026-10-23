(function(root){
 'use strict';
 function create({document,getData,isBusy,setBusy,request,apply,refresh,requestId,onFinish}){
  const money=value=>Number(value||0).toLocaleString('ko-KR')+'원',drafts=new Map(),pending=new Map();let snapshot=null,opener=null,working=false,conflict=false;
  const dialog=document.createElement('dialog');dialog.className='vendor-payment-work';dialog.setAttribute('aria-labelledby','vendor-payment-work-title');
  dialog.innerHTML='<form novalidate><header><p data-round></p><h2 id="vendor-payment-work-title"></h2></header><div class="vendor-payment-body"><p class="vendor-payment-person" data-person></p><strong class="vendor-payment-amount" data-amount></strong><p data-help></p><fieldset data-card-fields><legend>안내 방법</legend><label><input type="radio" name="notice" value="link" checked> 결제 링크 보내기</label><label><input type="radio" name="notice" value="external"> 다른 결제 앱에서 이미 보냈어요</label><label class="vendor-payment-url" for="vendor-payment-url">카드결제 링크<input id="vendor-payment-url" type="url" inputmode="url" placeholder="https://" autocomplete="off" aria-describedby="vendor-payment-work-error"></label><p data-external hidden></p></fieldset><label class="vendor-payment-check" data-check-label><input type="checkbox" data-check><span data-check-text></span></label><div id="vendor-payment-work-error" role="alert" tabindex="-1" hidden><p data-error-message></p><button type="button" data-reload hidden>최신 정보 불러오기</button></div></div><footer><button type="button" data-back>돌아가기</button><button type="submit" data-submit></button></footer></form>';
  document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('form');
  const scope=data=>JSON.stringify([data?.channel?.id,data?.round?.key||'',data?.vendor?.id]);
  const key=(data,buyerId,mode)=>JSON.stringify([scope(data),buyerId,mode]);
  const due=b=>b.payment.shippingChangedAfterReport?Math.max(0,b.totals.totalAmount-(b.payment.confirmedAmount||0)):(b.payment.confirmationDue??b.payment.additionalDue??b.totals.totalAmount);
  function allowed(data,buyer,mode){if(!buyer||buyer.changePending||!buyer.destination||buyer.payment.status==='paid'||(data.channel.checkoutOpen!==true&&data.channel.status!=='active'))return false;const p=buyer.payment;if(mode==='cancel')return !!p.cardLinkCancellationRequired;if(p.cardLinkCancellationRequired)return false;if(mode==='card')return p.method==='card'&&!p.cardPaymentUrl&&p.cardNoticeMethod!=='external';return p.method==='bank_transfer'||p.method==='card'&&!!(p.cardPaymentUrl||p.cardNoticeMethod==='external');}
  function label(){return snapshot?.mode==='card'?($('[value="external"]').checked?'발송 완료로 표시':'링크 보내기'):snapshot?.mode==='cancel'?'취소 완료로 표시':'결제 확인 완료';}
  function controls(){const uncertain=snapshot&&pending.has(snapshot.key);for(const el of form.querySelectorAll('button,input'))el.disabled=working;form.setAttribute('aria-busy',String(working));if(uncertain||conflict)form.querySelectorAll('input').forEach(el=>el.disabled=true);$('[data-submit]').disabled=working||conflict||(!uncertain&&snapshot?.mode!=='card'&&!$('[data-check]').checked);$('[data-submit]').textContent=working?'처리 중…':uncertain?'다시 확인':label();}
  function read(){return {method:$('[value="external"]').checked?'external':'link',url:$('#vendor-payment-url').value,checked:$('[data-check]').checked};}
  function remember(){if(snapshot&&snapshot.mode==='card'&&!pending.has(snapshot.key))drafts.set(snapshot.key,read());}
  function fieldMode(){const external=$('[value="external"]').checked;$('.vendor-payment-url').hidden=external;$('[data-external]').hidden=!external;controls();}
  function error(message,stale=false,field){conflict=stale;$('[data-error-message]').textContent=message;$('#vendor-payment-work-error').hidden=false;$('[data-reload]').hidden=!stale;controls();if(field){field.setAttribute('aria-invalid','true');field.focus();}else $('#vendor-payment-work-error').focus();}
  function close(){if(working)return;remember();dialog.close();}
  dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();else remember();});
  dialog.addEventListener('close',()=>{snapshot=null;if(opener?.isConnected)opener.focus();opener=null;});
  $('[data-back]').onclick=close;form.oninput=()=>{remember();fieldMode();};form.onchange=()=>{remember();fieldMode();};
  $('[data-reload]').onclick=async()=>{if(working)return;working=true;setBusy(true);controls();let ok=false;try{ok=await refresh();}catch{}finally{working=false;setBusy(false);}if(ok){pending.delete(snapshot.key);drafts.delete(snapshot.key);dialog.close();document.getElementById('action-count')?.closest('h2')?.focus();}else error('정보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',true);};
  form.onsubmit=async event=>{
   event.preventDefault();if(working||!snapshot||conflict)return false;
   const data=getData(),buyer=data.buyers.find(b=>b.id===snapshot.buyerId),prior=pending.get(snapshot.key);
   if(scope(data)!==snapshot.scope||!buyer||(!prior&&(buyer.payment.editVersion!==snapshot.version||!allowed(data,buyer,snapshot.mode)))){error('결제 정보가 바뀌었어요. 최신 내용을 확인한 뒤 다시 진행해 주세요.',true);return false;}
   const input=read();let body,route;
   if(!prior){
    if(snapshot.mode==='card'){
     if(input.method==='link'){let url;try{url=new URL(input.url.trim());}catch{}if(!url||url.protocol!=='https:'||url.username||url.password){error('https://로 시작하는 카드결제 링크를 입력해 주세요.',false,$('#vendor-payment-url'));return false;}}
     route='/card-link';body={buyerId:buyer.id,cardPaymentUrl:input.method==='link'?input.url.trim():'',cardNoticeMethod:input.method,expectedAmount:buyer.totals.totalAmount,expectedVersion:buyer.payment.editVersion,expectedCardCancellationVersion:buyer.payment.cardCancellationVersion,confirmedOldCardLinkCancelled:false,requestId:requestId()};
    }else{if(!input.checked)return false;route=snapshot.mode==='cancel'?'/confirm-card-cancellation':'/confirm-payment';body=snapshot.mode==='cancel'?{buyerId:buyer.id,confirmed:true,expectedCardCancellationVersion:buyer.payment.cardCancellationVersion||''}:{buyerId:buyer.id,requestId:requestId(),expectedVersion:buyer.payment.editVersion,shippingAmountReviewed:!!buyer.payment.shippingChangedAfterReport,expectedAmount:buyer.totals.totalAmount};}
   }
   const operation=prior||{route,body};pending.set(snapshot.key,operation);working=true;setBusy(true);conflict=false;$('#vendor-payment-work-error').hidden=true;$('#vendor-payment-url').removeAttribute('aria-invalid');controls();
   let failure;try{if(!operation.result)operation.result=await request(operation.route,operation.body);apply(operation.result);}catch(e){failure=e;if(!operation.result&&e.status>=400&&e.status<500)pending.delete(snapshot.key);}finally{working=false;setBusy(false);controls();}
   if(failure){error(operation.result?'저장은 완료됐어요. 다시 확인을 눌러 화면을 갱신해 주세요.':failure.message||'처리 결과를 확인하지 못했어요. 다시 확인해 주세요.',!operation.result&&[401,403,404,409,410].includes(failure.status));return false;}
   const finished={...snapshot};pending.delete(snapshot.key);drafts.delete(snapshot.key);dialog.close();onFinish(operation.result,finished.buyerId,finished.mode);return true;
  };
  const currentScope=k=>JSON.parse(k)[0]===scope(getData());
  return {isOpen:()=>dialog.open,hasDraft:()=>dialog.open||[...drafts].some(([k,v])=>currentScope(k)&&(v.url.trim()||v.method==='external'))||[...pending.keys()].some(currentScope),clear(buyerId){for(const mode of ['card','confirm','cancel']){drafts.delete(key(getData(),buyerId,mode));pending.delete(key(getData(),buyerId,mode));}},open(mode,buyerId,trigger){
   if(working||isBusy()||dialog.open)return;const data=getData(),buyer=data.buyers.find(b=>b.id===buyerId),k=key(data,buyerId,mode),prior=pending.get(k);if(!buyer||!prior&&!allowed(data,buyer,mode))return;
   snapshot={mode,buyerId,key:k,scope:scope(data),version:buyer?.payment.editVersion};opener=trigger||document.activeElement;conflict=false;
   const draft=drafts.get(k)||{method:'link',url:'',checked:false};$('[value="link"]').checked=draft.method!=='external';$('[value="external"]').checked=draft.method==='external';$('#vendor-payment-url').value=draft.url;$('[data-check]').checked=false;
   $('[data-round]').textContent=data.round?.name||data.channel.name;$('[data-person]').textContent=buyer.name;$('#vendor-payment-work-title').textContent=mode==='card'?'카드결제 안내':mode==='cancel'?'이전 카드 안내 취소 확인':'실제 결제 확인';$('[data-amount]').textContent=money(mode==='confirm'?due(buyer):buyer.totals.totalAmount);
   $('[data-card-fields]').hidden=mode!=='card';$('[data-check-label]').hidden=mode==='card';$('[data-check-text]').textContent=mode==='cancel'?'결제 앱에서 이전 링크·요청을 취소하거나 차단했어요':buyer.payment.shippingChangedAfterReport?'변경된 배송비를 포함한 위 금액의 실제 결제를 확인했어요':'은행·결제 앱에서 위 금액이 들어온 것을 확인했어요';
   $('[data-help]').textContent=mode==='card'?'이 구매자와 위 금액에 맞는 결제 안내를 등록해 주세요.':mode==='cancel'?'외부 결제 앱에서 먼저 취소해 주세요. 여기서는 취소 여부만 기록해요.':(buyer.payment.method==='bank_transfer'?'계좌이체':'카드결제')+' 내역을 확인한 뒤 완료해 주세요.';
   $('[data-external]').textContent=[buyer.phone,money(buyer.totals.totalAmount),'다른 결제 앱에서 직접 보낸 뒤 완료로 표시해 주세요.'].filter(Boolean).join(' · ');$('#vendor-payment-work-error').hidden=true;$('#vendor-payment-url').removeAttribute('aria-invalid');fieldMode();dialog.showModal();$('[data-back]').focus();if(prior)error('이전 요청의 처리 결과를 먼저 확인할게요. 다시 확인을 눌러 주세요.');
  }};
 }
 root.CreoVendorPaymentWork={create};
})(window);

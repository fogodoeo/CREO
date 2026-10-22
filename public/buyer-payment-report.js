(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBuyerPaymentReport=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function create({document,getCheckout,canReport,getAmount,request,apply,setBusy,refresh,requestId,onFinish}){
  const dialog=document.createElement('dialog');dialog.className='buyer-payment-report';dialog.setAttribute('aria-labelledby','payment-report-title');
  dialog.innerHTML='<h2 id="payment-report-title"></h2><p data-vendor></p><strong class="report-amount" data-amount></strong><p data-account></p><p data-help></p><div class="report-error" data-error role="alert" tabindex="-1" hidden><b data-error-title>요청 결과를 확인하지 못했어요</b><p data-error-message></p><button type="button" data-reload hidden>최신 정보 불러오기</button></div><div class="report-actions"><button type="button" data-cancel>돌아가기</button><button type="button" data-confirm></button></div>';
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector),pending=new Map();let snapshot=null,opener=null,busy=false;
  const scope=data=>JSON.stringify([data.channel?.id,data.round?.key||'']);
  function controls(value){busy=value;for(const control of dialog.querySelectorAll('button'))control.disabled=value;}
  function error(message,conflict=false){
   $('[data-error]').hidden=false;$('[data-error-message]').textContent=message;
   $('[data-reload]').hidden=!conflict;$('[data-confirm]').disabled=conflict;
   $('[data-confirm]').textContent='다시 요청';$('[data-error]').focus();
  }
  function close(){if(!busy)dialog.close();}
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{snapshot=null;if(opener?.isConnected)opener.focus();opener=null;});
  $('[data-cancel]').onclick=close;
  $('[data-reload]').onclick=async()=>{
   if(busy)return;controls(true);setBusy(true);let loaded=false;
   try{loaded=await refresh();}catch{}finally{setBusy(false);controls(false);}
   if(loaded){dialog.close();document.getElementById('flow-title')?.focus();}else error('정보를 불러오지 못했어요. 연결을 확인한 뒤 다시 불러와 주세요.',true);
  };
  $('[data-confirm]').onclick=async()=>{
   if(busy||!snapshot)return;
   const data=getCheckout(),vendor=data.vendors.find(v=>v.key===snapshot.vendorKey);
   if(scope(data)!==snapshot.scope||data.editVersion!==snapshot.version||!vendor||!canReport(vendor))return error('결제 정보가 변경됐어요. 최신 내용을 확인한 뒤 다시 요청해 주세요.',true);
   const key=JSON.stringify([snapshot.scope,vendor.key]),prior=pending.get(key);
   const body=prior?.expectedVersion===snapshot.version?prior:{requestId:requestId(),vendorKey:vendor.key,expectedVersion:snapshot.version};
   pending.set(key,body);controls(true);$('[data-error]').hidden=true;$('[data-confirm]').textContent='요청 중…';setBusy(true);
   let result,failure;
   try{result=await request(body);apply(result);pending.delete(key);}catch(e){failure=e;if(e.status&&e.status<500)pending.delete(key);}
   finally{setBusy(false);controls(false);}
   if(failure)return error(failure.message||'연결을 확인한 뒤 다시 요청해 주세요.',[401,403,404,409,410].includes(failure.status));
   const vendorKey=snapshot.vendorKey;dialog.close();onFinish(result,vendorKey);
  };
  return {isOpen:()=>dialog.open,open(vendorKey,trigger){
   if(busy||dialog.open)return;const data=getCheckout(),vendor=data.vendors.find(v=>v.key===vendorKey);if(!vendor||!canReport(vendor))return;
   snapshot={vendorKey,scope:scope(data),version:data.editVersion};opener=trigger;
   const bank=vendor.payment.method==='bank_transfer',account=vendor.payment.account||{};
   $('#payment-report-title').textContent=bank?'입금을 마치셨나요?':'카드결제를 마치셨나요?';
   $('[data-vendor]').textContent=vendor.name;$('[data-amount]').textContent=Number(getAmount(vendor)||0).toLocaleString('ko-KR')+'원';
   $('[data-account]').hidden=!bank;$('[data-account]').textContent=bank?[account.bankName,account.accountNumber,account.holder].filter(Boolean).join(' · '):'';
   $('[data-help]').textContent=bank?'실제 입금 후 눌러 주세요. 업체가 입금을 확인하면 완료돼요.':'카드결제가 끝난 뒤 눌러 주세요. 업체가 확인하면 완료돼요.';
   $('[data-error]').hidden=true;controls(false);$('[data-confirm]').textContent=bank?'입금했어요':'결제를 마쳤어요';dialog.showModal();$('[data-cancel]').focus();
  }};
 }
 return {create};
});

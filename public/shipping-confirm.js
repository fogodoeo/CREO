'use strict';
window.confirmShippingSettlement = function(title,amount,action){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='settlement-dialog';
  const heading=document.createElement('h2');heading.id='settlement-confirm-title';heading.textContent=title;
  const value=document.createElement('div');value.className='settlement-amount';value.textContent=amount;
  const actions=document.createElement('div');actions.className='settlement-actions';
  const cancel=document.createElement('button');cancel.className='settlement-secondary';cancel.textContent='취소';cancel.onclick=()=>dialog.close();
  const submit=document.createElement('button');submit.className='settlement-primary';submit.textContent=action;submit.onclick=()=>dialog.close('yes');
  actions.append(cancel,submit);dialog.append(heading,value,actions);dialog.setAttribute('aria-labelledby',heading.id);
  dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='yes';dialog.remove();resolve(accepted)},{once:true});
  document.body.append(dialog);dialog.showModal();cancel.focus();
 });
};

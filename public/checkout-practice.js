(function(root){
 'use strict';
 const initial=()=>({stage:'new',method:'bank',destination:''});
 function transition(state,action,value){
  if(action==='reset')return initial();
  if(action==='save'&&state.stage==='new'&&['pickup','delivery'].includes(value.destination)&&['bank','card'].includes(value.method))return{stage:value.method==='card'?'link_pending':'ready',method:value.method,destination:value.destination};
  if(action==='link'&&state.stage==='link_pending')return{...state,stage:'ready'};
  if(action==='report'&&state.stage==='ready')return{...state,stage:'reported'};
  if(action==='confirm'&&state.stage==='reported')return{...state,stage:'paid'};
  return state;
 }
 const api={initial,transition};if(typeof module==='object')module.exports=api;else root.CheckoutPractice=api;
})(typeof window==='object'?window:globalThis);

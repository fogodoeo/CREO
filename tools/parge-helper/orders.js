// Reads only the visible completion page. No network calls, payment actions or hidden application state.
(()=>{'use strict';
 window.CreoPargeOrders={read(){
  try{
   if(location.origin!=='https://parge.co.kr'||location.pathname!=='/booking')throw Error('파르게 배송신청 완료 화면을 열어 주세요.');
   const visible=el=>Boolean(el.getClientRects().length);
   if(![...document.querySelectorAll('h1,h2,h3')].some(el=>visible(el)&&el.textContent.trim()==='배송 신청이 완료되었습니다!'))throw Error('주문번호가 표시된 배송신청 완료 화면에서 불러와 주세요.');
   const heading=[...document.querySelectorAll('p')].find(el=>visible(el)&&el.textContent.trim()==='맡김일 안내');
   if(!heading)throw Error('주문번호 목록을 읽지 못했어요. 번호를 직접 확인해 입력해 주세요.');
   const orders=[...heading.parentElement.children].filter(el=>el!==heading&&visible(el)).map(el=>{
    const m=el.textContent.trim().match(/^([a-zA-Z0-9][a-zA-Z0-9_-]{3,79})\s*·\s*(.+)$/);
    if(!m)throw Error('파르게 주문 표시 형식이 변경됐어요. 번호를 직접 확인해 주세요.');
    return {orderNumber:m[1],handoverLabel:m[2]};
   });
   if(!orders.length||orders.length>100||new Set(orders.map(o=>o.orderNumber)).size!==orders.length)throw Error('주문번호 목록을 확인해 주세요.');
   return {orders,requiresRecipientMatch:true};
  }catch(e){return {error:e.message};}
 }};
})();

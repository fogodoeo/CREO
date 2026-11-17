// November booking UI. DOM-only: never reads React state, credentials or payment data.
(function(root){'use strict';
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim(),digits=v=>String(v||'').replace(/\D/g,'');
 const all=(s,q)=>[...s.querySelectorAll(q)],buttons=s=>all(s,'button');
 const one=(rows,label)=>{if(rows.length!==1)throw Error('파르게 입력란을 확인해 주세요: '+label);return rows[0];};
 const button=(s,t)=>one(buttons(s).filter(b=>clean(b.textContent)===t),t);
 const labelText=l=>clean([...l.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' '));
 const field=(s,t)=>one(all(s,'label').filter(l=>labelText(l)===t).flatMap(l=>all(l,'input,select')),t);
 const cards=()=>all(document,'.v2-panel').filter(p=>all(p,'label').some(l=>labelText(l)==='받는 분 이름'));
 const sender=()=>one(all(document,'.v2-panel').filter(p=>p.querySelector('input[placeholder="매장에 맡기는 분"]')),'맡기는 분');
 const present=()=>!!document.querySelector('input[placeholder="매장에 맡기는 분"]');
 function draftEmpty(){const rows=cards();if(rows.length!==1)throw Error('작성 중인 배송 내용이 있어요. 새 신청 화면에서 실행해 주세요.');const c=rows[0];if(['받는 분 이름','받는 분 연락처','분양가 (원) *','요청사항'].some(t=>field(c,t).value)||Number(field(c,'마릿수').value)!==1||all(c,'select').length!==1||!buttons(c).some(b=>clean(b.textContent)==='도착 매장 선택')||/선택됨:/.test(c.textContent))throw Error('작성 중인 배송 내용이 있어요. 새 신청 화면에서 실행해 주세요.');}
 function noCart(){if(buttons(document).some(b=>/^확인\s*\(\d+\)$/.test(clean(b.textContent))||clean(b.textContent)==='← 배송 추가하기'))throw Error('기존 장바구니가 있어요. 먼저 예약 내역을 확인해 주세요.');}
 function selectedDate(c,date){const [y,m,d]=date.split('-').map(Number);return clean(c.textContent).includes(`선택됨: ${y}년 ${m}월 ${d}일`);}
 async function choose(scope,kind,shop,h){
  h.click(button(scope,kind+' 매장 선택'));
  const dialog=await h.until(()=>all(document,'[role="dialog"]').find(d=>clean(d.querySelector('h3')?.textContent)===kind+' 매장'));
  await h.fill(one(all(dialog,'input[placeholder="매장명 검색"]'),'매장명 검색'),shop);
  const matches=()=>buttons(dialog).filter(b=>clean(b.textContent)===shop);
  const tabs=buttons(dialog).filter(b=>!b.querySelector('img')&&b!==button(dialog,'닫기')&&clean(b.textContent)!==shop);
  let found=matches();
  for(const tab of tabs){if(found.length)break;h.click(tab);await new Promise(r=>setTimeout(r,100));found=matches();}
  h.click(one(found,shop));await h.until(()=>!document.contains(dialog));
 }
 async function prepare(h){
  if(!present())throw Error('로그인한 파르게 작성 화면에서 실행해 주세요.');
  if(document.querySelector('[role="dialog"]'))throw Error('파르게 팝업을 닫고 다시 실행해 주세요.');
  draftEmpty();noCart();
  const current=buttons(document).filter(b=>clean(b.textContent).startsWith('출발 변경 · '));
  if(current.length){if(current.length!==1||clean(current[0].textContent)!=='출발 변경 · 크레오 대구본점')throw Error('출발 매장이 달라요. 크레오 대구본점을 확인해 주세요.');}
  else await choose(document,'출발','크레오 대구본점',h);
  await h.until(()=>cards()[0]?.textContent.includes('년'));
  if(!buttons(document).some(b=>clean(b.textContent)==='출발 변경 · 크레오 대구본점'))throw Error('출발 매장을 확인하지 못했어요.');
  draftEmpty();return cards()[0];
 }
 async function resolveDate(options,h){
  const c=await prepare(h);
  if(options?.specialPickup)throw Error('월요일 방송은 특별 수거 대상이에요. 다음 일요일로 자동 접수하지 않습니다. 파르게와 특별 수거 예약일을 확인해 주세요.');
  if(!clean(c.textContent).includes('일요일만 선택 가능'))throw Error('일요일 맡김 일정이 아니에요. 파르게 일정을 확인해 주세요.');
  const date=await h.earliestDate(c);if(new Date(date+'T00:00:00Z').getUTCDay()!==0)throw Error('일요일 맡김일을 확인하지 못했어요.');
  return {date,layout:'202611',label:'일요일 맡김 · 목요일 도착'};
 }
 async function run(plan,h){
  const c=await prepare(h);
  if(new Date(plan.date+'T00:00:00Z').getUTCDay()!==0)throw Error('새 파르게 화면은 일요일 맡김만 자동 입력해요. 특별 수거는 날짜 확인이 필요해요.');
  const orderer=one(all(document,'.v2-panel').filter(p=>all(p,'input[aria-readonly="true"]').length===2),'주문자');
  const original=all(orderer,'input').map(e=>e.value);
  const s=sender();await h.fill(field(s,'이름 또는 상호'),plan.senderName);
  const phone=plan.senderPhone;if(!/^01[016789]\d{7,8}$/.test(phone))throw Error('파르게는 맡기는 분의 휴대폰 번호가 필요해요.');
  const phoneFormat=p=>p.replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3');
  await h.fill(field(s,'연락처'),phoneFormat(phone));
  for(const [i,g] of plan.groups.entries()){
   if(i){h.click(button(document,'＋ 다른 도착지 추가'));await h.until(()=>cards().length===i+1);}
   const card=i?cards()[i]:c;h.report(`${i+1}/${plan.groups.length}건 입력 중`);
   await h.calendar(card,plan.date);await choose(card,'도착',g.shop,h);
   await h.fill(field(card,'받는 분 이름'),g.name);await h.fill(field(card,'받는 분 연락처'),phoneFormat(g.phone));
   const species=field(card,'종류');if(species.value!=='크레스티드게코')throw Error('개체 종류를 확인해 주세요.');
   await h.fill(field(card,'마릿수'),g.quantity);await h.fill(field(card,'분양가 (원) *'),g.price);await h.fill(field(card,'요청사항'),g.memo);
  }
  for(const [i,g]of plan.groups.entries()){
   const card=cards()[i];if(field(card,'받는 분 이름').value!==g.name||digits(field(card,'받는 분 연락처').value)!==g.phone||Number(field(card,'마릿수').value)!==g.quantity||Number(field(card,'분양가 (원) *').value)!==g.price||field(card,'요청사항').value!==g.memo||field(card,'종류').value!==g.species||!buttons(card).some(b=>clean(b.textContent)==='도착 · '+g.shop)||!selectedDate(card,plan.date))throw Error('입력값이 맞지 않아 장바구니 담기를 멈췄어요.');
  }
  if(cards().length!==plan.groups.length||field(s,'이름 또는 상호').value!==plan.senderName||digits(field(s,'연락처').value)!==phone||all(orderer,'input').some((e,i)=>e.value!==original[i]))throw Error('주문자·맡기는 분 정보를 확인해 주세요.');
  await h.reserve();h.click(button(document,'장바구니에 담고 확인'));
  await h.until(()=>buttons(document).some(b=>clean(b.textContent)==='← 배송 추가하기'),'장바구니 반영 여부를 확인하지 못했어요.');
  const cart=one(all(document,'.v2-panel').filter(p=>all(p,'.v2-kicker').some(k=>clean(k.textContent)==='장바구니')),'장바구니');
  const rows=buttons(cart).filter(b=>clean(b.textContent)==='삭제').map(b=>b.parentElement);
  if(rows.length!==plan.groups.length)throw Error('장바구니 건수를 직접 확인해 주세요.');
  const remaining=rows.slice();for(const g of plan.groups){const match=remaining.findIndex(r=>clean(r.querySelector('b')?.textContent)==='크레오 대구본점 → '+g.shop&&all(r,'div').some(d=>new RegExp('^'+g.quantity+'마리\\s*·').test(clean(d.textContent))));if(match<0)throw Error('장바구니 도착지·마릿수를 확인해 주세요.');remaining.splice(match,1);}
  // New provider cart hides recipient and sale price. Do not claim a full cart audit.
  h.report('입력·장바구니 건수 확인 완료 · 새 파르게 장바구니는 수령인·분양가를 표시하지 않아요. 확인 후 직접 예약해 주세요.');
  return {attempted:true,cartVerified:false,formVerified:true,cartSummaryVerified:true,count:plan.groups.length};
 }
 root.CreoPargeFormV2={present,resolveDate,run};
})(window);

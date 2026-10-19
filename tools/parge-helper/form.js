(function(root){'use strict';if(root.CreoPargeForm?.version==='1.1.0')return;
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();let running=false;
 const all=(scope,selector)=>[...scope.querySelectorAll(selector)],buttons=scope=>all(scope,'button');
 function button(scope,label){const rows=buttons(scope).filter(b=>clean(b.textContent)===label||b.getAttribute('aria-label')===label);if(rows.length!==1)throw Error('파르게 화면이 달라졌어요: '+label);return rows[0];}
 function click(el){if(!el||el.disabled)throw Error('선택할 수 없는 항목이에요. 파르게 화면을 확인해 주세요.');el.click();}
 async function until(fn,message){for(let i=0;i<100;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error(message||'입력 화면 응답이 없어요. 새로고침 후 다시 확인해 주세요.');}
 function field(scope,placeholder){const rows=all(scope,'input').filter(e=>e.getAttribute('placeholder')===placeholder);if(rows.length!==1)throw Error('입력란을 찾을 수 없어요: '+placeholder);return rows[0];}
 async function fill(el,value){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,60));if(el.value!==String(value))throw Error('입력값이 저장되지 않았어요.');}
 function cards(){return all(document,'input[placeholder="이름"]').map(input=>{let n=input.parentElement;while(n&&!(n.querySelector('h3')&&n.querySelectorAll('input[placeholder="이름"]').length===1))n=n.parentElement;if(!n)throw Error('배송지 입력 구조가 변경됐어요.');return n;});}
 function quantity(card){const b=button(card,'마릿수 한 마리 늘리기'),raw=clean(b.parentElement.textContent).replace(/[−+\s]/g,'');if(!/^\d+$/.test(raw))throw Error('마릿수 표시를 확인할 수 없어요.');return Number(raw);}
 function selectedDate(card,date){const [y,m,d]=date.split('-').map(Number);return clean(card.textContent).includes(`선택됨: ${y}년 ${m}월 ${d}일`);}
 function cartRows(){const aside=document.querySelector('aside');if(!aside)return [];return buttons(aside).filter(b=>clean(b.textContent)==='삭제').map(b=>{let n=b.parentElement;while(n&&n!==aside&&!n.textContent.includes('받는분:'))n=n.parentElement;if(!n||n===aside)throw Error('장바구니 구조가 바뀌었어요.');return clean(n.textContent).replace(/^배송\s*\d+\s*/,'');});}
 async function calendar(card,date){const [y,m,d]=date.split('-').map(Number),target=y*12+m;for(let i=0;i<25;i++){const match=card.textContent.match(/(\d{4})년\s*(\d{1,2})월/);if(!match)throw Error('맡김일 달력을 찾을 수 없어요.');const current=Number(match[1])*12+Number(match[2]);if(current===target){click(button(card,String(d)));await until(()=>selectedDate(card,date),'맡김일이 반영되지 않았어요.');return;}const old=match[0];click(button(card,current<target?'다음 달':'이전 달'));await until(()=>!card.textContent.includes(old));}throw Error('맡김일이 너무 멀어요.');}
 async function earliestDate(card,now=new Date()){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const [year,month]=today.split('-').map(Number),start=year*12+month;
  // Start at this month even if the user previously browsed a later month.
  for(let step=0;step<25;step++){
   const match=card.textContent.match(/(\d{4})년\s*(\d{1,2})월/);
   if(!match)throw Error('맡김일 달력을 찾을 수 없어요.');
   const y=Number(match[1]),m=Number(match[2]),current=y*12+m;
   if(current===start)break;
   if(step===24)throw Error('현재 달의 맡김일을 확인할 수 없어요.');
   click(button(card,current>start?'이전 달':'다음 달'));
   await until(()=>!card.textContent.includes(match[0]));
  }
  for(let step=0;step<12;step++){
   const match=card.textContent.match(/(\d{4})년\s*(\d{1,2})월/);
   if(!match)throw Error('맡김일 달력을 찾을 수 없어요.');
   const y=Number(match[1]),m=Number(match[2]);
   const available=buttons(card).filter(b=>!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&/^\d{1,2}$/.test(clean(b.textContent))).map(b=>{
    const d=Number(clean(b.textContent)),date=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()&&date>=today?date:null;
   }).filter(Boolean).sort();
   if(available.length)return available[0];
   const next=button(card,'다음 달');if(next.disabled||step===11)break;
   click(next);await until(()=>!card.textContent.includes(match[0]));
  }
  throw Error('선택 가능한 맡김일이 없어요. 파르게 일정을 확인해 주세요.');
 }
 async function resolveDate(){
  if(running)return {error:'이미 입력 중이에요.'};running=true;
  try{
   if(location.origin!=='https://parge.co.kr'||location.pathname!=='/booking')throw Error('파르게 배송신청 화면에서 실행해 주세요.');
   if(!buttons(document).some(b=>clean(b.textContent)==='로그아웃'))throw Error('파르게에 먼저 로그인해 주세요.');
   if(document.querySelector('[role="dialog"]'))throw Error('파르게 안내 팝업을 닫고 다시 실행해 주세요.');
   if(!document.querySelector('input[placeholder="이름 (또는 샵명)"]')){click(button(document,'크레오 대구본점'));await until(()=>document.querySelector('input[placeholder="이름 (또는 샵명)"]'));}
   const originText=all(document,'p').find(p=>clean(p.textContent)==='출발지 선택 완료')?.parentElement?.textContent||'';
   if(!originText.includes('크레오 대구본점'))throw Error('출발지를 크레오 대구본점으로 선택해 주세요.');
   const rows=cards();if(rows.length!==1||field(rows[0],'이름').value||field(rows[0],'연락처').value||field(rows[0],'예: 150000').value||quantity(rows[0])!==1||!rows[0].textContent.includes('위 버튼으로 도착 매장을 지정해 주세요.')||!rows[0].textContent.includes('위 달력에서 맡김일을 눌러 선택해 주세요.'))throw Error('작성 중인 배송 내용이 있어요. 새 배송신청 화면에서 실행해 주세요.');
   return {date:await earliestDate(rows[0])};
  }catch(e){return {error:e.message};}finally{running=false;}
 }
 async function chooseShop(card,shop){click(button(card,'도착 매장 선택'));const dialog=await until(()=>all(document,'[role="dialog"]').find(d=>d.textContent.includes('도착 파트너')));await fill(field(dialog,'매장명 검색 (권역 탭 숫자로 다른 지역 결과도 확인)'),shop);const find=()=>buttons(dialog).find(b=>clean(b.firstElementChild?.textContent)===shop&&/원/.test(b.textContent));await new Promise(r=>setTimeout(r,200));let target=find();if(!target){const tabs=buttons(dialog).filter(b=>b.querySelector('[aria-label$="매장 수"]')||/^(서울\/경기\/인천|충청\/대전|전라\/광주|대구\/경북\/부산\/경남|강원도|제주도)/.test(clean(b.textContent)));for(const tab of tabs){click(tab);await new Promise(r=>setTimeout(r,100));target=find();if(target)break;}}if(!target)throw Error('파르게에서 도착 매장을 찾지 못했어요: '+shop);click(target);await until(()=>!document.contains(dialog));}
 function report(message,error=false){let banner=document.getElementById('creo-parge-progress');if(!banner){banner=document.createElement('div');banner.id='creo-parge-progress';banner.style.cssText='position:sticky;top:0;z-index:2147483647;padding:16px;background:#eff5ff;color:#17212f;border:2px solid #2457ce;font:600 16px/1.5 system-ui';document.body.prepend(banner);}banner.setAttribute('role',error?'alert':'status');banner.textContent=message;}
 async function digest(value){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');}
 async function run(plan){if(running)return {error:'이미 입력 중이에요.'};running=true;let attempted=false;try{
  if(location.origin!=='https://parge.co.kr'||location.pathname!=='/booking')throw Error('파르게 배송신청 화면에서 실행해 주세요.');
  CreoPargeDispatch.validate(plan);
  if(!buttons(document).some(b=>clean(b.textContent)==='로그아웃'))throw Error('파르게에 먼저 로그인해 주세요.');
  if(document.querySelector('[role="dialog"]'))throw Error('파르게 안내 팝업을 닫고 다시 실행해 주세요.');
  const keys=await Promise.all(plan.groups.flatMap(g=>g.items).map(i=>digest(plan.channelId+':'+i.id).then(h=>'creo-parge:'+h)));
  const history=await chrome.storage.local.get(keys);if(keys.some(k=>history[k]))throw Error('이미 장바구니 담기를 시도한 개체가 있어요. 파르게 장바구니·예약 내역을 먼저 확인해 주세요.');
  report('파르게 입력 준비 중');
  const existing=cartRows();if(plan.groups.some(g=>existing.some(row=>row.includes('받는분: '+g.name)&&row.includes(g.shop))))throw Error('같은 수령인·도착지의 장바구니가 있어요. 추가 마릿수를 기존 건에 합쳐 주세요.');
  if(!document.querySelector('input[placeholder="이름 (또는 샵명)"]')){click(button(document,'크레오 대구본점'));await until(()=>document.querySelector('input[placeholder="이름 (또는 샵명)"]'));}
  const originText=all(document,'p').find(p=>clean(p.textContent)==='출발지 선택 완료')?.parentElement?.textContent||'';
  if(!originText.includes('크레오 대구본점'))throw Error('출발지를 크레오 대구본점으로 선택해 주세요.');
  const initial=cards();if(initial.length!==1||field(initial[0],'이름').value||field(initial[0],'연락처').value||field(initial[0],'예: 150000').value||quantity(initial[0])!==1||!initial[0].textContent.includes('위 버튼으로 도착 매장을 지정해 주세요.')||!initial[0].textContent.includes('위 달력에서 맡김일을 눌러 선택해 주세요.'))throw Error('작성 중인 배송 내용이 있어요. 새 배송신청 화면에서 실행해 주세요.');
  await fill(field(document,'이름 (또는 샵명)'),plan.senderName);const sender=field(document,'이름 (또는 샵명)').parentElement;await fill(field(sender,'연락처'),plan.senderPhone);
  for(let i=0;i<plan.groups.length;i++){
   if(i){click(button(document,'+ 도착지 추가 (다른 매장으로 보낼 개체가 더 있다면 클릭)'));await until(()=>cards().length===i+1);}
   const g=plan.groups[i],card=cards()[i];report(`${i+1}/${plan.groups.length}건 입력 중`);await calendar(card,plan.date);await chooseShop(card,g.shop);await fill(field(card,'이름'),g.name);await fill(field(card,'연락처'),g.phone);
   const selects=all(card,'select');if(selects.length!==1||selects[0].value!=='크레스티드게코'&&clean(selects[0].selectedOptions?.[0]?.textContent)!=='크레스티드게코')throw Error('개체 종류를 확인해 주세요.');
   for(let q=1;q<g.quantity;q++){click(button(card,'마릿수 한 마리 늘리기'));await until(()=>quantity(card)===q+1,'마릿수가 반영되지 않았어요.');}
   await fill(field(card,'예: 150000'),g.price);await fill(field(card,'요청사항 (선택)'),g.memo);
  }
  for(const [i,g]of plan.groups.entries()){const c=cards()[i];if(field(c,'이름').value!==g.name||field(c,'연락처').value!==g.phone||Number(field(c,'예: 150000').value)!==g.price||field(c,'요청사항 (선택)').value!=='전크자'||quantity(c)!==g.quantity||!c.textContent.includes(g.shop)||!selectedDate(c,plan.date))throw Error('입력 검증이 맞지 않아 장바구니 담기를 멈췄어요.');}
  const cart=buttons(document).find(b=>clean(b.textContent).startsWith('장바구니 담고 결제하기'));if(!cart||cart.disabled||!cart.textContent.includes(`(${plan.groups.length}곳)`))throw Error('장바구니에 담을 건수가 맞지 않아요. 화면을 확인해 주세요.');
  const reservation=await chrome.runtime.sendMessage({type:'creo-parge-reserve',keys});if(!reservation?.reserved)throw Error(reservation?.error||'중복 접수 여부를 확인하지 못했어요.');attempted=true;
  report('입력 완료 · 장바구니를 확인합니다.');click(cart);
  const back=await until(()=>buttons(document).find(b=>clean(b.textContent)==='← 다시 목록으로 (수정/추가)'),'장바구니 이동 결과를 확인하지 못했어요.');click(back);
  await until(()=>document.querySelector('aside'));const after=cartRows();
  if(after.length!==existing.length+plan.groups.length||existing.some(row=>!after.includes(row)))throw Error('기존 장바구니와 새 입력 내역을 대조해 주세요.');
  const added=after.slice();for(const row of existing)added.splice(added.indexOf(row),1);
  for(const g of plan.groups){const matches=added.filter(row=>row.includes('크레오 대구본점')&&row.includes(g.shop)&&row.includes('받는분: '+g.name)&&row.includes(`크레스티드게코 ${String(g.quantity).padStart(2,'0')}마리`)&&row.includes(`분양 ${g.price}원`));if(matches.length!==1)throw Error('장바구니 마릿수·분양가가 맞지 않아요. 직접 확인해 주세요.');}
  report('장바구니 내역 확인 완료 · 새로고침하면 사라질 수 있어요. 최종 확인 후 결제해 주세요.');return {attempted:true,cartVerified:true,count:plan.groups.length};
 }catch(e){const message=e.message+(attempted?' 장바구니 반영 여부를 먼저 확인해 주세요.':'');report(message,true);return {error:message};}finally{running=false;}}
 root.CreoPargeForm={version:'1.1.0',run,resolveDate};
})(window);

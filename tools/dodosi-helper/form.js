async function creoDodosiFill(plan, plans = [plan]) {
 try {
  const wait = async fn => { for (let i=0;i<100;i++) { const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,150)); } throw Error('도도시 화면이 바뀌었거나 응답이 늦습니다. 화면을 확인해 주세요.'); };
  const visible = e => !!(e && e.getClientRects().length && !e.closest('[aria-hidden="true"]'));
  const button = text => [...document.querySelectorAll('button')].find(b=>visible(b)&&b.textContent.trim()===text&&!b.disabled);
  const norm=s=>String(s||'').replace(/\s/g,'');
  const dateText=d=>`${+d.slice(5,7)}월 ${+d.slice(8)}일 (${['일','월','화','수','목','금','토'][new Date(d+'T00:00:00Z').getUTCDay()]})`;
  const setInput=async(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>input.value===value);};
  const row=i=>{let e=document.getElementById(`party-${i}-name`);while(e&&e!==document.body){if(e.querySelector('button[aria-label="마리 수 더하기"]')&&e.querySelectorAll('input[id$="-name"]').length===1)return e;e=e.parentElement;}return null;};
  const count=i=>{const r=row(i),g=r?.querySelector('[role="group"]');return Number((g?.getAttribute('aria-label')||'').match(/현재\s*(\d+)/)?.[1]||r?.querySelector('[role="status"]')?.textContent.trim());};
  if(location.origin!=='https://www.dodosi.co.kr'||location.pathname!=='/order'||plan?.schema!=='creo.dodosi.dispatch.v1')throw Error('도도시 예약 화면이 아닙니다.');
  const params=new URLSearchParams(location.search);
  if(params.get('myShop')!==plan.originId||params.get('shop')!==plan.destinationId||Number(params.get('qty'))!==plan.quantity)throw Error('출발지·도착지·마릿수가 맞지 않습니다.');
  await wait(()=>button('맡기는 날을 선택해주세요'));
  const sourceLabel=plan.originName.replace(/[\s()]/g,''),targetLabel=plan.shop.replace(/[\s()]/g,'');
  const text=document.body.innerText.replace(/[\s()]/g,'');
  if(!text.includes(sourceLabel)||!text.includes(targetLabel))throw Error('선택된 정거샵이 다릅니다. 입력을 중단했습니다.');
  button('맡기는 날을 선택해주세요').click();
  const d=plan.schedule.dropoffDate, dateLabel=dateText(d);
  (await wait(()=>button(dateLabel))).click();
  (await wait(()=>button(plan.quantity>1?'모두 크레스티드 게코예요':'크레스티드 게코에요'))).click();
  // Non-binding species packing notice only; never accept booking terms.
  (await wait(()=>button('확인했어요'))).click();
  (await wait(()=>button('다음 · 사람 정보 입력'))).click();
  const values={'one-name':plan.sender.name,'one-tel':plan.sender.phone};
  for(const [id,value] of Object.entries(values)){
    const input=await wait(()=>document.getElementById(id));
    await setInput(input,value);
  }
  for(const [i,p] of plans.entries()){
    if(p.schedule.dropoffDate!==d||p.originId!==plan.originId)throw Error('같은 맡김일만 한 예약서에 입력할 수 있습니다.');
    if(i){(await wait(()=>[...document.querySelectorAll('button')].find(b=>visible(b)&&b.textContent.trim().startsWith('받는 사람 추가')&&!b.disabled))).click();}
    const name=await wait(()=>document.getElementById(`party-${i}-name`));
    await setInput(name,p.name);await setInput(document.getElementById(`party-${i}-tel`),p.phone);
    if(i){
      (await wait(()=>[...row(i)?.querySelectorAll('button')||[]].find(b=>b.textContent.trim()==='도착 정거샵 선택'))).click();
      const dialog=await wait(()=>[...document.querySelectorAll('[role="dialog"]')].find(visible));
      const search=dialog.querySelector('input');if(!search)throw Error('정거샵 검색창을 찾지 못했습니다.');
      await setInput(search,p.shop.replace(/^\[[^\]]+\]\s*/,''));
      const choices=await wait(()=>{const found=[...dialog.querySelectorAll('button')].filter(b=>visible(b)&&!b.disabled&&norm(b.textContent).startsWith(norm(p.shop)));return found.length===1?found:null;});
      choices[0].click();await wait(()=>!visible(dialog));
    }
    await wait(()=>row(i));
    // Read each step back; no blind repeated clicks or global recipient selectors.
    await wait(()=>Number.isInteger(count(i))&&count(i)>0);
    for(let n=count(i);n<p.quantity;n++){row(i).querySelector('button[aria-label="마리 수 더하기"]').click();await wait(()=>count(i)===n+1);}
    if(count(i)!==p.quantity)throw Error(`${i+1}번째 받는 분의 마릿수가 다릅니다.`);
    await wait(()=>norm(row(i).textContent).includes(norm(p.shop))&&norm(row(i).textContent).includes(norm(dateText(p.schedule.arrivalDate))));
  }
  if(document.querySelectorAll('input[id^="party-"][id$="-name"]').length!==plans.length)throw Error('받는 사람 수가 다릅니다. 열린 예약서를 확인해 주세요.');
  for(const [i,p] of plans.entries())if(document.getElementById(`party-${i}-name`)?.value!==p.name||document.getElementById(`party-${i}-tel`)?.value.replace(/\D/g,'')!==p.phone||count(i)!==p.quantity)throw Error('입력 결과가 배송 목록과 다릅니다.');
  if(document.querySelector('input[type="checkbox"]:checked'))throw Error('동의 상태를 직접 확인해 주세요. 자동 입력은 결제 전까지만 합니다.');
  document.getElementById('one-name').scrollIntoView({block:'center'});
  return {filled:true,stage:'review',groupIds:plans.map(p=>p.groupId),count:plans.length,quantity:plans.reduce((n,p)=>n+p.quantity,0),dropoffDate:d};
 } catch(error) { return {filled:false,error:error.message}; }
}
if(typeof module==='object')module.exports={creoDodosiFill};

async function creoDodosiFill(plan) {
  const wait = async fn => { for (let i=0;i<100;i++) { const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,150)); } throw Error('도도시 화면이 바뀌었거나 응답이 늦습니다. 화면을 확인해 주세요.'); };
  const visible = e => !!(e && e.getClientRects().length && !e.closest('[aria-hidden="true"]'));
  const button = text => [...document.querySelectorAll('button')].find(b=>visible(b)&&b.textContent.trim()===text&&!b.disabled);
  if(location.origin!=='https://www.dodosi.co.kr'||location.pathname!=='/order'||plan?.schema!=='creo.dodosi.dispatch.v1')throw Error('도도시 예약 화면이 아닙니다.');
  const params=new URLSearchParams(location.search);
  if(params.get('myShop')!==plan.originId||params.get('shop')!==plan.destinationId||Number(params.get('qty'))!==plan.quantity)throw Error('출발지·도착지·마릿수가 맞지 않습니다.');
  await wait(()=>button('맡기는 날을 선택해주세요'));
  const sourceLabel=plan.originName.replace(/[\s()]/g,''),targetLabel=plan.shop.replace(/[\s()]/g,'');
  const text=document.body.innerText.replace(/[\s()]/g,'');
  if(!text.includes(sourceLabel)||!text.includes(targetLabel))throw Error('선택된 정거샵이 다릅니다. 입력을 중단했습니다.');
  button('맡기는 날을 선택해주세요').click();
  const d=plan.schedule.dropoffDate, dateLabel=`${+d.slice(5,7)}월 ${+d.slice(8)}일 (${['일','월','화','수','목','금','토'][new Date(d+'T00:00:00Z').getUTCDay()]})`;
  (await wait(()=>button(dateLabel))).click();
  (await wait(()=>button(plan.quantity>1?'모두 크레스티드 게코예요':'크레스티드 게코에요'))).click();
  // Non-binding species packing notice only; never accept booking terms.
  (await wait(()=>button('확인했어요'))).click();
  (await wait(()=>button('다음 · 사람 정보 입력'))).click();
  const values={'one-name':plan.sender.name,'one-tel':plan.sender.phone,'party-0-name':plan.name,'party-0-tel':plan.phone};
  for(const [id,value] of Object.entries(values)){
    const input=await wait(()=>document.getElementById(id));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>document.getElementById(id)?.value===value);
  }
  if(document.querySelector('input[type="checkbox"]:checked'))throw Error('동의 상태를 직접 확인해 주세요. 자동 입력은 결제 전까지만 합니다.');
  document.getElementById('one-name').scrollIntoView({block:'center'});
  return {filled:true,stage:'review',groupId:plan.groupId,dropoffDate:d,arrivalDate:plan.schedule.arrivalDate};
}
if(typeof module==='object')module.exports={creoDodosiFill};

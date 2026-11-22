(() => {
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=d=>`${+d.slice(5,7)}/${+d.slice(8)}(${['일','월','화','수','목','금','토'][new Date(d+'T00:00:00Z').getUTCDay()]})`;
 let cache,request,selected='';
 async function render(host,state,month){
  const today=new Date(Date.parse(state.now)+9*3600000).toISOString().slice(0,10);
  const mine=state.dates.filter(d=>d.regionName===state.vendor.region&&d.date>=today&&!d.paused),target=mine.find(d=>d.date.startsWith(month))||mine[0];
  host.innerHTML='<h2 id="inbound-title">출품 운송 · 도도시</h2><p role="status">정거샵 일정 확인 중…</p>';
  if(!target){host.innerHTML='<h2 id="inbound-title">출품 운송 · 도도시</h2><p>다음 방송 일정이 등록되면 배송 마감일을 안내해요.</p>';return;}
  try{
   const origin=state.dodosiInboundDestination||'크레용(대구)';
   if(!cache||cache.originName!==origin){request ||= fetch('/api/platform/shipping-rates/dodosi-routes?origin='+encodeURIComponent(origin),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).finally(()=>request=null);cache={...(await request),originName:origin};}
   if(!host.isConnected)return;
   const dest=cache.shops.find(s=>s.id===cache.origin);
   const choices=cache.shops.filter(s=>cache.routes.some(r=>r.from===s.id&&r.to===cache.origin&&r.available));
   host.innerHTML=`<div class="inbound-heading"><h2 id="inbound-title">출품 운송 · 도도시</h2><p>${fmt(target.date)} 방송</p></div><p class="inbound-notice">도착지 · <strong>${esc(dest?.label||origin)}</strong></p>${cache.fresh?`<label for="dodosi-inbound-shop">맡길 정거샵</label><select id="dodosi-inbound-shop" style="width:100%;min-height:44px;font-size:16px;margin:8px 0"><option value="">지역·정거샵 선택</option>${choices.map(s=>`<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select><div id="dodosi-inbound-result" aria-live="polite"></div>`:'<p>최신 일정 확인 중이에요. 예약 화면에서 방송 전 도착편을 확인해 주세요.</p>'}<p class="inbound-basis">맡김일 영업 종료 전 접수 · 방송 당일 도착편은 별도 확인</p><a href="https://www.dodosi.co.kr/order?mode=recv&myShop=${encodeURIComponent(cache.origin)}" target="_blank" rel="noopener">도도시 예약 ↗</a>`;
   const select=host.querySelector('select');if(!select)return;select.value=selected;
   function update(){selected=select.value;const out=host.querySelector('#dodosi-inbound-result');if(!selected){out.textContent='실제 맡길 정거샵을 선택해 주세요.';return;}
    const route=cache.routes.find(r=>r.from===selected&&r.to===cache.origin);
    const slot=(route?.slots||[]).filter(s=>s.dropoff>=today&&s.arrival<target.date).sort((a,b)=>b.dropoff.localeCompare(a.dropoff))[0];
    out.innerHTML=slot?`<p class="inbound-deadline"><strong>${fmt(slot.dropoff)}까지 맡기기</strong></p><ol class="inbound-route"><li><span>맡김</span><strong>${fmt(slot.dropoff)}</strong></li><li><span>수거</span><strong>${fmt(slot.pickup)}</strong></li><li><span>대구 도착 예정</span><strong>${fmt(slot.arrival)}</strong></li></ol>${route.price!=null?`<p class="inbound-basis">1마리 정상요금 ${route.price.toLocaleString('ko-KR')}원 · 본인 계정 할인은 예약 화면에서 확인</p>`:''}`:'<p class="inbound-warning">방송 전 도착 가능한 편이 없어요. 직접 운송 또는 운영자 확인이 필요합니다.</p>';
    const place=cache.shops.find(s=>s.id===selected);if(place?.address)out.insertAdjacentHTML('beforeend',`<p class="inbound-basis">${esc(place.address)}${place.hours?'<br>영업 '+esc(place.hours):''}${place.off?.length?' · '+esc(place.off.join('·'))+' 휴무':''}</p>`);
    host.querySelector('a').href='https://www.dodosi.co.kr/order?myShop='+encodeURIComponent(selected)+'&shop='+encodeURIComponent(cache.origin);
   }select.onchange=update;update();
  }catch{if(host.isConnected)host.innerHTML='<h2 id="inbound-title">출품 운송 · 도도시</h2><p>일정을 불러오지 못했어요.</p><a href="https://www.dodosi.co.kr/order" target="_blank" rel="noopener">도도시에서 확인 ↗</a>';}
 }
 window.CreoDodosiInbound={render};
})();

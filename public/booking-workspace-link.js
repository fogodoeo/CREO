(() => {
  const channel=document.getElementById('channel-select'),anchor=document.getElementById('review-entries');
  if(!channel||!anchor)return;
  anchor.parentElement.style.flexWrap='wrap';
  const link=document.createElement('a');link.className='btn';link.textContent='방송 예약 관리';link.style.cssText='min-height:48px;display:inline-flex;align-items:center;text-decoration:none';link.hidden=true;anchor.before(link);
  const update=()=>{link.hidden=channel.value!=='national-cre';link.href='/organizer-bookings.html?channel='+encodeURIComponent(channel.value);};
  channel.addEventListener('change',update);new MutationObserver(update).observe(anchor,{attributes:true,attributeFilter:['href']});update();
  const promo=document.createElement('a');promo.className='btn';promo.textContent='홍보 일정 관리';promo.href='/promo-center.html?admin=1';anchor.before(promo);
  const updatePromo=()=>{promo.hidden=channel.value!=='national-cre';};channel.addEventListener('change',updatePromo);new MutationObserver(updatePromo).observe(anchor,{attributes:true,attributeFilter:['href']});updatePromo();
})();

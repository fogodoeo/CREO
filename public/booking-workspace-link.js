(() => {
  const channel=document.getElementById('channel-select'),anchor=document.getElementById('review-entries');
  if(!channel||!anchor)return;
  anchor.parentElement.style.flexWrap='wrap';
  const link=document.createElement('a');link.className='btn';link.textContent='방송 예약 관리';link.style.cssText='min-height:48px;display:inline-flex;align-items:center;text-decoration:none';link.hidden=true;anchor.before(link);
  const vendors=document.createElement('a');vendors.className='btn';vendors.textContent='업체 사전등록';vendors.style.cssText=link.style.cssText;vendors.href='/national-vendors.html';vendors.hidden=true;link.before(vendors);
  const update=()=>{vendors.hidden=link.hidden=channel.value!=='national-cre';link.href='/organizer-bookings.html?channel='+encodeURIComponent(channel.value);};
  channel.addEventListener('change',update);new MutationObserver(update).observe(anchor,{attributes:true,attributeFilter:['href']});update();
})();

(function(root){
 'use strict';
 let scope='',view='',current=null,nodes=null;
 const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
 function mount(){
  const main=$('buyers').closest('main'),nav=document.createElement('nav'),buyers=document.createElement('section'),organizer=document.createElement('section');
  nav.className='vendor-finance-nav';nav.setAttribute('aria-label','결제·정산 업무');buyers.id='vendor-buyer-work';organizer.id='vendor-organizer-work';
  const buttons=['구매자 결제','주관사 정산'].map((name,i)=>{
   const button=document.createElement('button'),title=document.createElement('strong'),status=document.createElement('span');button.type='button';title.textContent=name;button.append(title,status);button.setAttribute('aria-controls',i?organizer.id:buyers.id);button.onclick=()=>{view=i?'organizer':'buyers';render();};nav.append(button);return {button,status};
  });
  buyers.setAttribute('aria-label','구매자 결제');organizer.setAttribute('aria-label','주관사 정산');
  main.prepend(nav,buyers,organizer);
  for(const el of [document.querySelector('.work-title'),document.querySelector('.work-filters'),$('buyers'),$('filter-empty'),$('empty')])buyers.append(el);
  nodes={nav,buyers,organizer,buttons};
 }
 function render(){
  if(!current)return;const {data,counts}=current,panel=$('shipping-settlement'),row=data.shippingSettlement?.vendors.find(v=>v.vendorId===data.vendor.id),hasSettlement=!!panel;
  if(panel&&panel.parentElement!==nodes.organizer)nodes.organizer.append(panel);
  if(!hasSettlement)view='buyers';
  nodes.nav.hidden=!hasSettlement;nodes.buyers.hidden=view!=='buyers';nodes.organizer.hidden=view!=='organizer';
  const title=document.querySelector('.work-title');title.hidden=hasSettlement||!data.buyers.length;
  if(!hasSettlement)title.firstChild.textContent='확인할 결제 ';
  const status=counts.action?'확인 필요 '+counts.action+'건':counts.waiting?'진행 중 '+counts.waiting+'명':counts.paid?'결제 완료 '+counts.paid+'명':'낙찰 내역 없음';
  nodes.buttons[0].status.textContent=status;
  nodes.buttons[1].status.textContent=row?.unassignedReceiptCount||data.shippingSettlement?.unassignedReceiptCount?'기존 입금 확인 중':row?.pendingReport?'입금 확인 중':row?.remittance?.ready===false?'정산 준비 중':row?.overpaidAmount?'초과 입금 확인 필요':row?.remainingAmount?'보낼 금액 '+money(row.remainingAmount):row?.missingDestinationItems?.length?'배송비 확인 중':'정산 완료';
  nodes.buttons.forEach(({button},i)=>button.setAttribute('aria-pressed',String(view===(i?'organizer':'buyers'))));
 }
 function update(data,counts){
  if(!nodes)mount();
  const key=data.channel.id+':'+(data.round?.key||''),row=data.shippingSettlement?.vendors.find(v=>v.vendorId===data.vendor.id),ready=row?.remittance?.ready!==false&&data.shippingSettlement?.bank?.bankAccount&&data.shippingSettlement?.notificationReady&&!data.shippingSettlement?.unassignedReceiptCount;
  if(key!==scope){scope=key;view=counts.action?'buyers':row&&(row.remainingAmount&&ready&&!row.pendingReport||!data.buyers.length)?'organizer':'buyers';}
  current={data,counts};render();
 }
 root.CreoVendorFinance={update};
})(window);

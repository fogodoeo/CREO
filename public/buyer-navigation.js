(function () {
  'use strict';
  window.CreoBuyerNavigation = {
    create({ onNavigate }) {
      const $=id=>document.getElementById(id), esc=CreoCheckoutClient.escapeHtml, money=CreoCheckoutClient.money;
      const viewer=CreoCheckoutItemView.createViewer({document,origin:location.origin});
      const inquiry=CreoCheckoutInquiry.create({document});
      let active='checkout', data=null;
      const nav=$('buyer-navigation');
      const archive=document.createElement('section');archive.id='buyer-archive-summary';archive.hidden=true;
      $('buyer-collection').before(archive);
      function choose(section) {
        if(nav.hidden)return;
        active=section;
        const url=new URL(location.href);url.hash=active==='items'?'items':'';history.replaceState(null,'',url);
        onNavigate();window.scrollTo(0,0);
        (active==='items'?$('collection-title'):data.readOnly?$('archive-title'):$('flow-title')).focus({preventScroll:true});
      }
      nav.querySelectorAll('a').forEach(link=>link.onclick=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();choose(link.dataset.buyerSection);});
      window.addEventListener('hashchange',()=>choose(location.hash==='#items'?'items':'checkout'));
      function itemMarkup(item) {
        const photos=CreoCheckoutItemView.pictures(item,location.origin), thumbnail=photos.find(p=>p.group==='개체'&&p.thumbnailUrl);
        const traits=CreoCheckoutItemView.traitSummary(item),hasParents=CreoCheckoutItemView.parentDetails(item).length>0;
        const label=photos.length?'개체'+(photos.some(p=>p.group!=='개체')?'·부모':'')+' 사진 보기':'부모 정보 보기';
        const canInquire=Boolean(CreoCheckoutInquiry.contact(item.inquiry));
        return `<article class="collection-item">${thumbnail?`<button type="button" class="collection-thumb" data-item-photo="${esc(item.id)}" aria-label="${esc(item.name)} 사진 보기"><img src="${esc(thumbnail.thumbnailUrl)}" alt="" loading="lazy" width="72" height="72"></button>`:''}<div class="collection-info"><small>${esc(item.vendorName)}</small><h2>${esc(CreoCheckoutItemView.itemTitle(item))}</h2>${traits?`<p>${esc(traits)}</p>`:''}<b>${money(item.soldAmount)}</b>${photos.length||hasParents||canInquire?`<div class="item-actions">${photos.length||hasParents?`<button type="button" class="collection-photo-link" data-item-photo="${esc(item.id)}">${label}</button>`:''}${canInquire?`<button type="button" class="inquiry-link" data-item-inquiry="${esc(item.id)}" aria-label="${esc(CreoCheckoutItemView.itemTitle(item))} 업체 문의">업체 문의</button>`:''}</div>`:''}</div></article>`;
      }
      return {
        isOpen:()=>viewer.isOpen()||inquiry.isOpen(),
        update(next, { dirty=false, editing=false, additional=false }={}) {
          const first=data===null;data=next;
          const registered=Boolean(data.submittedAt), readOnly=data.readOnly===true, canNavigate=readOnly||(registered&&!dirty&&!editing&&!additional);
          nav.hidden=!canNavigate;
          if(first&&canNavigate&&(location.hash==='#items'||(readOnly&&location.hash!=='#checkout')))active='items';
          if(!canNavigate)active='checkout';
          document.body.dataset.buyerSection=active;
          document.body.dataset.buyerReadOnly=String(readOnly);
          document.body.classList.toggle('has-buyer-navigation',canNavigate);
          $('buyer-event-label').textContent=(data.channel?.name||'')+(readOnly?' · 지난 경매':'');
          $('buyer-collection').hidden=active!=='items';
          $('order-overview').hidden=registered||readOnly;
          archive.hidden=!readOnly||active!=='checkout';
          if(readOnly){
            const selection=data.selection,selectedDestination=data.destinations.find(row=>row.id===selection?.destinationId),destinationType=selection?.destinationType||selectedDestination?.type;
            const destination=destinationType==='pickup'?selectedDestination?.label:selection?[destinationType==='parge'?'파르게':destinationType==='dodosi'?'도도시':selectedDestination?.label,selection.pargeRegion,selection.pargeShop].filter(Boolean).join(' · '):'';
            archive.innerHTML=`<h1 id="archive-title" tabindex="-1">거래 내역</h1>${data.vendors.map(v=>{
              const paid=v.payment.status==='paid',status=CreoCheckoutClient.paymentStatusMeta(v.payment.status).label,call=CreoCheckoutActions.phoneHref(v.contact?.phone);
              return `<article class="archive-vendor"><div><h2>${esc(v.name)}</h2><span>${esc(status)}</span></div><small>${paid?'확인된 결제금액':'등록된 금액'}</small><strong>${money(paid?v.payment.confirmedAmount:v.totals.totalAmount)}</strong><details><summary>낙찰금·배송비</summary><p>낙찰금 <b>${money(v.totals.auctionAmount)}</b></p><p>배송비 <b>${money(v.totals.shippingAmount)}</b></p>${v.totals.discountAmount?`<p>할인 <b>−${money(v.totals.discountAmount)}</b></p>`:''}</details>${call?`<a href="${esc(call)}">업체 문의</a>`:''}</article>`;
            }).join('')}<div class="archive-destination"><small>수령지</small><b>${esc(destination||'등록된 수령지가 없어요')}</b></div>`;
          }
          nav.querySelectorAll('a').forEach(link=>{if(link.dataset.buyerSection===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
          $('collection-count').textContent=`${data.items.length}개체`;
          $('collection-items').innerHTML=data.items.map(itemMarkup).join('');
          $('collection-empty').hidden=data.items.length!==0;
          $('collection-items').querySelectorAll('[data-item-photo]').forEach(button=>button.onclick=()=>{const item=data.items.find(i=>i.id===button.dataset.itemPhoto);if(item)viewer.open(item,button);});
          $('collection-items').querySelectorAll('[data-item-inquiry]').forEach(button=>button.onclick=()=>{const item=data.items.find(i=>i.id===button.dataset.itemInquiry);if(item)inquiry.open(item,data.channel?.name,button);});
          // Initial registration can inspect photos without leaving the required sequence.
          $('items').querySelectorAll('[data-initial-photo]').forEach(node=>node.remove());
          $('items').querySelectorAll('[data-initial-actions]').forEach(node=>node.remove());
          if(!registered&&!readOnly)for(const [i,item] of data.items.entries()) {
            const hasPhotos=CreoCheckoutItemView.pictures(item,location.origin).length>0;
            const hasParents=CreoCheckoutItemView.parentDetails(item).length>0,canInquire=Boolean(CreoCheckoutInquiry.contact(item.inquiry));
            if(!hasPhotos&&!hasParents&&!canInquire)continue;
            const row=$('items').children[i];if(!row)continue;
            const actions=document.createElement('div');actions.className='item-actions';actions.dataset.initialActions='';row.append(actions);
            if(hasPhotos||hasParents){const button=document.createElement('button');button.type='button';button.dataset.initialPhoto='';button.className='collection-photo-link';button.textContent=hasPhotos?'사진 보기':'부모 정보 보기';button.onclick=()=>viewer.open(item,button);actions.append(button);}
            if(canInquire){const button=document.createElement('button');button.type='button';button.dataset.initialInquiry='';button.className='inquiry-link';button.textContent='업체 문의';button.setAttribute('aria-label',CreoCheckoutItemView.itemTitle(item)+' 업체 문의');button.onclick=()=>inquiry.open(item,data.channel?.name,button);actions.append(button);}
          }
        }
      };
    }
  };
})();

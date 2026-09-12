(function () {
  'use strict';
  let viewer;
  window.CreoVendorItemView = {
    render(container, buyers) {
      viewer ||= CreoCheckoutItemView.createViewer({document,origin:location.origin});
      const {escapeHtml:esc,money}=CreoCheckoutClient;
      container.querySelectorAll('[data-buyer-items]').forEach(list => {
        const buyer=buyers.find(row=>row.id===list.dataset.buyerItems);
        if(!buyer)return;
        list.innerHTML=buyer.items.map(item=>{
          const photos=CreoCheckoutItemView.pictures(item,location.origin);
          const thumb=photos.find(photo=>photo.group==='개체'&&photo.thumbnailUrl);
          const traits=CreoCheckoutItemView.traitSummary(item),hasParents=CreoCheckoutItemView.parentDetails(item).length>0;
          const label=photos.length?'개체'+(photos.some(photo=>photo.group!=='개체')?'·부모':'')+' 사진 보기':'부모 정보 보기';
          return `<div class="checkout-vendor-item">${thumb?`<button class="collection-thumb" type="button" data-item-photo="${esc(item.id)}" aria-label="${esc(item.name)} 사진 보기"><img src="${esc(thumb.thumbnailUrl)}" alt="" loading="lazy" width="60" height="60"></button>`:''}<div class="checkout-vendor-item-info"><b>${esc(CreoCheckoutItemView.itemTitle(item))}</b>${traits?`<p class="item-traits">${esc(traits)}</p>`:''}<strong>${money(item.soldAmount)}</strong>${photos.length||hasParents?`<button class="collection-photo-link" type="button" data-item-photo="${esc(item.id)}">${label}</button>`:''}</div></div>`;
        }).join('');
        list.querySelectorAll('[data-item-photo]').forEach(button=>button.onclick=()=>{
          const item=buyer.items.find(row=>row.id===button.dataset.itemPhoto);
          if(item)viewer.open(item,button);
        });
      });
    },
    isOpen() { return Boolean(document.querySelector('.checkout-photo-viewer[open]')); }
  };
})();

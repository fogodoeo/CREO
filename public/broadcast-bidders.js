(function(root){
    'use strict';
    const selector='.live-bid-row[data-bidder-key]:not(.is-exiting)';
    function update(current,next){
        const sameItem=current.dataset.itemKey===next.dataset.itemKey;
        const moving=sameItem&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const oldRows=[...current.querySelectorAll(selector)];
        // Capture the current visual position so rapid bids interrupt smoothly.
        const top=current.getBoundingClientRect().top;
        const before=new Map(oldRows.map(row=>[row.dataset.bidderKey,{row,y:row.getBoundingClientRect().top-top,height:row.getBoundingClientRect().height}]));
        for(const row of current.children)for(const animation of row.getAnimations?.()||[])animation.cancel();
        const incoming=[...next.children];
        current.replaceChildren(...incoming);
        // Keep layout-editor geometry; the normal render pass reapplies its values.
        current.dataset.itemKey=next.dataset.itemKey;
        current.setAttribute('aria-label',next.getAttribute('aria-label'));
        current.style.setProperty('--bidders-opacity',next.style.getPropertyValue('--bidders-opacity'));
        const rows=[...current.querySelectorAll(selector)];
        if(!moving||!rows.length)return;
        const origin=current.getBoundingClientRect().top;
        for(const row of rows){
            const old=before.get(row.dataset.bidderKey),y=row.getBoundingClientRect().top-origin;
            const from=old?old.y-y:-Math.min(row.getBoundingClientRect().height+12,160);
            if(Math.abs(from)<.5)continue;
            row.animate?.([{transform:`translateY(${from}px)`,opacity:old?1:0},{transform:'translateY(0)',opacity:1}],{duration:200,easing:'cubic-bezier(.23,1,.32,1)'});
        }
        const keys=new Set(rows.map(row=>row.dataset.bidderKey));
        for(const [key,old] of before){
            if(keys.has(key)||!old.row.animate)continue;
            const ghost=old.row.cloneNode(true);
            ghost.classList.add('is-exiting');ghost.setAttribute('aria-hidden','true');ghost.removeAttribute('data-bidder-key');
            ghost.style.top=old.y+'px';ghost.style.height=old.height+'px';current.append(ghost);
            const animation=ghost.animate([{transform:'translateY(0)',opacity:1},{transform:`translateY(${old.height+12}px)`,opacity:0}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});
            animation.finished.then(()=>ghost.remove(),()=>ghost.remove());
        }
    }
    root.CreoBroadcastBidders={update};
    if(typeof module==='object'&&module.exports)module.exports={update};
})(typeof window==='object'?window:globalThis);

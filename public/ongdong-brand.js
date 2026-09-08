(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.OngdongBrand=api;
    if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>api.mount(document));
})(typeof window!=='undefined'?window:globalThis,function(){
    'use strict';
    // Keep the supplied PNGs intact. SVG viewports omit transparent outer margins.
    function image(full=false){
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${full?'334 225 622 820':'299 239 691 734'}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><image href="/assets/ongdong2/${full?'logo':'symbol'}.png" width="1254" height="1254"/></svg>`;
    }
    function header(){return `<span class="ongdong-symbol">${image()}</span><span class="ongdong-name">옹동2</span>`}
    function broadcast(page){return [1,2].includes(Number(page))?`<div class="ongdong-watermark ong-page-${Number(page)}" role="img" aria-label="옹동2 LIVE">${image(true)}</div>`:''}
    function mount(doc){
        doc.querySelectorAll('[data-ongdong-brand]').forEach(node=>{
            node.classList.add('ongdong-brand');node.innerHTML=header();
        });
    }
    return {image,header,broadcast,mount};
});

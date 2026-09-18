(function (global) {
    'use strict';
    const {escapeHtml:esc,money} = global.CreoCheckoutClient;
    function summary(buyer, channel) {
        if (!buyer.destination && !buyer.shippingNote) return '';
        return `<section class="vendor-shipping-summary"><div><b>수령 정보</b>${channel.status==='active' && buyer.canEditShippingNote ? `<button type="button" data-edit-shipping="${esc(buyer.id)}">수정</button>`:''}</div><p>${buyer.destination?.destinationType==='pickup'?'직수령 · ':''}${esc(buyer.destination?.address || '미등록')}</p>${global.CreoDeliverySchedule?.html(buyer.deliverySchedule)||''}${buyer.shippingNote?`<p class="vendor-shipping-note"><b>메모</b> ${esc(buyer.shippingNote)}</p>`:''}</section>`;
    }
    function quote(editor, selection) {
        const previous = editor.selection || {};
        if (['destinationId','pargeRegion','pargeShop'].every(key=>(selection[key]||'')===(previous[key]||''))) return editor.shippingAmount;
        if (editor.destinations.some(row=>row.id===selection.destinationId && row.type==='pickup')) return 0;
        const carrier = editor.carriers[selection.destinationId];
        const rate = carrier?.regions.find(row=>row.region===selection.pargeRegion)?.shops.find(row=>row.name===selection.pargeShop);
        if (!rate) return null;
        const extra = selection.pargeRegion.includes('제주') ? carrier.jejuAdditionalFee : carrier.additionalFee;
        return Number(rate.baseCost) + Math.max(0,editor.itemCount-1)*Number(extra);
    }
    function open(editor, onSave) {
        return new Promise(resolve=>{
            const opener=document.activeElement, dialog=document.createElement('dialog');
            let saving=false, completed=false;
            dialog.className='vendor-shipping-dialog';dialog.setAttribute('aria-labelledby','vendor-shipping-title');
            dialog.innerHTML='<form><h2 id="vendor-shipping-title">수령 정보 수정</h2><p class="shipping-editor-name"></p>'
                +'<p class="shipping-editor-lock" hidden></p><label>수령 방식<select name="destinationId"></select></label>'
                +'<div class="shipping-editor-carrier"><label>지역<select name="pargeRegion"></select></label><label>수령 지점<select name="pargeShop"></select></label></div>'
                +'<label>메모 <span class="shipping-editor-optional">선택 · 구매자·주관사에게도 표시</span><textarea name="note" maxlength="500" rows="3" placeholder="예: 구매자 섭외 배송업체가 수령 · 배송비 별도 부담"></textarea></label>'
                +'<div class="shipping-editor-quote" aria-live="polite"></div><p class="shipping-editor-card" hidden>기존 카드 안내는 취소 확인 후 다시 등록해 주세요.</p>'
                +'<p class="shipping-editor-error" role="alert" tabindex="-1"></p><div class="shipping-editor-actions"><button type="button" class="shipping-editor-close">닫기</button><button type="submit" class="shipping-editor-save">저장</button></div></form>';
            const form=dialog.querySelector('form'),field=name=>form.elements.namedItem(name),error=dialog.querySelector('.shipping-editor-error');
            dialog.querySelector('.shipping-editor-name').textContent=editor.name;
            function options(select,rows,value,placeholder) {
                select.replaceChildren(new Option(placeholder,''),...rows.map(row=>new Option(row.label,row.value)));
                select.value=value || '';
            }
            const destinations=editor.destinations.map(row=>({value:row.id,label:(row.type==='pickup'?'직수령 · ':'')+row.label}));
            if(editor.selection?.destinationId && !destinations.some(row=>row.value===editor.selection.destinationId)) destinations.push({value:editor.selection.destinationId,label:editor.address});
            options(field('destinationId'),destinations,editor.selection?.destinationId,'수령 방식 선택');
            field('note').value=editor.note || '';
            const selection=()=>({destinationId:field('destinationId').value,pargeRegion:field('pargeRegion').value,pargeShop:field('pargeShop').value});
            function updateQuote() {
                const fee=quote(editor,selection()),changed=fee!==null && fee!==editor.shippingAmount;
                dialog.querySelector('.shipping-editor-quote').innerHTML=fee===null?'<span>수령 지점을 선택해 주세요</span>':`<div><span>배송비</span><b>${changed?money(editor.shippingAmount)+' → ':''}${money(fee)}</b></div><div><span>결제금액</span><strong>${money(editor.auctionAmount+fee)}</strong></div>`;
                dialog.querySelector('.shipping-editor-card').hidden=!(changed && editor.hasCardGuide);
            }
            function shops(value='') {
                const rows=editor.carriers[field('destinationId').value]?.regions.find(row=>row.region===field('pargeRegion').value)?.shops || [];
                options(field('pargeShop'),rows.map(row=>({value:row.name,label:row.name})),value,'수령 지점 선택');updateQuote();
            }
            function regions(region='',shop='') {
                const carrier=editor.carriers[field('destinationId').value];
                dialog.querySelector('.shipping-editor-carrier').hidden=!carrier;
                options(field('pargeRegion'),(carrier?.regions || []).map(row=>({value:row.region,label:row.region})),region,'지역 선택');shops(shop);
            }
            regions(editor.selection?.pargeRegion,editor.selection?.pargeShop);
            field('destinationId').onchange=()=>regions();field('pargeRegion').onchange=()=>shops();field('pargeShop').onchange=updateQuote;
            if(!editor.canEditDestination) {
                ['destinationId','pargeRegion','pargeShop'].forEach(name=>field(name).disabled=true);
                const hint=dialog.querySelector('.shipping-editor-lock');hint.textContent=editor.lockedReason;hint.hidden=false;
            }
            const close=()=>{if(!saving)dialog.close()};
            dialog.querySelector('.shipping-editor-close').onclick=close;
            dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
            dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close()});
            form.onsubmit=async event=>{
                event.preventDefault();if(saving)return;
                const selected=editor.canEditDestination?selection():{destinationId:editor.selection?.destinationId||'',pargeRegion:editor.selection?.pargeRegion||'',pargeShop:editor.selection?.pargeShop||''};
                const fee=editor.canEditDestination?quote(editor,selected):editor.shippingAmount;
                if(fee===null){error.textContent='수령 방식과 지점을 선택해 주세요.';error.focus();return;}
                const controls=[...form.elements];saving=true;controls.forEach(node=>node.disabled=true);error.textContent='';dialog.querySelector('.shipping-editor-save').textContent='저장 중…';
                try {await onSave({...selected,note:field('note').value,expectedVersion:editor.expectedVersion,expectedAmount:editor.auctionAmount+fee});completed=true;dialog.close();}
                catch(e){error.textContent=e.message || '저장하지 못했어요. 연결을 확인하고 다시 저장해 주세요.';error.focus();}
                finally{saving=false;controls.forEach(node=>node.disabled=false);if(!editor.canEditDestination)['destinationId','pargeRegion','pargeShop'].forEach(name=>field(name).disabled=true);dialog.querySelector('.shipping-editor-save').textContent='저장';}
            };
            dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();resolve(completed)},{once:true});
            document.body.append(dialog);dialog.showModal();(editor.canEditDestination?field('destinationId'):field('note')).focus();
        });
    }
    global.CreoVendorShipping={summary,quote,open};
})(window);

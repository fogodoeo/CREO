(function (global) {
    'use strict';
    function button(buyer, channel) {
        if (!buyer.payment?.canResetCardGuide || buyer.changePending || channel.status !== 'active') return '';
        const id = global.CreoCheckoutClient.escapeHtml(buyer.id);
        return `<button class="card-reset-button" type="button" data-reset-card="${id}">카드 안내 변경</button>`;
    }
    function confirm(buyer) {
        return new Promise(resolve => {
            const opener = document.activeElement;
            const dialog = document.createElement('dialog');
            dialog.className = 'card-reset-dialog';
            dialog.setAttribute('aria-labelledby', 'card-reset-title');
            dialog.setAttribute('aria-describedby', 'card-reset-description');
            dialog.innerHTML = '<h2 id="card-reset-title">카드 안내 변경</h2>'
                + '<p class="card-reset-buyer"></p>'
                + '<p id="card-reset-description">기존 결제 앱에서 요청·링크를 취소한 뒤 진행해 주세요.</p>'
                + '<label class="card-reset-check"><input type="checkbox">기존 요청 취소·차단 및 미결제 확인</label>'
                + '<div class="card-reset-actions"><button type="button" class="card-reset-back">돌아가기</button>'
                + '<button type="button" class="card-reset-submit" disabled>대기로 변경</button></div>';
            dialog.querySelector('.card-reset-buyer').textContent = buyer.name + ' · ' + global.CreoCheckoutClient.money(buyer.payment.confirmationDue ?? buyer.totals.totalAmount);
            const checkbox = dialog.querySelector('input'), submit = dialog.querySelector('.card-reset-submit');
            checkbox.onchange = () => { submit.disabled = !checkbox.checked; };
            submit.onclick = () => { if (checkbox.checked) dialog.close('reset'); };
            dialog.querySelector('.card-reset-back').onclick = () => dialog.close();
            dialog.addEventListener('click', event => {
                const rect = dialog.getBoundingClientRect();
                if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
            });
            dialog.addEventListener('close', () => {
                const accepted = dialog.returnValue === 'reset';
                dialog.remove();
                if (opener?.isConnected) opener.focus();
                resolve(accepted);
            }, { once: true });
            document.body.append(dialog); dialog.showModal();
            dialog.querySelector('.card-reset-back').focus();
        });
    }
    global.CreoVendorCardReset = {button, confirm};
})(window);

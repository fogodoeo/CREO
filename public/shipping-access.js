(function (root) {
    'use strict';

    const PENDING_CLASS = 'shipping-access-pending';
    const GATE_ID = 'shipping-access-gate';

    root.document.documentElement.classList.add(PENDING_CLASS);

    const style = root.document.createElement('style');
    style.textContent = `
        html.${PENDING_CLASS} body > :not(#${GATE_ID}) { visibility:hidden!important; }
        #${GATE_ID} { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:18px; background:#0b0d10; color:#f4f5f7; font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; }
        #${GATE_ID}[hidden] { display:none; }
        #${GATE_ID} form { width:min(370px,100%); padding:26px; border:1px solid #292f38; border-radius:17px; background:#12151a; box-shadow:0 18px 60px rgba(0,0,0,.28); }
        #${GATE_ID} .shipping-access-brand { display:flex; align-items:center; gap:10px; margin-bottom:24px; }
        #${GATE_ID} .shipping-access-mark { display:grid; width:32px; height:32px; place-items:center; border:1px solid #403823; border-radius:9px; background:#17150f; color:#dfb55f; font-size:13px; font-weight:950; }
        #${GATE_ID} .shipping-access-brand strong { font-size:13px; font-weight:900; letter-spacing:.15em; }
        #${GATE_ID} h1 { margin:0; font-size:20px; }
        #${GATE_ID} p { margin:7px 0 19px; color:#8d96a2; font-size:11px; }
        #${GATE_ID} label { display:block; margin-bottom:6px; color:#aab1bb; font-size:10px; font-weight:750; }
        #${GATE_ID} input { width:100%; height:46px; padding:0 12px; border:1px solid #353c46; border-radius:9px; outline:0; background:#090c10; color:#fff; font:inherit; }
        #${GATE_ID} input:focus { border-color:#806b3e; }
        #${GATE_ID} button { width:100%; height:44px; margin-top:8px; border:0; border-radius:9px; background:#dfb55f; color:#171106; font:inherit; font-size:11px; font-weight:900; cursor:pointer; }
        #${GATE_ID} button:disabled { opacity:.5; cursor:wait; }
        #${GATE_ID} .shipping-access-error { min-height:16px; margin:7px 1px 0; color:#ff9292; font-size:9px; }
    `;
    root.document.head.appendChild(style);

    function unlock() {
        root.document.documentElement.classList.remove(PENDING_CLASS);
        root.document.getElementById(GATE_ID)?.remove();
    }

    function renderGate() {
        let gate = root.document.getElementById(GATE_ID);
        if (gate) return gate;
        gate = root.document.createElement('section');
        gate.id = GATE_ID;
        gate.innerHTML = `
            <form novalidate>
                <div class="shipping-access-brand"><span class="shipping-access-mark">C</span><strong>CREO</strong></div>
                <h1>배송업체 로그인</h1>
                <p>배송관리 비밀번호를 입력하세요.</p>
                <label for="shipping-access-password">비밀번호</label>
                <input id="shipping-access-password" type="password" autocomplete="current-password" maxlength="128" required>
                <button type="submit">배송관리 열기</button>
                <div class="shipping-access-error" role="alert"></div>
            </form>`;
        root.document.body.appendChild(gate);
        return gate;
    }

    async function requireAccess() {
        if (!root.CreoPlatform?.verifyAdmin) throw new Error('배송 인증 기능을 불러오지 못했습니다.');
        try {
            if (await root.CreoPlatform.verifyAdmin()) {
                unlock();
                return true;
            }
        } catch (_) {}

        const gate = renderGate();
        const form = gate.querySelector('form');
        const input = gate.querySelector('input');
        const button = gate.querySelector('button');
        const error = gate.querySelector('.shipping-access-error');
        requestAnimationFrame(() => input.focus({ preventScroll:true }));

        return new Promise(resolve => {
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const password = input.value;
                if (!password) return input.focus();
                error.textContent = '';
                input.disabled = true;
                button.disabled = true;
                button.textContent = '확인 중…';
                try {
                    root.CreoPlatform.setAdmin(password);
                    if (!await root.CreoPlatform.verifyAdmin(password)) throw new Error('비밀번호가 맞지 않습니다.');
                    input.value = '';
                    unlock();
                    resolve(true);
                } catch (failure) {
                    root.CreoPlatform.setAdmin('');
                    error.textContent = failure.message || '로그인하지 못했습니다.';
                    input.disabled = false;
                    button.disabled = false;
                    button.textContent = '배송관리 열기';
                    input.select();
                }
            });
        });
    }

    root.CreoShippingAccess = Object.freeze({ require: requireAccess });
})(window);

(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoCheckoutClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

    function byId(id, documentObject = document) {
        return documentObject.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function money(value) {
        return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ko-KR')}원`;
    }

    function formatPhone(value) {
        const digits = String(value || '').replace(/[^0-9]/g, '');
        if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        return digits;
    }

    function paymentStatusMeta(value, role = 'buyer') {
        const status = String(value || 'awaiting_information');
        if (status === 'paid') return Object.freeze({ label: '결제 완료', tone: 'green' });
        if (['payment_reported', 'bank_transfer_reported', 'card_payment_reported'].includes(status)) {
            return Object.freeze({ label: role === 'vendor' ? '확인 요청' : '확인 대기', tone: 'red' });
        }
        if (status === 'additional_payment') return Object.freeze({ label: '추가 결제', tone: 'red' });
        if (status === 'in_progress') return Object.freeze({ label: '결제 진행 중', tone: '' });
        if (status === 'card_link_pending') return Object.freeze({ label: role === 'vendor' ? '카드 링크 필요' : '링크 준비 중', tone: role === 'vendor' ? 'red' : '' });
        if (status === 'card_payment_pending') return Object.freeze({ label: '카드 결제 대기', tone: '' });
        if (status === 'bank_transfer_pending') return Object.freeze({ label: '입금 대기', tone: '' });
        return Object.freeze({ label: '정보 입력 대기', tone: '' });
    }

    function requestId(cryptoObject = globalThis.crypto) {
        return cryptoObject?.randomUUID
            ? cryptoObject.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function readCredential(locationObject, shortPrefix) {
        const params = new URLSearchParams(locationObject.search || '');
        const escapedPrefix = String(shortPrefix || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`^/${escapedPrefix}/([A-Za-z0-9_-]{8,24})$`).exec(locationObject.pathname || '');
        const code = params.get('code') || match?.[1] || '';
        const token = params.get('token') || '';
        return {
            code: SHORT_CODE_PATTERN.test(code) ? code : '',
            token: token && token.length <= 500 ? token : ''
        };
    }

    function resolveApiOrigin(locationObject, requestedOrigin = '') {
        try {
            const parsed = requestedOrigin ? new URL(requestedOrigin) : new URL(locationObject.origin);
            const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
            const trusted = parsed.origin === locationObject.origin || parsed.hostname === 'creok.onrender.com';
            if ((parsed.protocol === 'https:' && trusted) || (parsed.protocol === 'http:' && local)) return parsed.origin;
        } catch (_) {}
        return '';
    }

    function createClient(options = {}) {
        const locationObject = options.location || location;
        const fetchImpl = options.fetch || fetch;
        const endpoint = String(options.endpoint || '');
        const credential = readCredential(locationObject, options.shortPrefix);
        const apiOrigin = resolveApiOrigin(locationObject, options.apiOrigin || '');
        const retryCount = Math.max(1, Math.min(3, Number(options.retries) || 3));
        const credentialObject = () => credential.code ? { code: credential.code } : { token: credential.token };

        async function request(path = '', body = null) {
            let lastError;
            for (let attempt = 0; attempt < retryCount; attempt += 1) {
                try {
                    const suffix = body ? '' : `?${new URLSearchParams(credentialObject())}`;
                    const response = await fetchImpl(`${apiOrigin}${endpoint}${path}${suffix}`, {
                        method: body ? 'POST' : 'GET',
                        headers: body ? { 'Content-Type': 'application/json' } : {},
                        body: body ? JSON.stringify({ ...credentialObject(), ...body }) : undefined,
                        cache: 'no-store'
                    });
                    const payload = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        const error = new Error(payload.error || `연결 오류 ${response.status}`);
                        error.status = response.status;
                        throw error;
                    }
                    return payload;
                } catch (error) {
                    lastError = error;
                    if ((error.status && error.status < 500) || attempt >= retryCount - 1) break;
                    await new Promise(resolve => setTimeout(resolve, 500 * (2 ** attempt)));
                }
            }
            throw lastError || new Error('서버에 연결하지 못했습니다.');
        }

        async function revision(channelId) {
            const id = String(channelId || '').toLowerCase();
            if (!/^[a-z0-9-]{1,32}$/.test(id)) throw new Error('채널 정보가 올바르지 않습니다.');
            const response = await fetchImpl(`${apiOrigin}/api/platform/channels/${encodeURIComponent(id)}/broadcast-pulse`, {
                cache: 'no-store'
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(payload.error || `연결 오류 ${response.status}`);
                error.status = response.status;
                throw error;
            }
            return payload;
        }

        return Object.freeze({
            apiOrigin,
            credential: credentialObject,
            valid: Boolean(apiOrigin && (credential.code || credential.token)),
            request,
            revision
        });
    }

    function createAdaptivePoller(task, options = {}) {
        const documentObject = options.document || document;
        const visibleDelay = Math.max(250, Number(options.visibleDelay) || 1200);
        const hiddenDelay = Math.max(visibleDelay, Number(options.hiddenDelay) || 10000);
        const focusDelay = Math.max(0, Number(options.focusDelay) || 100);
        let timer = null;
        let stopped = true;

        const schedule = delay => {
            clearTimeout(timer);
            if (stopped) return;
            timer = setTimeout(async () => {
                try { await task(); } finally { schedule(documentObject.hidden ? hiddenDelay : visibleDelay); }
            }, delay);
        };
        const onVisibility = () => schedule(documentObject.hidden ? hiddenDelay : focusDelay);
        const start = (delay = 300) => {
            if (!stopped) return;
            stopped = false;
            documentObject.addEventListener('visibilitychange', onVisibility);
            schedule(delay);
        };
        const stop = () => {
            stopped = true;
            clearTimeout(timer);
            documentObject.removeEventListener('visibilitychange', onVisibility);
        };
        return Object.freeze({ start, stop });
    }

    function createRevisionSync(options = {}) {
        const documentObject = options.document || document;
        const fetchRevision = options.fetchRevision;
        const currentRevision = options.currentRevision;
        const refresh = options.refresh;
        const isReady = options.isReady || (() => true);
        const isBusy = options.isBusy || (() => false);
        const hasDraft = options.hasDraft || (() => false);
        const readRevision = options.readRevision || (payload => payload?.checkoutRevision);
        const onStatus = options.onStatus || (() => {});
        const settleDelay = Math.max(0, Number(options.settleDelay ?? 1800) || 0);
        if (typeof fetchRevision !== 'function' || typeof currentRevision !== 'function' || typeof refresh !== 'function') {
            throw new TypeError('Revision sync requires fetchRevision, currentRevision, and refresh');
        }

        let inFlight = false;
        let statusState = 'live';
        let settleTimer = null;

        function publish(text, stateName = 'live') {
            statusState = stateName;
            clearTimeout(settleTimer);
            onStatus(text, stateName);
            if (text === '방금 반영' && settleDelay > 0) {
                settleTimer = setTimeout(() => publish('실시간', 'live'), settleDelay);
            }
        }

        async function poll() {
            if (documentObject.hidden || inFlight || isBusy() || !isReady()) return 'skipped';
            inFlight = true;
            try {
                const next = await fetchRevision();
                const nextValue = readRevision(next);
                const currentValue = currentRevision();
                const nextRevision = Number(nextValue);
                const loadedRevision = Number(currentValue);
                if (
                    nextValue === undefined || nextValue === null
                    || currentValue === undefined || currentValue === null
                    || !Number.isFinite(nextRevision) || !Number.isFinite(loadedRevision)
                ) throw new Error('Checkout revision is unavailable');
                if (nextRevision !== loadedRevision) {
                    if (hasDraft()) {
                        publish('새 변경 있음', 'waiting');
                        return 'draft';
                    }
                    publish('반영 중…', 'waiting');
                    if (await refresh() !== false) {
                        publish('방금 반영', 'live');
                        return 'refreshed';
                    }
                    publish('재연결 중', 'error');
                    return 'failed';
                }
                if (statusState === 'error') publish('실시간', 'live');
                return 'current';
            } catch (_) {
                publish('재연결 중', 'error');
                return 'failed';
            } finally {
                inFlight = false;
            }
        }

        function stop() {
            clearTimeout(settleTimer);
        }

        return Object.freeze({ poll, publish, stop });
    }

    return Object.freeze({ byId, createAdaptivePoller, createClient, createRevisionSync, escapeHtml, formatPhone, money, paymentStatusMeta, readCredential, requestId, resolveApiOrigin });
});

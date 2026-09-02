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

        return Object.freeze({
            apiOrigin,
            credential: credentialObject,
            valid: Boolean(apiOrigin && (credential.code || credential.token)),
            request
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

    return Object.freeze({ byId, createAdaptivePoller, createClient, escapeHtml, money, readCredential, requestId, resolveApiOrigin });
});

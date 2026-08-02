(function (global) {
    'use strict';

    const ADMIN_KEY = 'creo_platform_admin';
    const SESSION_MARKER = 'session';

    async function readResponse(response) {
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
        return payload;
    }

    async function api(path, options = {}) {
        const admin = options.admin ?? sessionStorage.getItem(ADMIN_KEY) ?? '';
        const headerAdmin = admin && admin !== SESSION_MARKER ? admin : '';
        const response = await fetch(`/api/platform/${String(path).replace(/^\/+/, '')}`, {
            ...options,
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                ...(headerAdmin ? { 'X-Creo-Admin': headerAdmin } : {}),
                ...(options.headers || {})
            }
        });
        const payload = await readResponse(response);
        if (!response.ok) {
            const error = new Error(payload?.error || `요청 실패 (${response.status})`);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function setAdmin(password) {
        const value = String(password || '').trim();
        if (value) sessionStorage.setItem(ADMIN_KEY, value);
        else sessionStorage.removeItem(ADMIN_KEY);
    }

    function getAdmin() {
        return sessionStorage.getItem(ADMIN_KEY) || SESSION_MARKER;
    }

    async function verifyAdmin(password = getAdmin()) {
        const supplied = String(password || '');
        if (supplied && supplied !== SESSION_MARKER) {
            const response = await fetch('/api/platform/auth/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: supplied })
            });
            const payload = await readResponse(response);
            if (response.status === 429) throw new Error(payload?.error || '로그인 시도가 너무 많습니다.');
            if (!response.ok || !payload?.authenticated) {
                sessionStorage.removeItem(ADMIN_KEY);
                return false;
            }
            sessionStorage.setItem(ADMIN_KEY, SESSION_MARKER);
            return true;
        }
        const result = await api('admin-check', { admin: '' });
        if (result.authenticated) sessionStorage.setItem(ADMIN_KEY, SESSION_MARKER);
        else sessionStorage.removeItem(ADMIN_KEY);
        return Boolean(result.authenticated);
    }

    async function logout() {
        try {
            await api('auth/logout', { method: 'POST', admin: '', body: '{}' });
        } finally {
            sessionStorage.removeItem(ADMIN_KEY);
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function money(value) {
        const amount = Number(value) || 0;
        return amount.toLocaleString('ko-KR');
    }

    global.CreoPlatform = {
        api,
        escapeHtml,
        getAdmin,
        logout,
        money,
        setAdmin,
        verifyAdmin
    };
})(window);

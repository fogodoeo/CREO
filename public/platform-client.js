(function (global) {
    'use strict';

    const ADMIN_KEY = 'creo_platform_admin';

    async function api(path, options = {}) {
        const admin = options.admin ?? sessionStorage.getItem(ADMIN_KEY) ?? '';
        const response = await fetch(`/api/platform/${String(path).replace(/^\/+/, '')}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(admin ? { 'X-Creo-Admin': admin } : {}),
                ...(options.headers || {})
            }
        });
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
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
        return sessionStorage.getItem(ADMIN_KEY) || '';
    }

    async function verifyAdmin(password = getAdmin()) {
        if (!password) return false;
        const result = await api('admin-check', { admin: password });
        if (result.authenticated) setAdmin(password);
        return Boolean(result.authenticated);
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
        money,
        setAdmin,
        verifyAdmin
    };
})(window);

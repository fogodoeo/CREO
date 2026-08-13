(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoChannelRuntime = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
    const ROUTES = Object.freeze({
        home: Object.freeze({ path: '/', query: 'channel', label: '채널홈' }),
        workspace: Object.freeze({ path: '/channel-workspace.html', query: 'channel', label: '운영', feature: 'auction' }),
        shipping: Object.freeze({ path: '/shipping.html', query: 'channel', label: '배송', feature: 'shipping' }),
        shippingStatus: Object.freeze({ path: '/shipping-status.html', query: 'channel', label: '전체조회', feature: 'shipping' }),
        shippingRates: Object.freeze({ path: '/shipping-rates.html', query: 'channel', label: '요금표', feature: 'shipping' }),
        archives: Object.freeze({ path: '/channel-archives.html', query: 'channel', label: '회차', feature: 'auction' }),
        rankings: Object.freeze({ path: '/channel-archives.html', query: 'channel', label: 'RANKING', feature: 'scoreboards', defaults: { view: 'current' } }),
        control: Object.freeze({ path: '/broadcast-studio.html', query: 'channel', label: '방송', feature: 'broadcast' }),
        settings: Object.freeze({ path: '/channel-manager.html', query: 'channel', label: '설정' }),
        preview: Object.freeze({ path: '/broadcast-router.html', query: 'event', label: '미리보기', feature: 'broadcast', defaults: { page: 1 } }),
        live: Object.freeze({ path: '/broadcast-router.html', query: 'event', label: '송출', feature: 'broadcast', defaults: { page: 1, live: 1 } })
    });

    function normalizeChannelId(value) {
        const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 32);
        return CHANNEL_PATTERN.test(normalized) ? normalized : '';
    }

    function routeUrl(name, channelId, extra = {}) {
        const route = ROUTES[name];
        const id = normalizeChannelId(channelId);
        if (!route) throw new Error(`Unknown channel route: ${name}`);
        if (!id) throw new Error('A valid channel id is required');
        const params = new URLSearchParams();
        params.set(route.query, id);
        Object.entries({ ...(route.defaults || {}), ...(extra || {}) }).forEach(([key, value]) => {
            if (value === undefined || value === null || value === false || value === '') return;
            params.set(key, String(value));
        });
        return `${route.path}?${params.toString()}`;
    }

    function channelRoutes(channelId) {
        return Object.fromEntries(Object.keys(ROUTES).map(name => [name, routeUrl(name, channelId)]));
    }

    function preserveChannel(href, channelId, baseHref = 'http://creo.local/') {
        const id = normalizeChannelId(channelId);
        if (!id) return String(href || '');
        const base = new URL(baseHref);
        const url = new URL(String(href || '/'), base);
        if (url.pathname.endsWith('/broadcast-router.html')) {
            url.searchParams.set('event', id);
            url.searchParams.delete('channel');
        } else {
            url.searchParams.set('channel', id);
        }
        return url.origin === base.origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
    }

    function selectChannel(catalog, requested) {
        const channels = Array.isArray(catalog?.channels) ? catalog.channels : [];
        const id = normalizeChannelId(requested);
        return channels.find(channel => channel.id === id) || channels[0] || null;
    }

    class Runtime {
        constructor(options = {}) {
            this.client = options.client || root.CreoPlatform;
            this.location = options.location || root.location || { search: '', href: 'http://creo.local/' };
            this.catalog = options.catalog || { version: 0, channels: [] };
            this.channel = null;
            this.listeners = new Set();
        }

        async load(requested) {
            if (!this.catalog?.channels?.length) {
                if (!this.client?.api) throw new Error('CREO platform client is not available');
                this.catalog = await this.client.api('channels');
            }
            const query = new URLSearchParams(this.location.search || '');
            this.channel = selectChannel(this.catalog, requested || query.get('channel') || query.get('event'));
            if (!this.channel) throw new Error('사용 가능한 채널이 없습니다.');
            this.applyTheme();
            return this;
        }

        setChannel(channelId) {
            const next = selectChannel(this.catalog, channelId);
            if (!next) throw new Error('채널을 찾을 수 없습니다.');
            this.channel = next;
            this.applyTheme();
            this.listeners.forEach(listener => listener(next, this));
            return next;
        }

        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }

        url(name, extra) {
            return routeUrl(name, this.channel?.id, extra);
        }

        routes() {
            return channelRoutes(this.channel?.id);
        }

        supports(feature) {
            return !feature || this.channel?.features?.[feature] !== false;
        }

        available(name) {
            const route = ROUTES[name];
            return Boolean(route) && this.supports(route.feature);
        }

        term(name, fallback = '') {
            return this.channel?.terminology?.[name] || fallback;
        }

        adapterId() {
            return this.channel?.dataAdapter || (this.channel?.legacy?.items ? 'legacy-cdcup' : 'platform');
        }

        profileId() {
            return this.channel?.broadcastProfile || 'standard';
        }

        extension(name) {
            const href = this.channel?.pages?.[name];
            if (!href) return '';
            return preserveChannel(href, this.channel.id, this.location.href || 'http://creo.local/');
        }

        applyTheme(documentRef = root.document) {
            if (!documentRef?.documentElement || !this.channel) return;
            const element = documentRef.documentElement;
            const theme = this.channel.theme || {};
            element.dataset.creoChannel = this.channel.id;
            element.dataset.creoTemplate = this.channel.templateId || 'standard';
            element.dataset.creoAdapter = this.adapterId();
            element.dataset.creoBroadcastProfile = this.profileId();
            Object.entries(theme).forEach(([key, value]) => element.style.setProperty(`--creo-channel-${key}`, value));
        }
    }

    function create(options) {
        return new Runtime(options);
    }

    return Object.freeze({ ROUTES, Runtime, channelRoutes, create, normalizeChannelId, preserveChannel, routeUrl, selectChannel });
});

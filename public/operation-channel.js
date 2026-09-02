(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoOperationChannel = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    function channelIdFromLocation(locationRef = root.location, runtime = root.CreoChannelRuntime) {
        if (!runtime?.normalizeChannelId) return '';
        const query = new URLSearchParams(locationRef?.search || '');
        return runtime.normalizeChannelId(query.get('channel'));
    }

    function create(options = {}) {
        const client = options.client || root.CreoPlatform;
        const adapters = options.adapters || root.CreoChannelAdapters;
        const runtime = options.runtime || root.CreoChannelRuntime;
        const channelId = runtime?.normalizeChannelId(options.channelId);
        if (!channelId) throw new Error('운영할 채널 주소가 없습니다. 메인에서 채널을 다시 선택해 주세요.');
        if (!client?.api) throw new Error('CREO 플랫폼 연결을 찾을 수 없습니다.');
        if (!adapters?.resolve) throw new Error('채널 데이터 연결 모듈을 찾을 수 없습니다.');

        let resolved = null;
        let pending = null;

        async function ready() {
            if (resolved) return resolved;
            if (pending) return pending;
            pending = (async () => {
                const payload = await client.api(`channels/${encodeURIComponent(channelId)}`);
                const channel = payload?.channel;
                if (!channel || channel.id !== channelId) {
                    throw new Error('요청한 채널과 서버 자료가 일치하지 않습니다. 메인에서 다시 열어 주세요.');
                }
                const adapter = adapters.resolve(channel);
                // Adapters keep their channel-local workspace cache on this context.
                // The resolved identity is immutable, while this cache container must remain writable.
                const context = { channel };
                resolved = Object.freeze({ channelId, channel, adapter, context });
                if (typeof options.onReady === 'function') options.onReady(channel, resolved);
                return resolved;
            })();
            try {
                return await pending;
            } finally {
                pending = null;
            }
        }

        async function loadShippingItems() {
            const state = await ready();
            if (typeof state.adapter?.loadShippingItems !== 'function') {
                throw new Error('이 채널의 배송·인쇄 데이터 연결 방식이 설정되지 않았습니다.');
            }
            return state.adapter.loadShippingItems(state.context);
        }

        async function saveShippingItem(row, shippingData, auditMeta = {}) {
            const state = await ready();
            if (typeof state.adapter?.saveShippingItem !== 'function') {
                throw new Error('이 채널의 배송 저장 방식이 설정되지 않았습니다.');
            }
            return state.adapter.saveShippingItem(state.context, row, shippingData, auditMeta);
        }

        return Object.freeze({
            channelId,
            ready,
            loadShippingItems,
            saveShippingItem,
            get channel() { return resolved?.channel || null; },
            get adapter() { return resolved?.adapter || null; },
            get context() { return resolved?.context || null; }
        });
    }

    return Object.freeze({ channelIdFromLocation, create });
});

(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.CreoChannelBroadcastBridge = api;
        api.install(root);
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const BRIDGED_FUNCTIONS = Object.freeze([
        'enrichBroadcastItem',
        'getActiveItem',
        'getAuctionPulse',
        'getBroadcastItems',
        'getBroadcastItemsCached',
        'getBroadcastItemsLite',
        'getConfigMap',
        'getItems',
        'getRuntimeConfigMap',
        'updateConfigs'
    ]);

    function normalizeId(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    }

    function legacyStatus(value) {
        return ({ waiting: '대기', live: '진행중', sold: '낙찰', passed: '유찰' })[String(value || '')]
            || String(value || '대기');
    }

    function inManwon(value) {
        const amount = Number(value) || 0;
        return amount >= 10_000 ? amount / 10_000 : amount;
    }

    function legacyBidLog(item = {}) {
        const source = Array.isArray(item.bidLog) ? item.bidLog : [];
        return JSON.stringify(source.slice(-100));
    }

    function toLegacyItem(item = {}, rendererModule = 'cdcup') {
        const bidLog = legacyBidLog(item);
        const attributes = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
        const rawChecklist = String(attributes.checklist || '').trim();
        const storedAuctionType = String((rawChecklist.match(/(?:^|\|)\s*_auction\s*:\s*([^|]+)/i) || [])[1] || '').trim().toLowerCase();
        const validAuctionTypes = ['tournament', 'solo', 'event', 'extra', 'crewart'];
        const auctionType = validAuctionTypes.includes(storedAuctionType)
            ? storedAuctionType
            : (rendererModule === 'crewart' ? 'crewart' : 'extra');
        const checklistParts = [rawChecklist];
        if (!validAuctionTypes.includes(storedAuctionType)) checklistParts.push(`_auction:${auctionType}`);
        const storedVisibility = String((rawChecklist.match(/(?:^|\|)\s*_visibility\s*:\s*([^|]+)/i) || [])[1] || '').trim().toLowerCase();
        const visibilityMode = ['public', 'blind'].includes(storedVisibility)
            ? storedVisibility
            : (auctionType === 'tournament' ? '' : 'public');
        if (visibilityMode && visibilityMode !== storedVisibility) checklistParts.push(`_visibility:${visibilityMode}`);
        const checklist = checklistParts.filter(Boolean).join('|');
        return {
            row: item.id,
            id: item.id,
            num: Number(item.lotNumber) || 0,
            name: item.name || '',
            displayName: item.name || '',
            company: item.vendorName || '',
            vendorName: item.vendorName || '',
            price: inManwon(item.startPrice),
            startPrice: inManwon(item.startPrice),
            sold_price: inManwon(item.soldPrice),
            soldPrice: inManwon(item.soldPrice),
            winner: item.winnerAlias || '',
            status: legacyStatus(item.status),
            note: item.note || '',
            announce: attributes.announce || item.note || '',
            photoItem: item.photoUrl || '',
            photoSire: attributes.photo_sire || '',
            photoDam: attributes.photo_dam || '',
            photoSibling: attributes.photo_sibling || '',
            teamCode: item.groupId || '',
            teamName: item.teamName || item.groupId || '',
            groupId: item.groupId || '',
            category: item.category || '',
            auctionType,
            visibilityMode,
            points: Number(item.points) || 0,
            bid_log: bidLog,
            bidLog,
            checklist,
            checklist_parsed: '',
            hiddenPhotos: [],
            _broadcastPhotosLoaded: true,
            start_time: attributes.start_time || '',
            startTime: attributes.start_time || '',
            updated_at: item.updatedAt || '',
            updatedAt: item.updatedAt || '',
            crewartHouseKey: attributes.crewart_house_key || '',
            crewartHouseSource: attributes.crewart_house_source || ''
        };
    }

    function toLegacyBroadcastItems(payload = {}, rendererModule = 'cdcup') {
        const items = (payload.items || []).map(item => toLegacyItem(item, rendererModule));
        const state = payload.state && typeof payload.state === 'object' ? payload.state : null;
        if (!state) return items;

        const mode = String(state.mode || 'standby').toLowerCase();
        const activeItemId = String(state.activeItemId || '');
        return items.map(item => {
            const itemId = String(item.id || item.row || '');
            const matchesState = Boolean(activeItemId) && itemId === activeItemId;
            if (mode === 'live' && matchesState) return { ...item, status: '진행중' };
            if (mode === 'sold' && matchesState) return { ...item, status: '낙찰' };
            if (item.status === '진행중') return { ...item, status: '대기' };
            return item;
        });
    }

    function defaultConfig(channel, rendererModule) {
        const defaults = channel?.broadcastDefaults || {};
        const map = {
            active_event_module: rendererModule,
            badge_text: channel?.shortName || channel?.name || '',
            ticker: defaults.page1Ticker || '',
            notice_text: defaults.notice || '',
            notice_detail: defaults.noticeDetail || '',
            live_bidders_show: '1',
            live_bidders_mode: 'top',
            live_bidders_opacity: '94',
            p2_live_bidders_font_size: '20',
            p2_item_font_size: '33',
            scoreboard_name_fontsize: '33'
        };
        if (rendererModule === 'crewart') {
            map.crewart_ticker = defaults.page1Ticker || defaults.page2Ticker || '';
            map.crewart_badge_text = channel?.shortName || channel?.name || 'CREWARTS';
            map.crewart_score_scope = 'crewart';
            if (Array.isArray(channel?.groups) && channel.groups.length) {
                map.crewart_houses = channel.groups.map(group => [
                    group.name || group.shortName || group.id,
                    group.color || '#4b5563',
                    group.color || '#d6b25e'
                ].join('|')).join('\n');
            }
        }
        return map;
    }

    function install(target) {
        if (!target?.location || typeof target.fetch !== 'function') return null;
        const params = new URLSearchParams(target.location.search || '');
        const channelId = normalizeId(params.get('channel') || params.get('event'));
        const rendererModule = normalizeId(params.get('module')) || 'cdcup';
        if (!channelId) {
            if (rendererModule === 'cdcup') return null;
            const missingChannel = () => Promise.reject(new Error(`${rendererModule.toUpperCase()} 송출 채널이 지정되지 않았습니다.`));
            BRIDGED_FUNCTIONS.forEach(name => { target[name] = missingChannel; });
            return Object.freeze({ channelId: '', rendererModule, guarded: true });
        }

        const originals = Object.fromEntries(BRIDGED_FUNCTIONS.map(name => [name, target[name]]));
        let contextPromise = null;
        let broadcastCache = null;
        let broadcastCacheAt = 0;
        let configCache = null;
        let configCacheAt = 0;
        let lastPulseRevision = '';

        async function request(path, options = {}) {
            const response = await target.fetch(`/api/platform/${path}`, {
                credentials: 'same-origin',
                cache: 'no-store',
                ...options,
                headers: {
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(options.headers || {})
                }
            });
            const payload = await response.json().catch(() => ({}));
            if (response.status === 401 && target.parent && target.parent !== target && target.location.origin) {
                target.parent.postMessage({ type: 'creo-admin-required' }, target.location.origin);
            }
            if (!response.ok) throw new Error(payload.error || `채널 방송 연결 오류 ${response.status}`);
            return payload;
        }

        async function context() {
            if (!contextPromise) {
                contextPromise = request(`channels/${encodeURIComponent(channelId)}`)
                    .then(payload => ({ channel: payload.channel, platform: payload.channel?.dataAdapter !== 'legacy-cdcup' }));
            }
            return contextPromise;
        }

        async function delegated(name, args, platformHandler) {
            const current = await context();
            if (!current.platform) {
                if (typeof originals[name] !== 'function') throw new Error(`${name} is not available`);
                return originals[name](...args);
            }
            return platformHandler(current);
        }

        async function loadBroadcast(force = false, maxAgeMs = 900) {
            const now = Date.now();
            if (!force && broadcastCache && now - broadcastCacheAt < Math.max(350, Number(maxAgeMs) || 900)) return broadcastCache;
            broadcastCache = await request(`channels/${encodeURIComponent(channelId)}/broadcast`);
            target.__creoAudience = broadcastCache?.audience || null;
            broadcastCacheAt = now;
            return broadcastCache;
        }

        async function legacyItems(force = false, maxAgeMs = 900) {
            const payload = await loadBroadcast(force, maxAgeMs);
            return toLegacyBroadcastItems(payload, rendererModule);
        }

        async function loadConfig(force = false) {
            const now = Date.now();
            if (!force && configCache && now - configCacheAt < 750) return configCache;
            const current = await context();
            const payload = await request(`channels/${encodeURIComponent(channelId)}/broadcast-config`);
            configCache = {
                ...defaultConfig(current.channel, rendererModule),
                ...(payload.config || {}),
                active_event_module: rendererModule
            };
            configCacheAt = now;
            return configCache;
        }

        target.getRuntimeConfigMap = (...args) => delegated('getRuntimeConfigMap', args, () => loadConfig(Boolean(args[0])));
        target.getConfigMap = (...args) => delegated('getConfigMap', args, () => loadConfig(Boolean(args[0])));
        target.updateConfigs = (...args) => delegated('updateConfigs', args, async () => {
            const patch = { ...(args[0] || {}), active_event_module: rendererModule };
            delete patch.admin_pw;
            const payload = await request(`channels/${encodeURIComponent(channelId)}/broadcast-config`, {
                method: 'PUT',
                body: JSON.stringify({ patch })
            });
            configCache = { ...defaultConfig((await context()).channel, rendererModule), ...(payload.config || {}), active_event_module: rendererModule };
            configCacheAt = Date.now();
            return payload;
        });
        target.getItems = (...args) => delegated('getItems', args, () => legacyItems(Boolean(args[0])));
        target.getBroadcastItems = (...args) => delegated('getBroadcastItems', args, () => legacyItems(Boolean(args[0])));
        target.getBroadcastItemsLite = (...args) => delegated('getBroadcastItemsLite', args, () => legacyItems(Boolean(args[0])));
        target.getBroadcastItemsCached = (...args) => delegated('getBroadcastItemsCached', args, () => legacyItems(Boolean(args[0]), args[1]));
        target.getActiveItem = (...args) => delegated('getActiveItem', args, async () => {
            const items = await legacyItems(Boolean(args[0]));
            return items.find(item => item.status === '진행중') || null;
        });
        target.enrichBroadcastItem = (...args) => delegated('enrichBroadcastItem', args, () => args[0] ? { ...args[0], hiddenPhotos: [] } : null);
        target.getAuctionPulse = (...args) => delegated('getAuctionPulse', args, async () => {
            const payload = await request(`channels/${encodeURIComponent(channelId)}/broadcast-pulse`);
            const revision = String(payload.revision ?? '');
            if (lastPulseRevision && revision !== lastPulseRevision) {
                broadcastCacheAt = 0;
                configCacheAt = 0;
            }
            lastPulseRevision = revision;
            return { id: channelId, status: '', updatedAt: revision };
        });

        return Object.freeze({ channelId, rendererModule, context, loadBroadcast, loadConfig, originals });
    }

    return Object.freeze({ BRIDGED_FUNCTIONS, defaultConfig, install, legacyBidLog, legacyStatus, normalizeId, toLegacyBroadcastItems, toLegacyItem });
});

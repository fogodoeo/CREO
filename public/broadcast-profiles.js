(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoBroadcastProfiles = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const registry = new Map();
    const validPage = page => ['1', '2', '3'].includes(String(page)) ? String(page) : '1';
    const channelId = channel => encodeURIComponent(channel?.id || '');
    const SHARED_PAGE_CONTRACTS = Object.freeze({
        1: Object.freeze({ id: 'host', label: '진행', slots: Object.freeze(['channel', 'hosts', 'notice', 'ticker', 'banner']) }),
        2: Object.freeze({ id: 'item', label: '경매', slots: Object.freeze(['item', 'vendor', 'photo', 'price', 'sold', 'ticker', 'banner']) })
    });

    function register(profile) {
        if (!profile?.id) throw new Error('Broadcast profile id is required');
        registry.set(profile.id, Object.freeze({ ...profile }));
        return registry.get(profile.id);
    }

    function resolve(channel) {
        return registry.get(channel?.broadcastProfile || 'standard') || registry.get('standard');
    }

    function usesLegacyEngine(channel, profile = resolve(channel)) {
        return profile.legacyEngine === true && channel?.dataAdapter === 'legacy-cdcup';
    }

    function pageContract(channel, page) {
        const selectedPage = validPage(page);
        if (selectedPage !== '3') return SHARED_PAGE_CONTRACTS[selectedPage];
        const profile = resolve(channel);
        return Object.freeze({ id: profile.page3Renderer, label: profile.page3Label, slots: Object.freeze(profile.page3Slots || []) });
    }

    function studioFrame(channel, view) {
        const profile = resolve(channel);
        const layout = String(view || '').match(/^layout-([123])$/);
        if (!layout && usesLegacyEngine(channel, profile)) return `settings.html?module=${channelId(channel)}&channel=${channelId(channel)}&embedded=1`;
        if (!layout) return `auction-control.html?channel=${channelId(channel)}&embedded=1`;
        if (usesLegacyEngine(channel, profile)) return `preview.html?module=${channelId(channel)}&page=${layout[1]}&embedded=1`;
        return `auction-control.html?channel=${channelId(channel)}&embedded=1&page=${layout[1]}`;
    }

    function broadcastTarget(channel, page) {
        const profile = resolve(channel);
        const selectedPage = validPage(page);
        if (usesLegacyEngine(channel, profile)) return `broadcast.html?page=${selectedPage}&module=${channelId(channel)}&direct=1`;
        return `auction-live.html?channel=${channelId(channel)}&page=${selectedPage}`;
    }

    register({ id: 'standard', brandMark: 'C', page3Renderer: 'scoreboard', page3Label: '집계', page3Slots: ['scoreboard', 'quiz'], settings: { compatibilityModes: false, assets: true } });
    register({ id: 'cdcup-tournament', brandMark: 'C', studioAccent: '#5f8cff', studioAccentInk: '#07132f', legacyEngine: true, page3Renderer: 'tournament', page3Label: '대진표', page3Slots: ['bracket', 'teamTotals', 'qualifiers'], settings: { compatibilityModes: true, assets: true } });
    register({ id: 'crewart-academy', brandMark: 'W', studioAccent: '#ddb960', studioAccentInk: '#211604', page3Renderer: 'academy', page3Label: '기숙사 컵', page3Slots: ['groupScoreboard', 'quiz'], assetPack: 'crewart', settings: { compatibilityModes: false, assets: true }, defaultState: { page1BannerOn: false, page2BannerOn: false, notice: 'CREWARTS LIVE', noticeDetail: 'R · G · B · Y', page1Ticker: '크레와트 라이브 · 기숙사 점수전', page2Ticker: 'R · G · B · Y' } });

    return Object.freeze({ SHARED_PAGE_CONTRACTS, broadcastTarget, pageContract, register, resolve, studioFrame, usesLegacyEngine });
});

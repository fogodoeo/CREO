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
        2: Object.freeze({ id: 'item', label: '경매', slots: Object.freeze(['item', 'vendorTag', 'liveBidders', 'photo', 'parentPhotos', 'price', 'sold', 'ticker', 'banner']) })
    });

    const SHARED_PAGE2_DEFAULTS = Object.freeze({
        page2NoteOn: true,
        page2VendorTagOn: true,
        page2BiddersOn: true,
        page2BiddersOpacity: 94,
        page2BiddersFontSize: 20,
        page2ItemFontSize: 33,
        page2ParentsOn: true,
        page2BiddersPosition: 'top-left'
    });

    // Versioned, event-free starting layout. Existing channels opt in only on creation.
    const box=(x,y,width,height,fontScale=1)=>Object.freeze({x,y,width,height,fontScale,opacity:100,visible:true});
    const STANDARD_LAYOUT = Object.freeze({
        'p1-host-1':box(48,78,48,9), 'p1-banner':box(4,65,25,24), 'p1-ticker':box(4,90,92,7),
        'p2-progress':box(4,5,9,8.4), 'p2-info':box(22,5,61.5,10),
        'p2-bidders':box(4,59,27,25), 'p2-parents':box(78.5,65.2,17.5,20.4),
        'p2-banner':box(35.4,63.3,25,24), 'p2-ticker':box(4,90,92,7),
        'p2-waiting':box(35,26,30,32), 'p3-board':box(22,12,56,76)
    });
    function initialState(channel){
        if(channel?.broadcastDefaults?.layoutPreset!=='standard-v1')return {};
        return {page1HostsOn:true,page1TickerOn:true,page1BannerOn:true,page2InfoOn:true,page2NoteOn:true,page2ProgressOn:true,
            page2BiddersOn:true,page2ParentsOn:true,page2PriceOn:false,page2SoldOn:true,page2TickerOn:true,page2BannerOn:true,
            page3On:true,page3VendorRankingOn:true,page3BuyerRankingOn:true,page3RankingInterval:10,
            layoutPlacements:Object.fromEntries(Object.entries(STANDARD_LAYOUT).map(([key,value])=>[key,{...value}]))};
    }

    // P1/P2 are application code, not channel assets. Every platform-backed
    // channel points at these same files so a renderer or editor fix is inherited
    // by both existing and newly-created channels. Profiles may replace P3 only.
    const SHARED_PLATFORM_RENDERER = Object.freeze({
        editor: 'platform-layout-editor.html',
        live: 'auction-live.html'
    });

    const SHARED_SETTINGS_CONTRACT = Object.freeze({
        pages: Object.freeze(['1', '2', '3']),
        sections: Object.freeze([
            Object.freeze({ id: 'hosts', label: '진행진', fields: Object.freeze(['hostName1', 'hostRole1', 'hostName2', 'hostRole2', 'hostName3', 'hostRole3']) }),
            Object.freeze({ id: 'page1', label: '1P 진행 화면', fields: Object.freeze(['page1HostsOn', 'page1NoticeOn', 'page1TickerOn', 'page1BannerOn']) }),
            Object.freeze({ id: 'page2', label: '2P 개체 화면', fields: Object.freeze(['page2InfoOn', 'page2NoteOn', 'page2VendorTagOn', 'page2BiddersOn', 'page2BiddersOpacity', 'page2BiddersFontSize', 'page2ItemFontSize', 'page2PhotoOn', 'page2ParentsOn', 'page2PriceOn', 'page2SoldOn', 'page2TickerOn', 'page2BannerOn']) }),
            Object.freeze({ id: 'page3', label: '3P 집계 화면', fields: Object.freeze(['page3On', 'page3VendorRankingOn', 'page3BuyerRankingOn', 'page3RankingInterval', 'scoreboardId', 'extraMode', 'page3Title']) })
        ])
    });

    function register(profile) {
        if (!profile?.id) throw new Error('Broadcast profile id is required');
        registry.set(profile.id, Object.freeze({ ...profile, settings: Object.freeze({ page2InfoLayout: 'inline-traits', ...(profile.settings || {}) }) }));
        return registry.get(profile.id);
    }

    function ids() {
        return Object.freeze([...registry.keys()]);
    }

    function resolve(channel) {
        return registry.get(channel?.broadcastProfile || 'standard') || registry.get('standard');
    }

    function usesLegacyEngine(channel, profile = resolve(channel), page = 3) {
        return validPage(page) === '3' && profile?.engine === 'legacy-layout' && usesLegacyData(channel);
    }

    function usesLegacyData(channel) {
        return channel?.dataAdapter === 'legacy-cdcup';
    }

    function usesSharedStudio(channel, profile = resolve(channel)) {
        return true;
    }

    function pageContract(channel, page) {
        const selectedPage = validPage(page);
        if (selectedPage !== '3') return SHARED_PAGE_CONTRACTS[selectedPage];
        const profile = resolve(channel);
        return Object.freeze({ id: profile.page3Renderer, label: profile.page3Label, slots: Object.freeze(profile.page3Slots || []) });
    }

    function settingsContract(channel) {
        const profile = resolve(channel);
        return Object.freeze({
            id: profile.id,
            shared: SHARED_SETTINGS_CONTRACT,
            page3: Object.freeze({
                id: profile.page3Renderer,
                label: profile.page3Label,
                sections: Object.freeze(profile.page3SettingsSections || [])
            }),
            settings: profile.settings || {}
        });
    }

    function defaultState(channel) {
        const profile = resolve(channel);
        return Object.freeze({
            ...SHARED_PAGE2_DEFAULTS,
            ...initialState(channel),
            ...(profile.defaultState || {}),
            ...(channel?.broadcastDefaults || {})
        });
    }

    function studioFrame(channel, view) {
        const profile = resolve(channel);
        const layout = String(view || '').match(/^layout-([123])$/);
        if (!layout || !usesLegacyEngine(channel, profile, layout[1])) {
            if (layout) return `${SHARED_PLATFORM_RENDERER.editor}?channel=${channelId(channel)}&page=${layout[1]}&embedded=1`;
            if (!usesLegacyEngine(channel, profile, 3)) return `auction-control.html?channel=${channelId(channel)}&page=1&embedded=1&view=settings`;
        }
        const renderer = encodeURIComponent(profile.rendererModule || 'cdcup');
        if (!layout) return `settings.html?module=${renderer}&channel=${channelId(channel)}&embedded=1`;
        return `preview.html?module=${renderer}&channel=${channelId(channel)}&page=${layout[1]}&embedded=1`;
    }

    function broadcastTarget(channel, page) {
        const selectedPage = validPage(page);
        const profile = resolve(channel);
        if (!usesLegacyEngine(channel, profile, selectedPage)) return `${SHARED_PLATFORM_RENDERER.live}?channel=${channelId(channel)}&page=${selectedPage}`;
        const renderer = encodeURIComponent(profile.rendererModule || 'cdcup');
        return `broadcast.html?page=${selectedPage}&module=${renderer}&channel=${channelId(channel)}&direct=1`;
    }

    register({ id: 'standard', engine: 'platform', brandMark: 'C', studioAccent: '#55d18a', studioAccentInk: '#092514', sharedStudio: true, page3Renderer: 'scoreboard', page3Label: '집계', page3Slots: ['scoreboard'], page3SettingsSections: ['scoreboard'], settings: { compatibilityModes: false, assets: true } });
    register({ id: 'basic-dice', engine: 'platform', brandMark: 'B', studioAccent: '#f4b544', studioAccentInk: '#241602', sharedStudio: true, page3Renderer: 'dice-teams', page3Label: '홀짝 기여도', page3Slots: ['teamContribution', 'dice'], page3SettingsSections: ['scoreboard', 'dice'], settings: { compatibilityModes: false, assets: true, diceAssets: true, page2Price: false, page2InfoLayout: 'inline-traits', soldEffectPage: 3 }, defaultState: { page2PriceOn: false, page2SoldOn: false, page3On: true, scoreboardId: 'team-contribution', notice: 'BASIC LIVE', noticeDetail: '홀팀 VS 짝팀', page1Ticker: '실시간 경매', page2Ticker: '실시간 경매', page3Title: '홀팀 VS 짝팀' } });
    register({ id: 'cdcup-finals', engine: 'platform', brandMark: 'C', studioAccent: '#f4b544', studioAccentInk: '#241602', sharedStudio: true, page3Renderer: 'scoreboard', page3Label: '팀 기여도', page3Slots: ['scoreboard'], page3SettingsSections: ['scoreboard'], settings: { compatibilityModes: false, assets: true, page2Price: false, page2InfoLayout: 'inline-traits', soldEffectPage: 3 }, defaultState: { page2PriceOn: false, page2SoldOn: false, page3On: true, scoreboardId: 'teams', page3Title: '팀 기여도' } });
    register({ id: 'cdcup-tournament', engine: 'legacy-layout', rendererModule: 'cdcup', brandMark: 'C', studioAccent: '#5f8cff', studioAccentInk: '#07132f', sharedStudio: true, page3Renderer: 'tournament', page3Label: '대진표', page3Slots: ['bracket', 'teamTotals', 'qualifiers'], page3SettingsSections: ['bracket', 'teamTotals'], settings: { compatibilityModes: true, assets: true } });
    register({ id: 'crewart-academy', engine: 'legacy-layout', rendererModule: 'crewart', brandMark: 'W', studioAccent: '#ddb960', studioAccentInk: '#211604', sharedStudio: true, page3Renderer: 'academy', page3Label: '기숙사 점수', page3Slots: ['groupScoreboard'], page3SettingsSections: ['houseScoreboard'], assetPack: 'crewart', settings: { compatibilityModes: false, assets: true }, defaultState: { page1BannerOn: false, page2BannerOn: false, notice: 'CREWARTS LIVE', noticeDetail: 'R · G · B · Y', page1Ticker: '크레아트 라이브 · 기숙사 점수판', page2Ticker: 'R · G · B · Y' } });
    register({ id: 'creyon-metal', engine: 'legacy-layout', rendererModule: 'creyon', brandMark: 'Y', studioAccent: '#c4a979', studioAccentInk: '#211f1c', sharedStudio: true, page3Renderer: 'status', page3Label: '방송 현황', page3Slots: ['statusBoard'], page3SettingsSections: ['statusBoard'], assetPack: 'creyon', settings: { compatibilityModes: false, assets: true }, defaultState: { page1BannerOn: false, page2BannerOn: false, notice: 'CREYON', noticeDetail: 'HIGH QUALITY CRESTED GECKO', page1Ticker: 'CREYON', page2Ticker: 'HIGH QUALITY CRESTED GECKO' } });

    return Object.freeze({ SHARED_PAGE_CONTRACTS, SHARED_PAGE2_DEFAULTS, SHARED_PLATFORM_RENDERER, SHARED_SETTINGS_CONTRACT, STANDARD_LAYOUT, initialState, broadcastTarget, defaultState, ids, pageContract, register, resolve, settingsContract, studioFrame, usesLegacyData, usesLegacyEngine, usesSharedStudio });
});

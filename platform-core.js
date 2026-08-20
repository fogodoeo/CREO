'use strict';

const ChannelRuntime = require('./public/channel-runtime');

const CHANNEL_STATUSES = Object.freeze(['draft', 'active', 'paused', 'archived']);
const BROADCAST_TEMPLATES = Object.freeze(['classic', 'tournament', 'academy']);
const CHANNEL_TEMPLATES = Object.freeze(['standard', 'team', 'community', 'minimal']);
const OVERLAY_SKINS = Object.freeze(['clean', 'sport', 'heritage', 'minimal', 'metal']);
const OVERLAY_LAYOUTS = Object.freeze(['left', 'right', 'balanced']);
const SCOREBOARD_DIMENSIONS = Object.freeze(['vendor', 'group', 'category', 'winner']);
const SCOREBOARD_METRICS = Object.freeze(['soldAmount', 'soldCount', 'points']);
const DATA_ADAPTERS = Object.freeze(['platform', 'legacy-cdcup']);
const CHANNEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const RESERVED_CORE_PAGE_IDS = new Set(['archives', 'rankings']);

const DEFAULT_CHANNELS = Object.freeze([
    Object.freeze({
        id: 'cdcup',
        name: 'CDCUP',
        shortName: 'CDCUP',
        description: '토너먼트 경매 운영 채널',
        logoUrl: '',
        status: 'active',
        broadcastTemplate: 'tournament',
        dataAdapter: 'legacy-cdcup',
        broadcastProfile: 'cdcup-tournament',
        pages: Object.freeze({}),
        templateId: 'team',
        theme: Object.freeze({
            primary: '#093687',
            secondary: '#c39a4a',
            background: '#070c18',
            surface: '#10182a',
            text: '#f8fafc'
        }),
        features: Object.freeze({ catalog: true, vendors: true, auction: true, shipping: true, broadcast: true, groups: true, scoreboards: true, quiz: true, sponsors: true, tournament: true, survey: false, ranking: true }),
        terminology: Object.freeze({ item: '개체', vendor: '업체', group: '팀', round: '회차', scoreboard: '집계판' }),
        groups: Object.freeze([]),
        scoreboards: Object.freeze([
            Object.freeze({ id: 'vendors', name: '업체별 낙찰금액', dimension: 'vendor', metric: 'soldAmount', unit: '원', topN: 8 }),
            Object.freeze({ id: 'teams', name: '팀별 낙찰금액', dimension: 'group', metric: 'soldAmount', unit: '원', topN: 8 })
        ]),
        overlay: Object.freeze({ skin: 'sport', layout: 'balanced' }),
        broadcastDefaults: Object.freeze({
            notice: 'CDCUP 라이브',
            noticeDetail: '방송을 준비 중입니다.',
            page1Ticker: 'CDCUP LIVE',
            page2Ticker: '경매 정보를 확인해 주세요.',
            page3Title: '종합 순위표'
        }),
        legacy: Object.freeze({ items: true, managementUrl: '/cdcup-index.html', controlUrl: '/broadcast-studio.html?channel=cdcup' })
    }),
    Object.freeze({
        id: 'crewart',
        name: 'CREWARTS',
        shortName: 'CREWARTS',
        description: '크레와트 경매·기숙사 운영 채널',
        logoUrl: '/assets/crewart-broadcast/crewarts-crest.png',
        status: 'active',
        broadcastTemplate: 'academy',
        dataAdapter: 'platform',
        broadcastProfile: 'crewart-academy',
        pages: Object.freeze({ survey: '/crewart-survey.html' }),
        templateId: 'community',
        theme: Object.freeze({
            primary: '#6d28d9',
            secondary: '#d6b25e',
            background: '#140e23',
            surface: '#211735',
            text: '#fffaf0'
        }),
        features: Object.freeze({ catalog: true, vendors: true, auction: true, shipping: true, broadcast: true, groups: true, scoreboards: true, quiz: true, sponsors: true, tournament: false, survey: true, ranking: true }),
        terminology: Object.freeze({ item: '개체', vendor: '업체', group: '기숙사', round: '회차', scoreboard: '기숙사 컵' }),
        groups: Object.freeze([
            Object.freeze({ id: 'r', name: 'R', shortName: 'R', color: '#8a2b31', logoUrl: '', sortOrder: 1 }),
            Object.freeze({ id: 'g', name: 'G', shortName: 'G', color: '#285b3b', logoUrl: '', sortOrder: 2 }),
            Object.freeze({ id: 'b', name: 'B', shortName: 'B', color: '#31558c', logoUrl: '', sortOrder: 3 }),
            Object.freeze({ id: 'y', name: 'Y', shortName: 'Y', color: '#b07d20', logoUrl: '', sortOrder: 4 })
        ]),
        scoreboards: Object.freeze([
            Object.freeze({ id: 'houses', name: '기숙사 컵', dimension: 'group', metric: 'points', unit: '점', topN: 4 })
        ]),
        overlay: Object.freeze({ skin: 'heritage', layout: 'left' }),
        broadcastDefaults: Object.freeze({
            notice: 'CREWARTS LIVE',
            noticeDetail: 'R · G · B · Y',
            page1Ticker: '크레와트 라이브 · 기숙사 점수전',
            page2Ticker: 'R · G · B · Y',
            page3Title: '기숙사 컵'
        }),
        legacy: Object.freeze({ items: false, managementUrl: '/channel-workspace.html?channel=crewart', controlUrl: '/broadcast-studio.html?channel=crewart' })
    })
]);

function cleanText(value, maxLength = 120) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeChannelId(value) {
    const normalized = String(value ?? '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
    return CHANNEL_ID_PATTERN.test(normalized) ? normalized : '';
}

function normalizeColor(value, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return HEX_COLOR_PATTERN.test(normalized) ? normalized : fallback;
}

function normalizeFeatures(value = {}) {
    return {
        catalog: value.catalog !== false,
        vendors: value.vendors !== false,
        auction: value.auction !== false,
        shipping: value.shipping !== false,
        broadcast: value.broadcast !== false,
        groups: Boolean(value.groups),
        scoreboards: value.scoreboards !== false,
        quiz: value.quiz !== false,
        sponsors: value.sponsors !== false,
        tournament: Boolean(value.tournament),
        survey: Boolean(value.survey),
        ranking: value.ranking !== false
    };
}

function normalizeTerminology(value = {}, fallback = {}) {
    return {
        item: cleanText(value.item || fallback.item || '개체', 20),
        vendor: cleanText(value.vendor || fallback.vendor || '업체', 20),
        group: cleanText(value.group || fallback.group || '그룹', 20),
        round: cleanText(value.round || fallback.round || '회차', 20),
        scoreboard: cleanText(value.scoreboard || fallback.scoreboard || '집계판', 20)
    };
}

function normalizeGroups(value = [], fallback = []) {
    const rows = Array.isArray(value) ? value : fallback;
    const seen = new Set();
    return rows.slice(0, 24).map((group, index) => {
        const id = normalizeChannelId(group?.id || group?.shortName || group?.name) || `group-${index + 1}`;
        if (seen.has(id)) return null;
        seen.add(id);
        return {
            id,
            name: cleanText(group?.name || group?.shortName || id, 40),
            shortName: cleanText(group?.shortName || group?.name || id, 12),
            color: normalizeColor(group?.color, '#4b5563'),
            logoUrl: cleanText(group?.logoUrl, 600),
            sortOrder: Math.max(0, Math.min(999, Number.parseInt(group?.sortOrder, 10) || index + 1))
        };
    }).filter(Boolean);
}

function normalizeScoreboards(value = [], fallback = []) {
    const rows = Array.isArray(value) ? value : fallback;
    const seen = new Set();
    return rows.slice(0, 12).map((board, index) => {
        const id = normalizeChannelId(board?.id || board?.name) || `board-${index + 1}`;
        if (seen.has(id)) return null;
        seen.add(id);
        const metric = SCOREBOARD_METRICS.includes(board?.metric) ? board.metric : 'soldAmount';
        return {
            id,
            name: cleanText(board?.name || `집계판 ${index + 1}`, 50),
            dimension: SCOREBOARD_DIMENSIONS.includes(board?.dimension) ? board.dimension : 'vendor',
            metric,
            unit: cleanText(board?.unit || (metric === 'soldAmount' ? '원' : metric === 'points' ? '점' : '건'), 10),
            topN: Math.max(1, Math.min(12, Number.parseInt(board?.topN, 10) || 8))
        };
    }).filter(Boolean);
}

function normalizeOverlay(value = {}, fallback = {}) {
    return {
        skin: OVERLAY_SKINS.includes(value.skin) ? value.skin : (OVERLAY_SKINS.includes(fallback.skin) ? fallback.skin : 'clean'),
        layout: OVERLAY_LAYOUTS.includes(value.layout) ? value.layout : (OVERLAY_LAYOUTS.includes(fallback.layout) ? fallback.layout : 'balanced')
    };
}

function normalizePages(value = {}, fallback = {}) {
    const source = value && typeof value === 'object' ? value : fallback;
    return Object.fromEntries(Object.entries(source || {}).slice(0, 12).map(([key, href]) => {
        const id = normalizeChannelId(key);
        const path = cleanText(href, 300);
        if (!id || RESERVED_CORE_PAGE_IDS.has(id) || (!path.startsWith('/') && !/^https:\/\//i.test(path))) return null;
        return [id, path];
    }).filter(Boolean));
}

function normalizeBroadcastDefaults(value = {}, fallback = {}) {
    const source = { ...(fallback || {}), ...(value || {}) };
    const text = (key, max = 220) => cleanText(source[key], max);
    return {
        hostName1: text('hostName1', 60),
        hostRole1: text('hostRole1', 40),
        hostName2: text('hostName2', 60),
        hostRole2: text('hostRole2', 40),
        hostName3: text('hostName3', 60),
        hostRole3: text('hostRole3', 40),
        notice: text('notice', 160),
        noticeDetail: text('noticeDetail', 200),
        page1Ticker: text('page1Ticker'),
        page1BannerUrl: text('page1BannerUrl', 600),
        page2Ticker: text('page2Ticker'),
        page2BannerUrl: text('page2BannerUrl', 600),
        page3Title: text('page3Title', 120)
    };
}

function normalizeShippingDefaults(value = {}, fallback = {}) {
    const source = value && typeof value === 'object' ? value : fallback;
    const fallbackLocations = Array.isArray(fallback?.pickupLocations) ? fallback.pickupLocations : [];
    const locations = Array.isArray(source?.pickupLocations) ? source.pickupLocations : fallbackLocations;
    return {
        pickupLocations: [...new Set(locations.map((location) => cleanText(location, 60)).filter(Boolean))].slice(0, 24)
    };
}

function normalizeChannel(input = {}, fallback = {}) {
    const source = { ...fallback, ...input };
    const id = normalizeChannelId(source.id || source.slug || source.name);
    const status = CHANNEL_STATUSES.includes(source.status) ? source.status : 'draft';
    const broadcastTemplate = BROADCAST_TEMPLATES.includes(source.broadcastTemplate)
        ? source.broadcastTemplate
        : 'classic';
    const fallbackTheme = fallback.theme || {};
    const theme = { ...(fallback.theme || {}), ...(input.theme || {}) };
    const features = { ...(fallback.features || {}), ...(input.features || {}) };
    const legacy = { ...(fallback.legacy || {}), ...(input.legacy || {}) };
    const templateId = CHANNEL_TEMPLATES.includes(source.templateId) ? source.templateId : 'standard';
    const legacyItems = Boolean(legacy.items);
    const dataAdapter = DATA_ADAPTERS.includes(source.dataAdapter)
        ? source.dataAdapter
        : (DATA_ADAPTERS.includes(fallback.dataAdapter) ? fallback.dataAdapter : (legacyItems ? 'legacy-cdcup' : 'platform'));
    const broadcastProfile = normalizeChannelId(source.broadcastProfile)
        || normalizeChannelId(fallback.broadcastProfile)
        || 'standard';
    return {
        id,
        name: cleanText(source.name, 48),
        shortName: cleanText(source.shortName || source.name, 24),
        description: cleanText(source.description, 140),
        logoUrl: cleanText(source.logoUrl, 600),
        status,
        broadcastTemplate,
        dataAdapter,
        broadcastProfile,
        pages: normalizePages(input.pages ?? source.pages, fallback.pages),
        templateId,
        theme: {
            primary: normalizeColor(theme.primary, fallbackTheme.primary || '#1f2937'),
            secondary: normalizeColor(theme.secondary, fallbackTheme.secondary || '#d6b25e'),
            background: normalizeColor(theme.background, fallbackTheme.background || '#070b12'),
            surface: normalizeColor(theme.surface, fallbackTheme.surface || '#111827'),
            text: normalizeColor(theme.text, fallbackTheme.text || '#f8fafc')
        },
        features: normalizeFeatures(features),
        terminology: normalizeTerminology(input.terminology || source.terminology, fallback.terminology),
        groups: normalizeGroups(input.groups ?? source.groups, fallback.groups),
        scoreboards: normalizeScoreboards(input.scoreboards ?? source.scoreboards, fallback.scoreboards),
        overlay: normalizeOverlay(input.overlay || source.overlay, fallback.overlay),
        broadcastDefaults: normalizeBroadcastDefaults(input.broadcastDefaults ?? source.broadcastDefaults, fallback.broadcastDefaults),
        shippingDefaults: normalizeShippingDefaults(input.shippingDefaults ?? source.shippingDefaults, fallback.shippingDefaults),
        legacy: legacy && typeof legacy === 'object'
            ? {
                items: Boolean(legacy.items),
                managementUrl: cleanText(legacy.managementUrl || fallback.legacy?.managementUrl, 200),
                controlUrl: cleanText(legacy.controlUrl || fallback.legacy?.controlUrl, 200)
            }
            : { items: false, managementUrl: '', controlUrl: '' },
        createdAt: source.createdAt || null,
        updatedAt: source.updatedAt || null
    };
}

function validateChannel(channel, existingChannels = [], currentId = '') {
    const normalized = normalizeChannel(channel);
    const errors = [];
    if (!normalized.id) errors.push('채널 ID는 영문 소문자, 숫자, 하이픈으로 2~32자여야 합니다.');
    if (!normalized.name) errors.push('채널 이름을 입력해 주세요.');
    if (normalized.id && existingChannels.some((item) => item.id === normalized.id && item.id !== currentId)) {
        errors.push('이미 사용 중인 채널 ID입니다.');
    }
    if (normalized.features.shipping && !normalized.features.vendors) errors.push('배송 기능을 사용하려면 업체 기능이 필요합니다.');
    if ((normalized.features.quiz || normalized.features.sponsors || normalized.features.scoreboards || normalized.features.tournament) && !normalized.features.broadcast) {
        errors.push('퀴즈·배너·집계판·대진표 기능을 사용하려면 방송 기능이 필요합니다.');
    }
    if (normalized.features.tournament && (!normalized.features.groups || !normalized.features.scoreboards)) {
        errors.push('대진표 기능을 사용하려면 그룹과 집계판 기능이 필요합니다.');
    }
    if (normalized.scoreboards.some((board) => board.dimension === 'group') && !normalized.features.groups) {
        errors.push('그룹 기준 집계판을 사용하려면 그룹 기능이 필요합니다.');
    }
    return { valid: errors.length === 0, errors, value: normalized };
}

function channelKey(channelId, type, recordId = '') {
    const safeChannel = normalizeChannelId(channelId);
    const safeType = String(type || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    const safeRecord = String(recordId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64);
    if (!safeChannel || !safeType) throw new Error('Invalid channel key');
    return `creo_v2::${safeChannel}::${safeType}${safeRecord ? `::${safeRecord}` : ''}`;
}

function recordId(prefix = 'rec') {
    const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
        || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    return `${String(prefix).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'rec'}_${random.slice(0, 24)}`;
}

function channelLinks(channelId) {
    const id = normalizeChannelId(channelId) || 'cdcup';
    return ChannelRuntime.channelRoutes(id);
}

function publicChecklist(value) {
    const protectedKeys = new Set(['quiz_answer_b64', 'sale_config_b64']);
    return String(value || '')
        .split('|')
        .slice(0, 120)
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .filter((part) => !protectedKeys.has(String(part.split(':', 1)[0] || '').trim().toLowerCase()))
        .join('|')
        .slice(0, 12_000);
}

function publicItemAttributes(item = {}) {
    const attributes = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
    return {
        checklist: publicChecklist(attributes.checklist),
        announce: cleanText(attributes.announce, 1000),
        photo_sire: cleanText(attributes.photo_sire, 600),
        photo_dam: cleanText(attributes.photo_dam, 600),
        photo_sibling: cleanText(attributes.photo_sibling, 600),
        start_time: cleanText(attributes.start_time, 80)
    };
}

function publicBidLog(item = {}) {
    const raw = item.bidLog ?? item.bid_log ?? item.attributes?.bid_log ?? [];
    let rows = raw;
    if (typeof raw === 'string') {
        try { rows = JSON.parse(raw); } catch (_) { rows = []; }
    }
    if (!Array.isArray(rows)) return [];
    return rows.slice(-100).map((bid) => ({
        name: cleanText(bid?.name || bid?.bidder || bid?.winner, 80),
        bidder_key: cleanText(bid?.bidder_key || bid?.bidderKey || '', 80),
        region: cleanText(bid?.region || '', 40),
        amount: Math.max(0, Number(bid?.amount ?? bid?.price) || 0),
        time: cleanText(bid?.time || '', 40),
        timestamp: cleanText(bid?.timestamp || '', 60),
        created_at: cleanText(bid?.created_at || bid?.createdAt || '', 60),
        isQuiz: bid?.isQuiz === true
    })).filter((bid) => bid.name || bid.bidder_key || bid.amount || bid.isQuiz);
}

function publicItem(item = {}) {
    return {
        id: cleanText(item.id, 64),
        lotNumber: Number.parseInt(item.lotNumber, 10) || 0,
        name: cleanText(item.name, 80),
        vendorId: cleanText(item.vendorId, 64),
        vendorName: cleanText(item.vendorName, 80),
        teamName: cleanText(item.teamName, 60),
        groupId: cleanText(item.groupId, 64),
        category: cleanText(item.category, 60),
        points: Number(item.points) || 0,
        winnerAlias: cleanText(item.winnerAlias, 80),
        vendorLogoUrl: cleanText(item.vendorLogoUrl, 500),
        startPrice: Number(item.startPrice) || 0,
        soldPrice: Number(item.soldPrice) || 0,
        status: cleanText(item.status || 'waiting', 24),
        note: cleanText(item.note, 240),
        photoUrl: cleanText(item.photoUrl, 500),
        updatedAt: cleanText(item.updatedAt, 80),
        attributes: publicItemAttributes(item),
        bidLog: publicBidLog(item)
    };
}

module.exports = {
    BROADCAST_TEMPLATES,
    CHANNEL_TEMPLATES,
    CHANNEL_ID_PATTERN,
    CHANNEL_STATUSES,
    DATA_ADAPTERS,
    DEFAULT_CHANNELS,
    channelKey,
    channelLinks,
    cleanText,
    normalizeBroadcastDefaults,
    normalizeChannel,
    normalizeChannelId,
    normalizeShippingDefaults,
    publicChecklist,
    publicItem,
    publicItemAttributes,
    publicBidLog,
    recordId,
    validateChannel
};

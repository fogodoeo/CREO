'use strict';

const CHANNEL_STATUSES = Object.freeze(['draft', 'active', 'paused', 'archived']);
const BROADCAST_TEMPLATES = Object.freeze(['classic', 'tournament', 'academy']);
const CHANNEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const DEFAULT_CHANNELS = Object.freeze([
    Object.freeze({
        id: 'cdcup',
        name: 'CDCUP',
        shortName: 'CDCUP',
        description: '토너먼트 경매 운영 채널',
        status: 'active',
        broadcastTemplate: 'tournament',
        theme: Object.freeze({
            primary: '#093687',
            secondary: '#c39a4a',
            background: '#070c18',
            surface: '#10182a',
            text: '#f8fafc'
        }),
        features: Object.freeze({ tournament: true, survey: false, ranking: true }),
        legacy: Object.freeze({ items: true, managementUrl: '/cdcup-index.html', controlUrl: '/settings.html?module=cdcup' })
    }),
    Object.freeze({
        id: 'crewart',
        name: 'CREWARTS',
        shortName: 'CREWARTS',
        description: '크레와트 경매·기숙사 운영 채널',
        status: 'active',
        broadcastTemplate: 'academy',
        theme: Object.freeze({
            primary: '#6d28d9',
            secondary: '#d6b25e',
            background: '#140e23',
            surface: '#211735',
            text: '#fffaf0'
        }),
        features: Object.freeze({ tournament: false, survey: true, ranking: true }),
        legacy: Object.freeze({ items: false, managementUrl: '/crewart-settings.html', controlUrl: '/settings.html?module=crewart' })
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
        tournament: Boolean(value.tournament),
        survey: Boolean(value.survey),
        ranking: value.ranking !== false
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
    return {
        id,
        name: cleanText(source.name, 48),
        shortName: cleanText(source.shortName || source.name, 24),
        description: cleanText(source.description, 140),
        status,
        broadcastTemplate,
        theme: {
            primary: normalizeColor(theme.primary, fallbackTheme.primary || '#1f2937'),
            secondary: normalizeColor(theme.secondary, fallbackTheme.secondary || '#d6b25e'),
            background: normalizeColor(theme.background, fallbackTheme.background || '#070b12'),
            surface: normalizeColor(theme.surface, fallbackTheme.surface || '#111827'),
            text: normalizeColor(theme.text, fallbackTheme.text || '#f8fafc')
        },
        features: normalizeFeatures(features),
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
    const query = `channel=${encodeURIComponent(id)}`;
    return {
        workspace: `/channel-workspace.html?${query}`,
        control: `/auction-control.html?${query}`,
        preview: `/broadcast-router.html?event=${encodeURIComponent(id)}&page=1`,
        live: `/broadcast-router.html?event=${encodeURIComponent(id)}&page=1&live=1`,
        shipping: `/channel-shipping.html?${query}`
    };
}

function publicItem(item = {}) {
    return {
        id: cleanText(item.id, 64),
        lotNumber: Number.parseInt(item.lotNumber, 10) || 0,
        name: cleanText(item.name, 80),
        vendorId: cleanText(item.vendorId, 64),
        vendorName: cleanText(item.vendorName, 80),
        vendorLogoUrl: cleanText(item.vendorLogoUrl, 500),
        startPrice: Number(item.startPrice) || 0,
        soldPrice: Number(item.soldPrice) || 0,
        status: cleanText(item.status || 'waiting', 24),
        note: cleanText(item.note, 240),
        photoUrl: cleanText(item.photoUrl, 500)
    };
}

module.exports = {
    BROADCAST_TEMPLATES,
    CHANNEL_ID_PATTERN,
    CHANNEL_STATUSES,
    DEFAULT_CHANNELS,
    channelKey,
    channelLinks,
    cleanText,
    normalizeChannel,
    normalizeChannelId,
    publicItem,
    recordId,
    validateChannel
};

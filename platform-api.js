'use strict';

const crypto = require('node:crypto');
const { refreshShippingRate } = require('./shipping-rate-refresh');
const { rankingsForChannel } = require('./public/ranking-engine');
const BasicDice = require('./public/basic-dice-core');
const { normalizePhone } = require('./band-membership');
const SettlementDiscount = require('./public/settlement-discount');
const FALLBACK_PARGE_RATES = require('./public/parge_data.json');
const Checkout = require('./checkout-core');
const { shortSms } = require('./checkout-notifications');

const {
    DEFAULT_CHANNELS,
    channelLinks,
    channelKey,
    cleanText,
    normalizeChannel,
    normalizeChannelId,
    publicItem,
    recordId,
    validateChannel
} = require('./platform-core');

const BODY_LIMIT = 512 * 1024;
const TYPES = new Set(['vendor', 'item', 'shipment', 'asset']);
const ADMIN_COOKIE = 'creo_admin_session';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_LOGIN_ATTEMPTS = 6;
const BROADCAST_CONFIG_ID = 'broadcast-config';
const PINBALL_SESSION_ID = 'pinball-session';
const AUDIENCE_REVEALS_ID = 'crewart-audience-reveals';
const CREWART_ROULETTE_ID = 'crewart-contribution-roulette';
const CREWART_ROULETTE_DURATION_MS = 4500;
const CREWART_ROULETTE_HOLD_MS = 360;
const CREWART_ROULETTE_OUTCOMES = Object.freeze([
    Object.freeze({ multiplier: 0.25, weight: 10 }),
    Object.freeze({ multiplier: 0.5, weight: 20 }),
    Object.freeze({ multiplier: 2, weight: 40 }),
    Object.freeze({ multiplier: 3, weight: 20 }),
    Object.freeze({ multiplier: 4, weight: 10 })
]);
const BROADCAST_CONFIG_KEY = /^[a-z0-9][a-z0-9_:-]{0,79}$/i;
const SHIPPING_RATE_CONFIG_KEYS = Object.freeze({
    '도도시': 'shipping_rate_dodosi',
    '파르게': 'shipping_rate_parge',
    '랩팡': 'shipping_rate_wrapang'
});
const RUNTIME_CONFIG_VERSION_KEY = 'runtime_config_version';
const BUYER_SHIPPING_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const BUYER_SHIPPING_SHORT_KEY_PREFIX = 'buyer_shipping_short_v2_';
const LEGACY_BUYER_SHIPPING_SHORT_KEY_PREFIX = 'buyer_shipping_short_v1_';
const VENDOR_CHECKOUT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VENDOR_CHECKOUT_SHORT_KEY_PREFIX = 'vendor_checkout_short_v1_';

function replyJson(res, status, value, headers = {}) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(body);
}

async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
            const error = new Error('요청 내용이 너무 큽니다.');
            error.status = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch {
        const error = new Error('JSON 형식이 올바르지 않습니다.');
        error.status = 400;
        throw error;
    }
}

function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function sanitizeBroadcastConfigPatch(input = {}) {
    const patch = {};
    let totalLength = 0;
    for (const [rawKey, rawValue] of Object.entries(input && typeof input === 'object' ? input : {}).slice(0, 800)) {
        const key = String(rawKey || '').trim();
        if (!BROADCAST_CONFIG_KEY.test(key) || key === 'admin_pw') continue;
        if (rawValue === null) {
            patch[key] = null;
            continue;
        }
        const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
        if (value.length > 120_000) continue;
        totalLength += key.length + value.length;
        if (totalLength > 420_000) break;
        patch[key] = value;
    }
    return patch;
}

function mergeBroadcastConfig(current = {}, patch = {}) {
    const next = { ...(current && typeof current === 'object' ? current : {}) };
    Object.entries(sanitizeBroadcastConfigPatch(patch)).forEach(([key, value]) => {
        if (value === null) delete next[key];
        else next[key] = value;
    });
    return next;
}

function isBroadcastableChannel(channel) {
    return !channel?.id?.startsWith('checkout-test-') && channel?.status === 'active' && channel?.features?.broadcast !== false;
}

function publicArchive(record = {}) {
    return {
        id: cleanText(record.id, 64),
        title: cleanText(record.title || '회차 기록', 80),
        createdAt: record.createdAt || null,
        itemCount: Number(record.itemCount) || 0,
        soldCount: Number(record.soldCount) || 0,
        totalSoldAmount: Number(record.totalSoldAmount) || 0,
        scoreboardCount: Number(record.scoreboardCount || record.scoreboards?.length) || 0
    };
}

function archiveDetail(record = {}) {
    return {
        ...publicArchive(record),
        scoreboards: Array.isArray(record.scoreboards) ? record.scoreboards : [],
        items: Array.isArray(record.items) ? record.items : [],
        groups: Array.isArray(record.groups) ? record.groups : []
    };
}

function cookieValue(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
        const separator = cookie.indexOf('=');
        if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
        try { return decodeURIComponent(cookie.slice(separator + 1).trim()); }
        catch { return ''; }
    }
    return '';
}

function clientAddress(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.socket?.remoteAddress || 'unknown';
}

function secureRequest(req) {
    return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' || Boolean(req.socket?.encrypted);
}

function adminCookie(token, req, maxAgeSeconds) {
    const parts = [
        `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
    ];
    if (secureRequest(req)) parts.push('Secure');
    return parts.join('; ');
}

function sessionKey(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
}

function sanitizeBroadcastState(input = {}) {
    const extraMode = ['bracket', 'ranking', 'status', 'vendor', 'team'].includes(input.extraMode) ? input.extraMode : 'vendor';
    const positions = ['auto', 'top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    const position = (value, fallback = 'auto') => positions.includes(value) ? value : fallback;
    const bidderOpacityRaw = Number.parseInt(input.page2BiddersOpacity, 10);
    const bidderOpacity = Number.isFinite(bidderOpacityRaw) ? Math.max(0, Math.min(100, bidderOpacityRaw)) : 94;
    const bidderFontSizeRaw = Number.parseInt(input.page2BiddersFontSize, 10);
    const bidderFontSize = Number.isFinite(bidderFontSizeRaw) ? Math.max(10, Math.min(64, bidderFontSizeRaw)) : 20;
    const itemFontSizeRaw = Number.parseInt(input.page2ItemFontSize, 10);
    const itemFontSize = Number.isFinite(itemFontSizeRaw) ? Math.max(16, Math.min(96, itemFontSizeRaw)) : 33;
    const allowedLayoutSlots = new Set([
        'p1-hosts', 'p1-host-1', 'p1-host-2', 'p1-host-3', 'p1-banner', 'p1-ticker', 'p1-brand',
        'p2-progress', 'p2-info', 'p2-bidders', 'p2-photo', 'p2-price', 'p2-sold', 'p2-banner', 'p2-ticker', 'p2-brand',
        'p3-board', 'p3-effect'
    ]);
    const clampLayoutNumber = (value, min, max, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    };
    const multilineText = (value, maxLength = 1200) => String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, maxLength);
    const layoutPlacements = {};
    if (input.layoutPlacements && typeof input.layoutPlacements === 'object' && !Array.isArray(input.layoutPlacements)) {
        for (const [slot, raw] of Object.entries(input.layoutPlacements)) {
            if (!allowedLayoutSlots.has(slot) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            layoutPlacements[slot] = {
                x: clampLayoutNumber(raw.x, 0, 96, 4),
                y: clampLayoutNumber(raw.y, 0, 96, 4),
                width: clampLayoutNumber(raw.width, 4, 100, 40),
                height: clampLayoutNumber(raw.height, 4, 100, 20),
                fontScale: clampLayoutNumber(raw.fontScale, 0.5, 2.5, 1),
                opacity: clampLayoutNumber(raw.opacity, 0, 100, 100),
                visible: raw.visible !== false
            };
        }
    }
    return {
        id: 'state',
        activeItemId: cleanText(input.activeItemId, 64),
        mode: ['standby', 'live', 'sold'].includes(input.mode) ? input.mode : 'standby',
        page: Math.max(1, Math.min(3, Number.parseInt(input.page, 10) || 1)),
        hostName1: cleanText(input.hostName1, 60),
        hostRole1: cleanText(input.hostRole1, 40),
        hostName2: cleanText(input.hostName2, 60),
        hostRole2: cleanText(input.hostRole2, 40),
        hostName3: cleanText(input.hostName3, 60),
        hostRole3: cleanText(input.hostRole3, 40),
        notice: cleanText(input.notice || input.headline, 160),
        noticeDetail: cleanText(input.noticeDetail, 200),
        page1NoticeOn: booleanValue(input.page1NoticeOn),
        page1HostsOn: booleanValue(input.page1HostsOn),
        page1TickerOn: booleanValue(input.page1TickerOn),
        page1BannerOn: booleanValue(input.page1BannerOn, false),
        page1Ticker: multilineText(input.page1Ticker || input.ticker, 1200),
        page1TickerInterval: clampLayoutNumber(input.page1TickerInterval, 1, 30, 5),
        page1BannerUrl: cleanText(input.page1BannerUrl, 600),
        page1HostsPosition: position(input.page1HostsPosition),
        page1NoticePosition: position(input.page1NoticePosition),
        page1BannerPosition: position(input.page1BannerPosition),
        page1TickerPosition: ['auto', 'top', 'bottom'].includes(input.page1TickerPosition) ? input.page1TickerPosition : 'auto',
        page2InfoOn: booleanValue(input.page2InfoOn),
        page2ProgressOn: booleanValue(input.page2ProgressOn),
        page2VendorTagOn: booleanValue(input.page2VendorTagOn),
        page2BiddersOn: booleanValue(input.page2BiddersOn),
        page2BiddersOpacity: bidderOpacity,
        page2BiddersFontSize: bidderFontSize,
        page2BiddersPosition: position(input.page2BiddersPosition, 'top-left'),
        page2ItemFontSize: itemFontSize,
        page2PhotoOn: booleanValue(input.page2PhotoOn),
        page2PriceOn: booleanValue(input.page2PriceOn),
        page2SoldOn: booleanValue(input.page2SoldOn),
        page2TickerOn: booleanValue(input.page2TickerOn),
        page2BannerOn: booleanValue(input.page2BannerOn, false),
        page2Ticker: multilineText(input.page2Ticker || input.ticker, 1200),
        page2TickerInterval: clampLayoutNumber(input.page2TickerInterval, 1, 30, 5),
        page2BannerUrl: cleanText(input.page2BannerUrl, 600),
        page2HeaderPosition: position(input.page2HeaderPosition),
        page2InfoPosition: position(input.page2InfoPosition),
        page2PhotoPosition: position(input.page2PhotoPosition),
        page2PricePosition: position(input.page2PricePosition),
        page2SoldPosition: position(input.page2SoldPosition),
        page2BannerPosition: position(input.page2BannerPosition),
        page2TickerPosition: ['auto', 'top', 'bottom'].includes(input.page2TickerPosition) ? input.page2TickerPosition : 'auto',
        page3On: booleanValue(input.page3On, false),
        page3BannerOn: false,
        page3BannerUrl: '',
        bannerSelectionConfigured: input.bannerSelectionConfigured === true,
        selectedBannerIds: [...new Set((Array.isArray(input.selectedBannerIds)?input.selectedBannerIds:[]).map(id=>cleanText(id,64)).filter(Boolean))].slice(0,100),
        extraMode,
        scoreboardId: cleanText(input.scoreboardId, 64),
        page3Title: cleanText(input.page3Title || input.headline, 120),
        page3ResultBackgroundOpacity: clampLayoutNumber(input.page3ResultBackgroundOpacity, 0, 100, 85),
        page3BoardPosition: ['auto', 'full', 'left', 'right'].includes(input.page3BoardPosition) ? input.page3BoardPosition : 'auto',
        page3QuizPosition: ['auto', 'top', 'center', 'bottom'].includes(input.page3QuizPosition) ? input.page3QuizPosition : 'auto',
        quizOn: booleanValue(input.quizOn, false),
        quizStatus: ['ready', 'open', 'closed'].includes(input.quizStatus) ? input.quizStatus : 'ready',
        quizQuestion: cleanText(input.quizQuestion, 180),
        quizWinner: cleanText(input.quizWinner, 80),
        quizAnswer: cleanText(input.quizAnswer, 80),
        audienceSessionId: cleanText(input.audienceSessionId, 80),
        audienceSessionStatus: ['active', 'closed'].includes(input.audienceSessionStatus) ? input.audienceSessionStatus : '',
        audienceSessionLockedAt: cleanText(input.audienceSessionLockedAt, 80),
        audienceSessionEndedAt: cleanText(input.audienceSessionEndedAt, 80),
        layoutPlacements
    };
}

function pinballEntryCount(entry) {
    const match = String(entry || '').match(/(?:\*(\d+))?(?:\/(?:\d+(?:\.\d+)?))?\s*$/);
    return Math.max(1, Math.min(500, Number.parseInt(match?.[1], 10) || 1));
}

function pinballEntryName(entry) {
    return cleanText(String(entry || '').replace(/(?:\*\d+)?(?:\/(?:\d+(?:\.\d+)?))?\s*$/, '').trim(), 120);
}

function sanitizePinballConfig(input = {}) {
    const speed = Number(input.defaultSpeed);
    const map = Number.parseInt(input.defaultMap, 10);
    const rank = Number.parseInt(input.winningRank, 10);
    const requestedTheme = input.themePreset === 'liongecko' ? 'ryangecko' : input.themePreset;
    return {
        eventTitle: cleanText(input.eventTitle, 40) || '공정하고 즐거운 추첨',
        channelName: cleanText(input.channelName, 30),
        winnerLabel: cleanText(input.winnerLabel, 12) || '당첨',
        defaultMap: Number.isFinite(map) ? Math.max(0, Math.min(20, map)) : 0,
        defaultSpeed: [0.75, 1, 1.5, 2].includes(speed) ? speed : 1,
        renderFps: Number(input.renderFps) === 120 ? 120 : 60,
        winnerMode: ['first', 'last', 'rank'].includes(input.winnerMode) ? input.winnerMode : 'first',
        winningRank: Number.isFinite(rank) ? Math.max(1, Math.min(500, rank)) : 1,
        useSkills: booleanValue(input.useSkills, false),
        autoRecording: false,
        themePreset: ['ryangecko', 'academy', 'midnight', 'arena', 'clean'].includes(requestedTheme) ? requestedTheme : 'midnight',
        marbleStyle: ['glass', 'flat'].includes(input.marbleStyle) ? input.marbleStyle : 'glass',
        accentColor: /^#[0-9a-f]{6}$/i.test(String(input.accentColor || '')) ? String(input.accentColor) : '#f2c66d'
    };
}

function sanitizePinballEntries(input) {
    if (!Array.isArray(input)) return { entries: [], ballCount: 0, error: '참가자 목록이 필요합니다.' };
    const entries = input.slice(0, 500).map((entry) => cleanText(entry, 120)).filter(Boolean);
    const ballCount = entries.reduce((sum, entry) => sum + pinballEntryCount(entry), 0);
    if (ballCount < 2) return { entries, ballCount, error: '공을 2개 이상 입력해 주세요.' };
    if (ballCount > 500) return { entries, ballCount, error: '공은 최대 500개까지 지원합니다.' };
    return { entries, ballCount, error: '' };
}

function sanitizePinballStandings(input) {
    if (!Array.isArray(input)) return [];
    return input.slice(0, 500).map((standing, index) => ({
        rank: Math.max(1, Math.min(500, Number.parseInt(standing?.rank, 10) || index + 1)),
        name: cleanText(standing?.name, 120),
        finished: standing?.finished === true
    })).filter((standing) => standing.name).sort((left, right) => left.rank - right.rank);
}

function publicPinballResult(input) {
    if (!input || typeof input !== 'object') return null;
    return {
        runId: cleanText(input.runId, 80),
        winner: cleanText(input.winner, 120),
        completedAt: input.completedAt || null,
        standings: sanitizePinballStandings(input.standings)
    };
}

function publicPinballSession(record) {
    if (!record) {
        return {
            id: PINBALL_SESSION_ID,
            revision: 0,
            phase: 'idle',
            runId: '',
            command: null,
            entries: [],
            config: null,
            seed: '',
            ballCount: 0,
            result: null,
            history: [],
            updatedAt: null
        };
    }
    return {
        id: PINBALL_SESSION_ID,
        revision: Math.max(0, Number(record.revision) || 0),
        phase: ['idle', 'prepared', 'running', 'complete'].includes(record.phase) ? record.phase : 'idle',
        runId: cleanText(record.runId, 80),
        command: record.command && typeof record.command === 'object' ? {
            id: cleanText(record.command.id, 80),
            type: ['reset', 'prepare', 'start'].includes(record.command.type) ? record.command.type : 'reset',
            issuedAt: record.command.issuedAt || null
        } : null,
        entries: Array.isArray(record.entries) ? record.entries.map((entry) => cleanText(entry, 120)).filter(Boolean) : [],
        config: record.config ? sanitizePinballConfig(record.config) : null,
        seed: cleanText(record.seed, 96),
        ballCount: Math.max(0, Math.min(500, Number(record.ballCount) || 0)),
        result: publicPinballResult(record.result),
        history: Array.isArray(record.resultHistory)
            ? record.resultHistory.slice(0, 50).map(publicPinballResult).filter(Boolean)
            : [],
        updatedAt: record.updatedAt || null
    };
}

function sanitizeRecord(type, input = {}, current = {}) {
    const candidateId = cleanText(input.id || current.id || recordId(type.slice(0, 3)), 64)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 64);
    const base = {
        id: candidateId || recordId(type.slice(0, 3)),
        createdAt: current.createdAt || input.createdAt || null
    };
    if (type === 'vendor') {
        const paymentMethods = Array.isArray(input.paymentMethods)
            ? [...new Set(input.paymentMethods.filter((method) => Checkout.PAYMENT_METHODS.includes(method)))]
            : typeof input.paymentMethods === 'string'
                ? [...new Set(input.paymentMethods.split(',').map((method) => method.trim()).filter((method) => Checkout.PAYMENT_METHODS.includes(method)))]
                : Checkout.normalizeVendorPaymentMethods({ ...current, ...input });
        return {
            ...base,
            code: cleanText(input.code, 24).toUpperCase(),
            name: cleanText(input.name, 80),
            manager: cleanText(input.manager, 60),
            phone: cleanText(input.phone, 30),
            bankName: cleanText(input.bankName, 40),
            bankAccount: cleanText(input.bankAccount, 80),
            bankHolder: cleanText(input.bankHolder, 60),
            paymentMethods,
            directoryRevision: Number(input.directoryRevision ?? current.directoryRevision) || 0,
            cardPaymentEnabled: paymentMethods.includes('card'),
            logoUrl: cleanText(input.logoUrl, 600),
            contributionRate: Number(input.contributionRate ?? current.contributionRate) === 0.5 ? 0.5 : 1,
            groupId: cleanText(input.groupId, 64),
            address: cleanText(input.address, 240),
            note: cleanText(input.note, 500),
            active: input.active !== false
        };
    }
    if (type === 'item') {
        return {
            ...base,
            lotNumber: Math.max(0, Number.parseInt(input.lotNumber, 10) || 0),
            vendorId: cleanText(input.vendorId, 64),
            vendorName: cleanText(input.vendorName, 80),
            teamName: cleanText(input.teamName, 60),
            groupId: cleanText(input.groupId, 64),
            category: cleanText(input.category, 60),
            points: numberValue(input.points),
            name: cleanText(input.name, 100),
            startPrice: Math.max(0, numberValue(input.startPrice)),
            soldPrice: Math.max(0, numberValue(input.soldPrice)),
            status: cleanText(input.status || 'waiting', 24),
            note: cleanText(input.note, 1000),
            photoUrl: cleanText(input.photoUrl, 600),
            winnerName: cleanText(input.winnerName, 80),
            winnerAlias: cleanText(input.winnerAlias, 80),
            winnerPhone: cleanText(input.winnerPhone, 30),
            attributes: input.attributes && typeof input.attributes === 'object' ? input.attributes : {}
        };
    }
    if (type === 'shipment') {
        return {
            ...base,
            itemId: cleanText(input.itemId, 64),
            itemName: cleanText(input.itemName, 100),
            itemLotNumber: Math.max(0, Number.parseInt(input.itemLotNumber, 10) || 0),
            itemVendorName: cleanText(input.itemVendorName, 80),
            vendorId: cleanText(input.vendorId, 64),
            recipientName: cleanText(input.recipientName, 80),
            recipientPhone: cleanText(input.recipientPhone, 30),
            address: cleanText(input.address, 300),
            method: cleanText(input.method || 'delivery', 30),
            carrier: cleanText(input.carrier, 80),
            trackingNumber: cleanText(input.trackingNumber, 100),
            cost: Math.max(0, numberValue(input.cost)),
            status: cleanText(input.status || 'pending', 30),
            note: cleanText(input.note, 500),
            bundleId: cleanText(input.bundleId, 80),
            destinationType: ['pickup', 'parge', 'dodosi'].includes(input.destinationType) ? input.destinationType : '',
            destinationId: cleanText(input.destinationId, 80),
            pargeRegion: cleanText(input.pargeRegion, 80),
            pargeShop: cleanText(input.pargeShop, 120),
            paymentMethod: ['bank_transfer', 'card', 'on_site'].includes(input.paymentMethod) ? input.paymentMethod : '',
            bankSnapshot: input.bankSnapshot && typeof input.bankSnapshot === 'object' ? {
                bankName: cleanText(input.bankSnapshot.bankName,40), bankAccount: cleanText(input.bankSnapshot.bankAccount,80), bankHolder: cleanText(input.bankSnapshot.bankHolder,60)
            } : current.bankSnapshot || null,
            paymentStatus: Checkout.PAYMENT_STATUSES.includes(input.paymentStatus)
                ? input.paymentStatus
                : '',
            paymentRequestedAmount: Math.max(0, numberValue(input.paymentRequestedAmount)),
            shippingChangedAfterReport: Boolean(input.shippingChangedAfterReport),
            cardLinkCancellationRequired: Boolean(input.cardLinkCancellationRequired),
            destinationRevisionId: cleanText(input.destinationRevisionId,80),
            paymentConfirmedAmount: Math.max(0, numberValue(input.paymentConfirmedAmount)),
            paymentConfirmedAt: cleanText(input.paymentConfirmedAt, 80),
            paymentConfirmationRequestId: cleanText(input.paymentConfirmationRequestId, 80),
            cardPaymentUrl: cleanText(input.cardPaymentUrl, 1000),
            cardLinkPreparedAt: cleanText(input.cardLinkPreparedAt, 80),
            cardLinkRequestId: cleanText(input.cardLinkRequestId, 80),
            buyerPaymentReportedAt: cleanText(input.buyerPaymentReportedAt, 80),
            buyerPaymentReportRequestId: cleanText(input.buyerPaymentReportRequestId, 80),
            buyerSubmittedAt: cleanText(input.buyerSubmittedAt, 80),
            buyerRequestId: cleanText(input.buyerRequestId, 80)
        };
    }
    if (type === 'asset') {
        return {
            ...base,
            name: cleanText(input.name, 80),
            kind: ['banner', 'sponsor', 'vendor', 'dice'].includes(input.kind) ? input.kind : 'banner',
            page: ['1', '2', 'all'].includes(String(input.page)) ? String(input.page) : 'all',
            targetName: cleanText(input.targetName, 80),
            imageUrl: cleanText(input.imageUrl, 600),
            linkUrl: cleanText(input.linkUrl, 600),
            sortOrder: Math.max(0, Math.min(9999, Number.parseInt(input.sortOrder, 10) || 0)),
            active: booleanValue(input.active)
        };
    }
    throw new Error('Unsupported record type');
}

function rawItemBidLog(item = {}) {
    const raw = item.bidLog ?? item.bid_log ?? item.attributes?.bid_log ?? [];
    if (Array.isArray(raw)) return raw.slice(-100);
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(-100) : [];
    } catch (_) {
        return [];
    }
}

function contributionAmountForItem(item = {}, atMs = Date.now()) {
    const soldPrice = Math.max(0, Number(item.soldPrice) || 0);
    const attributes = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
    const audienceEffectiveAt = Date.parse(String(attributes.audience_contribution_effective_at || ''));
    const audienceContribution = Number(attributes.audience_contribution_amount);
    if (Number.isFinite(audienceEffectiveAt) && audienceEffectiveAt <= atMs && Number.isFinite(audienceContribution) && audienceContribution >= 0) {
        return audienceContribution;
    }
    const effectiveAt = Date.parse(String(attributes.crewart_contribution_effective_at || ''));
    const contribution = Number(attributes.crewart_contribution_amount);
    if (Number.isFinite(effectiveAt) && effectiveAt <= atMs && Number.isFinite(contribution) && contribution >= 0) {
        return contribution;
    }
    return soldPrice;
}

function itemHouseKey(item = {}) {
    const key = cleanText(item.attributes?.crewart_house_key || item.crewartHouseKey, 8).toUpperCase();
    return ['R', 'G', 'B', 'Y'].includes(key) ? key : '';
}

function liveHighestHouseBid(item = {}) {
    if (item.status !== 'live') return null;
    const bids = rawItemBidLog(item)
        .map((bid, index) => {
            const amount = Math.max(0, Number(bid?.amount) || 0);
            const explicitAmountWon = Number(bid?.amount_won ?? bid?.amountWon);
            return {
                bid,
                index,
                amount: Number.isFinite(explicitAmountWon) && explicitAmountWon >= 0
                    ? explicitAmountWon
                    : amount * 10000
            };
        })
        .sort((left, right) => right.amount - left.amount || left.index - right.index);
    const top = bids[0];
    if (!top?.amount) return null;
    const houseKey = cleanText(top.bid?.crewart_house_key || top.bid?.crewartHouseKey, 8).toUpperCase();
    return ['R', 'G', 'B', 'Y'].includes(houseKey) ? { houseKey, amount: top.amount } : null;
}

function crewartHouseTotals(items = [], atMs = Date.now()) {
    const totals = { R: 0, G: 0, B: 0, Y: 0 };
    for (const item of Array.isArray(items) ? items : []) {
        if (item.status === 'sold') {
            const houseKey = itemHouseKey(item);
            if (houseKey) totals[houseKey] += contributionAmountForItem(item, atMs);
            continue;
        }
        const live = liveHighestHouseBid(item);
        if (live) totals[live.houseKey] += live.amount;
    }
    return totals;
}

function crewartAssignmentWeights(items = [], atMs = Date.now()) {
    const totals = crewartHouseTotals(items, atMs);
    const values = Object.values(totals);
    if (!values.some((value) => value > 0)) return { R: 25, G: 25, B: 25, Y: 25 };
    const slots = [0, 10, 30, 60];
    const rows = Object.keys(totals)
        .map((houseKey) => ({ houseKey, amount: totals[houseKey] }))
        .sort((left, right) => right.amount - left.amount || left.houseKey.localeCompare(right.houseKey));
    const weights = {};
    for (let cursor = 0; cursor < rows.length;) {
        let end = cursor + 1;
        while (end < rows.length && rows[end].amount === rows[cursor].amount) end += 1;
        const sharedWeight = slots.slice(cursor, end).reduce((sum, weight) => sum + weight, 0) / (end - cursor);
        for (let index = cursor; index < end; index += 1) weights[rows[index].houseKey] = sharedWeight;
        cursor = end;
    }
    return weights;
}

function chooseCrewartRouletteMultiplier(randomInt = crypto.randomInt) {
    let cursor = randomInt(100);
    for (const outcome of CREWART_ROULETTE_OUTCOMES) {
        cursor -= outcome.weight;
        if (cursor < 0) return outcome.multiplier;
    }
    return 1;
}

function floorContribution(amount, multiplier) {
    return Math.max(0, Math.floor((Math.max(0, Number(amount) || 0) * multiplier) / 10000) * 10000);
}

function phoneFromBid(bid = {}) {
    const explicit = normalizePhone(
        bid.phone || bid.bidder_phone || bid.bidderPhone || bid.phone_number || bid.phoneNumber || ''
    );
    if (explicit) return explicit;
    const text = String(bid.name || bid.bidder || bid.winner || '');
    const matches = text.match(/(?<!\d)(?:010[\s.-]?\d{4}[\s.-]?\d{4}|\d{8})(?!\d)/g) || [];
    for (const match of matches) {
        const normalized = normalizePhone(/^\d{8}$/.test(match) ? `010${match}` : match);
        if (normalized) return normalized;
    }
    return '';
}

async function bidderMemberKey(bid, bandMembership) {
    if (typeof bandMembership?.resolveMemberSubject !== 'function') return '';
    const bidderKey = cleanText(bid?.bidder_key || bid?.bidderKey || '', 80);
    try {
        return cleanText(await bandMembership.resolveMemberSubject({
            phone: phoneFromBid(bid),
            bandMemberKey: bidderKey,
            displayName: bid?.name || bid?.bidder || bid?.winner || ''
        }), 80);
    } catch (_) {
        return '';
    }
}

function winningBid(item) {
    const bids = rawItemBidLog(item);
    if (!bids.length) return null;
    const winnerValues = [item?.winnerAlias, item?.winnerName]
        .map((value) => cleanText(value, 80).toLowerCase())
        .filter(Boolean);
    const matches = bids.filter((bid) => {
        const name = cleanText(bid?.name || bid?.bidder || bid?.winner, 80).toLowerCase();
        const key = cleanText(bid?.bidder_key || bid?.bidderKey, 80).toLowerCase();
        return winnerValues.includes(name) || winnerValues.includes(key);
    });
    const candidates = matches.length ? matches : bids;
    return candidates
        .map((bid, index) => ({ bid, index, amount: Math.max(0, Number(bid?.amount) || 0) }))
        .sort((left, right) => right.amount - left.amount || right.index - left.index)[0]?.bid || null;
}

async function winnerMemberKey(item, bandMembership) {
    if (typeof bandMembership?.resolveMemberSubject !== 'function') return '';
    const winnerBid = winningBid(item);
    if (!winnerBid) return '';
    return bidderMemberKey({ ...winnerBid, phone: item?.winnerPhone || phoneFromBid(winnerBid) }, bandMembership);
}

function winnerHouseSnapshot(item) {
    const bid = winningBid(item);
    const houseKey = cleanText(bid?.crewart_house_key || bid?.crewartHouseKey, 8).toUpperCase();
    if (!['R', 'G', 'B', 'Y'].includes(houseKey)) return null;
    return {
        houseKey,
        source: cleanText(bid?.crewart_house_source || bid?.crewartHouseSource, 16) === 'survey' ? 'survey' : 'random'
    };
}

function phoneParityCompetitionEnabled(channel) {
    const competition = channel?.audienceCompetition || {};
    return competition.enabled === true
        && competition.assignment === 'phone-parity'
        && competition.metric === 'soldPrice';
}

function mergeChannelBroadcastState(channel, current = {}, patch = {}) {
    const next = { ...(current || {}), ...(patch || {}) };
    // Selection has its own atomic endpoint; older settings panels cannot reset it.
    next.bannerSelectionConfigured = current.bannerSelectionConfigured === true;
    next.selectedBannerIds = current.selectedBannerIds || [];
    if (next.bannerSelectionConfigured) {
        next.page1BannerOn = next.page2BannerOn = next.selectedBannerIds.length > 0;
        next.page1BannerUrl = next.page2BannerUrl = '';
    }
    if (channel?.broadcastProfile !== 'basic-dice') return next;
    const owns = (key) => Object.prototype.hasOwnProperty.call(patch || {}, key);
    const tickerText = owns('page1Ticker')
        ? patch.page1Ticker
        : owns('page2Ticker')
            ? patch.page2Ticker
            : owns('ticker')
                ? patch.ticker
                : current.page1Ticker || current.page2Ticker || '';
    const tickerInterval = owns('page1TickerInterval')
        ? patch.page1TickerInterval
        : owns('page2TickerInterval')
            ? patch.page2TickerInterval
            : current.page1TickerInterval || current.page2TickerInterval || 5;
    return {
        ...next,
        page1Ticker: tickerText,
        page2Ticker: tickerText,
        page1TickerInterval: tickerInterval,
        page2TickerInterval: tickerInterval
    };
}

async function resolveWinnerPhone(item, bandMembership) {
    const bid = winningBid(item) || {};
    const explicit = normalizePhone(item?.winnerPhone || phoneFromBid(bid))
        || phoneFromBid({ name: `${item?.winnerAlias || ''} ${item?.winnerName || ''}` });
    if (explicit) return explicit;
    if (typeof bandMembership?.resolveMemberIdentity !== 'function') return '';
    try {
        const identity = await bandMembership.resolveMemberIdentity({
            bandMemberKey: bid?.bidder_key || bid?.bidderKey || '',
            displayName: bid?.name || bid?.bidder || item?.winnerAlias || item?.winnerName || ''
        });
        return normalizePhone(identity?.phone);
    } catch (_) {
        return '';
    }
}

async function resolvePhoneParityWinner(item, bandMembership) {
    const phone = await resolveWinnerPhone(item, bandMembership);
    if (phone) {
        const lastDigit = Number.parseInt(phone.slice(-1), 10);
        if (Number.isInteger(lastDigit)) {
            return { groupKey: lastDigit % 2 === 0 ? 'even' : 'odd', source: 'phone' };
        }
    }
    // A BAND profile can temporarily be absent from the membership mirror (for
    // example the leader account or a just-joined member). Keep that bidder on
    // one stable side instead of dropping the live score entirely. A later
    // resolvable phone always wins over this fallback.
    const bid = winningBid(item) || {};
    const stableKey = cleanText(
        bid?.bidder_key || bid?.bidderKey || bid?.name || bid?.bidder
            || item?.winnerAlias || item?.winnerName || '',
        160
    );
    if (!stableKey) return null;
    const parity = crypto.createHash('sha256').update(`phone-parity:${stableKey}`).digest()[0] % 2;
    return { groupKey: parity === 0 ? 'even' : 'odd', source: 'fallback' };
}

async function enrichPhoneParityBidderGroups(channel, item, bandMembership) {
    if (!phoneParityCompetitionEnabled(channel)) return item;
    const bids = rawItemBidLog(item);
    if (!bids.length) return item;
    const winning = winningBid({ ...item, bidLog: bids });
    const winnerIndex = Math.max(0, bids.indexOf(winning));
    const assignment = await resolvePhoneParityWinner({
        ...item,
        winnerAlias: winning?.bidder_key || winning?.bidderKey || winning?.name || '',
        winnerName: winning?.name || winning?.bidder || '',
        bidLog: [winning]
    }, bandMembership);
    return {
        ...item,
        bidLog: bids.map((bid, index) => {
            if (index !== winnerIndex) return bid;
            if (!['odd', 'even'].includes(assignment?.groupKey)) return bid;
            return {
                ...bid,
                audience_group_key: assignment.groupKey,
                audience_group_source: assignment.source === 'phone' ? 'phone' : 'fallback'
            };
        }),
        ...(item.status === 'sold' && !['odd', 'even'].includes(cleanText(item.attributes?.audience_group_key, 16).toLowerCase())
            ? {
                attributes: {
                    ...(item.attributes || {}),
                    audience_group_key: assignment?.groupKey || '',
                    audience_group_source: assignment?.source || ''
                }
            }
            : {})
    };
}

function normalizedDiceFace(value) {
    const face = Number.parseInt(value, 10);
    return Number.isInteger(face) && face >= 1 && face <= 6 ? face : 1;
}

async function enrichCrewartBidderHouses(channel, item, crewartHouseService, bandMembership, audienceSession, houseWeights, logger = console) {
    const competition = channel?.audienceCompetition || {};
    if (
        competition.enabled !== true
        || competition.assignment !== 'survey-random'
        || !crewartHouseService
    ) return item;

    const bids = rawItemBidLog(item);
    if (!bids.length) return item;
    const inputs = await Promise.all(bids.map(async (bid, index) => {
        const bidderKey = cleanText(bid?.bidder_key || bid?.bidderKey || '', 80);
        const explicitMemberKey = cleanText(
            bid?.member_key || bid?.memberKey || bid?.band_member_key || bid?.bandMemberKey || '',
            80
        );
        const phone = phoneFromBid(bid);
        const resolvedMemberKey = phone ? '' : await bidderMemberKey(bid, bandMembership);
        return {
            channelId: channel.id,
            itemId: item.id,
            sessionId: cleanText(audienceSession?.audienceSessionId, 80),
            lockedAt: cleanText(audienceSession?.audienceSessionLockedAt, 80),
            assignmentSequence: Math.max(0, Number.parseInt(bid?.bid_sequence || bid?.bidSequence, 10) || 0),
            memberKey: phone ? '' : (explicitMemberKey || resolvedMemberKey || (/^member_[a-z0-9_-]+$/i.test(bidderKey) ? bidderKey : '')),
            phone,
            winnerName: bid?.name || bid?.bidder || bid?.winner || '',
            winnerAlias: bidderKey || bid?.name || `bidder-${index + 1}`,
            houseWeights
        };
    }));

    try {
        const assignments = typeof crewartHouseService.resolveBidderAssignments === 'function'
            ? await crewartHouseService.resolveBidderAssignments(inputs)
            : await Promise.all(inputs.map((input) => crewartHouseService.resolveWinnerAssignment(input)));
        return {
            ...item,
            bidLog: bids.map((bid, index) => {
                const assignment = assignments[index];
                const houseKey = cleanText(assignment?.houseKey, 8).toUpperCase();
                if (!['R', 'G', 'B', 'Y'].includes(houseKey)) return bid;
                return {
                    ...bid,
                    crewart_house_key: houseKey,
                    crewart_house_source: assignment?.source === 'survey' ? 'survey' : 'random'
                };
            })
        };
    } catch (error) {
        logger.warn?.('[platform] live bidder house assignment unavailable', error?.message || error);
        return item;
    }
}

function audienceCompetitionEnabled(channel) {
    const competition = channel?.audienceCompetition || {};
    return competition.enabled === true
        && competition.assignment === 'survey-random'
        && competition.metric === 'soldPrice';
}

function publicBidderKey(value) {
    const raw = cleanText(value, 160);
    return raw ? `bidder_${crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 18)}` : '';
}

function publicBidderName(value) {
    return cleanText(value, 120)
        .replace(/(?<!\d)010[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g, '')
        .replace(/(^|[\s/|·])\d{8,13}(?=$|[\s/|·])/g, '$1')
        .replace(/[\s/|·]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

function validateRecord(type, record, workspace) {
    const errors = [];
    if (type === 'vendor') {
        if (!record.name) errors.push('업체명을 입력해 주세요.');
        if (record.groupId && !workspace.groups?.some((group) => group.id === record.groupId)) errors.push('이 채널에 등록되지 않은 그룹입니다.');
        if (record.code && workspace.vendors.some((vendor) => vendor.code === record.code && vendor.id !== record.id)) {
            errors.push('이 채널에서 이미 사용 중인 업체 코드입니다.');
        }
    }
    if (type === 'item') {
        if (!record.name) errors.push('개체명을 입력해 주세요.');
        if (!record.lotNumber) errors.push('경매 번호를 입력해 주세요.');
        if (record.vendorId && !workspace.vendors.some((vendor) => vendor.id === record.vendorId)) {
            errors.push('이 채널에 등록되지 않은 업체입니다.');
        }
        if (record.groupId && !workspace.groups?.some((group) => group.id === record.groupId)) errors.push('이 채널에 등록되지 않은 그룹입니다.');
        if (workspace.items.some((item) => item.lotNumber === record.lotNumber && item.id !== record.id)) {
            errors.push('이 채널에서 이미 사용 중인 경매 번호입니다.');
        }
    }
    if (type === 'shipment') {
        const item = workspace.items.find((entry) => entry.id === record.itemId);
        if (!item && !record.itemName) errors.push('이 채널에 등록된 개체를 선택해 주세요.');
        if (record.vendorId && !workspace.vendors.some((vendor) => vendor.id === record.vendorId)) {
            errors.push('이 채널에 등록되지 않은 업체입니다.');
        }
        if (record.itemId && workspace.shipments.some((shipment) => shipment.itemId === record.itemId && shipment.id !== record.id)) {
            errors.push('이 개체의 배송 정보가 이미 등록되어 있습니다.');
        }
    }
    if (type === 'asset') {
        if (!record.name) errors.push('자산 이름을 입력해 주세요.');
        if (!record.imageUrl) errors.push('이미지 URL을 입력해 주세요.');
        if (record.kind === 'vendor' && !record.targetName) errors.push('로고를 연결할 업체명을 입력해 주세요.');
        if (record.kind === 'dice' && !/^[1-6]$/.test(record.targetName)) errors.push('주사위 영상은 눈금 1~6 중 하나에 연결해 주세요.');
    }
    return errors;
}

function isSoldItem(item = {}) {
    return cleanText(item.status, 24) === 'sold' || Number(item.soldPrice) > 0;
}

function startsNewAuctionLifecycle(item = {}, requestedStatus = '') {
    return cleanText(item.status, 24) === 'sold' && ['waiting', 'live'].includes(requestedStatus);
}

function storedWinnerPhone(item = {}) {
    return normalizePhone(item.winnerPhone)
        || phoneFromBid(winningBid(item) || {})
        || phoneFromBid({ name: `${item.winnerAlias || ''} ${item.winnerName || ''}` });
}

function buyerDisplayName(item = {}) {
    return publicBidderName(item.winnerName || item.winnerAlias || winningBid(item)?.name || '낙찰자') || '낙찰자';
}

function maskBuyerName(value) {
    const name = cleanText(value, 80);
    if (name.length <= 1) return name;
    if (name.length === 2) return `${name[0]}*`;
    return `${name[0]}${'*'.repeat(Math.min(3, name.length - 2))}${name.at(-1)}`;
}

function stableBuyerId(prefix, value) {
    return `${prefix}_${crypto.createHash('sha256').update(String(value || '')).digest('base64url').slice(0, 20)}`;
}

function vendorKeyForItem(item = {}) {
    return cleanText(item.vendorId || item.vendorName, 80);
}

function buyerSmsItemSummary(items = [], limit = 4) {
    const names = items.map((item) => cleanText(item?.name || `LOT ${Math.max(0, Number(item?.lotNumber) || 0)}`, 100))
        .filter(Boolean);
    const visible = names.slice(0, limit).join('·');
    return names.length > limit ? `${visible} 외 ${names.length - limit}개` : visible || '낙찰 개체';
}

function buyerShippingSms({ name, vendorName, context, payload, buyerUrl }) {
    const paidItemIds = new Set(context.shipments
        .filter((shipment) => shipment.paymentStatus === 'paid' && shipment.paymentConfirmedAt)
        .map((shipment) => shipment.itemId));
    const paidItems = context.bundleItems.filter((item) => paidItemIds.has(item.id));
    const openItems = context.bundleItems.filter((item) => !paidItemIds.has(item.id));
    const additionalWin = payload.payment.confirmedAmount > 0 && openItems.length > 0;
    const additionalPayment = payload.payment.confirmedAmount > 0 && payload.payment.additionalDue > 0;
    const additional = additionalWin || additionalPayment;
    const paid = payload.payment.status === 'paid';
    const submitted = Boolean(payload.submittedAt);
    const itemSummary = buyerSmsItemSummary(additional && openItems.length ? openItems : context.bundleItems);
    let mode = 'initial';
    let lines;

    if (additional) {
        mode = 'additional';
        lines = [
            additionalWin
                ? `${name}님, ${vendorName} ${itemSummary} 추가 낙찰 감사합니다.`
                : `${name}님, ${vendorName} 추가 결제 안내입니다.`,
            paidItems.length ? `기존 결제 완료: ${buyerSmsItemSummary(paidItems)}` : '',
            `추가 결제 금액: ${payload.payment.additionalDue.toLocaleString('ko-KR')}원`,
            '아래 링크에서 배송 내역을 확인해 주세요.',
            '방송 중 통화가 어렵습니다. 결제 후 문자 남겨 주세요.',
            buyerUrl.toString()
        ];
    } else if (paid) {
        mode = 'paid';
        lines = [
            `${name}님, ${vendorName} ${itemSummary} 결제 완료 내역입니다.`,
            '아래 링크에서 배송 내역을 확인할 수 있습니다.',
            buyerUrl.toString()
        ];
    } else if (submitted) {
        mode = 'submitted';
        lines = [
            `${name}님, ${vendorName} ${itemSummary} 낙찰 안내입니다.`,
            '배송·결제 정보가 저장되었습니다. 아래 링크에서 확인해 주세요.',
            '방송 중 통화가 어렵습니다. 결제 후 문자 남겨 주세요.',
            buyerUrl.toString()
        ];
    } else {
        lines = [
            `${name}님, ${vendorName} ${itemSummary} 낙찰 감사합니다.`,
            '배송지와 결제 방법은 아래 링크에서 선택해 주세요.',
            '방송 중 통화가 어렵습니다. 결제 후 문자 남겨 주세요.',
            buyerUrl.toString()
        ];
    }
    return { mode, message: lines.filter(Boolean).join('\n'), itemSummary };
}

function requestOrigin(req) {
    const protocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (req.socket?.encrypted ? 'https' : 'http');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return host ? `${protocol}://${host}` : '';
}

function sanitizePargeRates(payload = FALLBACK_PARGE_RATES) {
    const groups = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    return Object.entries(groups).slice(0, 20).map(([region, rows]) => ({
        region: cleanText(region, 80),
        shops: (Array.isArray(rows) ? rows : []).slice(0, 300).map((row) => ({
            name: cleanText(row?.shop, 120),
            baseCost: Math.max(0, Math.round(Number(row?.cost) || 0))
        })).filter((row) => row.name && row.baseCost > 0)
    })).filter((group) => group.region && group.shops.length);
}

function selectedPargeRate(groups, region, shop) {
    const group = (groups || []).find((entry) => entry.region === region);
    return group?.shops?.find((entry) => entry.name === shop) || null;
}

function buyerShippingCost(selection, itemCount, channel, pargeRates) {
    if (!selection || selection.destinationType !== 'parge') return 0;
    const rate = selectedPargeRate(pargeRates, selection.pargeRegion, selection.pargeShop);
    if (!rate) return 0;
    const count = Math.max(1, Number.parseInt(itemCount, 10) || 1);
    const isJeju = String(selection.pargeRegion || '').includes('제주');
    const extraFee = isJeju
        ? Number(channel?.shippingDefaults?.pargeJejuAdditionalFee) || 4000
        : Number(channel?.shippingDefaults?.pargeAdditionalFee) || 7000;
    return rate.baseCost + Math.max(0, count - 1) * extraFee;
}

function createPlatformApi({
    repository,
    logger = console,
    refreshShippingRateFn = refreshShippingRate,
    crewartHouseService = null,
    bandMembership = null,
    notificationService = null,
    checkoutTestDeliveryChannels = process.env.CREO_CHECKOUT_TEST_DELIVERY_CHANNELS || '',
    diceRoll = null,
    diceRandomInt = (maximum) => crypto.randomInt(maximum),
    adminSessionSecret = process.env.CREO_ADMIN_SECRET || crypto.randomBytes(32).toString('hex'),
    adminSessionTtlMs = ADMIN_SESSION_TTL_MS
} = {}) {
    if (!repository) throw new Error('repository is required');
    const testDeliveryChannels = new Set(String(checkoutTestDeliveryChannels).split(',').map(id => id.trim()).filter(id => /^checkout-test-[a-f0-9]{16}$/.test(id)));
    const vendorDirectory = require('./vendor-directory').createVendorDirectory(repository);
    const bannerLibrary = require('./shared-banner-library').createSharedBannerLibrary(repository);
    const sessionSecret = String(adminSessionSecret || crypto.randomBytes(32).toString('hex'));
    const sessionTtlMs = Math.max(60_000, Number(adminSessionTtlMs) || ADMIN_SESSION_TTL_MS);
    const mutationLocks = new Map();
    const channelRevisions = new Map();
    const knownChannelIds = new Set(DEFAULT_CHANNELS.map((channel) => channel.id));
    const revokedAdminSessions = new Map();
    const adminLoginAttempts = new Map();
    const configuredBuyerSiteOrigin = String(process.env.CREO_BUYER_SITE_ORIGIN || '').trim().replace(/\/$/, '');
    let revisionSequence = 0;
    const checkoutRevisions = new Map();

    function buyerCorsHeaders(req) {
        const origin = String(req.headers.origin || '').trim();
        if (!origin || !configuredBuyerSiteOrigin) return {};
        let allowedOrigin = '';
        try { allowedOrigin = new URL(configuredBuyerSiteOrigin).origin; }
        catch { return {}; }
        if (origin !== allowedOrigin) return {};
        return {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            Vary: 'Origin'
        };
    }

    function signedCheckoutToken(prefix, payload, ttlMs, now = Date.now()) {
        const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: now + ttlMs })).toString('base64url');
        const unsigned = `${prefix}.${encoded}`;
        const signature = crypto.createHmac('sha256', sessionSecret).update(unsigned).digest('base64url');
        return `${unsigned}.${signature}`;
    }

    function verifiedCheckoutToken(rawToken, prefixes, ttlMs, now = Date.now()) {
        const parts = String(rawToken || '').split('.');
        if (parts.length !== 3 || !prefixes.includes(parts[0])) return null;
        const unsigned = parts.slice(0, 2).join('.');
        const expected = crypto.createHmac('sha256', sessionSecret).update(unsigned).digest('base64url');
        const suppliedBuffer = Buffer.from(parts[2]);
        const expectedBuffer = Buffer.from(expected);
        if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
        let payload;
        try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
        catch { return null; }
        if (Number(payload?.expiresAt) <= now || Number(payload.expiresAt) > now + ttlMs + 60_000) return null;
        return { ...payload, tokenVersion: parts[0] };
    }

    function signBuyerShippingToken({ channelId, phone }, now = Date.now()) {
        return signedCheckoutToken('bs2', {
            v: 2,
            channelId: normalizeChannelId(channelId),
            phoneHash: sessionKey(normalizePhone(phone))
        }, BUYER_SHIPPING_TOKEN_TTL_MS, now);
    }

    function verifyBuyerShippingToken(token, now = Date.now()) {
        const payload = verifiedCheckoutToken(token, ['bs2', 'bs1'], BUYER_SHIPPING_TOKEN_TTL_MS, now);
        if (!payload || ![1, 2].includes(Number(payload.v))) return null;
        payload.channelId = normalizeChannelId(payload.channelId);
        payload.itemId = cleanText(payload.itemId, 64);
        payload.phoneHash = cleanText(payload.phoneHash, 100);
        payload.vendorKey = cleanText(payload.vendorKey, 80);
        return payload.channelId && payload.phoneHash ? payload : null;
    }

    function signVendorCheckoutToken({ channelId, vendorKey }, now = Date.now()) {
        return signedCheckoutToken('vc1', {
            v: 1,
            channelId: normalizeChannelId(channelId),
            vendorKey: cleanText(vendorKey, 80)
        }, VENDOR_CHECKOUT_TOKEN_TTL_MS, now);
    }

    function verifyVendorCheckoutToken(token, now = Date.now()) {
        const payload = verifiedCheckoutToken(token, ['vc1'], VENDOR_CHECKOUT_TOKEN_TTL_MS, now);
        if (!payload || Number(payload.v) !== 1) return null;
        payload.channelId = normalizeChannelId(payload.channelId);
        payload.vendorKey = cleanText(payload.vendorKey, 80);
        return payload.channelId && payload.vendorKey ? payload : null;
    }

    function buyerShippingShortCode(payload) {
        const stableKey = [payload.channelId, payload.phoneHash].join(':');
        return crypto.createHmac('sha256', sessionSecret)
            .update(`buyer-shipping-short-v2:${stableKey}`)
            .digest('base64url')
            .slice(0, 11);
    }

    function vendorCheckoutShortCode(payload) {
        return crypto.createHmac('sha256', sessionSecret)
            .update(`vendor-checkout-short-v1:${payload.channelId}:${payload.vendorKey}`)
            .digest('base64url')
            .slice(0, 11);
    }

    async function saveBuyerShippingShortLink(token, payload) {
        const code = buyerShippingShortCode(payload);
        await repository.upsertRows([{
            key: `${BUYER_SHIPPING_SHORT_KEY_PREFIX}${code}`,
            value: JSON.stringify({ token, expiresAt: payload.expiresAt })
        }]);
        return code;
    }

    async function saveVendorCheckoutShortLink(token, payload) {
        const code = vendorCheckoutShortCode(payload);
        await repository.upsertRows([{
            key: `${VENDOR_CHECKOUT_SHORT_KEY_PREFIX}${code}`,
            value: JSON.stringify({ token, expiresAt: payload.expiresAt })
        }]);
        return code;
    }

    async function resolveShortCredential({ token = '', code = '', kind = 'buyer' } = {}) {
        const verify = kind === 'vendor' ? verifyVendorCheckoutToken : verifyBuyerShippingToken;
        const cleanCode = cleanText(code, 24);
        if (cleanCode) {
            if (!/^[A-Za-z0-9_-]{8,24}$/.test(cleanCode)) return '';
            const prefixes = kind === 'vendor'
                ? [VENDOR_CHECKOUT_SHORT_KEY_PREFIX]
                : [BUYER_SHIPPING_SHORT_KEY_PREFIX, LEGACY_BUYER_SHIPPING_SHORT_KEY_PREFIX];
            const rows = await repository.getRowsByKeys(prefixes.map((prefix) => `${prefix}${cleanCode}`));
            const entry = rows.map((row) => {
                try { return JSON.parse(row.value); } catch { return null; }
            }).find(Boolean);
            if (!entry?.token || Number(entry.expiresAt) <= Date.now()) return '';
            return verify(entry.token) ? entry.token : '';
        }
        return verify(token) ? token : '';
    }

    function resolveBuyerShippingCredential(input = {}) {
        return resolveShortCredential({ ...input, kind: 'buyer' });
    }

    function resolveVendorCheckoutCredential(input = {}) {
        return resolveShortCredential({ ...input, kind: 'vendor' });
    }

    function pickupDestinations(channel) {
        const defaults = channel.shippingDefaults || {};
        return (defaults.pickupLocations || []).slice(0, 24).map((label, index) => ({
            id: `pickup-${index + 1}`, type: 'pickup', label
        })).filter(row => !(defaults.disabledPickupLocations || []).includes(row.label));
    }

    async function pargeRates(provider = 'parge') {
        if (provider === 'dodosi') {
            let payload = require('./public/dodosi_data.json');
            try {
                const rows = await repository.getRowsByKeys(['shipping_rate_dodosi']);
                const stored = rows?.find(row => row.key === 'shipping_rate_dodosi')?.value;
                if (stored) payload = JSON.parse(stored);
            } catch (error) { logger.warn?.('[shipping] 도도시 요금표 조회 실패:', error.message); }
            const groups = {};
            const items = Array.isArray(payload) ? payload : payload.items || payload.data || [];
            for (const item of Array.isArray(items) ? items : []) {
                const region = cleanText(item.route || item.region || '기타', 80);
                const name = cleanText(item.region ? `${item.region}${item.sub ? ' ' + item.sub : ''} - ${item.shop}` : item.shop, 120);
                const cost = Number(item.price);
                if (!name || !Number.isFinite(cost) || cost <= 0) continue;
                (groups[region] ||= []).push({ name, baseCost: Math.round(cost) });
            }
            return Object.entries(groups).map(([region, shops]) => ({ region, shops }));
        }
        let payload = FALLBACK_PARGE_RATES;
        try {
            const rows = await repository.getRowsByKeys(['shipping_rate_parge']);
            const stored = rows?.find((row) => row.key === 'shipping_rate_parge')?.value;
            const parsed = stored ? JSON.parse(stored) : null;
            if (parsed?.data && typeof parsed.data === 'object') payload = parsed;
        } catch (error) {
            logger.warn?.('[platform-api] stored PARGE rate load failed:', error.message);
        }
        return sanitizePargeRates(payload);
    }

    async function buyerBundleContext(tokenOrPayload) {
        const token = typeof tokenOrPayload === 'string' ? verifyBuyerShippingToken(tokenOrPayload) : tokenOrPayload;
        if (!token) return null;
        const catalog = await loadCatalog();
        const channel = catalog.channels.find((entry) => entry.id === token.channelId && entry.status === 'active');
        if (!channel || channel.features?.shipping === false || channel.dataAdapter !== 'platform') return null;
        const [items, shipments, vendors] = await Promise.all([
            repository.listRecords(channel.id, 'item'),
            repository.listRecords(channel.id, 'shipment'),
            vendorDirectory.list(channel.id)
        ]);
        const soldItems = items.filter(isSoldItem);
        if (token.tokenVersion === 'bs1' || Number(token.v) === 1) {
            const anchor = soldItems.find((item) => item.id === token.itemId);
            if (!anchor || (token.vendorKey && vendorKeyForItem(anchor) !== token.vendorKey)) return null;
            const anchorPhone = storedWinnerPhone(anchor) || await resolveWinnerPhone(anchor, bandMembership);
            if (!anchorPhone || sessionKey(anchorPhone) !== token.phoneHash) return null;
        }
        const resolved = await Promise.all(soldItems.map(async (item) => ({
            item,
            phone: storedWinnerPhone(item) || await resolveWinnerPhone(item, bandMembership)
        })));
        const bundleItems = resolved.filter((entry) => entry.phone && sessionKey(entry.phone) === token.phoneHash)
            .map((entry) => entry.item)
            .sort(Checkout.itemOrder);
        if (!bundleItems.length) return null;
        const anchorPhone = resolved.find((entry) => bundleItems.some((item) => item.id === entry.item.id))?.phone || '';
        return { token, catalog, channel, items, shipments, vendors, anchorPhone, bundleItems };
    }

    function groupSettlement(context, group) {
        const vendorName = group.vendor?.name || group.items[0]?.vendorName || '';
        const selected = group.items.map((item) => ({
            ...item,
            soldAmountWon: Math.max(0, Number(item.soldPrice) || 0),
            company: vendorName,
            winner: item.winnerName || item.winnerAlias || ''
        }));
        const all = context.items.filter(isSoldItem).map((item) => ({
            ...item,
            soldAmountWon: Math.max(0, Number(item.soldPrice) || 0),
            company: item.vendorName || item.vendorId || '',
            winner: item.winnerName || item.winnerAlias || ''
        }));
        return SettlementDiscount.calculate(context.channel.settlementDiscount, selected, all);
    }

    function latestBundleShipment(context) {
        const itemIds = new Set(context.bundleItems.map((item) => item.id));
        return Checkout.newestShipment(context.shipments.filter((shipment) => itemIds.has(shipment.itemId)));
    }

    function shipmentSelection(shipment) {
        if (!shipment?.destinationType) return null;
        return {
            destinationType: shipment.destinationType,
            destinationId: shipment.destinationId || '',
            pargeRegion: shipment.pargeRegion || '',
            pargeShop: shipment.pargeShop || ''
        };
    }

    async function checkoutSnapshot(context) {
        const latest = latestBundleShipment(context);
        const rates = await pargeRates(latest?.destinationType);
        const selection = shipmentSelection(latest);
        const shipping = Checkout.allocateShipping(context.bundleItems, selection, context.channel, rates);
        // Saved allocations are the quoted shipping price; settings changes do not reprice them.
        for (const row of context.shipments) {
            if (shipping.allocations.has(row.itemId) && row.buyerSubmittedAt) shipping.allocations.set(row.itemId, Math.max(0, Number(row.cost) || 0));
        }
        shipping.total = [...shipping.allocations.values()].reduce((sum, cost) => sum + cost, 0);
        const groups = Checkout.groupItemsByVendor(context.bundleItems, context.vendors).map((group) => {
            const itemIds = new Set(group.items.map((item) => item.id));
            const shipments = context.shipments.filter((shipment) => itemIds.has(shipment.itemId));
            const settlement = groupSettlement(context, group);
            const shippingAmount = group.items.reduce((sum, item) => sum + (shipping.allocations.get(item.id) || 0), 0);
            const totalAmount = settlement.payableAuctionAmount + shippingAmount;
            const payment = Checkout.derivePaymentState({ shipments, itemCount: group.items.length, totalAmount });
            return { ...group, shipments, settlement, shippingAmount, totalAmount, payment };
        });
        return { rates, latest, selection, shipping, groups };
    }

    function groupPublicPayload(group) {
        const latest = group.payment.latest;
        const methods = Checkout.normalizeVendorPaymentMethods(group.vendor);
        return {
            key: group.key,
            id: group.vendor?.id || '',
            name: group.vendor?.name || group.items[0]?.vendorName || '업체',
            contact: {
                manager: cleanText(group.vendor?.manager, 60),
                phone: normalizePhone(group.vendor?.phone)
            },
            paymentMethods: methods,
            items: group.items.map((item) => ({
                id: item.id,
                lotNumber: Math.max(0, Number(item.lotNumber) || 0),
                name: cleanText(item.name || '개체', 100),
                soldAmount: Math.max(0, Number(item.soldPrice) || 0),
                paymentStatus: group.shipments.find((shipment) => shipment.itemId === item.id)?.paymentStatus || ''
            })),
            payment: {
                status: group.payment.status,
                method: latest?.paymentMethod || '',
                confirmedAmount: group.payment.confirmedAmount,
                additionalDue: group.payment.additionalDue,
                confirmationDue: group.payment.confirmationDue ?? null,
                requestedAmount: group.totalAmount,
                shippingChangedAfterReport: Boolean(latest?.shippingChangedAfterReport),
                reportedAmount: latest?.shippingChangedAfterReport ? Number(latest.paymentRequestedAmount)||0 : null,
                cardLinkCancellationRequired: Boolean(latest?.cardLinkCancellationRequired),
                cardPaymentUrl: latest?.paymentMethod === 'card' ? cleanText(latest.cardPaymentUrl, 1000) : '',
                buyerPaymentReportedAt: latest?.buyerPaymentReportedAt || '',
                account: {
                    bankName: cleanText((latest?.bankSnapshot || group.vendor)?.bankName, 40),
                    accountNumber: cleanText((latest?.bankSnapshot || group.vendor)?.bankAccount, 80),
                    holder: cleanText((latest?.bankSnapshot || group.vendor)?.bankHolder, 60)
                }
            },
            totals: {
                auctionAmount: group.settlement.originalAmount,
                discountLabel: group.settlement.label || '',
                discountAmount: group.settlement.discountAmount,
                payableAuctionAmount: group.settlement.payableAuctionAmount,
                shippingAmount: group.shippingAmount,
                totalAmount: group.totalAmount
            }
        };
    }

    async function buyerShippingPayload(context) {
        const snapshot = await checkoutSnapshot(context);
        const fixedDestinations = pickupDestinations(context.channel);
        const carriers = {};
        const availableCarriers = new Set(context.channel.shippingDefaults?.enabledCarriers || ['parge']);
        if (['parge', 'dodosi'].includes(snapshot.selection?.destinationType)) availableCarriers.add(snapshot.selection.destinationType);
        if (snapshot.selection?.destinationType === 'pickup' && !fixedDestinations.some(row => row.id === snapshot.selection.destinationId)) {
            fixedDestinations.push({id:snapshot.selection.destinationId,type:'pickup',label:snapshot.latest.address || '기존 수령지'});
        }
        for (const id of availableCarriers) {
            carriers[id] = { regions: await pargeRates(id), additionalFee: Number(context.channel.shippingDefaults?.[id + 'AdditionalFee'] ?? 7000), jejuAdditionalFee: Number(context.channel.shippingDefaults?.[id + 'JejuAdditionalFee'] ?? (id === 'parge' ? 4000 : 7000)) };
        }
        const groups = snapshot.groups.map(groupPublicPayload);
        const allPaid = groups.length > 0 && groups.every((group) => group.payment.status === 'paid');
        const hasAdditional = groups.some((group) => group.payment.status === 'additional_payment');
        const hasReported = groups.some((group) => ['bank_transfer_reported', 'card_payment_reported'].includes(group.payment.status));
        const submittedAt = snapshot.latest?.buyerSubmittedAt || '';
        const overallStatus = allPaid ? 'paid' : hasAdditional ? 'additional_payment' : hasReported ? 'payment_reported' : submittedAt ? 'in_progress' : 'awaiting_information';
        const auctionAmount = groups.reduce((sum, group) => sum + group.totals.auctionAmount, 0);
        const discountAmount = groups.reduce((sum, group) => sum + group.totals.discountAmount, 0);
        const payableAuctionAmount = groups.reduce((sum, group) => sum + group.totals.payableAuctionAmount, 0);
        const confirmedAmount = groups.reduce((sum, group) => sum + group.payment.confirmedAmount, 0);
        const additionalDue = groups.reduce((sum, group) => sum + group.payment.additionalDue, 0);
        const items = context.bundleItems.map((item) => {
            const group = snapshot.groups.find((entry) => entry.items.some((candidate) => candidate.id === item.id));
            return {
                id: item.id,
                lotNumber: Math.max(0, Number(item.lotNumber) || 0),
                name: cleanText(item.name || '개체', 100),
                vendorKey: group?.key || '',
                vendorName: group?.vendor?.name || item.vendorName || '업체',
                soldAmount: Math.max(0, Number(item.soldPrice) || 0),
                paymentStatus: group?.shipments.find((shipment) => shipment.itemId === item.id)?.paymentStatus || ''
            };
        });
        return {
            revision: checkoutRevision(context.channel.id),
            channel: { id: context.channel.id, name: context.channel.name },
            testDeliveryEnabled: testDeliveryChannels.has(context.channel.id),
            changeRequest: publicChange((await checkoutChanges(context))[0]),
            canRequestChange: Boolean(submittedAt) && !ownCheckoutShipments(context).some(checkoutChangeLocked),
            canEditDestination: !ownCheckoutShipments(context).some(destinationChangeLocked) && !(await pendingCheckoutChange(context) && checkoutRequestChangesPayment(await pendingCheckoutChange(context))),
            buyer: { name: maskBuyerName(buyerDisplayName(context.bundleItems[0])), phoneLast4: context.anchorPhone.slice(-4) },
            items,
            vendors: groups,
            destinations: [...fixedDestinations, ...Object.keys(carriers).map(id => ({ id, type: id, label: id === 'parge' ? '파르게 배송' : '도도시 배송', provider: id === 'parge' ? '파르게' : '도도시' }))],
            carriers,
            parge: {
                regions: snapshot.rates,
                additionalFee: Number(context.channel.shippingDefaults?.pargeAdditionalFee) || 7000,
                jejuAdditionalFee: Number(context.channel.shippingDefaults?.pargeJejuAdditionalFee) || 4000
            },
            selection: snapshot.selection ? {
                ...snapshot.selection,
                payments: groups.map((group) => ({ vendorKey: group.key, method: group.payment.method }))
            } : null,
            payment: { status: overallStatus, confirmedAmount, additionalDue },
            totals: {
                auctionAmount,
                discountLabel: groups.map((group) => group.totals.discountLabel).filter(Boolean).join(' · '),
                discountAmount,
                payableAuctionAmount,
                shippingAmount: snapshot.shipping.total,
                totalAmount: payableAuctionAmount + snapshot.shipping.total
            },
            submittedAt,
            updatedAt: snapshot.latest?.updatedAt || ''
        };
    }

    async function buyerDeliveryPayload(context) {
        const payload = await buyerShippingPayload(context);
        return {
            revision: payload.revision,
            channel: payload.channel,
            buyer: payload.buyer,
            items: payload.items.map(({ id, lotNumber, name, vendorName, soldAmount }) => ({
                id, lotNumber, name, vendorName, soldAmount
            })),
            destinations: payload.destinations,
            parge: payload.parge,
            carriers: payload.carriers,
            selection: payload.selection ? {
                destinationType: payload.selection.destinationType,
                destinationId: payload.selection.destinationId,
                pargeRegion: payload.selection.pargeRegion,
                pargeShop: payload.selection.pargeShop
            } : null,
            submittedAt: payload.submittedAt,
            updatedAt: payload.updatedAt
        };
    }

    function buyerInputError(message, status = 422) {
        const error = new Error(message);
        error.status = status;
        return error;
    }

    function requestedPaymentMethods(body, groups) {
        const rows = Array.isArray(body.payments) ? body.payments : [];
        const requested = new Map(rows.map((row) => [cleanText(row?.vendorKey, 80), cleanText(row?.method, 30)]));
        if (body.paymentMethod && groups.length === 1) requested.set(groups[0].key, cleanText(body.paymentMethod, 30));
        return requested;
    }

    function ownCheckoutShipments(context) {
        const ids = new Set(context.bundleItems.map(item => item.id));
        return context.shipments.filter(row => ids.has(row.itemId));
    }
    async function checkoutChanges(context) {
        return (await repository.listRecords(context.channel.id, 'checkoutchange'))
            .filter(row => row.phoneHash === context.token.phoneHash)
            .sort((a,b) => (a.state!=='pending')-(b.state!=='pending') || String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    async function pendingCheckoutChange(context) { return (await checkoutChanges(context)).find(row => row.state === 'pending'); }
    async function assertNoCheckoutChange(context) {
        if (await pendingCheckoutChange(context)) throw buyerInputError('변경 요청을 운영자가 확인 중입니다. 승인·반려 후 진행해 주세요.', 409);
    }
    async function assertShipmentNotPending(channelId, record) {
        const changes=await repository.listRecords(channelId,'checkoutchange');
        if(changes.some(r=>r.state==='pending' && r.itemIds?.includes(record?.itemId)))throw buyerInputError('변경 요청 승인·반려 후 배송 정보를 수정해 주세요.',409);
    }
    function checkoutSelectionChanged(context, body) {
        const latest = latestBundleShipment(context);
        if (!latest?.buyerSubmittedAt || !ownCheckoutShipments(context).some(row=>row.paymentMethod)) return false;
        if (latest.destinationId !== body.destinationId || (latest.pargeRegion || '') !== (body.pargeRegion || '') || (latest.pargeShop || '') !== (body.pargeShop || '')) return true;
        const groups = Checkout.groupItemsByVendor(context.bundleItems, context.vendors), requested = requestedPaymentMethods(body, groups);
        return groups.some(group => {
            const old = Checkout.newestShipment(ownCheckoutShipments(context).filter(row => group.items.some(item => item.id === row.itemId)));
            return old?.paymentMethod && requested.has(group.key) && old.paymentMethod !== requested.get(group.key);
        });
    }
    function checkoutPaymentChanged(context,body) {
        const groups=Checkout.groupItemsByVendor(context.bundleItems,context.vendors),requested=requestedPaymentMethods(body,groups);
        return groups.some(group=>{
            const old=Checkout.newestShipment(ownCheckoutShipments(context).filter(row=>group.items.some(item=>item.id===row.itemId)));
            return old?.paymentMethod && requested.has(group.key) && old.paymentMethod!==requested.get(group.key);
        });
    }
    function checkoutRequestChangesPayment(record) {
        return record.before.vendors.some(v=>v.method && record.after.vendors.find(a=>a.key===v.key)?.method!==v.method);
    }
    function destinationChangeLocked(row) {
        return row.paymentStatus==='paid' || Number(row.paymentConfirmedAmount)>0 || Boolean(row.trackingNumber) || ['shipped','delivered','received','complete'].includes(row.status);
    }
    function checkoutChangeLocked(row) {
        return ['paid','bank_transfer_reported','card_payment_reported'].includes(row.paymentStatus) || Number(row.paymentConfirmedAmount)>0 || Boolean(row.trackingNumber) || ['shipped','delivered','received','complete'].includes(row.status);
    }
    function assertChangeable(context) {
        if (ownCheckoutShipments(context).some(checkoutChangeLocked)) {
            throw buyerInputError('결제 신고·확인 또는 발송된 내역은 변경할 수 없습니다. 운영자에게 문의해 주세요.', 409);
        }
    }
    function checkoutFingerprint(context) {
        const sort = rows => [...rows].sort((a,b) => String(a.id).localeCompare(String(b.id)));
        return sessionKey(JSON.stringify({items:sort(context.bundleItems),shipments:sort(ownCheckoutShipments(context)),vendors:sort(context.vendors),shipping:context.channel.shippingDefaults,discount:context.channel.settlementDiscount}));
    }
    function changeView(payload) {
        return { selection:payload.selection, totals:payload.totals, vendors:payload.vendors.map(v => ({key:v.key,name:v.name,method:v.payment.method,amount:v.totals.totalAmount,shippingAmount:v.totals.shippingAmount})),
            address:payload.selection?.destinationType === 'pickup' ? payload.destinations.find(d=>d.id===payload.selection.destinationId)?.label || '' : [payload.selection?.pargeRegion,payload.selection?.pargeShop].filter(Boolean).join(' · ') };
    }
    function publicChange(row) { return row ? {id:row.id,state:row.state,createdAt:row.createdAt,reviewedAt:row.reviewedAt || '',reason:row.reason || '',after:row.after} : null; }
    function operatorChangeEvent(record) {
        return {eventKey:`checkout-change:${record.id}`,templateKey:'operator_checkout_change',recipientRole:'operator',recipientPhone:'01049278600',transport:'alimtalk',allowSmsFallback:false,failureSmsFallback:true,
            variables:{업체명:record.before.vendors.map(v=>v.name).join(', '),구매자명:record.buyerName,업체접속코드:record.operatorCode},fallbackText:shortSms('변경 승인 요청',`https://creok.onrender.com/w/${record.operatorCode}`)};
    }
    async function submitCheckoutChange(req, context, body) {
        if(!checkoutPaymentChanged(context,body)){
            const result=await saveBuyerShipping(context,body);
            return {...result,notification:result.duplicate?{duplicate:true}:await enqueueShippingRegistered(req,context)};
        }
        const requestId = cleanText(body.requestId,80);
        if (requestId.length < 8) throw buyerInputError('변경 요청값이 올바르지 않습니다.');
        const id = stableBuyerId('change', `${context.channel.id}:${context.token.phoneHash}:${requestId}`);
        let record = await repository.getRecord(context.channel.id, 'checkoutchange', id);
        const duplicate = Boolean(record);
        if (!record) {
            await assertNoCheckoutChange(context); assertChangeable(context);
            if (!latestBundleShipment(context)?.buyerSubmittedAt || !checkoutSelectionChanged(context,body)) throw buyerInputError('기존 정보와 다른 변경 내용을 선택해 주세요.');
            const proposal = {requestId:`change-${requestId}`.slice(0,80),destinationId:cleanText(body.destinationId,80),pargeRegion:cleanText(body.pargeRegion,80),pargeShop:cleanText(body.pargeShop,120),payments:(body.payments || []).map(p=>({vendorKey:cleanText(p.vendorKey,80),method:cleanText(p.method,30)}))};
            const before = changeView(await buyerShippingPayload(context));
            const preview = await saveBuyerShipping(structuredClone(context), proposal, {dryRun:true});
            const code = 'op_' + sessionKey(`${context.channel.id}:${id}`).replace(/[^A-Za-z0-9_-]/g,'').slice(0,16);
            const now = new Date().toISOString();
            record = {id,channelId:context.channel.id,phoneHash:context.token.phoneHash,phone:context.anchorPhone,buyerName:buyerDisplayName(context.bundleItems[0]),state:'pending',createdAt:now,updatedAt:now,before,after:changeView(preview.payload),proposal,fingerprint:checkoutFingerprint(context),operatorCode:code,
                itemIds:context.bundleItems.map(i=>i.id),cardLinks:ownCheckoutShipments(context).filter(s=>s.cardPaymentUrl).map(s=>({vendorId:s.vendorId,url:s.cardPaymentUrl}))};
            const rows=[{key:channelKey(context.channel.id,'checkoutchange',id),value:JSON.stringify(record)},
                {key:`creo_checkout_change_link::${code}`,value:JSON.stringify({channelId:context.channel.id,id})}];
            if(notificationService?.prepare && (!context.channel.id.startsWith('checkout-test-') || testDeliveryChannels.has(context.channel.id))){
                const prepared=await notificationService.prepare(context.channel.id,operatorChangeEvent(record));
                if(!prepared.duplicate)rows.push({key:channelKey(context.channel.id,'notification',prepared.record.id),value:JSON.stringify(prepared.record)});
            }
            await repository.upsertRows(rows);
            touchCheckout(context.channel.id); touchChannel(context.channel.id);
        }
        let notification = {duplicate:true};
        if (record.state === 'pending') notification = await enqueueNotification(context.channel.id,operatorChangeEvent(record));
        return {duplicate,notification,payload:await buyerShippingPayload(context)};
    }
    async function reviewCheckoutChange(req, channel, id, body) {
        const record = await repository.getRecord(channel.id,'checkoutchange',id);
        if (!record) throw buyerInputError('변경 요청이 없습니다.',404);
        if (!['approve','reject'].includes(body.action)) throw buyerInputError('승인 또는 반려를 선택해 주세요.');
        const state = body.action === 'approve' ? 'approved' : 'rejected';
        if (record.state !== 'pending') {
            if (record.state === state) return {record,duplicate:true};
            throw buyerInputError('이미 처리한 변경 요청입니다.',409);
        }
        if (state === 'approved' && channel.status !== 'active') throw buyerInputError('운영 중인 채널에서만 승인할 수 있습니다.',409);
        const now = new Date().toISOString(), reviewed = {...record,state,updatedAt:now,reviewedAt:now,reviewedBy:'operator',reason:cleanText(body.reason,300)};
        let rows=[];
        if (state === 'approved') {
            const context = await buyerBundleContext({v:2,channelId:channel.id,phoneHash:record.phoneHash});
            if (!context || checkoutFingerprint(context) !== record.fingerprint) throw buyerInputError('요청 이후 낙찰·결제 정보가 바뀌었습니다. 반려 후 다시 요청해 주세요.',409);
            assertChangeable(context);
            if (body.confirmedUnpaid !== true) throw buyerInputError('모든 관련 업체의 미결제 여부를 확인해 주세요.');
            if (record.cardLinks.length && body.confirmedCardLinksCancelled !== true) throw buyerInputError('기존 카드 링크 취소·미승인 여부를 확인해 주세요.');
            const copy=structuredClone(context);
            copy.shipments=copy.shipments.map(s=>context.bundleItems.some(i=>i.id===s.itemId)?{...s,cardPaymentUrl:'',cardLinkPreparedAt:'',cardLinkRequestId:''}:s);
            const result=await saveBuyerShipping(copy,record.proposal,{dryRun:true,approvedChange:true});
            if(JSON.stringify(changeView(result.payload).totals)!==JSON.stringify(record.after.totals))throw buyerInputError('배송비·금액이 바뀌었습니다. 반려 후 다시 요청해 주세요.',409);
            rows=result.records.map(s=>({key:channelKey(channel.id,'shipment',s.id),value:JSON.stringify({...s,updatedAt:now,createdAt:s.createdAt || now})}));
            reviewed.confirmedUnpaid=true; reviewed.confirmedCardLinksCancelled=body.confirmedCardLinksCancelled === true;
        } else if (!reviewed.reason) throw buyerInputError('반려 사유를 입력해 주세요.');
        rows.push({key:channelKey(channel.id,'checkoutchange',id),value:JSON.stringify(reviewed)});
        const context=await buyerBundleContext({v:2,channelId:channel.id,phoneHash:record.phoneHash});
        const events=[];
        if(context){
            const link=await prepareBuyerCheckoutLink(req,channel.id,context.anchorPhone);
            events.push({eventKey:`checkout-change-reviewed:${id}`,templateKey:'buyer_checkout_change_reviewed',recipientRole:'buyer',recipientPhone:context.anchorPhone,transport:'alimtalk',
                variables:{구매자명:record.buyerName,업체명:record.after.vendors.map(v=>v.name).join(', '),개체명:context.bundleItems.map(i=>i.name).join('·'),낙찰금액:`${context.bundleItems.reduce((n,i)=>n+Number(i.soldPrice||0),0).toLocaleString('ko-KR')}원`,접속코드:link.code},fallbackText:shortSms(state==='approved'?'변경 승인':'변경 반려',link.url)});
            if(state==='approved')for(const group of Checkout.groupItemsByVendor(context.bundleItems,context.vendors)){
                if(!normalizePhone(group.vendor?.phone))continue;
                const vendorLink=await prepareVendorCheckoutLink(req,channel.id,group.key);
                events.push({eventKey:`checkout-change-approved:${id}:${group.key}`,templateKey:'vendor_shipping_registered',recipientRole:'vendor',recipientPhone:group.vendor.phone,transport:'alimtalk',variables:{업체명:group.vendor.name,구매자명:record.buyerName,업체접속코드:vendorLink.code},fallbackText:shortSms('수령정보 변경',vendorLink.url)});
            }
        }
        if(notificationService?.prepare && (!channel.id.startsWith('checkout-test-')||testDeliveryChannels.has(channel.id)))for(const event of events){
            const prepared=await notificationService.prepare(channel.id,{...event,recipientPhone:channel.id.startsWith('checkout-test-')?'01049278600':event.recipientPhone,allowSmsFallback:false,failureSmsFallback:true});
            if(!prepared.duplicate)rows.push({key:channelKey(channel.id,'notification',prepared.record.id),value:JSON.stringify(prepared.record)});
        }
        await repository.upsertRows(rows);
        touchCheckout(channel.id);touchChannel(channel.id);
        if(!notificationService?.prepare)for(const event of events)await enqueueNotification(channel.id,event);
        return {record:reviewed,duplicate:false};
    }

    async function saveBuyerShipping(context, body = {}, options = {}) {
        const requirePaymentMethod = options.requirePaymentMethod !== false;
        const responsePayload = options.responsePayload || buyerShippingPayload;
        const requestId = cleanText(body.requestId, 80);
        if (requestId.length < 8) throw buyerInputError('저장 요청값이 올바르지 않습니다.');
        const latest = latestBundleShipment(context);
        const destinationChanged=Boolean(latest?.buyerSubmittedAt) && (latest.destinationId!==body.destinationId || (latest.pargeRegion||'')!==(body.pargeRegion||'') || (latest.pargeShop||'')!==(body.pargeShop||''));
        const directDestinationEdit=destinationChanged && !checkoutPaymentChanged(context,body) && !options.dryRun && !options.approvedChange;
        let replacedRequest=null;
        if (!options.dryRun && !options.approvedChange) {
            const pending=await pendingCheckoutChange(context);
            if(pending && !(directDestinationEdit&&!checkoutRequestChangesPayment(pending)))await assertNoCheckoutChange(context);
            if (checkoutPaymentChanged(context, body)) throw buyerInputError('결제 방식 변경은 운영자 승인이 필요합니다.', 409);
            if(destinationChanged && ownCheckoutShipments(context).some(destinationChangeLocked))throw buyerInputError('결제 확인·발송 이후에는 배송지를 수정할 수 없습니다.',409);
            if(directDestinationEdit && pending)replacedRequest=pending;
        }
        if (latest?.buyerRequestId === requestId) return { duplicate: true, payload: await responsePayload(context) };
        const fixedDestinations = pickupDestinations(context.channel);
        const destinationId = cleanText(body.destinationId, 80);
        const unchangedDestination = latest?.destinationId === destinationId && (latest.pargeRegion || '') === (body.pargeRegion || '') && (latest.pargeShop || '') === (body.pargeShop || '');
        if (unchangedDestination && latest.destinationType === 'pickup' && !fixedDestinations.some(row => row.id === destinationId)) fixedDestinations.push({id:destinationId,type:'pickup',label:latest.address});
        const fixed = fixedDestinations.find((destination) => destination.id === destinationId);
        const rates = await pargeRates(destinationId);
        let selection;
        let method;
        let carrier;
        let address;
        if (fixed) {
            selection = { destinationType: 'pickup', destinationId: fixed.id, pargeRegion: '', pargeShop: '' };
            method = 'pickup';
            carrier = '';
            address = fixed.label;
        } else if (['parge', 'dodosi'].includes(destinationId) && ((context.channel.shippingDefaults?.enabledCarriers || ['parge']).includes(destinationId) || unchangedDestination)) {
            const pargeRegion = cleanText(body.pargeRegion, 80);
            const pargeShop = cleanText(body.pargeShop, 120);
            if (!selectedPargeRate(rates, pargeRegion, pargeShop)) throw buyerInputError('배송업체의 수령 지점을 다시 선택해 주세요.');
            selection = { destinationType: destinationId, destinationId, pargeRegion, pargeShop };
            method = 'delivery';
            carrier = destinationId === 'parge' ? '파르게' : '도도시';
            address = `${pargeRegion} (${pargeShop})`;
        } else {
            throw buyerInputError('배송지를 선택해 주세요.');
        }
        const groups = Checkout.groupItemsByVendor(context.bundleItems, context.vendors);
        const requestedMethods = requestedPaymentMethods(body, groups);
        const shipping = Checkout.allocateShipping(context.bundleItems, selection, context.channel, rates);
        const existingByItem = new Map(context.shipments.map((shipment) => [shipment.itemId, shipment]));
        if (!directDestinationEdit && ownCheckoutShipments(context).some(shipment => ['bank_transfer_reported', 'card_payment_reported'].includes(shipment.paymentStatus))) {
            throw buyerInputError('업체가 결제를 확인 중입니다. 확인 완료 후 추가 내역을 저장해 주세요.', 409);
        }
        const now = new Date().toISOString();
        const saved = [];
        for (const group of groups) {
            const groupShipments = context.shipments.filter((shipment) => group.items.some((item) => item.id === shipment.itemId));
            const groupLatest = Checkout.newestShipment(groupShipments);
            const paymentMethod = requestedMethods.get(group.key) || groupLatest?.paymentMethod || '';
            const allowedMethods = Checkout.normalizeVendorPaymentMethods(group.vendor);
            if (paymentMethod && (!Checkout.PAYMENT_METHODS.includes(paymentMethod) || !allowedMethods.includes(paymentMethod))) {
                throw buyerInputError(`${group.vendor?.name || '업체'}의 결제방식을 선택해 주세요.`);
            }
            if (!paymentMethod && requirePaymentMethod) throw buyerInputError(`${group.vendor?.name || '업체'}의 결제방식을 선택해 주세요.`);
            const settlement = groupSettlement(context, group);
            const shippingAmount = group.items.reduce((sum, item) => sum + (shipping.allocations.get(item.id) || 0), 0);
            const totalAmount = settlement.payableAuctionAmount + shippingAmount;
            const confirmedAmount = Checkout.confirmedAmount(groupShipments);
            const additional = confirmedAmount > 0 && confirmedAmount < totalAmount;
            const previousRequested = Math.max(0, Number(groupLatest?.paymentRequestedAmount) || 0);
            const amountChanged = previousRequested > 0 && previousRequested !== totalAmount;
            const cardPaymentUrl = paymentMethod === 'card' && !amountChanged ? (groupLatest?.cardPaymentUrl || '') : '';
            const openStatus = confirmedAmount >= totalAmount && totalAmount > 0
                ? 'paid'
                : additional
                    ? 'additional_payment'
                    : !paymentMethod
                        ? 'awaiting_information'
                        : paymentMethod === 'card'
                        ? (cardPaymentUrl ? 'card_payment_pending' : 'card_link_pending')
                        : 'bank_transfer_pending';
            const bundleId = stableBuyerId('bundle', `${context.channel.id}:${group.key}:${context.anchorPhone}`);
            for (const item of group.items) {
                const current = existingByItem.get(item.id) || {};
                const keepCompletedItem = current.paymentStatus === 'paid' && Boolean(current.paymentConfirmedAt);
                const keepReported=directDestinationEdit && ['bank_transfer_reported','card_payment_reported'].includes(current.paymentStatus);
                const itemPaymentStatus = keepCompletedItem ? 'paid' : keepReported ? current.paymentStatus : openStatus;
                const record = sanitizeRecord('shipment', {
                    ...current,
                    id: current.id || stableBuyerId('shipment', `${context.channel.id}:${item.id}`),
                    itemId: item.id,
                    itemName: item.name || '',
                    itemLotNumber: Number(item.lotNumber) || 0,
                    itemVendorName: group.vendor?.name || item.vendorName || '',
                    vendorId: item.vendorId || group.vendor?.id || '',
                    recipientName: buyerDisplayName(item),
                    recipientPhone: context.anchorPhone,
                    method,
                    carrier,
                    address,
                    cost: shipping.allocations.get(item.id) || 0,
                    status: itemPaymentStatus === 'paid' ? 'complete' : 'payment_pending',
                    note: current.note || '',
                    bundleId,
                    ...selection,
                    bankSnapshot: current.bankSnapshot || (group.vendor.bankName&&group.vendor.bankAccount&&group.vendor.bankHolder ? {bankName:group.vendor.bankName,bankAccount:group.vendor.bankAccount,bankHolder:group.vendor.bankHolder} : null),
                    paymentMethod,
                    paymentStatus: itemPaymentStatus,
                    paymentRequestedAmount: keepReported ? current.paymentRequestedAmount : totalAmount,
                    shippingChangedAfterReport: keepReported && Number(current.paymentRequestedAmount)!==totalAmount,
                    cardLinkCancellationRequired: !keepReported && paymentMethod==='card' && (Boolean(current.cardLinkCancellationRequired) || (directDestinationEdit&&amountChanged&&Boolean(current.cardPaymentUrl))),
                    paymentConfirmedAmount: confirmedAmount,
                    paymentConfirmedAt: current.paymentConfirmedAt || '',
                    paymentConfirmationRequestId: current.paymentConfirmationRequestId || '',
                    cardPaymentUrl: keepReported ? current.cardPaymentUrl || '' : cardPaymentUrl,
                    cardLinkPreparedAt: cardPaymentUrl ? (groupLatest?.cardLinkPreparedAt || '') : '',
                    cardLinkRequestId: cardPaymentUrl ? (groupLatest?.cardLinkRequestId || '') : '',
                    buyerPaymentReportedAt: keepCompletedItem || keepReported ? current.buyerPaymentReportedAt || '' : '',
                    buyerPaymentReportRequestId: keepCompletedItem || keepReported ? current.buyerPaymentReportRequestId || '' : '',
                    buyerSubmittedAt: now,
                    destinationRevisionId: directDestinationEdit ? requestId : current.destinationRevisionId || '',
                    buyerRequestId: requestId
                }, current);
                saved.push(options.dryRun || directDestinationEdit ? record : await repository.upsertRecord(context.channel.id, 'shipment', record));
            }
        }
        const bundleIds = new Set(context.bundleItems.map((item) => item.id));
        context.shipments = [...context.shipments.filter((shipment) => !bundleIds.has(shipment.itemId)), ...saved];
        if(directDestinationEdit){
            const rows=saved.map(s=>({key:channelKey(context.channel.id,'shipment',s.id),value:JSON.stringify({...s,createdAt:s.createdAt||now,updatedAt:now})}));
            if(replacedRequest)rows.push({key:channelKey(context.channel.id,'checkoutchange',replacedRequest.id),value:JSON.stringify({...replacedRequest,state:'approved',reviewedBy:'buyer',reviewedAt:now,updatedAt:now,reason:'결제 확인 전 배송지 직접 수정',after:changeView(await buyerShippingPayload(context))})});
            await repository.upsertRows(rows);
        }
        if (!options.dryRun) { touchCheckout(context.channel.id); touchChannel(context.channel.id); }
        return { duplicate: false, records: saved, payload: await responsePayload(context) };
    }

    async function reportBuyerPayment(context, vendorKey, requestId) {
        await assertNoCheckoutChange(context);
        const cleanRequestId = cleanText(requestId, 80);
        if (cleanRequestId.length < 8) throw buyerInputError('결제 신고 요청값이 올바르지 않습니다.');
        const snapshot = await checkoutSnapshot(context);
        const group = snapshot.groups.find((entry) => entry.key === cleanText(vendorKey, 80));
        if (!group) throw buyerInputError('결제할 업체 내역을 찾을 수 없습니다.', 404);
        if (group.shipments.length === group.items.length
            && group.shipments.every((shipment) => shipment.buyerPaymentReportRequestId === cleanRequestId)) {
            return { duplicate: true, payload: await buyerShippingPayload(context), group };
        }
        if (!group.payment.latest?.paymentMethod) throw buyerInputError('배송지와 결제방식을 먼저 저장해 주세요.', 409);
        if (group.payment.status === 'paid') return { duplicate: true, payload: await buyerShippingPayload(context), group };
        if (group.payment.latest.paymentMethod === 'card' && !group.payment.latest.cardPaymentUrl) {
            throw buyerInputError('업체에서 카드결제 링크를 준비하고 있습니다.', 409);
        }
        const nextStatus = group.payment.latest.paymentMethod === 'card' ? 'card_payment_reported' : 'bank_transfer_reported';
        const unpaid = group.shipments.filter(shipment => shipment.paymentStatus !== 'paid');
        if (unpaid.length && unpaid.every(shipment => shipment.paymentStatus === nextStatus)) {
            return { duplicate: true, payload: await buyerShippingPayload(context), group };
        }
        // Validate the complete bundle before mutating any existing shipment.
        if (group.items.some(item => !group.shipments.some(shipment => shipment.itemId === item.id))) {
            throw buyerInputError('추가 낙찰 내역의 배송정보를 먼저 저장해 주세요.', 409);
        }
        const now = new Date().toISOString();
        const saved = [];
        for (const item of group.items) {
            const current = group.shipments.find((shipment) => shipment.itemId === item.id);
            if (!current) throw buyerInputError('배송정보를 다시 저장해 주세요.', 409);
            if (current.paymentStatus === 'paid') continue;
            saved.push(await repository.upsertRecord(context.channel.id, 'shipment', sanitizeRecord('shipment', {
                ...current,
                paymentStatus: nextStatus,
                buyerPaymentReportedAt: now,
                buyerPaymentReportRequestId: cleanRequestId
            }, current)));
        }
        const itemIds = new Set(group.items.map((item) => item.id));
        context.shipments = [...context.shipments.filter((shipment) => !itemIds.has(shipment.itemId)),
            ...group.shipments.filter((shipment) => shipment.paymentStatus === 'paid'), ...saved];
        touchCheckout(context.channel.id);
        touchChannel(context.channel.id);
        return { duplicate: false, payload: await buyerShippingPayload(context), group };
    }

    async function confirmBuyerPayment(context, vendorKey, requestId, confirmation = {}) {
        await assertNoCheckoutChange(context);
        const cleanRequestId = cleanText(requestId, 80);
        if (cleanRequestId.length < 8) throw buyerInputError('결제 확인 요청값이 올바르지 않습니다.');
        const snapshot = await checkoutSnapshot(context);
        const group = snapshot.groups.find((entry) => entry.key === cleanText(vendorKey, 80));
        if (!group) throw buyerInputError('구매자 결제 묶음을 찾을 수 없습니다.', 404);
        if (group.payment.status === 'paid') return { duplicate: true, payload: await buyerShippingPayload(context), group };
        if (!snapshot.selection || !group.payment.latest?.paymentMethod) throw buyerInputError('구매자가 배송지와 결제방식을 먼저 선택해야 합니다.', 409);
        if (group.shipments.length === group.items.length
            && group.shipments.every((shipment) => shipment.paymentConfirmationRequestId === cleanRequestId)) {
            return { duplicate: true, payload: await buyerShippingPayload(context), group };
        }
        const now = new Date().toISOString();
        const saved = [];
        const existingByItem = new Map(group.shipments.map((shipment) => [shipment.itemId, shipment]));
        const reported = group.shipments.filter(shipment => ['bank_transfer_reported', 'card_payment_reported'].includes(shipment.paymentStatus));
        const reportedIds = new Set(reported.map(shipment => shipment.itemId));
        const shippingReview=reported.some(s=>s.shippingChangedAfterReport);
        if(shippingReview && (confirmation.shippingAmountReviewed!==true || Number(confirmation.expectedAmount)!==group.totalAmount))throw buyerInputError('배송지 변경으로 금액이 달라졌습니다. 실제 입금·승인 금액이 변경 금액과 일치하는지 다시 확인해 주세요.',409);
        const confirmationAmount = shippingReview ? group.totalAmount : reported.length
            ? Math.max(...reported.map(shipment => Number(shipment.paymentRequestedAmount) || 0))
            : group.totalAmount;
        const bundleId = group.payment.latest.bundleId || stableBuyerId('bundle', `${context.channel.id}:${group.key}:${context.anchorPhone}`);
        for (const item of group.items) {
            const current = existingByItem.get(item.id) || {};
            if (current.paymentStatus === 'paid' || (reported.length && !reportedIds.has(item.id))) {
                if (current.id) saved.push(current);
                continue;
            }
            const record = sanitizeRecord('shipment', {
                ...current,
                id: current.id || stableBuyerId('shipment', `${context.channel.id}:${item.id}`),
                itemId: item.id,
                itemName: item.name || '',
                itemLotNumber: Number(item.lotNumber) || 0,
                itemVendorName: group.vendor?.name || item.vendorName || '',
                vendorId: item.vendorId || group.vendor?.id || '',
                recipientName: buyerDisplayName(item),
                recipientPhone: context.anchorPhone,
                method: snapshot.selection.destinationType === 'pickup' ? 'pickup' : 'delivery',
                carrier: snapshot.selection.destinationType === 'parge' ? '파르게' : snapshot.selection.destinationType === 'dodosi' ? '도도시' : '',
                address: ['parge', 'dodosi'].includes(snapshot.selection.destinationType) ? `${snapshot.selection.pargeRegion} (${snapshot.selection.pargeShop})` : group.payment.latest.address,
                cost: snapshot.shipping.allocations.get(item.id) || 0,
                status: 'complete',
                note: current.note || '',
                bundleId,
                ...snapshot.selection,
                paymentMethod: group.payment.latest.paymentMethod,
                paymentStatus: 'paid',
                shippingChangedAfterReport: false,
                paymentRequestedAmount: confirmationAmount,
                paymentConfirmedAmount: confirmationAmount,
                paymentConfirmedAt: now,
                paymentConfirmationRequestId: cleanRequestId,
                cardPaymentUrl: group.payment.latest.cardPaymentUrl || '',
                cardLinkPreparedAt: group.payment.latest.cardLinkPreparedAt || '',
                cardLinkRequestId: group.payment.latest.cardLinkRequestId || '',
                buyerPaymentReportedAt: current.buyerPaymentReportedAt || group.payment.latest.buyerPaymentReportedAt || '',
                buyerPaymentReportRequestId: current.buyerPaymentReportRequestId || group.payment.latest.buyerPaymentReportRequestId || '',
                buyerSubmittedAt: current.buyerSubmittedAt || group.payment.latest.buyerSubmittedAt || now,
                buyerRequestId: current.buyerRequestId || group.payment.latest.buyerRequestId || ''
            }, current);
            saved.push(await repository.upsertRecord(context.channel.id, 'shipment', record));
        }
        const itemIds = new Set(group.items.map((item) => item.id));
        context.shipments = [...context.shipments.filter((shipment) => !itemIds.has(shipment.itemId)), ...saved];
        touchCheckout(context.channel.id);
        touchChannel(context.channel.id);
        return { duplicate: false, payload: await buyerShippingPayload(context), group };
    }

    async function vendorCheckoutContext(tokenOrPayload, event = '') {
        let token = typeof tokenOrPayload === 'string' ? verifyVendorCheckoutToken(tokenOrPayload) : tokenOrPayload;
        if (!token) return null;
        const profile = await vendorDirectory.profileFor(token.channelId,token.vendorKey);
        if(event && event !== token.channelId) {
            const membership=profile?.members.find(member=>member.channelId===event);
            if(!membership)return null;
            token={...token,channelId:membership.channelId,vendorKey:membership.vendorId};
        }
        const catalog = await loadCatalog();
        if(!event&&profile&&typeof tokenOrPayload==='string') {
            const candidates=profile.members.slice().sort((a,b)=>Number(catalog.channels.find(c=>c.id===b.channelId)?.status==='active')-Number(catalog.channels.find(c=>c.id===a.channelId)?.status==='active'));
            for(const member of candidates) {
                if(catalog.channels.some(c=>c.id===member.channelId)&&await vendorDirectory.find(member.channelId,member.vendorId)) {token={...token,channelId:member.channelId,vendorKey:member.vendorId};break}
            }
        }
        const channel = catalog.channels.find((entry) => entry.id === token.channelId);
        if (!channel || channel.features?.shipping === false || channel.dataAdapter !== 'platform') return null;
        const [items, shipments, vendors] = await Promise.all([
            repository.listRecords(channel.id, 'item'),
            repository.listRecords(channel.id, 'shipment'),
            vendorDirectory.list(channel.id)
        ]);
        const vendor = vendors.find((entry) => entry.id === token.vendorKey)
            || vendors.find((entry) => entry.name === token.vendorKey);
        if (!vendor) return null;
        return { token, catalog, channel, items, shipments, vendors, vendor, profile, vendorKey: token.vendorKey };
    }

    async function vendorBuyerBundles(context) {
        const resolved = await Promise.all(context.items.filter(isSoldItem).map(async (item) => ({
            item,
            phone: storedWinnerPhone(item) || await resolveWinnerPhone(item, bandMembership)
        })));
        const buyerRows = new Map();
        for (const entry of resolved) {
            if (!entry.phone || vendorKeyForItem(entry.item) !== context.vendorKey) continue;
            const phoneHash = sessionKey(entry.phone);
            if (!buyerRows.has(phoneHash)) buyerRows.set(phoneHash, { phoneHash, phone: entry.phone, vendorItems: [] });
            buyerRows.get(phoneHash).vendorItems.push(entry.item);
        }
        const bundles = [];
        for (const row of buyerRows.values()) {
            const bundleItems = resolved.filter((entry) => entry.phone && sessionKey(entry.phone) === row.phoneHash)
                .map((entry) => entry.item)
                .sort(Checkout.itemOrder);
            const buyerContext = {
                token: { channelId: context.channel.id, phoneHash: row.phoneHash },
                catalog: context.catalog,
                channel: context.channel,
                items: context.items,
                shipments: context.shipments,
                vendors: context.vendors,
                anchorPhone: row.phone,
                bundleItems
            };
            const snapshot = await checkoutSnapshot(buyerContext);
            const group = snapshot.groups.find((entry) => entry.key === context.vendorKey);
            if (!group) continue;
            bundles.push({
                id: stableBuyerId('buyer', `${context.channel.id}:${row.phoneHash}`),
                phone: row.phone,
                name: buyerDisplayName(group.items[0]),
                context: buyerContext,
                snapshot,
                group
            });
        }
        return bundles.sort((left, right) => {
            const leftOpen = left.group.payment.status === 'paid' ? 1 : 0;
            const rightOpen = right.group.payment.status === 'paid' ? 1 : 0;
            return leftOpen - rightOpen
                || String(right.group.payment.latest?.buyerPaymentReportedAt || right.group.payment.latest?.buyerSubmittedAt || '')
                    .localeCompare(String(left.group.payment.latest?.buyerPaymentReportedAt || left.group.payment.latest?.buyerSubmittedAt || ''))
                || left.name.localeCompare(right.name, 'ko');
        });
    }

    function vendorBuyerPublicPayload(bundle) {
        const { group, snapshot } = bundle;
        const latest = group.payment.latest;
        return {
            id: bundle.id,
            name: bundle.name,
            phone: bundle.phone,
            destination: snapshot.selection ? {
                ...snapshot.selection,
                address: latest?.address || ''
            } : null,
            items: group.items.map((item) => ({
                id: item.id,
                lotNumber: Math.max(0, Number(item.lotNumber) || 0),
                name: cleanText(item.name || '개체', 100),
                soldAmount: Math.max(0, Number(item.soldPrice) || 0),
                paid: group.shipments.find((shipment) => shipment.itemId === item.id)?.paymentStatus === 'paid'
            })),
            payment: {
                status: group.payment.status,
                method: latest?.paymentMethod || '',
                requestedAmount: group.totalAmount,
                confirmedAmount: group.payment.confirmedAmount,
                additionalDue: group.payment.additionalDue,
                confirmationDue: group.payment.confirmationDue ?? null,
                shippingChangedAfterReport: Boolean(latest?.shippingChangedAfterReport),
                reportedAmount: latest?.shippingChangedAfterReport ? Number(latest.paymentRequestedAmount)||0 : null,
                cardLinkCancellationRequired: Boolean(latest?.cardLinkCancellationRequired),
                cardPaymentUrl: latest?.cardPaymentUrl || '',
                reportedAt: latest?.buyerPaymentReportedAt || '',
                confirmedAt: latest?.paymentConfirmedAt || ''
            },
            totals: {
                auctionAmount: group.settlement.originalAmount,
                discountAmount: group.settlement.discountAmount,
                payableAuctionAmount: group.settlement.payableAuctionAmount,
                shippingAmount: group.shippingAmount,
                totalAmount: group.totalAmount
            }
        };
    }

    async function vendorCheckoutPayload(context) {
        const bundles = await vendorBuyerBundles(context);
        const buyers = await Promise.all(bundles.map(async bundle => ({...vendorBuyerPublicPayload(bundle),changePending:Boolean(await pendingCheckoutChange(bundle.context))})));
        return {
            revision: checkoutRevision(context.channel.id),
            testDeliveryEnabled: testDeliveryChannels.has(context.channel.id),
            channel: { id: context.channel.id, name: context.channel.name, status: context.channel.status },
            events: (context.profile?.members || [{channelId:context.channel.id}]).map(member => {
                const channel=context.catalog.channels.find(row=>row.id===member.channelId);
                return channel ? {id:channel.id,name:channel.name,status:channel.status} : null;
            }).filter(Boolean),
            vendor: {
                id: context.vendor.id,
                directoryRevision: context.vendor.directoryRevision || 0,
                name: context.vendor.name,
                manager: context.vendor.manager || '',
                phone: context.vendor.phone || '',
                bankName: context.vendor.bankName || '',
                bankAccount: context.vendor.bankAccount || '',
                bankHolder: context.vendor.bankHolder || '',
                bankRegistered: Boolean(context.vendor.bankName || context.vendor.bankAccount || context.vendor.bankHolder),
                paymentMethods: Checkout.normalizeVendorPaymentMethods(context.vendor)
            },
            summary: {
                buyerCount: buyers.length,
                itemCount: buyers.reduce((sum, buyer) => sum + buyer.items.length, 0),
                openCount: buyers.filter((buyer) => buyer.payment.status !== 'paid').length,
                reportedCount: buyers.filter((buyer) => ['bank_transfer_reported', 'card_payment_reported'].includes(buyer.payment.status)).length
            },
            buyers
        };
    }

    async function vendorStatusPayload(context) {
        const payload = await vendorCheckoutPayload(context);
        return {
            revision: payload.revision,
            channel: payload.channel,
            vendor: { id: payload.vendor.id, name: payload.vendor.name, manager: payload.vendor.manager },
            summary: { buyerCount: payload.summary.buyerCount, itemCount: payload.summary.itemCount },
            buyers: payload.buyers.map((buyer) => {
                const status = buyer.payment.status;
                return {
                    id: buyer.id,
                    name: buyer.name,
                    phoneLast4: String(buyer.phone || '').replace(/[^0-9]/g, '').slice(-4),
                    destination: buyer.destination?.address || '',
                    items: buyer.items.map(({ id, lotNumber, name, soldAmount, paid }) => ({ id, lotNumber, name, soldAmount, completed: paid })),
                    progress: {
                        status: status === 'paid'
                            ? 'complete'
                            : ['bank_transfer_reported', 'card_payment_reported'].includes(status)
                                ? 'buyer_reported'
                                : buyer.destination
                                    ? 'information_registered'
                                    : 'awaiting_information'
                    }
                };
            })
        };
    }

    async function vendorBuyerBundle(context, buyerId) {
        return (await vendorBuyerBundles(context)).find((entry) => entry.id === cleanText(buyerId, 64)) || null;
    }

    async function saveCardPaymentLink(context, buyerId, rawUrl, requestId, confirmation = {}) {
        const cleanRequestId = cleanText(requestId, 80);
        if (cleanRequestId.length < 8) throw buyerInputError('카드 링크 요청값이 올바르지 않습니다.');
        const cardPaymentUrl = Checkout.validateCardPaymentUrl(rawUrl);
        if (!cardPaymentUrl) throw buyerInputError('외부에서 열 수 있는 HTTPS 카드결제 주소를 입력해 주세요.');
        const bundle = await vendorBuyerBundle(context, buyerId);
        if (!bundle) throw buyerInputError('구매자 결제 내역을 찾을 수 없습니다.', 404);
        await assertNoCheckoutChange(bundle.context);
        const { group } = bundle;
        if(group.shipments.some(s=>s.cardLinkCancellationRequired) && (confirmation.confirmedOldCardLinkCancelled!==true || Number(confirmation.expectedAmount)!==group.totalAmount))throw buyerInputError('배송비 변경 전 카드 링크를 취소·차단하고 현재 금액으로 새 링크를 등록해 주세요.',409);
        if(group.shipments.some(s=>s.shippingChangedAfterReport))throw buyerInputError('결제 신고 후 배송비가 바뀌었습니다. 실제 결제 내역부터 확인해 주세요.',409);
        if (group.payment.status === 'paid') throw buyerInputError('이미 결제 완료된 내역입니다.', 409);
        if (group.payment.latest?.paymentMethod !== 'card') throw buyerInputError('구매자가 카드결제를 선택한 내역이 아닙니다.', 409);
        if (!group.payment.latest?.buyerSubmittedAt) throw buyerInputError('구매자가 배송·결제 정보를 먼저 저장해야 합니다.', 409);
        if (group.shipments.length === group.items.length
            && group.shipments.every((shipment) => shipment.cardLinkRequestId === cleanRequestId)) {
            return { duplicate: true, bundle, payload: await vendorCheckoutPayload(context) };
        }
        const now = new Date().toISOString();
        const saved = [];
        for (const item of group.items) {
            const current = group.shipments.find((shipment) => shipment.itemId === item.id);
            if (!current) throw buyerInputError('구매자가 배송·결제 정보를 다시 저장해야 합니다.', 409);
            if (current.paymentStatus === 'paid') continue;
            saved.push(await repository.upsertRecord(context.channel.id, 'shipment', sanitizeRecord('shipment', {
                ...current,
                cardPaymentUrl,
                cardLinkCancellationRequired: false,
                cardLinkPreparedAt: now,
                cardLinkRequestId: cleanRequestId,
                paymentStatus: 'card_payment_pending',
                buyerPaymentReportedAt: '',
                buyerPaymentReportRequestId: ''
            }, current)));
        }
        const itemIds = new Set(group.items.map((item) => item.id));
        context.shipments = [...context.shipments.filter((shipment) => !itemIds.has(shipment.itemId)),
            ...group.shipments.filter((shipment) => shipment.paymentStatus === 'paid'), ...saved];
        touchCheckout(context.channel.id);
        touchChannel(context.channel.id);
        return { duplicate: false, bundle: await vendorBuyerBundle(context, buyerId), payload: await vendorCheckoutPayload(context) };
    }

    function checkoutPageOrigin(req) {
        return configuredBuyerSiteOrigin || requestOrigin(req);
    }

    async function prepareBuyerCheckoutLink(req, channelId, phone) {
        const token = signBuyerShippingToken({ channelId, phone });
        const payload = verifyBuyerShippingToken(token);
        const code = await saveBuyerShippingShortLink(token, payload);
        const origin = checkoutPageOrigin(req);
        if (!origin) throw buyerInputError('구매자 배송 페이지 주소를 만들 수 없습니다.', 500);
        const url = new URL(`/d/${code}`, origin);
        const apiOrigin = requestOrigin(req);
        if (configuredBuyerSiteOrigin && apiOrigin && url.origin !== new URL(apiOrigin).origin) {
            url.pathname = '/buyer-shipping.html';
            url.searchParams.set('code', code);
            url.searchParams.set('apiOrigin', apiOrigin);
        }
        return { token, payload, code, url };
    }

    async function prepareVendorCheckoutLink(req, channelId, vendorKey) {
        const profile = await vendorDirectory.profileFor(channelId,vendorKey);
        const token = signVendorCheckoutToken(profile ? {channelId:profile.home.channelId,vendorKey:profile.home.vendorId} : { channelId, vendorKey });
        const payload = verifyVendorCheckoutToken(token);
        const code = await saveVendorCheckoutShortLink(token, payload);
        const origin = requestOrigin(req);
        if (!origin) throw buyerInputError('업체 확인 페이지 주소를 만들 수 없습니다.', 500);
        return { token, payload, code, url: new URL(`/w/${code}`, origin) };
    }

    async function enqueueNotification(channelId, event) {
        if (channelId.startsWith('checkout-test-')) {
            if (!testDeliveryChannels.has(channelId)) return { configured: true, suppressed: true, status: 'test_no_send' };
            // Explicitly enabled practice pages can only notify the operator's test phone.
            event = { ...event, recipientPhone: '01049278600' };
        }
        if (!notificationService) return { configured: false, duplicate: false };
        try {
            const result = await notificationService.enqueue(channelId, { ...event, allowSmsFallback: false, failureSmsFallback: true });
            return { configured: true, duplicate: result.duplicate, status: result.record?.status || '' };
        } catch (error) {
            logger.error?.('[platform-api] notification enqueue failed', channelId, event.templateKey, error.message);
            return { configured: true, failed: true, error: error.message };
        }
    }

    async function enqueueSaleNotifications(req, channel, item) {
        const phone = storedWinnerPhone(item) || await resolveWinnerPhone(item, bandMembership);
        const vendorKey = vendorKeyForItem(item);
        const vendor = await vendorDirectory.find(channel.id, item.vendorId)
            || (await vendorDirectory.list(channel.id)).find((entry) => entry.name === item.vendorName)
            || { id: item.vendorId || '', name: item.vendorName || '업체', phone: '' };
        const buyerName = buyerDisplayName(item);
        const vendorName = vendor.name || item.vendorName || '업체';
        const eventVersion = cleanText(item.updatedAt || item.createdAt || Date.now(), 80);
        let buyerResult = { skipped: 'missing_phone' };
        // A missing buyer contact or buyer-link failure must not suppress the vendor's notice.
        if (phone) try {
        const buyerLink = await prepareBuyerCheckoutLink(req, channel.id, phone);
        const buyerContext = await buyerBundleContext(buyerLink.payload);
        const buyerPayload = buyerContext ? await buyerShippingPayload(buyerContext) : null;
        const additional = Boolean(buyerPayload && buyerPayload.items.length > 1);
        const itemSummary = buyerSmsItemSummary(additional && buyerContext ? [item] : buyerContext?.bundleItems || [item]);
        const buyerTemplate = additional ? 'buyer_win_additional' : 'buyer_win_initial';
        const buyerDue = buyerPayload?.payment?.additionalDue || buyerPayload?.totals?.totalAmount || 0;
        buyerResult = await enqueueNotification(channel.id, {
            eventKey: `sale:${item.id}:${eventVersion}:buyer`,
            templateKey: buyerTemplate,
            transport: 'alimtalk', allowSmsFallback: false,
            recipientRole: 'buyer',
            recipientPhone: phone,
            variables: {
                구매자명: buyerName,
                업체명: vendorName,
                개체명: itemSummary,
                낙찰금액: `${Math.max(0, Number(item.soldPrice) || 0).toLocaleString('ko-KR')}원`,
                추가결제금액: `${Math.max(0, Number(buyerDue) || 0).toLocaleString('ko-KR')}원`,
                접속코드: buyerLink.code
            },
            fallbackText: shortSms('낙찰 안내', buyerLink.url, itemSummary)
        });
        } catch (error) {
            logger.error?.('[platform-api] buyer sale notification preparation failed', channel.id, item.id, error.message);
            buyerResult = { failed: true, error: error.message };
        }
        let vendorResult = { skipped: 'missing_vendor_phone' };
        if (normalizePhone(vendor.phone) && vendorKey) {
            const vendorLink = await prepareVendorCheckoutLink(req, channel.id, vendorKey);
            vendorResult = await enqueueNotification(channel.id, {
                eventKey: `sale:${item.id}:${eventVersion}:vendor`,
                templateKey: 'vendor_win',
                transport: 'alimtalk', allowSmsFallback: false,
                recipientRole: 'vendor',
                recipientPhone: vendor.phone,
                variables: {
                    업체명: vendorName,
                    개체명: cleanText(item.name || '개체', 100),
                    구매자명: buyerName,
                    낙찰금액: `${Math.max(0, Number(item.soldPrice) || 0).toLocaleString('ko-KR')}원`,
                    업체접속코드: vendorLink.code
                },
                fallbackText: shortSms('낙찰 등록', vendorLink.url, item.name)
            });
        }
        return { buyer: buyerResult, vendor: vendorResult };
    }

    async function enqueueVendorPaymentReport(req, context, group, buyerName, phone) {
        const vendor = group.vendor || {};
        if (!normalizePhone(vendor.phone)) return { skipped: 'missing_vendor_phone' };
        const link = await prepareVendorCheckoutLink(req, context.channel.id, group.key);
        return enqueueNotification(context.channel.id, {
            eventKey: `payment-reported:${group.key}:${sessionKey(phone)}:${group.payment.latest?.buyerPaymentReportRequestId || Date.now()}`,
            templateKey: 'vendor_payment_reported',
            transport: 'alimtalk', allowSmsFallback: false,
            recipientRole: 'vendor',
            recipientPhone: vendor.phone,
            variables: {
                업체명: vendor.name || '업체',
                구매자명: buyerName,
                결제금액: `${Math.max(0, Number(group.totalAmount) || 0).toLocaleString('ko-KR')}원`,
                업체접속코드: link.code
            },
            fallbackText: shortSms('입금신고 접수', link.url)
        });
    }

    async function enqueueShippingRegistered(req, context) {
        const snapshot = await checkoutSnapshot(context);
        const results = [];
        for (const group of snapshot.groups) {
            if (!normalizePhone(group.vendor?.phone)) continue;
            const link = await prepareVendorCheckoutLink(req, context.channel.id, group.key);
            const latest = group.payment.latest || {};
            const fingerprint = crypto.createHash('sha256').update(JSON.stringify([
                group.items.map(item => [item.id, item.soldPrice]).sort(),
                latest.destinationId, latest.address, latest.pargeRegion, latest.pargeShop, latest.paymentMethod, latest.destinationRevisionId || ''
            ])).digest('hex').slice(0, 24);
            results.push(await enqueueNotification(context.channel.id, {
                eventKey: `shipping-registered:${sessionKey(context.anchorPhone)}:${group.key}:${fingerprint}`,
                templateKey: 'vendor_shipping_registered', transport: 'alimtalk', allowSmsFallback: false,
                recipientRole: 'vendor', recipientPhone: group.vendor.phone,
                variables: { 업체명: group.vendor.name, 구매자명: buyerDisplayName(context.bundleItems[0]), 업체접속코드: link.code },
                fallbackText: shortSms('수령정보 등록', link.url)
            }));
        }
        return results;
    }

    async function enqueueBuyerStatusNotification(req, bundle, templateKey, eventKey) {
        const link = await prepareBuyerCheckoutLink(req, bundle.context.channel.id, bundle.phone);
        const vendorName = bundle.group.vendor?.name || '업체';
        const amount = bundle.group.payment.additionalDue || bundle.group.totalAmount;
        const isCard = templateKey === 'buyer_card_link_ready';
        return enqueueNotification(bundle.context.channel.id, {
            eventKey,
            templateKey,
            transport: 'alimtalk', allowSmsFallback: false,
            recipientRole: 'buyer',
            recipientPhone: bundle.phone,
            variables: {
                구매자명: bundle.name,
                업체명: vendorName,
                개체명: bundle.group.items.map(item => cleanText(item.name || '개체', 100)).join(', '),
                낙찰금액: `${Math.max(0, Number(bundle.group.settlement.originalAmount) || 0).toLocaleString('ko-KR')}원`,
                결제금액: `${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')}원`,
                접속코드: link.code
            },
            fallbackText: shortSms(isCard ? '카드결제 안내' : '결제 확인', link.url)
        });
    }

    function channelRevision(channelId) {
        return channelRevisions.get(channelId) || 0;
    }

    function checkoutRevision(channelId) {
        return checkoutRevisions.get(channelId) || 0;
    }

    function touchChannel(channelId) {
        revisionSequence += 1;
        knownChannelIds.add(channelId);
        channelRevisions.set(channelId, revisionSequence);
        return revisionSequence;
    }

    function touchCheckout(channelId) {
        revisionSequence += 1;
        knownChannelIds.add(channelId);
        checkoutRevisions.set(channelId, revisionSequence);
        return revisionSequence;
    }

    async function touchVendorChannels(channelId,vendorId) {
        const profile=await vendorDirectory.profileFor(channelId,vendorId);
        for(const id of new Set([channelId,...(profile?.members||[]).map(member=>member.channelId)])){touchCheckout(id);touchChannel(id)}
    }

    function touchRecord(channelId, type, before = null, after = null) {
        if (
            type === 'shipment'
            || type === 'vendor'
            || (type === 'item' && (isSoldItem(before || {}) || isSoldItem(after || {})))
        ) touchCheckout(channelId);
        return touchChannel(channelId);
    }

    async function loadCatalog() {
        const catalog = await repository.getCatalog();
        catalog.channels.forEach((channel) => knownChannelIds.add(channel.id));
        return catalog;
    }

    async function withMutationLock(key, callback) {
        const lockKey = String(key || 'global');
        const previous = mutationLocks.get(lockKey) || Promise.resolve();
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const tail = previous.then(() => gate);
        mutationLocks.set(lockKey, tail);
        await previous;
        try { return await callback(); }
        finally {
            release();
            if (mutationLocks.get(lockKey) === tail) mutationLocks.delete(lockKey);
        }
    }
    function pruneAdminState(now = Date.now()) {
        for (const [key, expiresAt] of revokedAdminSessions) {
            if (expiresAt <= now) revokedAdminSessions.delete(key);
        }
        for (const [key, attempt] of adminLoginAttempts) {
            if (attempt.resetAt <= now) adminLoginAttempts.delete(key);
        }
    }

    function signAdminSession(now = Date.now()) {
        const issuedAt = Math.floor(now);
        const expiresAt = issuedAt + sessionTtlMs;
        const unsigned = `v1.${issuedAt}.${expiresAt}.${crypto.randomBytes(18).toString('base64url')}`;
        const signature = crypto.createHmac('sha256', sessionSecret).update(unsigned).digest('base64url');
        return `${unsigned}.${signature}`;
    }

    function verifyAdminSession(token, now = Date.now()) {
        const parts = String(token || '').split('.');
        if (parts.length !== 5 || parts[0] !== 'v1') return null;
        const issuedAt = Number(parts[1]);
        const expiresAt = Number(parts[2]);
        if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return null;
        if (issuedAt > now + 5 * 60 * 1000 || expiresAt <= now || expiresAt < issuedAt || expiresAt - issuedAt > sessionTtlMs) return null;
        const unsigned = parts.slice(0, 4).join('.');
        const expected = crypto.createHmac('sha256', sessionSecret).update(unsigned).digest('base64url');
        const suppliedBuffer = Buffer.from(parts[4]);
        const expectedBuffer = Buffer.from(expected);
        if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
        return { expiresAt };
    }

    function hasAdminSession(req, now = Date.now()) {
        const token = cookieValue(req, ADMIN_COOKIE);
        if (!token) return false;
        const key = sessionKey(token);
        if ((revokedAdminSessions.get(key) || 0) > now) return false;
        return Boolean(verifyAdminSession(token, now));
    }

    function revokeAdminSession(req, now = Date.now()) {
        const token = cookieValue(req, ADMIN_COOKIE);
        const session = verifyAdminSession(token, now);
        if (session) revokedAdminSessions.set(sessionKey(token), session.expiresAt);
    }

    function loginAttempt(address, now = Date.now()) {
        const current = adminLoginAttempts.get(address);
        if (!current || current.resetAt <= now) return { count: 0, resetAt: now + ADMIN_LOGIN_WINDOW_MS };
        return current;
    }

    async function isAdmin(req) {
        pruneAdminState();
        if (hasAdminSession(req)) return true;
        const supplied = req.headers['x-creo-admin'];
        return supplied ? repository.verifyAdmin(supplied) : false;
    }

    async function requireAdmin(req, res) {
        if (await isAdmin(req)) return true;
        replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
        return false;
    }

    async function workspace(channelId) {
        const [vendors, items, shipments, assets, broadcast] = await Promise.all([
            vendorDirectory.list(channelId),
            repository.listRecords(channelId, 'item'),
            repository.listRecords(channelId, 'shipment'),
            repository.listRecords(channelId, 'asset'),
            repository.getRecord(channelId, 'broadcast', 'state')
        ]);
        return { vendors, items, shipments, assets, broadcast: broadcast || { id: 'state', mode: 'standby', page: 1 } };
    }

    function activeAudienceSession(state = {}) {
        if (state.audienceSessionStatus !== 'active' || !cleanText(state.audienceSessionId, 80)) return null;
        return {
            sessionId: cleanText(state.audienceSessionId, 80),
            lockedAt: cleanText(state.audienceSessionLockedAt, 80)
        };
    }

    async function ensureAudienceSession(channelId, channel, state = {}) {
        const existing = activeAudienceSession(state);
        if (existing || !audienceCompetitionEnabled(channel)) return { state, session: existing, created: false };
        const nowIso = new Date().toISOString();
        const sessionId = `cw_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('base64url')}`;
        const nextState = sanitizeBroadcastState({
            ...state,
            audienceSessionId: sessionId,
            audienceSessionStatus: 'active',
            audienceSessionLockedAt: nowIso,
            audienceSessionEndedAt: ''
        });
        const saved = await repository.upsertRecord(channelId, 'broadcast', nextState);
        await repository.upsertRecord(channelId, 'setting', {
            id: AUDIENCE_REVEALS_ID,
            sessionId,
            sequence: 0,
            events: [],
            revealedBidderKeys: [],
            updatedAt: nowIso
        });
        await repository.upsertRecord(channelId, 'setting', {
            id: CREWART_ROULETTE_ID,
            sessionId,
            sequence: 0,
            events: [],
            updatedAt: nowIso
        });
        return { state: saved, session: { sessionId, lockedAt: nowIso }, created: true };
    }

    async function appendAudienceReveal(channelId, session, input, assignment) {
        if (assignment?.source !== 'random') return null;
        const requestSequence = Math.max(0, Number.parseInt(input.bid_sequence || input.bidSequence, 10) || 0);
        const assignmentSequence = Math.max(0, Number.parseInt(assignment.assignmentSequence, 10) || 0);
        const assignmentSessionId = cleanText(assignment.sessionId, 80);
        // A broadcast read can warm the session assignment cache before the
        // desktop assignment POST arrives. Those warmed rows have sequence 0;
        // the first real bid must still create exactly one public reveal.
        const ownsAssignment = Boolean(assignment.isNew)
            || (requestSequence > 0 && (assignmentSequence === 0 || requestSequence >= assignmentSequence));
        if ((assignmentSessionId && assignmentSessionId !== session.sessionId) || !ownsAssignment) return null;
        const stored = await repository.getRecord(channelId, 'setting', AUDIENCE_REVEALS_ID);
        const current = stored?.sessionId === session.sessionId
            ? stored
            : { id: AUDIENCE_REVEALS_ID, sessionId: session.sessionId, sequence: 0, events: [], revealedBidderKeys: [] };
        const bidderKey = cleanText(input.bidder_key || input.bidderKey, 120);
        const safeBidderKey = publicBidderKey(bidderKey || input.name);
        const revealedBidderKeys = [...new Set([
            ...(Array.isArray(current.revealedBidderKeys) ? current.revealedBidderKeys : []),
            ...(Array.isArray(current.events) ? current.events.map((event) => event?.bidderKey) : [])
        ].map((value) => cleanText(value, 64)).filter(Boolean))];
        if (revealedBidderKeys.includes(safeBidderKey)) return null;
        const sequence = Math.max(0, Number.parseInt(current.sequence, 10) || 0) + 1;
        const messageKey = cleanText(input.message_key || input.messageKey, 180);
        const event = {
            id: `reveal_${crypto.createHash('sha256').update(`${session.sessionId}:${messageKey || bidderKey}:${sequence}`).digest('base64url').slice(0, 20)}`,
            sequence,
            bidderKey: safeBidderKey,
            name: publicBidderName(input.name || input.bidder || input.winner),
            region: cleanText(input.region, 40),
            amount: Math.max(0, Number(input.amount) || 0),
            houseKey: cleanText(assignment.houseKey, 8).toUpperCase(),
            assignedAt: cleanText(assignment.assignedAt || new Date().toISOString(), 80)
        };
        const events = [...(Array.isArray(current.events) ? current.events : []), event]
            .sort((a, b) => Number(a.sequence) - Number(b.sequence))
            .slice(-100);
        await repository.upsertRecord(channelId, 'setting', {
            ...current,
            id: AUDIENCE_REVEALS_ID,
            sessionId: session.sessionId,
            sequence,
            events,
            revealedBidderKeys: [...revealedBidderKeys, safeBidderKey].slice(-1000),
            updatedAt: new Date().toISOString()
        });
        return event;
    }

    async function resolveAudienceBidder(channelId, channel, state, input = {}) {
        if (!audienceCompetitionEnabled(channel) || typeof crewartHouseService?.resolveWinnerAssignment !== 'function') {
            return { assignment: null, reveal: null, state, session: null };
        }
        const ensured = await ensureAudienceSession(channelId, channel, state);
        const phone = phoneFromBid(input);
        const memberKey = phone ? '' : await bidderMemberKey(input, bandMembership);
        const assignment = await crewartHouseService.resolveWinnerAssignment({
            channelId,
            itemId: cleanText(input.itemId, 64),
            sessionId: ensured.session.sessionId,
            lockedAt: ensured.session.lockedAt,
            assignmentSequence: Math.max(0, Number.parseInt(input.bid_sequence || input.bidSequence, 10) || 0),
            memberKey,
            phone,
            winnerName: input.name || input.bidder || input.winner || '',
            winnerAlias: input.bidder_key || input.bidderKey || input.name || '',
            houseWeights: input.houseWeights
        });
        const reveal = await appendAudienceReveal(channelId, ensured.session, input, assignment);
        return { assignment, reveal, state: ensured.state, session: ensured.session };
    }

    async function decorateCrewartBidLog(channelId, channel, state, item) {
        const bids = rawItemBidLog(item);
        if (!bids.length || !audienceCompetitionEnabled(channel) || typeof crewartHouseService?.resolveBidderAssignments !== 'function') {
            return { item, state };
        }
        const ensured = await ensureAudienceSession(channelId, channel, state);
        const assignmentWeights = crewartAssignmentWeights((await workspace(channelId)).items);
        const ordered = bids.map((bid, index) => ({ bid, index })).sort((a, b) => {
            const aSeq = Math.max(0, Number.parseInt(a.bid?.bid_sequence || a.bid?.bidSequence, 10) || 0);
            const bSeq = Math.max(0, Number.parseInt(b.bid?.bid_sequence || b.bid?.bidSequence, 10) || 0);
            return (aSeq - bSeq) || (a.index - b.index);
        });
        const inputs = await Promise.all(ordered.map(async ({ bid, index }) => {
            const phone = phoneFromBid(bid);
            const explicitMemberKey = cleanText(
                bid?.member_key || bid?.memberKey || bid?.band_member_key || bid?.bandMemberKey || '',
                80
            );
            const bidderKey = cleanText(bid?.bidder_key || bid?.bidderKey, 80);
            const resolvedMemberKey = phone ? '' : await bidderMemberKey(bid, bandMembership);
            return {
                channelId,
                itemId: item.id,
                sessionId: ensured.session.sessionId,
                lockedAt: ensured.session.lockedAt,
                assignmentSequence: Math.max(0, Number.parseInt(bid?.bid_sequence || bid?.bidSequence, 10) || index + 1),
                memberKey: phone ? '' : (explicitMemberKey || resolvedMemberKey || (/^member_[a-z0-9_-]+$/i.test(bidderKey) ? bidderKey : '')),
                phone,
                winnerName: bid?.name || bid?.bidder || bid?.winner || '',
                winnerAlias: bidderKey || bid?.name || `bidder-${index + 1}`,
                houseWeights: assignmentWeights
            };
        }));
        const assignments = await crewartHouseService.resolveBidderAssignments(inputs);
        const decoratedByIndex = new Map();
        for (let orderedIndex = 0; orderedIndex < ordered.length; orderedIndex += 1) {
            const { bid, index } = ordered[orderedIndex];
            const assignment = assignments[orderedIndex];
            const decorated = {
                ...bid,
                crewart_house_key: cleanText(assignment?.houseKey, 8).toUpperCase(),
                crewart_house_source: assignment?.source === 'survey' ? 'survey' : 'random',
                crewart_assignment_session: ensured.session.sessionId,
                crewart_assignment_sequence: Math.max(0, Number.parseInt(assignment?.assignmentSequence, 10) || inputs[orderedIndex].assignmentSequence)
            };
            decoratedByIndex.set(index, decorated);
            await appendAudienceReveal(channelId, ensured.session, decorated, assignment);
        }
        const decoratedBids = bids.map((bid, index) => decoratedByIndex.get(index) || bid);
        return {
            state: ensured.state,
            item: {
                ...item,
                attributes: {
                    ...(item.attributes || {}),
                    bid_log: JSON.stringify(decoratedBids)
                }
            }
        };
    }

    async function audienceRevealPayload(channelId, state = {}) {
        const session = activeAudienceSession(state);
        if (!session) return { sessionId: '', lockedAt: '', sequence: 0, events: [], revealedBidderKeys: [] };
        const stored = await repository.getRecord(channelId, 'setting', AUDIENCE_REVEALS_ID);
        const events = stored?.sessionId === session.sessionId && Array.isArray(stored.events)
            ? stored.events.slice(-100).map((event) => ({
                id: cleanText(event.id, 64),
                sequence: Math.max(0, Number.parseInt(event.sequence, 10) || 0),
                bidderKey: cleanText(event.bidderKey, 64),
                name: publicBidderName(event.name),
                region: cleanText(event.region, 40),
                amount: Math.max(0, Number(event.amount) || 0),
                houseKey: ['R', 'G', 'B', 'Y'].includes(cleanText(event.houseKey, 8).toUpperCase())
                    ? cleanText(event.houseKey, 8).toUpperCase()
                    : '',
                assignedAt: cleanText(event.assignedAt, 80)
            })).filter((event) => event.id && event.houseKey)
            : [];
        const revealedBidderKeys = stored?.sessionId === session.sessionId
            ? [...new Set([
                ...(Array.isArray(stored?.revealedBidderKeys) ? stored.revealedBidderKeys : []),
                ...events.map((event) => event.bidderKey)
            ].map((value) => cleanText(value, 64)).filter(Boolean))].slice(-1000)
            : [];
        return {
            sessionId: session.sessionId,
            lockedAt: session.lockedAt,
            sequence: Math.max(0, Number.parseInt(stored?.sequence, 10) || 0),
            events,
            revealedBidderKeys
        };
    }

    function publicCrewartRouletteEvent(event = {}) {
        const multiplier = Number(event.multiplier);
        return {
            id: cleanText(event.id, 80),
            sequence: Math.max(0, Number.parseInt(event.sequence, 10) || 0),
            itemId: cleanText(event.itemId, 64),
            lotNumber: Math.max(0, Number.parseInt(event.lotNumber, 10) || 0),
            winner: publicBidderName(event.winner),
            houseKey: ['R', 'G', 'B', 'Y'].includes(cleanText(event.houseKey, 8).toUpperCase())
                ? cleanText(event.houseKey, 8).toUpperCase()
                : '',
            baseAmount: Math.max(0, Number(event.baseAmount) || 0),
            multiplier: [0.25, 0.5, 2, 3, 4].includes(multiplier) ? multiplier : 1,
            contributionAmount: Math.max(0, Number(event.contributionAmount) || 0),
            replay: event.replay === true,
            startedAt: cleanText(event.startedAt, 80),
            revealAt: cleanText(event.revealAt, 80)
        };
    }

    async function crewartRoulettePayload(channelId, state = {}) {
        const session = activeAudienceSession(state);
        if (!session) return { sessionId: '', sequence: 0, events: [] };
        const stored = await repository.getRecord(channelId, 'setting', CREWART_ROULETTE_ID);
        const events = stored?.sessionId === session.sessionId && Array.isArray(stored.events)
            ? stored.events.slice(-100).map(publicCrewartRouletteEvent).filter((event) => event.id && event.itemId && event.houseKey)
            : [];
        return {
            sessionId: session.sessionId,
            sequence: Math.max(0, Number.parseInt(stored?.sequence, 10) || 0),
            events
        };
    }

    async function channelSwitchBlocker(channel) {
        if (!channel?.id) return null;
        const [broadcast, items] = await Promise.all([
            repository.getRecord(channel.id, 'broadcast', 'state'),
            channel.dataAdapter === 'platform' ? repository.listRecords(channel.id, 'item') : Promise.resolve([])
        ]);
        const liveItem = items.find((item) => item.status === 'live') || null;
        if (broadcast?.mode !== 'live' && !liveItem) return null;
        return {
            channelId: channel.id,
            channelName: channel.name,
            itemId: liveItem?.id || broadcast?.activeItemId || '',
            itemName: liveItem?.name || ''
        };
    }

    async function activeChannelContext() {
        const catalog = await loadCatalog();
        const storedId = await repository.getActiveChannel();
        const channel = catalog.channels.find((candidate) => candidate.id === storedId && isBroadcastableChannel(candidate))
            || catalog.channels.find((candidate) => isBroadcastableChannel(candidate))
            || null;
        const channelId = channel?.id || '';
        if (channelId && channelId !== storedId) await repository.setActiveChannel(channelId);
        return { catalog, channelId, channel };
    }

    async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/platform/')) return false;
        try {
            const segments = url.pathname.slice('/api/platform/'.length).split('/').filter(Boolean).map(decodeURIComponent);
            const method = req.method || 'GET';

            if(segments[0]==='banner-library'){
                if(!await requireAdmin(req,res))return true;
                if(segments.length===1&&method==='GET'){replyJson(res,200,{banners:await bannerLibrary.list()});return true}
                if(segments.length===1&&method==='POST'){
                    const body=await readJson(req);
                    await withMutationLock('shared-banners',async()=>{const record=await bannerLibrary.save(body.record||{});const catalog=await repository.getCatalog();for(const channel of catalog.channels)touchChannel(channel.id);replyJson(res,201,{record})});return true;
                }
                if(segments[1]==='import'&&method==='POST'){
                    await withMutationLock('shared-banners',async()=>{
                        const catalog=await repository.getCatalog(),selections=await bannerLibrary.importExisting(catalog.channels);
                        for(const entry of selections)await withMutationLock('channel:'+entry.channelId,async()=>{
                            const stored=await repository.getRecord(entry.channelId,'broadcast','state');
                            if(!stored&&!entry.ids.length)return;
                            const current=stored||catalog.channels.find(row=>row.id===entry.channelId)?.broadcastDefaults||{};
                            if(current.bannerSelectionConfigured)return;
                            const layoutPlacements=Object.fromEntries(Object.entries(current.layoutPlacements||{}).filter(([key])=>key!=='p3-banner'));
                            await repository.upsertRecord(entry.channelId,'broadcast',{...current,id:'state',layoutPlacements,bannerSelectionConfigured:true,selectedBannerIds:entry.ids,page1BannerOn:entry.ids.length>0,page2BannerOn:entry.ids.length>0,page1BannerUrl:'',page2BannerUrl:'',page3BannerOn:false,page3BannerUrl:'',revision:Date.now()});touchChannel(entry.channelId);
                        });
                        replyJson(res,200,{banners:await bannerLibrary.list()});
                    });return true;
                }
                replyJson(res,404,{error:'Not found'});return true;
            }

            if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'login' && method === 'POST') {
                const now = Date.now();
                const address = clientAddress(req);
                const attempt = loginAttempt(address, now);
                if (attempt.count >= ADMIN_LOGIN_ATTEMPTS) {
                    const retryAfter = Math.max(1, Math.ceil((attempt.resetAt - now) / 1000));
                    replyJson(res, 429, { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { 'Retry-After': retryAfter });
                    return true;
                }
                const body = await readJson(req);
                if (!await repository.verifyAdmin(body.password)) {
                    adminLoginAttempts.set(address, { count: attempt.count + 1, resetAt: attempt.resetAt });
                    replyJson(res, 401, { error: '비밀번호가 맞지 않습니다.' });
                    return true;
                }
                adminLoginAttempts.delete(address);
                const token = signAdminSession(now);
                replyJson(res, 200, { authenticated: true }, {
                    'Set-Cookie': adminCookie(token, req, sessionTtlMs / 1000)
                });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'logout' && method === 'POST') {
                revokeAdminSession(req);
                replyJson(res, 200, { authenticated: false }, {
                    'Set-Cookie': adminCookie('', req, 0)
                });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'health' && method === 'GET') {
                replyJson(res, 200, await repository.health());
                return true;
            }

            if (segments.length === 1 && segments[0] === 'admin-check' && method === 'GET') {
                replyJson(res, 200, { authenticated: await isAdmin(req) });
                return true;
            }

            if (['buyer-shipping', 'buyer-delivery'].includes(segments[0]) && method === 'OPTIONS') {
                res.writeHead(204, buyerCorsHeaders(req));
                res.end();
                return true;
            }

            if (segments.length === 1 && segments[0] === 'buyer-delivery' && method === 'GET') {
                const credential = await resolveBuyerShippingCredential({
                    token: url.searchParams.get('token'),
                    code: url.searchParams.get('code')
                });
                const context = await buyerBundleContext(credential);
                if (!context) {
                    replyJson(res, 401, { error: '배송 링크가 만료되었거나 올바르지 않습니다.' }, buyerCorsHeaders(req));
                    return true;
                }
                replyJson(res, 200, await buyerDeliveryPayload(context), buyerCorsHeaders(req));
                return true;
            }

            if (segments.length === 1 && segments[0] === 'buyer-delivery' && method === 'POST') {
                const body = await readJson(req);
                const credential = await resolveBuyerShippingCredential(body);
                const context = await buyerBundleContext(credential);
                if (!context) {
                    replyJson(res, 401, { error: '배송 링크가 만료되었거나 올바르지 않습니다.' }, buyerCorsHeaders(req));
                    return true;
                }
                await withMutationLock(`channel:${context.channel.id}`, async () => {
                    const freshContext = await buyerBundleContext(context.token);
                    if (!freshContext) throw buyerInputError('배송 정보를 다시 불러와 주세요.', 409);
                    const result = await saveBuyerShipping(freshContext, body, {
                        requirePaymentMethod: false,
                        responsePayload: buyerDeliveryPayload
                    });
                    replyJson(res, 200, { ...result.payload, duplicate: result.duplicate }, buyerCorsHeaders(req));
                });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'checkout-change-link' && method === 'GET') {
                if (!await requireAdmin(req,res)) return true;
                const code=cleanText(url.searchParams.get('code'),24);
                const rows=await repository.getRowsByKeys([`creo_checkout_change_link::${code}`]);
                const link=rows[0]?.value ? JSON.parse(rows[0].value) : null;
                if(!link)throw buyerInputError('변경 요청 링크가 없습니다.',404);
                replyJson(res,200,link);return true;
            }
            if (segments.length === 2 && segments[0] === 'buyer-shipping' && segments[1] === 'change-request' && method === 'POST') {
                const body=await readJson(req),credential=await resolveBuyerShippingCredential(body),context=await buyerBundleContext(credential);
                if(!context)throw buyerInputError('구매자 링크를 확인해 주세요.',401);
                await withMutationLock(`channel:${context.channel.id}`,async()=>{
                    const fresh=await buyerBundleContext(context.token);
                    if(!fresh)throw buyerInputError('변경할 내역이 없습니다.',409);
                    const result=await submitCheckoutChange(req,fresh,body);
                    replyJson(res,200,{...result.payload,duplicate:result.duplicate,notification:result.notification},buyerCorsHeaders(req));
                });return true;
            }
            if (segments.length === 1 && segments[0] === 'buyer-shipping' && method === 'GET') {
                const credential = await resolveBuyerShippingCredential({
                    token: url.searchParams.get('token'),
                    code: url.searchParams.get('code')
                });
                const context = await buyerBundleContext(credential);
                if (!context) {
                    replyJson(res, 401, { error: '배송 링크가 만료되었거나 올바르지 않습니다.' }, buyerCorsHeaders(req));
                    return true;
                }
                replyJson(res, 200, await buyerShippingPayload(context), buyerCorsHeaders(req));
                return true;
            }

            if (segments.length === 1 && segments[0] === 'buyer-shipping' && method === 'POST') {
                const body = await readJson(req);
                const credential = await resolveBuyerShippingCredential(body);
                const context = await buyerBundleContext(credential);
                if (!context) {
                    replyJson(res, 401, { error: '배송 링크가 만료되었거나 올바르지 않습니다.' }, buyerCorsHeaders(req));
                    return true;
                }
                await withMutationLock(`channel:${context.channel.id}`, async () => {
                    const freshContext = await buyerBundleContext(context.token);
                    if (!freshContext) throw buyerInputError('배송 정보를 다시 불러와 주세요.', 409);
                    const result = await saveBuyerShipping(freshContext, body);
                    const notifications = result.duplicate ? [] : await enqueueShippingRegistered(req, freshContext);
                    replyJson(res, 200, { ...result.payload, duplicate: result.duplicate, notifications }, buyerCorsHeaders(req));
                });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'buyer-shipping' && segments[1] === 'report-payment' && method === 'POST') {
                const body = await readJson(req);
                const credential = await resolveBuyerShippingCredential(body);
                const context = await buyerBundleContext(credential);
                if (!context) {
                    replyJson(res, 401, { error: '배송 링크가 만료되었거나 올바르지 않습니다.' }, buyerCorsHeaders(req));
                    return true;
                }
                await withMutationLock(`channel:${context.channel.id}`, async () => {
                    const freshContext = await buyerBundleContext(context.token);
                    if (!freshContext) throw buyerInputError('배송 정보를 다시 불러와 주세요.', 409);
                    const result = await reportBuyerPayment(freshContext, body.vendorKey, body.requestId);
                    const freshSnapshot = await checkoutSnapshot(freshContext);
                    const group = freshSnapshot.groups.find((entry) => entry.key === cleanText(body.vendorKey, 80));
                    const notification = group && !result.duplicate
                        ? await enqueueVendorPaymentReport(req, freshContext, group, buyerDisplayName(freshContext.bundleItems[0]), freshContext.anchorPhone)
                        : { skipped: 'missing_group' };
                    replyJson(res, 200, { ...result.payload, duplicate: result.duplicate, notification }, buyerCorsHeaders(req));
                });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'vendor-status' && method === 'GET') {
                const credential = await resolveVendorCheckoutCredential({
                    token: url.searchParams.get('token'),
                    code: url.searchParams.get('code')
                });
                const context = await vendorCheckoutContext(credential, method === 'GET' ? (url.searchParams.get('event') || '') : (body.event || ''));
                if (!context) {
                    replyJson(res, 401, { error: '업체 확인 링크가 만료되었거나 올바르지 않습니다.' });
                    return true;
                }
                replyJson(res, 200, await vendorStatusPayload(context));
                return true;
            }

            if (segments.length === 2 && segments[0] === 'vendor-checkout' && segments[1] === 'revision' && method === 'GET') {
                const credential=await resolveVendorCheckoutCredential({code:url.searchParams.get('code'),token:url.searchParams.get('token')});
                const context=await vendorCheckoutContext(credential,url.searchParams.get('event')||'');
                if(!context)throw buyerInputError('업체 전용 링크를 다시 확인해 주세요.',401);
                replyJson(res,200,{revision:checkoutRevision(context.channel.id)});return true;
            }

            if (segments.length === 1 && segments[0] === 'vendor-checkout' && method === 'GET') {
                const credential = await resolveVendorCheckoutCredential({
                    token: url.searchParams.get('token'),
                    code: url.searchParams.get('code')
                });
                const context = await vendorCheckoutContext(credential, method === 'GET' ? (url.searchParams.get('event') || '') : (body.event || ''));
                if (!context) {
                    replyJson(res, 401, { error: '업체 확인 링크가 만료되었거나 올바르지 않습니다.' });
                    return true;
                }
                replyJson(res, 200, await vendorCheckoutPayload(context));
                return true;
            }

            if (segments.length === 2 && segments[0] === 'vendor-checkout' && segments[1] === 'settings' && method === 'POST') {
                const body = await readJson(req);
                const credential = await resolveVendorCheckoutCredential(body);
                const context = await vendorCheckoutContext(credential, method === 'GET' ? (url.searchParams.get('event') || '') : (body.event || ''));
                if (!context) throw buyerInputError('업체 전용 링크를 다시 확인해 주세요.', 401);
                await withMutationLock(`channel:${context.channel.id}`, async () => {
                    const fresh = await vendorCheckoutContext(context.token);
                    if (!fresh) throw buyerInputError('업체 정보를 다시 불러와 주세요.', 409);
                    const current = fresh.vendor;
                    const bank = {
                        bankName: cleanText(body.bankName, 60),
                        bankAccount: cleanText(body.bankAccount, 100),
                        bankHolder: cleanText(body.bankHolder, 80)
                    };
                    if (!bank.bankName || !bank.bankAccount || !bank.bankHolder || !/^[0-9 -]{5,100}$/.test(bank.bankAccount)) throw buyerInputError('은행·계좌번호·예금주를 정확히 입력해 주세요.');
                    const registered = Boolean(current.bankName || current.bankAccount || current.bankHolder);
                    const changed = Object.keys(bank).some(key => bank[key] !== (current[key] || ''));
                    if (registered && changed) throw buyerInputError('등록된 계좌 변경은 운영자에게 요청해 주세요.', 409);
                    const phone = cleanText(body.phone, 30).replace(/[^0-9]/g, '');
                    if (!/^0\d{8,10}$/.test(phone)) throw buyerInputError('업체 연락처를 정확히 입력해 주세요.');
                    // Only the vendor resolved from this bearer link may be updated.
                    await vendorDirectory.update(fresh.channel.id, {
                        ...current, ...bank, phone,
                        paymentMethods: ['bank_transfer', ...(body.cardEnabled === true ? ['card'] : [])],
                        updatedAt: new Date().toISOString()
                    }, body.directoryRevision ?? current.directoryRevision, {firstBankOnly:true});
                    await touchVendorChannels(fresh.channel.id,current.id);
                    touchChannel(fresh.channel.id);
                    replyJson(res, 200, await vendorCheckoutPayload(await vendorCheckoutContext(context.token)));
                });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'vendor-checkout' && segments[1] === 'card-link' && method === 'POST') {
                const body = await readJson(req);
                const credential = await resolveVendorCheckoutCredential(body);
                const context = await vendorCheckoutContext(credential, method === 'GET' ? (url.searchParams.get('event') || '') : (body.event || ''));
                if (!context) {
                    replyJson(res, 401, { error: '업체 확인 링크가 만료되었거나 올바르지 않습니다.' });
                    return true;
                }
                await withMutationLock(`channel:${context.channel.id}`, async () => {
                    const freshContext = await vendorCheckoutContext(context.token);
                    if (!freshContext) throw buyerInputError('업체 결제 정보를 다시 불러와 주세요.', 409);
                    if(freshContext.channel.status!=='active')throw buyerInputError('운영 중인 경매에서만 결제 처리할 수 있습니다.',409);
                    const result = await saveCardPaymentLink(freshContext, body.buyerId, body.cardPaymentUrl, body.requestId, body);
                    const notification = result.duplicate
                        ? { duplicate: true }
                        : await enqueueBuyerStatusNotification(
                            req,
                            result.bundle,
                            'buyer_card_link_ready',
                            `card-link:${context.vendorKey}:${body.buyerId}:${cleanText(body.requestId, 80)}`
                        );
                    const reloadedContext = await vendorCheckoutContext(context.token);
                    replyJson(res, 200, { ...(await vendorCheckoutPayload(reloadedContext)), duplicate: result.duplicate, notification });
                });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'vendor-checkout' && segments[1] === 'confirm-payment' && method === 'POST') {
                const body = await readJson(req);
                const credential = await resolveVendorCheckoutCredential(body);
                const context = await vendorCheckoutContext(credential, method === 'GET' ? (url.searchParams.get('event') || '') : (body.event || ''));
                if (!context) {
                    replyJson(res, 401, { error: '업체 확인 링크가 만료되었거나 올바르지 않습니다.' });
                    return true;
                }
                await withMutationLock(`channel:${context.channel.id}`, async () => {
                    const freshContext = await vendorCheckoutContext(context.token);
                    if (!freshContext) throw buyerInputError('업체 결제 정보를 다시 불러와 주세요.', 409);
                    if(freshContext.channel.status!=='active')throw buyerInputError('운영 중인 경매에서만 결제 처리할 수 있습니다.',409);
                    const bundle = await vendorBuyerBundle(freshContext, body.buyerId);
                    if (!bundle) throw buyerInputError('구매자 결제 내역을 찾을 수 없습니다.', 404);
                    const result = await confirmBuyerPayment(bundle.context, context.vendorKey, body.requestId, body);
                    const reloadedContext = await vendorCheckoutContext(context.token);
                    const refreshed = await vendorBuyerBundle(reloadedContext, body.buyerId) || bundle;
                    const notification = result.duplicate
                        ? { duplicate: true }
                        : await enqueueBuyerStatusNotification(
                            req,
                            refreshed,
                            'buyer_payment_confirmed',
                            `payment-confirmed:${context.vendorKey}:${body.buyerId}:${cleanText(body.requestId, 80)}`
                        );
                    replyJson(res, 200, { ...(await vendorCheckoutPayload(reloadedContext)), duplicate: result.duplicate, notification });
                });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'shipping-rates' && segments[1] === 'refresh' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const company = cleanText(body.company);
                const configKey = SHIPPING_RATE_CONFIG_KEYS[company];
                if (!configKey) {
                    replyJson(res, 422, { error: '지원하지 않는 배송사입니다.' });
                    return true;
                }
                const result = await refreshShippingRateFn(company, { force: body.force === true });
                await repository.upsertRows([
                    { key: configKey, value: JSON.stringify(result.payload) },
                    { key: RUNTIME_CONFIG_VERSION_KEY, value: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}` }
                ]);
                replyJson(res, 200, { ...result, persisted: true });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'active-channel' && method === 'GET') {
                const { catalog, channelId } = await activeChannelContext();
                replyJson(res, 200, { channelId, catalogVersion: catalog.version });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'operator-context' && method === 'GET') {
                if (!await requireAdmin(req, res)) return true;
                const { channelId, channel } = await activeChannelContext();
                replyJson(res, 200, {
                    activeChannelId: channelId,
                    channel: channel ? { ...channel, links: channelLinks(channel) } : null,
                    adapter: channel?.dataAdapter || '',
                    workspace: channel && channel.dataAdapter !== 'legacy-cdcup' ? await workspace(channelId) : null
                });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'active-channel' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                await withMutationLock('active-channel', async () => {
                const { catalog, channelId: currentChannelId, channel: currentChannel } = await activeChannelContext();
                const channelId = normalizeChannelId(body.channelId);
                if (!catalog.channels.some((channel) => channel.id === channelId && isBroadcastableChannel(channel))) {
                    replyJson(res, 422, { error: '운영 가능한 채널을 선택해 주세요.' });
                    return true;
                }
                if (channelId === currentChannelId) {
                    replyJson(res, 200, { channelId, previousChannelId: currentChannelId, unchanged: true });
                    return true;
                }
                if (normalizeChannelId(body.expectedCurrentChannelId) !== currentChannelId) {
                    replyJson(res, 409, {
                        error: '다른 화면에서 운영 채널이 이미 변경되었습니다. 새로고침 후 다시 확인해 주세요.',
                        code: 'ACTIVE_CHANNEL_CHANGED',
                        channelId: currentChannelId
                    });
                    return true;
                }
                if (normalizeChannelId(body.confirmChannelId) !== channelId) {
                    replyJson(res, 409, {
                        error: '채널 전환 확인값이 없습니다. 방송제어에서 전환 버튼을 다시 눌러 주세요.',
                        code: 'CHANNEL_SWITCH_CONFIRMATION_REQUIRED',
                        channelId: currentChannelId
                    });
                    return true;
                }
                const blocker = await channelSwitchBlocker(currentChannel);
                if (blocker) {
                    replyJson(res, 409, {
                        error: `${blocker.channelName || blocker.channelId} 경매가 진행 중이라 채널을 전환할 수 없습니다. 현재 경매를 먼저 종료해 주세요.`,
                        code: 'ACTIVE_AUCTION_LOCKED',
                        channelId: currentChannelId,
                        lock: blocker
                    });
                    return true;
                }
                replyJson(res, 200, {
                    channelId: await repository.setActiveChannel(channelId),
                    previousChannelId: currentChannelId,
                    unchanged: false
                });
                });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'channels' && method === 'GET') {
                const catalog = await loadCatalog();
                const admin = await isAdmin(req);
                const includeInactive = admin && url.searchParams.get('includeArchived') === '1';
                const channels = catalog.channels
                    .filter((channel) => !channel.id.startsWith('checkout-test-') && (includeInactive || channel.status === 'active'))
                    .map((channel) => ({ ...channel, links: channelLinks(channel) }));
                replyJson(res, 200, { ...catalog, channels });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'channels' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const catalog = await loadCatalog();
                const checked = validateChannel(body.channel, catalog.channels);
                if (!checked.valid) {
                    replyJson(res, 422, { error: checked.errors.join(' '), errors: checked.errors });
                    return true;
                }
                const now = new Date().toISOString();
                checked.value.createdAt = now;
                checked.value.updatedAt = now;
                const saved = await repository.saveCatalog([...catalog.channels, checked.value], body.expectedVersion ?? catalog.version);
                touchChannel(checked.value.id);
                replyJson(res, 201, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments[0] !== 'channels' || !segments[1]) {
                replyJson(res, 404, { error: 'Not found' });
                return true;
            }

            const channelId = normalizeChannelId(segments[1]);
            if (segments.length === 3 && segments[2] === 'broadcast-pulse' && method === 'GET') {
                if (!channelId || !knownChannelIds.has(channelId)) {
                    replyJson(res, 404, { error: '채널을 찾을 수 없습니다.' });
                    return true;
                }
                // These scoped counters intentionally stay memory-only. Broadcast
                // and checkout pages can poll without SQLite/Supabase read traffic.
                replyJson(res, 200, {
                    revision: channelRevision(channelId),
                    checkoutRevision: checkoutRevision(channelId)
                }, buyerCorsHeaders(req));
                return true;
            }
            const catalog = await loadCatalog();
            const channelIndex = catalog.channels.findIndex((channel) => channel.id === channelId);
            const channel = catalog.channels[channelIndex];
            if (!channel) {
                replyJson(res, 404, { error: '채널을 찾을 수 없습니다.' });
                return true;
            }

            if (segments.length === 2 && method === 'GET') {
                replyJson(res, 200, { channel: { ...channel, links: channelLinks(channel) } });
                return true;
            }

            if (segments.length === 2 && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const checked = validateChannel({ ...channel, ...body.channel, id: channelId }, catalog.channels, channelId);
                if (!checked.valid) {
                    replyJson(res, 422, { error: checked.errors.join(' '), errors: checked.errors });
                    return true;
                }
                checked.value.createdAt = channel.createdAt;
                checked.value.updatedAt = new Date().toISOString();
                const saveChannel = async () => {
                    const next = catalog.channels.slice();
                    next[channelIndex] = checked.value;
                    const saved = await repository.saveCatalog(next, body.expectedVersion ?? catalog.version);
                    touchChannel(channelId);
                    return saved;
                };
                const activeId = await repository.getActiveChannel();
                if (activeId === channelId && !isBroadcastableChannel(checked.value)) {
                    const result = await withMutationLock(`channel:${channelId}`, async () => {
                        const blocker = await channelSwitchBlocker(channel);
                        if (blocker) return { blocker };
                        return { saved: await saveChannel() };
                    });
                    if (result.blocker) {
                        replyJson(res, 409, {
                            error: '진행 중인 경매가 있어 채널을 보관하거나 방송 기능을 끌 수 없습니다. 먼저 경매를 종료해 주세요.',
                            code: 'CHANNEL_LIVE',
                            itemId: result.blocker.itemId || ''
                        });
                        return true;
                    }
                    replyJson(res, 200, { channel: checked.value, catalogVersion: result.saved.version });
                    return true;
                }
                const saved = await saveChannel();
                replyJson(res, 200, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 2 && method === 'DELETE') {
                if (!await requireAdmin(req, res)) return true;
                if (DEFAULT_CHANNELS.some((entry) => entry.id === channelId) || channel.dataAdapter === 'legacy-cdcup') {
                    replyJson(res, 409, { error: '기본 운영 채널은 삭제할 수 없습니다. 보관 상태로 변경해 주세요.' });
                    return true;
                }
                if (await repository.getActiveChannel() === channelId) {
                    replyJson(res, 409, { error: '현재 방송 중인 채널은 삭제할 수 없습니다. 다른 채널로 전환해 주세요.' });
                    return true;
                }
                const data = await workspace(channelId);
                const archives = await repository.listRecords(channelId, 'archive');
                if (data.vendors.length || data.items.length || data.shipments.length || data.assets.length || archives.length) {
                    replyJson(res, 409, { error: '업체·개체·배송·회차 기록·브랜드 자산을 먼저 삭제해 주세요.' });
                    return true;
                }
                if (data.broadcast?.id === 'state') await repository.deleteRecord(channelId, 'broadcast', 'state');
                if (await repository.getRecord(channelId, 'setting', BROADCAST_CONFIG_ID)) {
                    await repository.deleteRecord(channelId, 'setting', BROADCAST_CONFIG_ID);
                }
                if (await repository.getRecord(channelId, 'setting', PINBALL_SESSION_ID)) {
                    await repository.deleteRecord(channelId, 'setting', PINBALL_SESSION_ID);
                }
                const saved = await repository.saveCatalog(
                    catalog.channels.filter((entry) => entry.id !== channelId),
                    url.searchParams.has('expectedVersion') ? url.searchParams.get('expectedVersion') : catalog.version
                );
                channelRevisions.delete(channelId);
                knownChannelIds.delete(channelId);
                replyJson(res, 200, { deleted: true, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'workspace' && method === 'GET') {
                if (!await requireAdmin(req, res)) return true;
                replyJson(res, 200, { channel, ...(await workspace(channelId)) });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'notification-test' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                if (channel.status !== 'draft' || !notificationService?.provider?.testMode) {
                    replyJson(res, 409, { error: '테스트 모드의 초안 채널에서만 가능합니다.' });
                    return true;
                }
                const body = await readJson(req);
                const result = await notificationService.sendOneTest(channelId, cleanText(body.notificationId, 64), body.confirmedPhone);
                replyJson(res, 200, result);
                return true;
            }

            if (segments.length === 3 && segments[2] === 'notifications' && method === 'GET') {
                if (!await requireAdmin(req, res)) return true;
                const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 120));
                const loadedRecords = notificationService && typeof notificationService.list === 'function'
                    ? await notificationService.list(channelId, limit)
                    : [];
                const records = Array.isArray(loadedRecords) ? loadedRecords : [];
                const counts = {
                    total: records.length,
                    queued: 0,
                    configuration_pending: 0,
                    sending: 0,
                    sent: 0,
                    failed: 0,
                    expired: 0
                };
                const notifications = records.map((record) => {
                    const status = Object.prototype.hasOwnProperty.call(counts, record.status) ? record.status : 'failed';
                    counts[status] += 1;
                    const digits = String(record.recipientPhone || '').replace(/[^0-9]/g, '');
                    return {
                        id: cleanText(record.id, 64),
                        templateKey: cleanText(record.templateKey, 80),
                        transport: record.transport === 'alimtalk' ? 'alimtalk' : 'sms',
                        recipientRole: ['vendor','operator'].includes(record.recipientRole) ? record.recipientRole : 'buyer',
                        recipientPhoneLast4: digits.slice(-4),
                        status,
                        attempts: Math.max(0, Number(record.attempts) || 0),
                        lastError: record.status==='sent' ? '' : cleanText(record.lastError, 300),
                        createdAt: cleanText(record.createdAt, 80),
                        updatedAt: cleanText(record.updatedAt, 80),
                        sentAt: cleanText(record.sentAt, 80)
                    };
                });
                const delivery = notificationService && typeof notificationService.health === 'function'
                    ? notificationService.health()
                    : { provider: 'disabled', configured: false, smsConfigured: false };
                replyJson(res, 200, { channelId, delivery, counts, notifications });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'audience' && method === 'GET') {
                const data = await workspace(channelId);
                const audience = audienceCompetitionEnabled(channel)
                    ? await audienceRevealPayload(channelId, data.broadcast)
                    : { sessionId: '', lockedAt: '', sequence: 0, events: [], revealedBidderKeys: [] };
                if (audienceCompetitionEnabled(channel)) {
                    audience.roulette = await crewartRoulettePayload(channelId, data.broadcast);
                }
                replyJson(res, 200, {
                    revision: channelRevision(channelId),
                    audience
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'audience-assignment' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                await withMutationLock(`channel:${channelId}`, async () => {
                    const activeId = await repository.getActiveChannel();
                    if (activeId !== channelId) {
                        replyJson(res, 409, {
                            error: '현재 운영 채널이 변경되었습니다. 입찰을 다시 확인해 주세요.',
                            code: 'ACTIVE_CHANNEL_CHANGED',
                            channelId: activeId || ''
                        });
                        return;
                    }
                    const data = await workspace(channelId);
                    const itemId = cleanText(body.itemId || data.broadcast?.activeItemId, 64);
                    const item = data.items.find((entry) => entry.id === itemId);
                    if (!item || (item.status !== 'live' && data.broadcast?.activeItemId !== itemId)) {
                        replyJson(res, 409, { error: '현재 진행 중인 개체의 입찰이 아닙니다.', code: 'ITEM_NOT_LIVE' });
                        return;
                    }
                    if (data.broadcast?.audienceSessionStatus === 'closed') {
                        replyJson(res, 409, { error: '종료된 방송 회차입니다. 새 방송을 시작한 뒤 입찰해 주세요.', code: 'AUDIENCE_SESSION_CLOSED' });
                        return;
                    }
                    const result = await resolveAudienceBidder(channelId, channel, data.broadcast, {
                        ...body,
                        itemId,
                        houseWeights: crewartAssignmentWeights(data.items)
                    });
                    const assignment = result.assignment;
                    if (!assignment?.houseKey) {
                        replyJson(res, 503, { error: '기숙사 배정을 확정하지 못했습니다.', code: 'ASSIGNMENT_UNAVAILABLE' });
                        return;
                    }
                    touchChannel(channelId);
                    const requestSequence = Math.max(0, Number.parseInt(body.bid_sequence || body.bidSequence, 10) || 0);
                    const assignmentSequence = Math.max(0, Number.parseInt(assignment.assignmentSequence, 10) || 0);
                    replyJson(res, 200, {
                        channelId,
                        itemId,
                        sessionId: result.session?.sessionId || '',
                        houseKey: cleanText(assignment.houseKey, 8).toUpperCase(),
                        source: assignment.source === 'survey' ? 'survey' : 'random',
                        isNewRandom: assignment.source !== 'survey'
                            && (Boolean(result.reveal) || (requestSequence > 0 && requestSequence === assignmentSequence)),
                        revealSequence: Math.max(0, Number.parseInt(result.reveal?.sequence, 10) || 0)
                    });
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'audience-assignment-audit' && method === 'GET') {
                if (!await requireAdmin(req, res)) return true;
                const data = await workspace(channelId);
                const session = activeAudienceSession(data.broadcast);
                if (!audienceCompetitionEnabled(channel) || !session) {
                    replyJson(res, 409, { error: '진행 중인 크레와트 방송 회차가 없습니다.', code: 'AUDIENCE_SESSION_CLOSED' });
                    return true;
                }
                if (typeof crewartHouseService?.getSurveyAssignment !== 'function') {
                    replyJson(res, 503, { error: '설문 배정 대조 기능을 사용할 수 없습니다.', code: 'ASSIGNMENT_AUDIT_UNAVAILABLE' });
                    return true;
                }
                const bidders = new Map();
                for (const item of data.items) {
                    for (const bid of rawItemBidLog(item)) {
                        const bidderKey = cleanText(bid?.bidder_key || bid?.bidderKey, 120);
                        const phone = phoneFromBid(bid);
                        const name = cleanText(bid?.name || bid?.bidder || bid?.winner, 120);
                        const identity = bidderKey || phone || name.toLowerCase();
                        if (identity) bidders.set(identity, { bid, bidderKey, phone, name });
                    }
                }
                const rows = [];
                for (const entry of bidders.values()) {
                    const memberKey = await bidderMemberKey(entry.bid, bandMembership);
                    const survey = await crewartHouseService.getSurveyAssignment({
                        channelId,
                        sessionId: session.sessionId,
                        memberKey,
                        phone: entry.phone,
                        winnerName: entry.name,
                        winnerAlias: entry.bidderKey || entry.name
                    });
                    const currentHouseKey = cleanText(entry.bid?.crewart_house_key || entry.bid?.crewartHouseKey, 8).toUpperCase();
                    const surveyHouseKey = cleanText(survey?.houseKey, 8).toUpperCase();
                    rows.push({
                        bidderKey: entry.bidderKey,
                        name: publicBidderName(entry.name),
                        currentHouseKey: ['R', 'G', 'B', 'Y'].includes(currentHouseKey) ? currentHouseKey : '',
                        currentSource: cleanText(entry.bid?.crewart_house_source || entry.bid?.crewartHouseSource, 16),
                        surveyHouseKey: ['R', 'G', 'B', 'Y'].includes(surveyHouseKey) ? surveyHouseKey : '',
                        matchedByMember: Boolean(memberKey && surveyHouseKey)
                    });
                }
                replyJson(res, 200, { channelId, sessionId: session.sessionId, rows });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'audience-assignment-override' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                await withMutationLock(`channel:${channelId}`, async () => {
                    const activeId = await repository.getActiveChannel();
                    if (activeId !== channelId) {
                        replyJson(res, 409, { error: '현재 운영 채널이 변경되었습니다.', code: 'ACTIVE_CHANNEL_CHANGED' });
                        return;
                    }
                    const data = await workspace(channelId);
                    const session = activeAudienceSession(data.broadcast);
                    if (!audienceCompetitionEnabled(channel) || !session) {
                        replyJson(res, 409, { error: '진행 중인 크레와트 방송 회차가 없습니다.', code: 'AUDIENCE_SESSION_CLOSED' });
                        return;
                    }
                    if (typeof crewartHouseService?.overrideSessionAssignment !== 'function') {
                        replyJson(res, 503, { error: '기숙사 교정 기능을 사용할 수 없습니다.', code: 'ASSIGNMENT_OVERRIDE_UNAVAILABLE' });
                        return;
                    }
                    const requestedHouseKey = cleanText(body.houseKey, 8).toUpperCase();
                    if (!['R', 'G', 'B', 'Y'].includes(requestedHouseKey)) {
                        replyJson(res, 422, { error: '기숙사 색상을 확인해 주세요.', code: 'INVALID_HOUSE' });
                        return;
                    }
                    const requestedBidderKey = cleanText(body.bidder_key || body.bidderKey, 120);
                    const requestedPhone = normalizePhone(body.phone);
                    let matchedBid = null;
                    let matchedItem = null;
                    for (const item of data.items) {
                        const bid = rawItemBidLog(item).find((entry) => {
                            const bidderKey = cleanText(entry?.bidder_key || entry?.bidderKey, 120);
                            const phone = phoneFromBid(entry);
                            return (requestedBidderKey && bidderKey === requestedBidderKey)
                                || (requestedPhone && phone === requestedPhone);
                        });
                        if (bid) { matchedBid = bid; matchedItem = item; break; }
                    }
                    if (!matchedBid) {
                        replyJson(res, 404, { error: '해당 입찰자를 찾지 못했습니다.', code: 'BIDDER_NOT_FOUND' });
                        return;
                    }
                    const phone = phoneFromBid(matchedBid);
                    const memberKey = phone ? '' : await bidderMemberKey(matchedBid, bandMembership);
                    const assignment = await crewartHouseService.overrideSessionAssignment({
                        channelId,
                        itemId: matchedItem?.id || '',
                        memberKey,
                        phone,
                        winnerName: matchedBid.name || matchedBid.bidder || matchedBid.winner || '',
                        winnerAlias: matchedBid.bidder_key || matchedBid.bidderKey || matchedBid.name || '',
                        assignmentSequence: Math.max(0, Number.parseInt(
                            matchedBid.crewart_assignment_sequence || matchedBid.bid_sequence || matchedBid.bidSequence,
                            10
                        ) || 0)
                    }, session, requestedHouseKey);

                    const canonicalBidderKey = cleanText(matchedBid.bidder_key || matchedBid.bidderKey, 120);
                    let updatedItems = 0;
                    for (const item of data.items) {
                        const bids = rawItemBidLog(item);
                        let changed = false;
                        const nextBids = bids.map((bid) => {
                            const sameBidder = Boolean(
                                canonicalBidderKey
                                && cleanText(bid?.bidder_key || bid?.bidderKey, 120) === canonicalBidderKey
                            ) || Boolean(phone && phoneFromBid(bid) === phone);
                            if (!sameBidder) return bid;
                            if (
                                cleanText(bid?.crewart_house_key || bid?.crewartHouseKey, 8).toUpperCase() === requestedHouseKey
                                && cleanText(bid?.crewart_house_source || bid?.crewartHouseSource, 16) === 'survey'
                            ) return bid;
                            changed = true;
                            return { ...bid, crewart_house_key: requestedHouseKey, crewart_house_source: 'survey' };
                        });
                        if (!changed) continue;
                        const attributes = {
                            ...(item.attributes || {}),
                            bid_log: JSON.stringify(nextBids)
                        };
                        const winner = winningBid({ ...item, attributes });
                        const winnerMatches = canonicalBidderKey
                            ? cleanText(winner?.bidder_key || winner?.bidderKey, 120) === canonicalBidderKey
                            : (phone && phoneFromBid(winner || {}) === phone);
                        if (item.status === 'sold' && winnerMatches) {
                            attributes.crewart_house_key = requestedHouseKey;
                            attributes.crewart_house_source = 'survey';
                        }
                        await repository.upsertRecord(channelId, 'item', { ...item, attributes });
                        updatedItems += 1;
                    }

                    const revealState = await repository.getRecord(channelId, 'setting', AUDIENCE_REVEALS_ID);
                    const safeBidderKey = publicBidderKey(canonicalBidderKey || matchedBid.name);
                    if (revealState?.sessionId === session.sessionId && safeBidderKey) {
                        let revealChanged = false;
                        const events = (Array.isArray(revealState.events) ? revealState.events : []).map((event) => (
                            event?.bidderKey === safeBidderKey && event?.houseKey !== requestedHouseKey
                                ? (revealChanged = true, { ...event, houseKey: requestedHouseKey })
                                : event
                        ));
                        if (revealChanged) {
                            await repository.upsertRecord(channelId, 'setting', {
                                ...revealState,
                                id: AUDIENCE_REVEALS_ID,
                                events,
                                updatedAt: new Date().toISOString()
                            });
                        }
                    }
                    touchChannel(channelId);
                    replyJson(res, 200, {
                        corrected: true,
                        duplicate: assignment?.duplicate === true,
                        houseKey: requestedHouseKey,
                        updatedItems
                    });
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'audience-roulette' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                await withMutationLock(`channel:${channelId}`, async () => {
                    const activeId = await repository.getActiveChannel();
                    if (activeId !== channelId) {
                        replyJson(res, 409, { error: '현재 운영 채널이 변경되었습니다.', code: 'ACTIVE_CHANNEL_CHANGED' });
                        return;
                    }
                    const data = await workspace(channelId);
                    if (!audienceCompetitionEnabled(channel)) {
                        replyJson(res, 409, { error: '크레와트 기숙사 경매에서만 사용할 수 있습니다.', code: 'ROULETTE_DISABLED' });
                        return;
                    }
                    const session = activeAudienceSession(data.broadcast);
                    if (!session) {
                        replyJson(res, 409, { error: '진행 중인 크레와트 방송 회차가 없습니다.', code: 'AUDIENCE_SESSION_CLOSED' });
                        return;
                    }
                    const itemId = cleanText(body.itemId || data.broadcast?.activeItemId, 64);
                    const item = data.items.find((entry) => entry.id === itemId) || null;
                    if (
                        !item
                        || item.status !== 'sold'
                        || data.broadcast?.activeItemId !== itemId
                        || data.broadcast?.mode !== 'sold'
                    ) {
                        replyJson(res, 409, { error: '직전 낙찰 건의 룰렛 참여 시간이 아닙니다.', code: 'ROULETTE_WINDOW_CLOSED' });
                        return;
                    }
                    const winning = winningBid(item);
                    const expectedBidderKey = cleanText(winning?.bidder_key || winning?.bidderKey || '', 120);
                    const requestedBidderKey = cleanText(body.bidder_key || body.bidderKey, 120);
                    if (!expectedBidderKey || !requestedBidderKey || expectedBidderKey !== requestedBidderKey) {
                        replyJson(res, 403, { error: '직전 낙찰자만 룰렛에 참여할 수 있습니다.', code: 'ROULETTE_NOT_WINNER' });
                        return;
                    }

                    const stored = await repository.getRecord(channelId, 'setting', CREWART_ROULETTE_ID);
                    const current = stored?.sessionId === session.sessionId
                        ? stored
                        : { id: CREWART_ROULETTE_ID, sessionId: session.sessionId, sequence: 0, events: [] };
                    const events = Array.isArray(current.events) ? current.events.slice(-100) : [];
                    const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes : {};
                    const activeRouletteEventId = cleanText(attrs.crewart_roulette_event_id, 80);
                    const messageKey = cleanText(body.message_key || body.messageKey, 180);
                    const repeatedMessage = messageKey
                        ? events.find((event) => cleanText(event.messageKey, 180) === messageKey)
                        : null;
                    if (repeatedMessage && repeatedMessage.id === activeRouletteEventId) {
                        replyJson(res, 200, { duplicate: true, event: publicCrewartRouletteEvent(repeatedMessage) });
                        return;
                    }
                    // The same QA lot can be reopened and sold again. The item attribute is
                    // cleared on the live transition, so it is the lifecycle idempotency key;
                    // an older event for the same item must not block the new sold lifecycle.
                    const existing = activeRouletteEventId
                        ? events.find((event) => event.id === activeRouletteEventId) || null
                        : null;
                    if (existing) {
                        replyJson(res, 200, { duplicate: true, event: publicCrewartRouletteEvent(existing) });
                        return;
                    }

                    const sequence = Math.max(0, Number.parseInt(current.sequence, 10) || 0) + 1;
                    const nowMs = Date.now();
                    const lastRevealMs = events.reduce((max, event) => {
                        const parsed = Date.parse(String(event?.revealAt || ''));
                        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
                    }, 0);
                    const startedAtMs = Math.max(nowMs, lastRevealMs + CREWART_ROULETTE_HOLD_MS);
                    const revealAtMs = startedAtMs + CREWART_ROULETTE_DURATION_MS;
                    const multiplier = chooseCrewartRouletteMultiplier();
                    const baseAmount = Math.max(0, Number(item.soldPrice) || 0);
                    const contributionAmount = floorContribution(baseAmount, multiplier);
                    const event = {
                        id: `roulette_${crypto.createHash('sha256').update(`${session.sessionId}:${itemId}:${messageKey || requestedBidderKey}`).digest('base64url').slice(0, 24)}`,
                        sequence,
                        itemId,
                        lotNumber: Math.max(0, Number.parseInt(item.lotNumber, 10) || 0),
                        winner: item.winnerAlias || item.winnerName || winning?.name || '',
                        bidderKey: requestedBidderKey,
                        houseKey: itemHouseKey(item) || cleanText(winning?.crewart_house_key, 8).toUpperCase(),
                        baseAmount,
                        multiplier,
                        contributionAmount,
                        startedAt: new Date(startedAtMs).toISOString(),
                        revealAt: new Date(revealAtMs).toISOString(),
                        requestedAt: new Date(nowMs).toISOString(),
                        messageKey
                    };
                    if (!['R', 'G', 'B', 'Y'].includes(event.houseKey)) {
                        replyJson(res, 409, { error: '낙찰자의 기숙사 배정이 완료되지 않았습니다.', code: 'ROULETTE_HOUSE_MISSING' });
                        return;
                    }
                    await repository.upsertRecord(channelId, 'setting', {
                        ...current,
                        id: CREWART_ROULETTE_ID,
                        sessionId: session.sessionId,
                        sequence,
                        events: [...events, event].slice(-100),
                        updatedAt: new Date(nowMs).toISOString()
                    });
                    const savedItem = await repository.upsertRecord(channelId, 'item', {
                        ...item,
                        attributes: {
                            ...(item.attributes || {}),
                            crewart_contribution_base: baseAmount,
                            crewart_contribution_multiplier: multiplier,
                            crewart_contribution_amount: contributionAmount,
                            crewart_contribution_effective_at: event.revealAt,
                            crewart_roulette_status: 'completed',
                            crewart_roulette_event_id: event.id
                        }
                    });
                    touchChannel(channelId);
                    replyJson(res, 201, {
                        duplicate: false,
                        event: publicCrewartRouletteEvent(event),
                        soldPrice: savedItem.soldPrice
                    });
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'broadcast' && method === 'GET') {
                const data = await workspace(channelId);
                if(data.broadcast?.bannerSelectionConfigured){
                    data.assets=[...data.assets.filter(asset=>asset.kind!=='banner'),...await bannerLibrary.selected(data.broadcast)];
                    data.broadcast={...data.broadcast,page1BannerUrl:'',page2BannerUrl:''};
                }
                data.broadcast={...data.broadcast,page3BannerOn:false,page3BannerUrl:''};
                const vendors = new Map(data.vendors.map((vendor) => [vendor.id, vendor]));
                const activeItemId = cleanText(data.broadcast?.activeItemId, 64);
                const requestedPageRaw = Number.parseInt(url.searchParams.get('page'), 10);
                const requestedPage = [1, 2, 3].includes(requestedPageRaw) ? requestedPageRaw : 0;
                const orderedItems = data.items.slice().sort((a, b) => Number(a.lotNumber) - Number(b.lotNumber) || String(a.id).localeCompare(String(b.id)));
                const completedItem = (item) => Number(item.soldPrice) > 0 || ['sold', 'completed', 'complete', 'passed', 'cancelled'].includes(String(item.status || '').toLowerCase());
                const completedCount = orderedItems.filter(completedItem).length;
                const activeIndex = orderedItems.findIndex((item) => item.id === activeItemId || item.status === 'live');
                const totalItems = orderedItems.length;
                const currentItem = totalItems ? Math.max(1, Math.min(totalItems, activeIndex >= 0 ? activeIndex + 1 : completedCount + 1)) : 0;
                const itemProgress = {
                    current: currentItem,
                    total: totalItems,
                    completed: completedCount,
                    remaining: Math.max(0, totalItems - completedCount)
                };
                const pageItems = requestedPage === 1
                    ? []
                    : requestedPage === 2
                        ? data.items.filter((item) => item.id === activeItemId || item.status === 'live')
                        : requestedPage === 3
                            ? data.items.filter((item) => item.id === activeItemId
                                || item.status === 'sold'
                                || Number(item.soldPrice) > 0
                                || Number(item.points) > 0
                                || item.attributes?.audience_dice_event_id
                                || item.attributes?.crewart_roulette_event_id)
                            : data.items;
                const audience = audienceCompetitionEnabled(channel) && requestedPage !== 1
                    ? await audienceRevealPayload(channelId, data.broadcast)
                    : { sessionId: '', lockedAt: '', sequence: 0, events: [], revealedBidderKeys: [] };
                if (audienceCompetitionEnabled(channel) && requestedPage !== 1) {
                    audience.roulette = await crewartRoulettePayload(channelId, data.broadcast);
                }
                const broadcastItems = await Promise.all(pageItems.map(async (item) => {
                    const isActiveItem = item.status === 'live' || (activeItemId && item.id === activeItemId);
                    const missingParityGroup = item.status === 'sold'
                        && !['odd', 'even'].includes(cleanText(item.attributes?.audience_group_key, 16).toLowerCase());
                    let enrichedItem = isActiveItem
                        ? enrichCrewartBidderHouses(
                            channel,
                            item,
                            crewartHouseService,
                            bandMembership,
                            data.broadcast,
                            crewartAssignmentWeights(data.items),
                            logger
                        )
                        : item;
                    enrichedItem = await enrichedItem;
                    if ((isActiveItem || missingParityGroup) && phoneParityCompetitionEnabled(channel)) {
                        enrichedItem = await enrichPhoneParityBidderGroups(channel, enrichedItem, bandMembership);
                    }
                    return enrichedItem;
                }));
                const revealedBidderKeys = new Set(audience.revealedBidderKeys || []);
                replyJson(res, 200, {
                    revision: channelRevision(channelId),
                    channel,
                    audience,
                    itemProgress,
                    state: data.broadcast ? {
                        ...data.broadcast,
                        quizAnswer: data.broadcast.quizStatus === 'closed' ? data.broadcast.quizAnswer : ''
                    } : data.broadcast,
                    assets: data.assets
                        .filter((asset) => asset.active !== false)
                        .filter((asset) => !requestedPage
                            || (requestedPage === 3
                                ? asset.kind === 'dice'
                                : (asset.page === 'all' || asset.page === String(requestedPage))))
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'))
                        .map(({ id, name, kind, page, targetName, imageUrl, linkUrl, sortOrder }) => ({ id, name, kind, page, targetName, imageUrl, linkUrl, sortOrder })),
                    items: broadcastItems.map((item) => {
                        const vendor = vendors.get(item.vendorId);
                        const publicRecord = publicItem({
                            ...item,
                            vendorName: vendor?.name || item.vendorName,
                            vendorLogoUrl: vendor?.logoUrl || item.vendorLogoUrl,
                            vendorContributionRate: vendor?.contributionRate ?? 1,
                            groupId: item.groupId || vendor?.groupId || ''
                        });
                        publicRecord.bidLog = publicRecord.bidLog.map((bid) => {
                            const pending = bid.crewart_house_source === 'random'
                                && !revealedBidderKeys.has(bid.bidder_key);
                            if (pending) return { ...bid, crewart_assignment_pending: true };
                            const { crewart_assignment_pending, ...readyBid } = bid;
                            return readyBid;
                        });
                        return publicRecord;
                    })
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'broadcast-config' && method === 'GET') {
                const stored = await repository.getRecord(channelId, 'setting', BROADCAST_CONFIG_ID);
                replyJson(res, 200, {
                    channelId,
                    revision: channelRevision(channelId),
                    config: stored?.values && typeof stored.values === 'object' ? stored.values : {}
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'broadcast-config' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const stored = await repository.getRecord(channelId, 'setting', BROADCAST_CONFIG_ID);
                const values = mergeBroadcastConfig(stored?.values, body.patch);
                const record = await repository.upsertRecord(channelId, 'setting', {
                    id: BROADCAST_CONFIG_ID,
                    values,
                    revision: Date.now()
                });
                touchChannel(channelId);
                replyJson(res, 200, { channelId, config: record.values, revision: record.revision });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'auction-transition' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                if (channel.dataAdapter === 'legacy-cdcup') {
                    replyJson(res, 409, { error: 'CDCUP 레거시 경매는 기존 운영 어댑터에서 변경해 주세요.' });
                    return true;
                }
                const body = await readJson(req);
                await withMutationLock('active-channel', async () => {
                    const active = await activeChannelContext();
                    const isolatedNotificationTest = body.notificationTest === true
                        && channel.status === 'draft' && notificationService?.provider?.testMode === true
                        && body.status === 'sold';
                    if (active.channelId !== channelId && !isolatedNotificationTest) {
                        replyJson(res, 409, {
                            error: '현재 운영 채널이 변경되었습니다. 경매 목록을 새로고침한 뒤 다시 시도해 주세요.',
                            code: 'ACTIVE_CHANNEL_CHANGED',
                            channelId: active.channelId
                        });
                        return;
                    }
                await withMutationLock(`channel:${channelId}`, async () => {
                    const data = await workspace(channelId);
                    const itemId = cleanText(body.itemId || body.item?.id, 64);
                    const current = data.items.find((item) => item.id === itemId) || null;
                    const requestedStatus = ['waiting', 'live', 'sold', 'passed'].includes(body.status) ? body.status : '';
                    const requestedMode = ['standby', 'live', 'sold'].includes(body.mode) ? body.mode : (requestedStatus === 'live' ? 'live' : requestedStatus === 'sold' ? 'sold' : 'standby');
                    const staleShipments = current && ['waiting', 'live'].includes(requestedStatus)
                        ? data.shipments.filter((shipment) => shipment.itemId === current.id)
                        : [];
                    const newAuctionLifecycle = Boolean(current && startsNewAuctionLifecycle(current, requestedStatus));
                    const staleSaleOutcome = Boolean(current && ['waiting', 'live'].includes(requestedStatus) && (
                        newAuctionLifecycle
                        || staleShipments.length
                        || Number(current.soldPrice) > 0
                        || cleanText(current.winnerName || current.winnerAlias || current.winnerPhone, 160)
                    ));
                    let audienceState = data.broadcast;
                    if ((requestedStatus || requestedMode !== 'standby') && !current) {
                        replyJson(res, 404, { error: '전환할 개체를 현재 채널에서 찾을 수 없습니다.' });
                        return;
                    }
                    if (requestedStatus === 'live' && audienceCompetitionEnabled(channel)) {
                        audienceState = (await ensureAudienceSession(channelId, channel, audienceState)).state;
                    }

                    if (requestedStatus === 'live') {
                        for (const other of data.items.filter((item) => item.id !== itemId && item.status === 'live')) {
                            await repository.upsertRecord(channelId, 'item', { ...other, status: 'waiting' });
                        }
                    }

                    let savedItem = current;
                    if (current && (requestedStatus || (body.item && typeof body.item === 'object'))) {
                        let candidate = sanitizeRecord('item', {
                            ...current,
                            ...(body.item && typeof body.item === 'object' ? body.item : {}),
                            ...(requestedStatus ? { status: requestedStatus } : {}),
                            id: current.id
                        }, current);
                        if (staleSaleOutcome) {
                            candidate = {
                                ...candidate,
                                soldPrice: 0,
                                winnerName: '',
                                winnerAlias: '',
                                winnerPhone: '',
                                attributes: {
                                    ...(candidate.attributes || {}),
                                    ...(newAuctionLifecycle ? { bid_log: '[]' } : {})
                                }
                            };
                        }
                        if (requestedStatus === 'live' && candidate.attributes) {
                            candidate = {
                                ...candidate,
                                attributes: {
                                    ...candidate.attributes,
                                    crewart_house_key: '',
                                    crewart_house_source: '',
                                    crewart_contribution_base: 0,
                                    crewart_contribution_multiplier: 1,
                                    crewart_contribution_amount: 0,
                                    crewart_contribution_effective_at: '',
                                    crewart_roulette_status: 'unused',
                                    crewart_roulette_event_id: '',
                                    audience_group_key: '',
                                    audience_group_source: '',
                                    audience_contribution_base: 0,
                                    audience_contribution_multiplier: 1,
                                    audience_contribution_amount: 0,
                                    audience_contribution_effective_at: '',
                                    audience_dice_face: 0,
                                    audience_dice_status: 'unused',
                                    audience_dice_event_id: '',
                                    audience_dice_started_at: '',
                                    audience_dice_reveal_at: ''
                                }
                            };
                        }
                        if (requestedStatus !== 'live' && audienceCompetitionEnabled(channel)) {
                            const decorated = await decorateCrewartBidLog(channelId, channel, audienceState, candidate);
                            candidate = decorated.item;
                            audienceState = decorated.state;
                        }
                        const audienceCompetition = channel.audienceCompetition || {};
                        const fixedHouseKey = cleanText(candidate.attributes?.crewart_house_key, 8).toUpperCase();
                        if (
                            requestedStatus === 'sold'
                            && audienceCompetition.enabled === true
                            && audienceCompetition.assignment === 'survey-random'
                            && !['R', 'G', 'B', 'Y'].includes(fixedHouseKey)
                            && typeof crewartHouseService?.resolveWinnerAssignment === 'function'
                        ) {
                            const snapshot = winnerHouseSnapshot(candidate);
                            const session = activeAudienceSession(audienceState);
                            const memberKey = snapshot ? '' : await winnerMemberKey(candidate, bandMembership);
                            const assignment = snapshot || await crewartHouseService.resolveWinnerAssignment({
                                channelId,
                                itemId: current.id,
                                sessionId: session?.sessionId || '',
                                lockedAt: session?.lockedAt || '',
                                memberKey,
                                phone: candidate.winnerPhone,
                                winnerName: candidate.winnerName,
                                winnerAlias: candidate.winnerAlias
                            });
                            candidate = {
                                ...candidate,
                                attributes: {
                                    ...(candidate.attributes || {}),
                                    crewart_house_key: cleanText(assignment?.houseKey, 8).toUpperCase(),
                                    crewart_house_source: assignment?.source === 'survey' ? 'survey' : 'random'
                                }
                            };
                        }
                        if (
                            requestedStatus === 'sold'
                            && audienceCompetitionEnabled(channel)
                            && current.status !== 'sold'
                        ) {
                            const baseContribution = Math.max(0, Number(candidate.soldPrice) || 0);
                            candidate = {
                                ...candidate,
                                attributes: {
                                    ...(candidate.attributes || {}),
                                    crewart_contribution_base: baseContribution,
                                    crewart_contribution_multiplier: 1,
                                    crewart_contribution_amount: baseContribution,
                                    crewart_contribution_effective_at: '',
                                    crewart_roulette_status: 'unused',
                                    crewart_roulette_event_id: ''
                                }
                            };
                        }
                        if (
                            requestedStatus === 'sold'
                            && phoneParityCompetitionEnabled(channel)
                            && current.status !== 'sold'
                        ) {
                            const assignment = await resolvePhoneParityWinner(candidate, bandMembership);
                            const contributionTotals = BasicDice.contributionTotals(data.items);
                            const face = normalizedDiceFace(typeof diceRoll === 'function'
                                ? diceRoll({
                                    groupKey: assignment?.groupKey || '',
                                    contributionTotals,
                                    items: data.items
                                })
                                : BasicDice.chooseBalancedDiceFace(
                                    assignment?.groupKey || '',
                                    contributionTotals,
                                    diceRandomInt
                                ));
                            const baseContribution = Math.max(0, Number(candidate.soldPrice) || 0);
                            const startedAtMs = Date.now();
                            const startedAt = new Date(startedAtMs).toISOString();
                            const revealAt = new Date(startedAtMs + 6000).toISOString();
                            const eventId = `dice_${crypto.createHash('sha256').update(`${channelId}:${current.id}:${startedAt}`).digest('base64url').slice(0, 24)}`;
                            candidate = {
                                ...candidate,
                                attributes: {
                                    ...(candidate.attributes || {}),
                                    audience_group_key: assignment?.groupKey || '',
                                    audience_group_source: assignment?.source || '',
                                    audience_contribution_base: baseContribution,
                                    audience_contribution_multiplier: face,
                                    audience_contribution_amount: baseContribution * face,
                                    audience_contribution_effective_at: revealAt,
                                    audience_dice_face: face,
                                    audience_dice_status: 'rolling',
                                    audience_dice_event_id: eventId,
                                    audience_dice_started_at: startedAt,
                                    audience_dice_reveal_at: revealAt
                                }
                            };
                        }
                        const errors = validateRecord('item', candidate, { ...data, groups: channel.groups || [] });
                        if (errors.length) {
                            replyJson(res, 422, { error: errors.join(' '), errors });
                            return;
                        }
                        savedItem = await repository.upsertRecord(channelId, 'item', candidate);
                    }

                    const hasExplicitActiveItem = body.state && typeof body.state === 'object'
                        && Object.prototype.hasOwnProperty.call(body.state, 'activeItemId');
                    const nextState = sanitizeBroadcastState({
                        ...mergeChannelBroadcastState(
                            channel,
                            audienceState || {},
                            body.state && typeof body.state === 'object' ? body.state : {}
                        ),
                        activeItemId: hasExplicitActiveItem ? body.state.activeItemId : (itemId || data.broadcast?.activeItemId || ''),
                        mode: requestedMode
                    });
                    const savedState = await repository.upsertRecord(channelId, 'broadcast', nextState);
                    if (!isolatedNotificationTest) await repository.setActiveChannel(channelId);
                    if (staleShipments.length) {
                        const deletedShipments = [];
                        try {
                            for (const shipment of staleShipments) {
                                await repository.deleteRecord(channelId, 'shipment', shipment.id);
                                deletedShipments.push(shipment);
                            }
                        } catch (error) {
                            // Reopening a sold lot and retiring its old payment record is one
                            // lifecycle change. Restore the previous state if storage rejects
                            // the shipment cleanup so a paid shipment can never attach to a
                            // partially reopened auction.
                            try {
                                if (current) await repository.upsertRecord(channelId, 'item', current);
                                if (data.broadcast) await repository.upsertRecord(channelId, 'broadcast', data.broadcast);
                                for (const shipment of deletedShipments) {
                                    await repository.upsertRecord(channelId, 'shipment', shipment);
                                }
                            } catch (rollbackError) {
                                logger.error?.('[platform-api] auction lifecycle rollback failed', rollbackError.message);
                            }
                            throw error;
                        }
                    }
                    let notifications = null;
                    if (requestedStatus === 'sold' && current?.status !== 'sold' && savedItem) {
                        try {
                            notifications = await enqueueSaleNotifications(req, channel, savedItem);
                        } catch (error) {
                            logger.error?.('[platform-api] sale notification preparation failed', channelId, savedItem.id, error.message);
                            notifications = { failed: true, error: error.message };
                        }
                    }
                    if ((requestedStatus === 'sold' && current?.status !== 'sold') || staleSaleOutcome) touchCheckout(channelId);
                    touchChannel(channelId);
                    replyJson(res, 200, {
                        channelId,
                        item: savedItem,
                        state: savedState,
                        shipmentResetCount: staleShipments.length,
                        notifications
                    });
                });
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'rankings' && method === 'GET') {
                const data = await workspace(channelId);
                replyJson(res, 200, {
                    channelId,
                    channel: {
                        id: channel.id,
                        name: channel.name,
                        shortName: channel.shortName,
                        logoUrl: channel.logoUrl,
                        theme: channel.theme,
                        dataAdapter: channel.dataAdapter,
                        groups: channel.groups,
                        scoreboards: channel.scoreboards
                    },
                    scoreboards: rankingsForChannel(channel, data.items, data.vendors)
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'duplicate' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const requestedChannel = body.channel && typeof body.channel === 'object' ? body.channel : {};
                const proposedInput = {
                    ...channel,
                    ...requestedChannel,
                    id: requestedChannel.id,
                    name: requestedChannel.name || `${channel.name} 복사본`,
                    status: 'draft',
                    dataAdapter: 'platform',
                    pages: {},
                    legacy: { items: false, managementUrl: '', controlUrl: '' }
                };
                if (body.copyBroadcastContent !== true && !Object.prototype.hasOwnProperty.call(requestedChannel, 'broadcastDefaults')) {
                    proposedInput.broadcastDefaults = {};
                }
                const proposed = normalizeChannel(proposedInput);
                const checked = validateChannel(proposed, catalog.channels);
                if (!checked.valid) {
                    replyJson(res, 422, { error: checked.errors.join(' '), errors: checked.errors });
                    return true;
                }
                const now = new Date().toISOString();
                checked.value.createdAt = now;
                checked.value.updatedAt = now;
                const saved = await repository.saveCatalog([...catalog.channels, checked.value], body.expectedVersion ?? catalog.version);
                if (body.copyVendors) {
                    const sourceVendors = await vendorDirectory.list(channelId);
                    for (const vendor of sourceVendors) {
                        await repository.upsertRecord(checked.value.id, 'vendor', { ...vendor, id: recordId('ven'), channelId: checked.value.id });
                    }
                }
                if (body.copyBroadcastConfig !== false) {
                    const [sourceState, sourceConfig] = await Promise.all([
                        repository.getRecord(channelId, 'broadcast', 'state'),
                        repository.getRecord(channelId, 'setting', BROADCAST_CONFIG_ID)
                    ]);
                    if (sourceState) {
                        const copyContent = body.copyBroadcastContent === true;
                        const targetContent = checked.value.broadcastDefaults || {};
                        const content = (key) => copyContent ? sourceState[key] : targetContent[key];
                        // A duplicated channel reuses the shared layout and visibility controls,
                        // but channel-owned presenters, ticker copy and media must start from the
                        // target channel. It must also never inherit the source auction lifecycle.
                        await repository.upsertRecord(checked.value.id, 'broadcast', {
                            ...sanitizeBroadcastState({
                                ...sourceState,
                                hostName1: content('hostName1'),
                                hostRole1: content('hostRole1'),
                                hostName2: content('hostName2'),
                                hostRole2: content('hostRole2'),
                                hostName3: content('hostName3'),
                                hostRole3: content('hostRole3'),
                                notice: content('notice'),
                                noticeDetail: content('noticeDetail'),
                                page1Ticker: content('page1Ticker'),
                                page2Ticker: content('page2Ticker'),
                                page1BannerUrl: copyContent ? sourceState.page1BannerUrl : '',
                                page2BannerUrl: copyContent ? sourceState.page2BannerUrl : '',
                                page3BannerUrl: copyContent ? sourceState.page3BannerUrl : '',
                                page3Title: content('page3Title'),
                                quizQuestion: '',
                                activeItemId: '',
                                mode: 'standby',
                                audienceSessionId: '',
                                audienceSessionStatus: '',
                                audienceSessionLockedAt: '',
                                audienceSessionEndedAt: '',
                                quizStatus: 'ready',
                                quizWinner: '',
                                quizAnswer: ''
                            }),
                            id: 'state',
                            revision: Date.now()
                        });
                    }
                    if (sourceConfig?.values) {
                        await repository.upsertRecord(checked.value.id, 'setting', {
                            id: BROADCAST_CONFIG_ID,
                            values: mergeBroadcastConfig({}, sourceConfig.values),
                            revision: Date.now()
                        });
                    }
                }
                touchChannel(checked.value.id);
                replyJson(res, 201, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'pinball-session' && method === 'GET') {
                const record = await repository.getRecord(channelId, 'setting', PINBALL_SESSION_ID);
                replyJson(res, 200, { channelId, session: publicPinballSession(record) });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'pinball-session' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const action = ['reset', 'prepare', 'start'].includes(body.action) ? body.action : '';
                const requestId = cleanText(body.requestId, 80);
                if (!action || !/^[a-z0-9][a-z0-9_-]{7,79}$/i.test(requestId)) {
                    replyJson(res, 422, { error: '유효한 핀볼 명령과 요청 ID가 필요합니다.' });
                    return true;
                }
                await withMutationLock(`pinball:${channelId}`, async () => {
                    const current = await repository.getRecord(channelId, 'setting', PINBALL_SESSION_ID);
                    if (current?.lastRequestId === requestId) {
                        replyJson(res, 200, { channelId, session: publicPinballSession(current), duplicate: true });
                        return;
                    }
                    const currentRevision = Math.max(0, Number(current?.revision) || 0);
                    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== currentRevision) {
                        replyJson(res, 409, {
                            error: '다른 제어 화면에서 핀볼 설정이 변경되었습니다. 현재 상태를 다시 확인해 주세요.',
                            code: 'PINBALL_REVISION_CONFLICT',
                            session: publicPinballSession(current)
                        });
                        return;
                    }

                    const now = new Date().toISOString();
                    let next;
                    if (action === 'reset') {
                        next = {
                            id: PINBALL_SESSION_ID,
                            revision: currentRevision + 1,
                            phase: 'idle',
                            runId: '',
                            command: { id: crypto.randomUUID(), type: 'reset', issuedAt: now },
                            entries: [],
                            config: null,
                            seed: '',
                            ballCount: 0,
                            resultHistory: Array.isArray(current?.resultHistory) ? current.resultHistory : [],
                            lastRequestId: requestId,
                            updatedAt: now
                        };
                    } else if (action === 'prepare') {
                        if (current?.phase === 'running') {
                            replyJson(res, 409, { error: '현재 추첨이 끝난 뒤 다음 공을 배치해 주세요.', code: 'PINBALL_ALREADY_RUNNING' });
                            return;
                        }
                        const checked = sanitizePinballEntries(body.entries);
                        if (checked.error) {
                            replyJson(res, 422, { error: checked.error });
                            return;
                        }
                        const seed = cleanText(body.seed, 96);
                        if (!seed) {
                            replyJson(res, 422, { error: '추첨 시드가 필요합니다.' });
                            return;
                        }
                        next = {
                            id: PINBALL_SESSION_ID,
                            revision: currentRevision + 1,
                            phase: 'prepared',
                            runId: crypto.randomUUID(),
                            command: { id: crypto.randomUUID(), type: 'prepare', issuedAt: now },
                            entries: checked.entries,
                            config: sanitizePinballConfig(body.config),
                            seed,
                            ballCount: checked.ballCount,
                            resultHistory: Array.isArray(current?.resultHistory) ? current.resultHistory : [],
                            lastRequestId: requestId,
                            updatedAt: now
                        };
                    } else {
                        if (!current || !current.runId || !Array.isArray(current.entries) || current.entries.length === 0) {
                            replyJson(res, 409, { error: '먼저 참가자와 공을 송출 화면에 배치해 주세요.', code: 'PINBALL_NOT_PREPARED' });
                            return;
                        }
                        if (current.phase === 'running') {
                            replyJson(res, 200, { channelId, session: publicPinballSession(current), duplicate: true });
                            return;
                        }
                        if (current.phase !== 'prepared') {
                            replyJson(res, 409, { error: '현재 핀볼 세션을 시작할 수 없습니다.', code: 'PINBALL_INVALID_PHASE' });
                            return;
                        }
                        next = {
                            ...current,
                            revision: currentRevision + 1,
                            phase: 'running',
                            command: { id: crypto.randomUUID(), type: 'start', issuedAt: now },
                            lastRequestId: requestId,
                            updatedAt: now
                        };
                    }
                    const saved = await repository.upsertRecord(channelId, 'setting', next);
                    touchChannel(channelId);
                    replyJson(res, 200, { channelId, session: publicPinballSession(saved), duplicate: false });
                });
                return true;
            }

            if (segments.length === 4 && segments[2] === 'pinball-session' && segments[3] === 'complete' && method === 'POST') {
                const body = await readJson(req);
                const runId = cleanText(body.runId, 80);
                const commandId = cleanText(body.commandId, 80);
                const winner = cleanText(body.winner, 120);
                const standings = sanitizePinballStandings(body.standings);
                await withMutationLock(`pinball:${channelId}`, async () => {
                    const current = await repository.getRecord(channelId, 'setting', PINBALL_SESSION_ID);
                    if (current?.phase === 'complete' && current.runId === runId) {
                        replyJson(res, 200, { channelId, session: publicPinballSession(current), duplicate: true });
                        return;
                    }
                    if (!current || current.phase !== 'running' || current.runId !== runId || current.command?.id !== commandId) {
                        replyJson(res, 409, { error: '현재 실행 중인 핀볼 추첨과 일치하지 않습니다.', code: 'PINBALL_RUN_MISMATCH' });
                        return;
                    }
                    const participantNames = new Set((current.entries || []).map(pinballEntryName).filter(Boolean));
                    if (!winner || !participantNames.has(winner)) {
                        replyJson(res, 422, { error: '현재 참가자 목록에 없는 결과입니다.' });
                        return;
                    }
                    const expectedRanks = Array.from({ length: current.ballCount }, (_, index) => index + 1);
                    if (
                        standings.length !== current.ballCount
                        || standings.some((standing, index) => standing.rank !== expectedRanks[index] || !participantNames.has(standing.name))
                        || !standings.some((standing) => standing.name === winner)
                    ) {
                        replyJson(res, 422, { error: '현재 참가자와 일치하는 전체 핀볼 순위가 필요합니다.' });
                        return;
                    }
                    const now = new Date().toISOString();
                    const result = { runId, winner, completedAt: now, standings };
                    const resultHistory = [
                        result,
                        ...(Array.isArray(current.resultHistory) ? current.resultHistory : [])
                            .filter((entry) => cleanText(entry?.runId, 80) !== runId)
                    ].slice(0, 50);
                    const saved = await repository.upsertRecord(channelId, 'setting', {
                        ...current,
                        revision: Math.max(0, Number(current.revision) || 0) + 1,
                        phase: 'complete',
                        result,
                        resultHistory,
                        updatedAt: now
                    });
                    touchChannel(channelId);
                    replyJson(res, 200, { channelId, session: publicPinballSession(saved), duplicate: false });
                });
                return true;
            }

            if(segments.length===3&&segments[2]==='banner-selection'&&method==='PUT'){
                if(!await requireAdmin(req,res))return true;
                const body=await readJson(req);
                if(typeof body.selected!=='boolean'||!(await bannerLibrary.list()).some(row=>row.id===body.id)){replyJson(res,422,{error:'공용 보관함의 배너를 선택해 주세요.'});return true}
                await withMutationLock('channel:'+channelId,async()=>{
                    const current=await repository.getRecord(channelId,'broadcast','state')||channel.broadcastDefaults||{};
                    const ids=new Set(current.selectedBannerIds||[]);
                    if(body.selected)ids.add(body.id);else ids.delete(body.id);
                    const placements={...(current.layoutPlacements||{})};
                    if(body.selected)for(const key of ['p1-banner','p2-banner'])if(placements[key])placements[key]={...placements[key],visible:true};
                    const state=await repository.upsertRecord(channelId,'broadcast',{...sanitizeBroadcastState({...current,layoutPlacements:placements,bannerSelectionConfigured:true,selectedBannerIds:[...ids],page1BannerOn:ids.size>0,page2BannerOn:ids.size>0,page1BannerUrl:'',page2BannerUrl:''}),revision:Date.now()});
                    touchChannel(channelId);replyJson(res,200,{state});
                });return true;
            }

            if (segments.length === 3 && segments[2] === 'broadcast-state' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                await withMutationLock(`channel:${channelId}`, async () => {
                    const current = await repository.getRecord(channelId, 'broadcast', 'state');
                    const record = await repository.upsertRecord(channelId, 'broadcast', {
                        ...sanitizeBroadcastState(mergeChannelBroadcastState(channel, current || {}, body)),
                        revision: Date.now()
                    });
                    touchChannel(channelId);
                    replyJson(res, 200, { state: record });
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'buyer-shipping-link' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                if (channel.dataAdapter !== 'platform') {
                    replyJson(res, 409, { error: '구매자 배송 링크는 신규 채널 자료에서 사용할 수 있습니다.' });
                    return true;
                }
                const body = await readJson(req);
                const itemId = cleanText(body.itemId, 64);
                const item = await repository.getRecord(channelId, 'item', itemId);
                if (!item || !isSoldItem(item)) {
                    replyJson(res, 404, { error: '낙찰 개체를 찾을 수 없습니다.' });
                    return true;
                }
                const phone = storedWinnerPhone(item) || await resolveWinnerPhone(item, bandMembership);
                const vendorKey = vendorKeyForItem(item);
                if (!phone) {
                    replyJson(res, 422, { error: '낙찰자 전화번호가 없어 문자를 준비할 수 없습니다.' });
                    return true;
                }
                if (!vendorKey) {
                    replyJson(res, 422, { error: '개체의 업체 정보가 없어 배송 묶음을 만들 수 없습니다.' });
                    return true;
                }
                const prepared = await prepareBuyerCheckoutLink(req, channelId, phone);
                const { payload: tokenPayload, code: shortCode, url: buyerUrl } = prepared;
                const name = buyerDisplayName(item);
                const vendorName = cleanText(item.vendorName || (await repository.getRecord(channelId, 'vendor', item.vendorId))?.name || '업체', 80);
                const context = await buyerBundleContext(tokenPayload);
                if (!context) {
                    replyJson(res, 404, { error: '구매자 배송 묶음을 찾을 수 없습니다.' });
                    return true;
                }
                const payload = await buyerShippingPayload(context);
                const sms = buyerShippingSms({ name, vendorName, context, payload, buyerUrl });
                replyJson(res, 200, {
                    phone,
                    url: buyerUrl.toString(),
                    code: shortCode,
                    expiresAt: new Date(Date.now() + BUYER_SHIPPING_TOKEN_TTL_MS).toISOString(),
                    messageMode: sms.mode,
                    itemSummary: sms.itemSummary,
                    message: sms.message
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'checkout-test' && method === 'POST') {
                if (!await requireAdmin(req,res)) return true;
                const body=await readJson(req);
                const vendor=await vendorDirectory.find(channelId,cleanText(body.vendorId,64));
                if(!vendor || channelId.startsWith('checkout-test-')) { replyJson(res,422,{error:'운영 채널의 업체를 선택해 주세요.'});return true; }
                const testId='checkout-test-'+crypto.createHash('sha256').update(channelId+':'+vendor.id).digest('hex').slice(0,16);
                await withMutationLock('checkout-test-create',async()=>{
                    const current=await loadCatalog();
                    if(!current.channels.some(c=>c.id===testId)) {
                        const testChannel=normalizeChannel({id:testId,name:'[테스트·입금 금지] '+vendor.name,status:'active',dataAdapter:'platform',features:{broadcast:false,shipping:true},shippingDefaults:{...channel.shippingDefaults,pickupLocations:channel.shippingDefaults?.pickupLocations?.length?channel.shippingDefaults.pickupLocations:['테스트 직접수령']}});
                        await repository.saveCatalog([...current.channels,testChannel],current.version);
                    }
                    if(!await repository.getRecord(testId,'vendor','test-vendor'))await repository.upsertRecord(testId,'vendor',{
                        ...vendor,id:'test-vendor',channelId:testId,directoryId:undefined,name:'[테스트] '+vendor.name,
                        phone:'01049278600',bankName:'테스트 은행 (입금 금지)',bankAccount:'000-000-000000',bankHolder:'실제 입금 금지',paymentMethods:['bank_transfer','card'],cardEnabled:true
                    });
                    if(!await repository.getRecord(testId,'item','test-item'))await repository.upsertRecord(testId,'item',{
                        id:'test-item',channelId:testId,name:'TEST-01 (입금 금지)',lotNumber:1,vendorId:'test-vendor',vendorName:'[테스트] '+vendor.name,status:'sold',soldPrice:100000,winnerName:'테스트 구매자',winnerPhone:'01049278600'
                    });
                    const buyer=await prepareBuyerCheckoutLink(req,testId,'01049278600');
                    const seller=await prepareVendorCheckoutLink(req,testId,'test-vendor');
                    replyJson(res,200,{buyerUrl:buyer.url.toString(),vendorUrl:seller.url.toString(),channelId:testId,message:'실제 페이지·서버 저장을 사용합니다. 문자 자동 발송은 꺼져 있으며 실제 입금은 하지 마세요.'});
                });return true;
            }

            if (segments.length === 3 && segments[2] === 'vendor-directory') {
                if (!await requireAdmin(req,res)) return true;
                if (method === 'GET') {
                    const directory=await vendorDirectory.read();
                    replyJson(res,200,{profiles:directory.profiles.map(p=>({id:p.id,name:p.info.name,phone:p.info.phone||'',members:p.members}))});return true;
                }
                if (method === 'POST') {
                    const body=await readJson(req);
                    const result=body.profileId ? await vendorDirectory.attach(cleanText(body.profileId,80),channelId) : await vendorDirectory.enroll(channelId,cleanText(body.vendorId,64));
                    await touchVendorChannels(channelId,result.vendorId||body.vendorId);replyJson(res,200,{result});return true;
                }
            }

            if (segments.length === 3 && segments[2] === 'vendor-checkout-link' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const vendors = await vendorDirectory.list(channelId);
                const requested = cleanText(body.vendorKey || body.vendorId || body.vendorName, 80);
                const vendor = vendors.find((entry) => entry.id === requested) || vendors.find((entry) => entry.name === requested);
                if (!vendor) {
                    replyJson(res, 404, { error: '업체를 찾을 수 없습니다.' });
                    return true;
                }
                const prepared = await prepareVendorCheckoutLink(req, channelId, vendor.id || vendor.name);
                const context = await vendorCheckoutContext(prepared.payload);
                replyJson(res, 200, {
                    url: prepared.url.toString(),
                    code: prepared.code,
                    expiresAt: new Date(Date.now() + VENDOR_CHECKOUT_TOKEN_TTL_MS).toISOString(),
                    vendor: { id: vendor.id, name: vendor.name, phone: vendor.phone || '' },
                    summary: context ? (await vendorCheckoutPayload(context)).summary : null
                });
                return true;
            }

            if (segments.length >= 3 && segments[2] === 'checkout-changes') {
                if(!await requireAdmin(req,res))return true;
                if(segments.length===3 && method==='GET'){
                    const records=(await repository.listRecords(channelId,'checkoutchange')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
                    replyJson(res,200,{records});return true;
                }
                if(segments.length===4 && method==='POST'){
                    const body=await readJson(req);
                    await withMutationLock(`channel:${channelId}`,async()=>replyJson(res,200,await reviewCheckoutChange(req,channel,segments[3],body)));
                    return true;
                }
            }
            if (segments.length === 3 && segments[2] === 'buyer-shipping-payment' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const itemId = cleanText(body.itemId, 64);
                const item = await repository.getRecord(channelId, 'item', itemId);
                if (!item || !isSoldItem(item)) {
                    replyJson(res, 404, { error: '낙찰 개체를 찾을 수 없습니다.' });
                    return true;
                }
                const phone = storedWinnerPhone(item) || await resolveWinnerPhone(item, bandMembership);
                if (!phone) {
                    replyJson(res, 422, { error: '낙찰자 전화번호가 없습니다.' });
                    return true;
                }
                const tokenPayload = {
                    v: 2,
                    channelId,
                    phoneHash: sessionKey(phone),
                    expiresAt: Date.now() + BUYER_SHIPPING_TOKEN_TTL_MS
                };
                const vendorKey = vendorKeyForItem(item);
                await withMutationLock(`channel:${channelId}`, async () => {
                    const context = await buyerBundleContext(tokenPayload);
                    if (!context) throw buyerInputError('구매자 배송 묶음을 찾을 수 없습니다.', 404);
                    const result = await confirmBuyerPayment(context, body.vendorKey || vendorKey, body.requestId, body);
                    replyJson(res, 200, { ...result.payload, duplicate: result.duplicate });
                });
                return true;
            }

            const type = segments[2]?.replace(/s$/, '');
            if (segments[2] !== 'archives' && !TYPES.has(type)) {
                replyJson(res, 404, { error: 'Not found' });
                return true;
            }
            if (!await requireAdmin(req, res)) return true;

            if (segments.length === 3 && method === 'POST' && segments[2] !== 'archives') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const body = await readJson(req);
                    if (type === 'item' && body.requireActiveChannel === true) {
                        const activeId = await repository.getActiveChannel();
                        if (activeId !== channelId) {
                            replyJson(res, 409, {
                                error: '현재 운영 채널이 변경되었습니다. 개체 목록을 새로고침해 주세요.',
                                code: 'ACTIVE_CHANNEL_CHANGED',
                                channelId: activeId || ''
                            });
                            return;
                        }
                    }
                    const data = await workspace(channelId);
                    let record = sanitizeRecord(type, body.record);
                    if(type==='shipment')await assertShipmentNotPending(channelId,record);
                    if (type === 'item' && body.allocateNextLot === true) {
                        const nextLotNumber = data.items.reduce(
                            (maximum, item) => Math.max(maximum, Number(item.lotNumber) || 0),
                            0
                        ) + 1;
                        record = { ...record, lotNumber: nextLotNumber };
                    }
                    const errors = validateRecord(type, record, { ...data, groups: channel.groups || [] });
                    if (errors.length) {
                        replyJson(res, 422, { error: errors.join(' '), errors });
                        return;
                    }
                    const saved = type === 'vendor' ? await vendorDirectory.update(channelId,record,body.record?.directoryRevision) : await repository.upsertRecord(channelId, type, record);
                    touchRecord(channelId, type, null, saved);
                    if(type==='vendor')await touchVendorChannels(channelId,saved.id);
                    replyJson(res, 201, { record: saved });
                });
                return true;
            }

            if (segments.length >= 3 && segments[2] === 'archives') {
                if (!await requireAdmin(req, res)) return true;
                if (segments.length === 3 && method === 'GET') {
                    const records = await repository.listRecords(channelId, 'archive');
                    const archives = records
                        .map((record) => publicArchive(record))
                        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
                    replyJson(res, 200, { channelId, archives });
                    return true;
                }
                if (segments.length === 3 && method === 'POST') {
                    const body = await readJson(req);
                    await withMutationLock(`channel:${channelId}`, async () => {
                        const data = await workspace(channelId);
                        const liveItem = data.items.find((item) => item.status === 'live') || null;
                        if (data.broadcast?.mode === 'live' || liveItem) {
                            replyJson(res, 409, {
                                error: '진행 중인 경매를 종료한 뒤 회차를 저장해 주세요.',
                                code: 'AUCTION_LIVE',
                                itemId: liveItem?.id || data.broadcast?.activeItemId || ''
                            });
                            return;
                        }
                        const sold = data.items.filter((item) => item.status === 'sold' || Number(item.soldPrice) > 0);
                        const record = await repository.upsertRecord(channelId, 'archive', {
                            id: recordId('arc'),
                            title: cleanText(body.title || `${channel.name} ${new Date().toLocaleDateString('ko-KR')}`, 80),
                            createdAt: new Date().toISOString(),
                            itemCount: data.items.length,
                            soldCount: sold.length,
                            totalSoldAmount: sold.reduce((sum, item) => sum + (Number(item.soldPrice) || 0), 0),
                            scoreboardCount: channel.scoreboards?.length || 0,
                            scoreboards: rankingsForChannel(channel, data.items, data.vendors),
                            groups: channel.groups || [],
                            items: data.items
                        });
                        if (activeAudienceSession(data.broadcast)) {
                            await repository.upsertRecord(channelId, 'broadcast', sanitizeBroadcastState({
                                ...data.broadcast,
                                audienceSessionStatus: 'closed',
                                audienceSessionEndedAt: new Date().toISOString()
                            }));
                        }
                        touchChannel(channelId);
                        replyJson(res, 201, { archive: archiveDetail(record) });
                    });
                    return true;
                }
                if (segments.length === 4 && method === 'GET') {
                    const archive = await repository.getRecord(channelId, 'archive', segments[3]);
                    if (!archive) replyJson(res, 404, { error: '회차 기록을 찾을 수 없습니다.' });
                    else replyJson(res, 200, { archive: archiveDetail(archive) });
                    return true;
                }
                if (segments.length === 4 && method === 'DELETE') {
                    const archive = await repository.getRecord(channelId, 'archive', segments[3]);
                    if (!archive) replyJson(res, 404, { error: '회차 기록을 찾을 수 없습니다.' });
                    else {
                        await repository.deleteRecord(channelId, 'archive', segments[3]);
                        touchChannel(channelId);
                        replyJson(res, 200, { deleted: true });
                    }
                    return true;
                }
            }

            if (segments.length === 4 && method === 'PUT') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const body = await readJson(req);
                    const current = await repository.getRecord(channelId, type, segments[3]);
                    if (!current) {
                        replyJson(res, 404, { error: '항목을 찾을 수 없습니다.' });
                        return;
                    }
                    const data = await workspace(channelId);
                    const incoming = { ...body.record, id: current.id };
                    // Ordinary item edits must not end a live auction. Older
                    // monitor clients send a full cached record when editing
                    // the name/checklist, and that cache can still say
                    // `waiting`. Auction status changes belong exclusively to
                    // the locked auction-transition route above.
                    if (type === 'item' && current.status === 'live') {
                        incoming.status = 'live';
                    }
                    let record = sanitizeRecord(type, incoming, current);
                    if(type==='shipment'){await assertShipmentNotPending(channelId,current);await assertShipmentNotPending(channelId,record);}
                    if (type === 'item' && current.status === 'live' && audienceCompetitionEnabled(channel)) {
                        const decorated = await decorateCrewartBidLog(channelId, channel, data.broadcast, record);
                        record = decorated.item;
                    }
                    const errors = validateRecord(type, record, { ...data, groups: channel.groups || [] });
                    if (errors.length) {
                        replyJson(res, 422, { error: errors.join(' '), errors });
                        return;
                    }
                    const saved = type === 'vendor' ? await vendorDirectory.update(channelId,record,body.record?.directoryRevision) : await repository.upsertRecord(channelId, type, record);
                    touchRecord(channelId, type, current, saved);
                    if(type==='vendor')await touchVendorChannels(channelId,saved.id);
                    replyJson(res, 200, { record: saved });
                });
                return true;
            }

            if (segments.length === 4 && method === 'DELETE') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const data = await workspace(channelId);
                    const deletedRecord = data[segments[2]]?.find((record) => record.id === segments[3]) || null;
                    if (type === 'item' && (deletedRecord?.status === 'live' || (data.broadcast?.activeItemId === segments[3] && data.broadcast?.mode === 'live'))) {
                        replyJson(res, 409, { error: '진행 중인 경매는 종료하거나 대기로 전환한 후 삭제해 주세요.' });
                        return;
                    }
                    if(type==='shipment')await assertShipmentNotPending(channelId,deletedRecord);
                    if (type === 'vendor') {
                        if(await vendorDirectory.profileFor(channelId,segments[3])) {
                            replyJson(res,409,{error:'공통 업체는 다른 채널과 연결되어 있어 여기서 삭제할 수 없습니다. 비활성화해 주세요.'});return;
                        }
                        const usedByItem = data.items.some((item) => item.vendorId === segments[3]);
                        const usedByShipment = data.shipments.some((shipment) => shipment.vendorId === segments[3]);
                        if (usedByItem || usedByShipment) {
                            replyJson(res, 409, { error: '연결된 개체나 배송이 있어 업체를 삭제할 수 없습니다.' });
                            return;
                        }
                    }
                    if (type === 'item' && data.shipments.some((shipment) => shipment.itemId === segments[3])) {
                        replyJson(res, 409, { error: '연결된 배송 정보가 있어 개체를 삭제할 수 없습니다.' });
                        return;
                    }
                    const clearSelection = type === 'item' && data.broadcast?.activeItemId === segments[3];
                    if (clearSelection) await repository.upsertRecord(channelId, 'broadcast', { ...data.broadcast, activeItemId: '', mode: 'standby' });
                    try {
                        await repository.deleteRecord(channelId, type, segments[3]);
                    } catch (error) {
                        if (clearSelection) await repository.upsertRecord(channelId, 'broadcast', data.broadcast);
                        throw error;
                    }
                    touchRecord(channelId, type, deletedRecord, null);
                    replyJson(res, 200, { deleted: true });
                });
                return true;
            }

            replyJson(res, 404, { error: 'Not found' });
            return true;
        } catch (error) {
            logger.error?.('[platform-api]', error.message);
            const status = error.status || (error.code === 'VERSION_CONFLICT' ? 409 : 500);
            const errorHeaders = url.pathname.startsWith('/api/platform/buyer-shipping') || url.pathname.startsWith('/api/platform/buyer-delivery')
                ? buyerCorsHeaders(req)
                : {};
            replyJson(
                res,
                status,
                { error: status === 500 ? '운영 데이터 처리 중 오류가 발생했습니다.' : error.message },
                errorHeaders
            );
            return true;
        }
    }

    return { handle, isAdmin, workspace };
}

module.exports = {
    CREWART_ROULETTE_OUTCOMES,
    chooseCrewartRouletteMultiplier,
    contributionAmountForItem,
    createPlatformApi,
    crewartAssignmentWeights,
    crewartHouseTotals,
    floorContribution,
    mergeBroadcastConfig,
    readJson,
    sanitizeBroadcastConfigPatch,
    sanitizeRecord,
    validateRecord
};

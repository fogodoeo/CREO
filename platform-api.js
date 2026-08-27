'use strict';

const crypto = require('node:crypto');
const { refreshShippingRate } = require('./shipping-rate-refresh');
const { rankingsForChannel } = require('./public/ranking-engine');
const { normalizePhone } = require('./band-membership');

const {
    DEFAULT_CHANNELS,
    channelLinks,
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
    return channel?.status === 'active' && channel?.features?.broadcast !== false;
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
        'p1-brand', 'p1-page-label', 'p1-hosts', 'p1-notice', 'p1-banner', 'p1-ticker',
        'p2-brand', 'p2-page-label', 'p2-header', 'p2-info', 'p2-bidders', 'p2-photo', 'p2-price', 'p2-sold', 'p2-banner', 'p2-ticker',
        'p3-board', 'p3-effect', 'p3-banner'
    ]);
    const clampLayoutNumber = (value, min, max, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    };
    const layoutPlacements = {};
    if (input.layoutPlacements && typeof input.layoutPlacements === 'object' && !Array.isArray(input.layoutPlacements)) {
        for (const [slot, raw] of Object.entries(input.layoutPlacements)) {
            if (!allowedLayoutSlots.has(slot) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            layoutPlacements[slot] = {
                x: clampLayoutNumber(raw.x, 0, 96, 4),
                y: clampLayoutNumber(raw.y, 0, 96, 4),
                width: clampLayoutNumber(raw.width, 4, 100, 40),
                height: clampLayoutNumber(raw.height, 4, 100, 20),
                fontScale: clampLayoutNumber(raw.fontScale, 0.5, 2.5, 1)
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
        page1Ticker: cleanText(input.page1Ticker || input.ticker, 220),
        page1BannerUrl: cleanText(input.page1BannerUrl, 600),
        page1HostsPosition: position(input.page1HostsPosition),
        page1NoticePosition: position(input.page1NoticePosition),
        page1BannerPosition: position(input.page1BannerPosition),
        page1TickerPosition: ['auto', 'top', 'bottom'].includes(input.page1TickerPosition) ? input.page1TickerPosition : 'auto',
        page2InfoOn: booleanValue(input.page2InfoOn),
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
        page2Ticker: cleanText(input.page2Ticker || input.ticker, 220),
        page2BannerUrl: cleanText(input.page2BannerUrl, 600),
        page2HeaderPosition: position(input.page2HeaderPosition),
        page2InfoPosition: position(input.page2InfoPosition),
        page2PhotoPosition: position(input.page2PhotoPosition),
        page2PricePosition: position(input.page2PricePosition),
        page2SoldPosition: position(input.page2SoldPosition),
        page2BannerPosition: position(input.page2BannerPosition),
        page2TickerPosition: ['auto', 'top', 'bottom'].includes(input.page2TickerPosition) ? input.page2TickerPosition : 'auto',
        page3On: booleanValue(input.page3On, false),
        page3BannerOn: booleanValue(input.page3BannerOn, false),
        page3BannerUrl: cleanText(input.page3BannerUrl, 600),
        extraMode,
        scoreboardId: cleanText(input.scoreboardId, 64),
        page3Title: cleanText(input.page3Title || input.headline, 120),
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
        themePreset: ['academy', 'midnight', 'arena', 'clean'].includes(input.themePreset) ? input.themePreset : 'midnight',
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
        return {
            ...base,
            code: cleanText(input.code, 24).toUpperCase(),
            name: cleanText(input.name, 80),
            manager: cleanText(input.manager, 60),
            phone: cleanText(input.phone, 30),
            logoUrl: cleanText(input.logoUrl, 600),
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
            note: cleanText(input.note, 500)
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
    if (!phone) return null;
    const lastDigit = Number.parseInt(phone.slice(-1), 10);
    if (!Number.isInteger(lastDigit)) return null;
    return { groupKey: lastDigit % 2 === 0 ? 'even' : 'odd', source: 'phone' };
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

function createPlatformApi({
    repository,
    logger = console,
    refreshShippingRateFn = refreshShippingRate,
    crewartHouseService = null,
    bandMembership = null,
    diceRoll = () => crypto.randomInt(1, 7),
    adminSessionSecret = process.env.CREO_ADMIN_SECRET || crypto.randomBytes(32).toString('hex'),
    adminSessionTtlMs = ADMIN_SESSION_TTL_MS
} = {}) {
    if (!repository) throw new Error('repository is required');
    const sessionSecret = String(adminSessionSecret || crypto.randomBytes(32).toString('hex'));
    const sessionTtlMs = Math.max(60_000, Number(adminSessionTtlMs) || ADMIN_SESSION_TTL_MS);
    const mutationLocks = new Map();
    const channelRevisions = new Map();
    const knownChannelIds = new Set(DEFAULT_CHANNELS.map((channel) => channel.id));
    const revokedAdminSessions = new Map();
    const adminLoginAttempts = new Map();
    let revisionSequence = 0;

    function channelRevision(channelId) {
        return channelRevisions.get(channelId) || 0;
    }

    function touchChannel(channelId) {
        revisionSequence += 1;
        knownChannelIds.add(channelId);
        channelRevisions.set(channelId, revisionSequence);
        return revisionSequence;
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
            repository.listRecords(channelId, 'vendor'),
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
            || catalog.channels.find((candidate) => candidate.status !== 'archived')
            || catalog.channels[0]
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
                const { channelId } = await activeChannelContext();
                replyJson(res, 200, { channelId });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'operator-context' && method === 'GET') {
                if (!await requireAdmin(req, res)) return true;
                const { channelId, channel } = await activeChannelContext();
                replyJson(res, 200, {
                    activeChannelId: channelId,
                    channel: channel ? { ...channel, links: channelLinks(channel.id) } : null,
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
                    .filter((channel) => includeInactive || channel.status === 'active')
                    .map((channel) => ({ ...channel, links: channelLinks(channel.id) }));
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
                // This endpoint intentionally stays memory-only. OBS can poll it
                // every 350 ms without creating SQLite/Supabase read traffic.
                replyJson(res, 200, { revision: channelRevision(channelId) });
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
                replyJson(res, 200, { channel: { ...channel, links: channelLinks(channel.id) } });
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
                const next = catalog.channels.slice();
                next[channelIndex] = checked.value;
                const saved = await repository.saveCatalog(next, body.expectedVersion ?? catalog.version);
                touchChannel(channelId);
                replyJson(res, 200, { channel: checked.value, catalogVersion: saved.version });
                return true;
            }

            if (segments.length === 2 && method === 'DELETE') {
                if (!await requireAdmin(req, res)) return true;
                if (DEFAULT_CHANNELS.some((entry) => entry.id === channelId) || channel.legacy?.items) {
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
                const vendors = new Map(data.vendors.map((vendor) => [vendor.id, vendor]));
                const activeItemId = cleanText(data.broadcast?.activeItemId, 64);
                const requestedPageRaw = Number.parseInt(url.searchParams.get('page'), 10);
                const requestedPage = [1, 2, 3].includes(requestedPageRaw) ? requestedPageRaw : 0;
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
                    return isActiveItem
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
                }));
                const revealedBidderKeys = new Set(audience.revealedBidderKeys || []);
                replyJson(res, 200, {
                    revision: channelRevision(channelId),
                    channel,
                    audience,
                    state: data.broadcast ? {
                        ...data.broadcast,
                        quizAnswer: data.broadcast.quizStatus === 'closed' ? data.broadcast.quizAnswer : ''
                    } : data.broadcast,
                    assets: data.assets
                        .filter((asset) => asset.active !== false)
                        .filter((asset) => !requestedPage
                            || (requestedPage === 3
                                ? asset.kind === 'dice' || (asset.kind === 'banner' && (asset.page === 'all' || asset.page === '3'))
                                : (asset.page === 'all' || asset.page === String(requestedPage))))
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'))
                        .map(({ id, name, kind, page, targetName, imageUrl, linkUrl, sortOrder }) => ({ id, name, kind, page, targetName, imageUrl, linkUrl, sortOrder })),
                    items: broadcastItems.map((item) => {
                        const vendor = vendors.get(item.vendorId);
                        const publicRecord = publicItem({
                            ...item,
                            vendorName: vendor?.name || item.vendorName,
                            vendorLogoUrl: vendor?.logoUrl || item.vendorLogoUrl,
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
                    if (active.channelId !== channelId) {
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
                            const face = normalizedDiceFace(diceRoll());
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
                        ...(audienceState || {}),
                        ...(body.state && typeof body.state === 'object' ? body.state : {}),
                        activeItemId: hasExplicitActiveItem ? body.state.activeItemId : (itemId || data.broadcast?.activeItemId || ''),
                        mode: requestedMode
                    });
                    const savedState = await repository.upsertRecord(channelId, 'broadcast', nextState);
                    await repository.setActiveChannel(channelId);
                    touchChannel(channelId);
                    replyJson(res, 200, { channelId, item: savedItem, state: savedState });
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
                    scoreboards: rankingsForChannel(channel, data.items)
                });
                return true;
            }

            if (segments.length === 3 && segments[2] === 'duplicate' && method === 'POST') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                const proposed = normalizeChannel({
                    ...channel,
                    ...body.channel,
                    id: body.channel?.id,
                    name: body.channel?.name || `${channel.name} 복사본`,
                    status: 'draft',
                    dataAdapter: 'platform',
                    pages: {},
                    legacy: { items: false, managementUrl: '', controlUrl: '' }
                });
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
                    const sourceVendors = await repository.listRecords(channelId, 'vendor');
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
                        await repository.upsertRecord(checked.value.id, 'broadcast', {
                            ...sourceState,
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

            if (segments.length === 3 && segments[2] === 'broadcast-state' && method === 'PUT') {
                if (!await requireAdmin(req, res)) return true;
                const body = await readJson(req);
                await withMutationLock(`channel:${channelId}`, async () => {
                    const current = await repository.getRecord(channelId, 'broadcast', 'state');
                    const record = await repository.upsertRecord(channelId, 'broadcast', {
                        ...sanitizeBroadcastState({ ...(current || {}), ...body }),
                        revision: Date.now()
                    });
                    touchChannel(channelId);
                    replyJson(res, 200, { state: record });
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
                    const saved = await repository.upsertRecord(channelId, type, record);
                    touchChannel(channelId);
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
                            scoreboards: rankingsForChannel(channel, data.items),
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
                    if (type === 'item' && current.status === 'live' && audienceCompetitionEnabled(channel)) {
                        const decorated = await decorateCrewartBidLog(channelId, channel, data.broadcast, record);
                        record = decorated.item;
                    }
                    const errors = validateRecord(type, record, { ...data, groups: channel.groups || [] });
                    if (errors.length) {
                        replyJson(res, 422, { error: errors.join(' '), errors });
                        return;
                    }
                    const saved = await repository.upsertRecord(channelId, type, record);
                    touchChannel(channelId);
                    replyJson(res, 200, { record: saved });
                });
                return true;
            }

            if (segments.length === 4 && method === 'DELETE') {
                await withMutationLock(`channel:${channelId}`, async () => {
                    const data = await workspace(channelId);
                    if (type === 'vendor') {
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
                    await repository.deleteRecord(channelId, type, segments[3]);
                    touchChannel(channelId);
                    replyJson(res, 200, { deleted: true });
                });
                return true;
            }

            replyJson(res, 404, { error: 'Not found' });
            return true;
        } catch (error) {
            logger.error?.('[platform-api]', error.message);
            const status = error.status || (error.code === 'VERSION_CONFLICT' ? 409 : 500);
            replyJson(res, status, { error: status === 500 ? '운영 데이터 처리 중 오류가 발생했습니다.' : error.message });
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

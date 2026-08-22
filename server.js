// Build: 20260820-hotfix-v37
'use strict';

require('./load-local-env')();

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createBandOAuth } = require('./band-oauth');
const { createBandMembership } = require('./band-membership');
const { createBandMonitorStatusReader } = require('./band-monitor-status');
const { createCrewartSurveyApi } = require('./crewart-survey-api');
const { createCrewartHouseService } = require('./crewart-house-service');
const { createPlatformApi } = require('./platform-api');
const { createCaptureApi } = require('./capture-api');
const { CaptureStorage } = require('./capture-storage');
const { createCdcupRoundsApi } = require('./cdcup-rounds-api');
const { normalizeChannelId } = require('./platform-core');
const { SupabaseConfigRepository } = require('./platform-repository');
const { SQLitePlatformRepository } = require('./sqlite-platform-repository');

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const bandOAuth = createBandOAuth();
let platformApi;
const bandMembership = createBandMembership({
    isAdmin: (req) => platformApi?.isAdmin(req) || false
});
const readBandMonitorStatus = createBandMonitorStatusReader();
const supabasePlatformRepository = new SupabaseConfigRepository();
const platformStorageMode = String(process.env.CREO_PLATFORM_STORAGE || 'sqlite').toLowerCase();
const platformRepository = platformStorageMode === 'supabase'
    ? supabasePlatformRepository
    : new SQLitePlatformRepository({
        mirror: process.env.CREO_SUPABASE_MIRROR_ENABLED === 'false' ? null : supabasePlatformRepository
    });
const crewartHouseService = createCrewartHouseService({
    repository: supabasePlatformRepository,
    secret: bandMembership.config.sessionSecret
});
platformApi = createPlatformApi({ repository: platformRepository, crewartHouseService, bandMembership });
const captureStorage = new CaptureStorage();
const captureApi = createCaptureApi({
    repository: platformRepository,
    storage: captureStorage,
    isAdmin: platformApi.isAdmin
});
const cdcupRoundsApi = createCdcupRoundsApi({
    repository: supabasePlatformRepository,
    isAdmin: platformApi.isAdmin
});
const crewartSurveyApi = createCrewartSurveyApi({
    repository: supabasePlatformRepository,
    bandMembership,
    crewartHouseService,
    isAdmin: platformApi.isAdmin
});

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const CONTENT_TYPES = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.htm': 'text/html; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function writeHeaders(res, status, headers = {}) {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
}

function send(res, status, body, contentType, headers = {}) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    writeHeaders(res, status, {
        'Content-Type': contentType,
        'Content-Length': payload.length,
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(payload);
}

function sendJson(res, status, value) {
    send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function cacheControlFor(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (['.html', '.htm', '.json', '.js', '.css'].includes(extension)) {
        return 'no-cache';
    }
    if (/\.(?:avif|gif|ico|jpe?g|mp4|ogg|png|svg|webm|webp|woff2?)$/i.test(extension)) {
        return 'public, max-age=604800, stale-while-revalidate=86400';
    }
    return 'public, max-age=86400, stale-while-revalidate=3600';
}

function safePublicPath(urlPathname) {
    let pathname;
    try {
        pathname = decodeURIComponent(urlPathname);
    } catch {
        return null;
    }
    if (pathname.includes('\0') || pathname.split('/').some((part) => part === '..')) return null;
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = path.resolve(PUBLIC_DIR, relative);
    if (candidate !== PUBLIC_DIR && !candidate.startsWith(`${PUBLIC_DIR}${path.sep}`)) return null;
    return candidate;
}

function parseRange(value, size) {
    const match = String(value || '').match(/^bytes=(\d*)-(\d*)$/);
    if (!match) return null;
    let start = match[1] ? Number(match[1]) : null;
    let end = match[2] ? Number(match[2]) : null;
    if (start === null && end === null) return null;
    if (start === null) {
        const suffixLength = Math.min(end, size);
        start = size - suffixLength;
        end = size - 1;
    } else {
        end = end === null ? size - 1 : Math.min(end, size - 1);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
        return null;
    }
    return { start, end };
}

function isOperationalChannel(channel, feature) {
    return channel?.status === 'active' && channel?.features?.[feature] !== false;
}

async function canonicalOperationalChannelLocation(url, feature) {
    if (!url.searchParams.has('channel')) return '';
    const requestedId = normalizeChannelId(url.searchParams.get('channel'));
    const catalog = await platformRepository.getCatalog();
    const requested = catalog.channels.find((channel) => channel.id === requestedId);
    if (isOperationalChannel(requested, feature)) return '';
    const activeId = normalizeChannelId(await platformRepository.getActiveChannel());
    const target = catalog.channels.find((channel) => channel.id === activeId && isOperationalChannel(channel, feature))
        || catalog.channels.find((channel) => isOperationalChannel(channel, feature));
    if (!target) return '';
    const params = new URLSearchParams(url.searchParams);
    params.set('channel', target.id);
    return `${url.pathname}?${params.toString()}`;
}

async function serveStatic(req, res, url) {
    let filePath = safePublicPath(url.pathname);
    if (!filePath) return false;

    let stat;
    try {
        stat = await fsp.stat(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            stat = await fsp.stat(filePath);
        }
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
        throw error;
    }
    if (!stat.isFile()) return false;

    const etag = `W/\"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}\"`;
    const commonHeaders = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControlFor(filePath),
        'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        ETag: etag,
        'Last-Modified': stat.mtime.toUTCString()
    };

    if (!req.headers.range && req.headers['if-none-match'] === etag) {
        writeHeaders(res, 304, commonHeaders);
        res.end();
        return true;
    }

    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (req.headers.range) {
        const range = parseRange(req.headers.range, stat.size);
        if (!range) {
            writeHeaders(res, 416, { ...commonHeaders, 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return true;
        }
        ({ start, end } = range);
        status = 206;
        commonHeaders['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    commonHeaders['Content-Length'] = end - start + 1;
    writeHeaders(res, status, commonHeaders);
    if (req.method === 'HEAD') {
        res.end();
        return true;
    }

    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { start, end });
        stream.once('error', reject);
        res.once('finish', resolve);
        res.once('close', resolve);
        stream.pipe(res);
    });
    return true;
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        if (url.pathname.startsWith('/api/band-oauth/')) {
            if (await bandOAuth.handle(req, res, url)) return;
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (url.pathname.startsWith('/api/band-membership/')) {
            if (await bandMembership.handle(req, res, url)) return;
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (url.pathname === '/api/band-monitor/status' && req.method === 'GET') {
            sendJson(res, 200, {
                ok: true,
                now: new Date().toISOString(),
                monitor: await readBandMonitorStatus()
            });
            return;
        }

        if (url.pathname.startsWith('/api/crewart-survey/')) {
            if (await crewartSurveyApi.handle(req, res, url)) return;
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (url.pathname.startsWith('/api/cdcup/rounds/')) {
            if (await cdcupRoundsApi.handle(req, res, url)) return;
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (url.pathname.startsWith('/api/capture/')) {
            if (await captureApi.handleApi(req, res, url)) return;
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (url.pathname.startsWith('/api/platform/')) {
            if (await platformApi.handle(req, res, url)) return;
        }

        if (url.pathname.startsWith('/capture/')) {
            if (await captureApi.handleSharePage(req, res, url)) return;
        }

        if (url.pathname === '/health' && req.method === 'GET') {
            let platform;
            try { platform = await platformRepository.health(); }
            catch (error) { platform = { ok: false, error: error.message }; }
            sendJson(res, 200, {
                ok: true,
                service: 'creo',
                publicSiteReady: true,
                bandOAuthConfigured: bandOAuth.config.configured,
                bandMembershipConfigured: bandMembership.config.configured,
                bandMonitor: await readBandMonitorStatus(),
                platform,
                capture: captureStorage.health(),
                now: new Date().toISOString()
            });
            return;
        }

        if (
            (req.method === 'GET' || req.method === 'HEAD')
            && url.pathname === '/crewart-survey-manager.html'
        ) {
            writeHeaders(res, 308, {
                Location: '/crewart-survey.html',
                'Cache-Control': 'no-store'
            });
            res.end();
            return;
        }

        const operationalFeature = new Map([
            ['/broadcast-studio.html', 'broadcast'],
            ['/shipping.html', 'shipping'],
            ['/shipping-status.html', 'shipping'],
            ['/shipping-rates.html', 'shipping']
        ]).get(url.pathname);
        if ((req.method === 'GET' || req.method === 'HEAD') && operationalFeature) {
            let location = '';
            try { location = await canonicalOperationalChannelLocation(url, operationalFeature); }
            catch (error) { console.error('[server] channel canonicalization failed:', error.message); }
            if (location) {
                writeHeaders(res, 307, { Location: location, 'Cache-Control': 'no-store' });
                res.end();
                return;
            }
        }

        if ((req.method === 'GET' || req.method === 'HEAD') && await serveStatic(req, res, url)) {
            return;
        }

        if (url.pathname.startsWith('/api/')) {
            sendJson(res, 404, { error: 'Not found' });
            return;
        }
        send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    } catch (error) {
        console.error('[server] request failed:', error.message);
        if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
        else res.destroy();
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[creo] listening on http://${HOST}:${PORT}`);
    console.log(`[creo] public directory: ${PUBLIC_DIR}`);
    console.log(`[creo] BAND OAuth configured: ${bandOAuth.config.configured}`);
    console.log(`[creo] BAND membership configured: ${bandMembership.config.configured}`);
    console.log(`[creo] platform storage: ${platformStorageMode}`);
});

let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[creo] ${signal} received, closing cleanly`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref?.();
    server.close(() => {
        try { platformRepository.close?.(); } catch (error) { console.error('[creo] repository close failed:', error.message); }
        clearTimeout(forceExit);
        process.exit(0);
    });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

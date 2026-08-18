'use strict';

const crypto = require('node:crypto');
const { cleanText, normalizeChannelId } = require('./platform-core');
const { MIME_EXTENSIONS } = require('./capture-storage');

const CAPTURE_BODY_LIMIT = 4 * 1024 * 1024;
const AGENT_LEASE_MS = 30_000;
const JOB_STATUSES = new Set(['pending', 'capturing', 'complete', 'error']);

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

function replyHtml(res, status, value) {
    const body = Buffer.from(String(value));
    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=300'
    });
    res.end(body);
}

async function readJson(req, limit = CAPTURE_BODY_LIMIT) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) {
            const error = new Error('캡처 이미지가 너무 큽니다.');
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

function safeCompare(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function captureIdFor(channelId, itemId) {
    return `cap_${crypto.createHash('sha256').update(`${channelId}:${itemId}`).digest('hex').slice(0, 24)}`;
}

function cleanItemId(value) {
    return cleanText(value, 64).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function publicCapture(record, origin = '') {
    const channelId = normalizeChannelId(record.channelId) || 'cdcup';
    const token = cleanText(record.shareToken, 80);
    const base = String(origin || '').replace(/\/+$/, '');
    return {
        id: record.id,
        itemId: record.itemId,
        itemNumber: Number(record.itemNumber) || 0,
        itemName: record.itemName || '',
        vendorName: record.vendorName || '',
        status: JOB_STATUSES.has(record.status) ? record.status : 'pending',
        requestedAt: record.requestedAt || null,
        capturedAt: record.capturedAt || null,
        updatedAt: record.updatedAt || null,
        error: record.status === 'error' ? '캡처에 실패했습니다.' : '',
        width: Number(record.width) || 0,
        height: Number(record.height) || 0,
        bytes: Number(record.bytes) || 0,
        imageUrl: token ? `${base}/api/capture/image/${encodeURIComponent(channelId)}/${encodeURIComponent(token)}` : '',
        shareUrl: token ? `${base}/capture/${encodeURIComponent(channelId)}/${encodeURIComponent(token)}` : ''
    };
}

function requestOrigin(req) {
    const protocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket?.encrypted ? 'https' : 'http');
    return `${protocol}://${req.headers.host || 'localhost'}`;
}

function normalizeJob(input = {}) {
    const channelId = normalizeChannelId(input.channelId || 'cdcup');
    const itemId = cleanItemId(input.itemId);
    if (!channelId) throw Object.assign(new Error('채널 ID가 올바르지 않습니다.'), { status: 400 });
    if (!itemId) throw Object.assign(new Error('개체 ID가 필요합니다.'), { status: 400 });
    return {
        channelId,
        itemId,
        itemNumber: Math.max(0, Number.parseInt(input.itemNumber, 10) || 0),
        itemName: cleanText(input.itemName || '개체', 100),
        vendorName: cleanText(input.vendorName, 80),
        eventKey: cleanText(input.eventKey, 160)
    };
}

function createCaptureApi({ repository, storage, isAdmin, logger = console } = {}) {
    if (!repository || !storage) throw new Error('capture repository and storage are required');
    const configuredAgentToken = String(process.env.CREO_CAPTURE_AGENT_TOKEN || '');

    async function isAgent(req) {
        const supplied = req.headers['x-creo-capture-token'];
        if (configuredAgentToken && safeCompare(supplied, configuredAgentToken)) return true;
        return typeof isAdmin === 'function' ? Boolean(await isAdmin(req)) : false;
    }

    async function requireAgent(req, res) {
        if (await isAgent(req)) return true;
        replyJson(res, 401, { error: '캡처 에이전트 인증이 필요합니다.' });
        return false;
    }

    async function findByToken(channelId, token) {
        const records = await repository.listRecords(channelId, 'capture');
        return records.find((record) => safeCompare(record.shareToken, token)) || null;
    }

    async function handleApi(req, res, url) {
        if (!url.pathname.startsWith('/api/capture/')) return false;
        try {
            const segments = url.pathname.slice('/api/capture/'.length).split('/').filter(Boolean).map(decodeURIComponent);
            const method = req.method || 'GET';

            if (segments.length === 1 && segments[0] === 'bootstrap' && method === 'GET') {
                replyJson(res, 200, {
                    serviceUrl: requestOrigin(req),
                    defaultChannel: 'cdcup',
                    storage: storage.health()
                });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'agent-check' && method === 'GET') {
                if (!await requireAgent(req, res)) return true;
                replyJson(res, 200, { authenticated: true, storage: storage.health() });
                return true;
            }

            if (segments.length === 1 && segments[0] === 'jobs' && method === 'POST') {
                if (!await requireAgent(req, res)) return true;
                const input = normalizeJob(await readJson(req, 256 * 1024));
                const id = captureIdFor(input.channelId, input.itemId);
                const current = await repository.getRecord(input.channelId, 'capture', id);
                if (current?.eventKey && input.eventKey && current.eventKey === input.eventKey && current.status !== 'error') {
                    replyJson(res, 200, { job: publicCapture(current, requestOrigin(req)), duplicate: true });
                    return true;
                }
                const now = new Date().toISOString();
                const record = await repository.upsertRecord(input.channelId, 'capture', {
                    ...(current || {}),
                    id,
                    ...input,
                    status: 'pending',
                    requestedAt: now,
                    leaseUntil: null,
                    agentId: '',
                    error: '',
                    attempts: Number(current?.attempts) || 0,
                    shareToken: current?.shareToken || crypto.randomBytes(24).toString('base64url')
                });
                replyJson(res, 201, { job: publicCapture(record, requestOrigin(req)) });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'jobs' && segments[1] === 'next' && method === 'POST') {
                if (!await requireAgent(req, res)) return true;
                const body = await readJson(req, 64 * 1024);
                const channelId = normalizeChannelId(body.channelId || 'cdcup');
                const agentId = cleanText(body.agentId || 'capture-agent', 80);
                if (!channelId) throw Object.assign(new Error('채널 ID가 올바르지 않습니다.'), { status: 400 });
                const now = Date.now();
                const records = await repository.listRecords(channelId, 'capture');
                const job = records
                    .filter((record) => record.status === 'pending' || (record.status === 'capturing' && new Date(record.leaseUntil || 0).getTime() <= now))
                    .sort((a, b) => new Date(a.requestedAt || 0) - new Date(b.requestedAt || 0))[0];
                if (!job) {
                    replyJson(res, 200, { job: null });
                    return true;
                }
                const leased = await repository.upsertRecord(channelId, 'capture', {
                    ...job,
                    status: 'capturing',
                    agentId,
                    attempts: (Number(job.attempts) || 0) + 1,
                    leaseUntil: new Date(now + AGENT_LEASE_MS).toISOString(),
                    error: ''
                });
                replyJson(res, 200, { job: publicCapture(leased, requestOrigin(req)) });
                return true;
            }

            if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'upload' && method === 'POST') {
                if (!await requireAgent(req, res)) return true;
                const channelId = normalizeChannelId((await Promise.resolve(segments[1] && url.searchParams.get('channel'))) || 'cdcup');
                const jobId = cleanItemId(segments[1]);
                const body = await readJson(req);
                const actualChannelId = normalizeChannelId(body.channelId || channelId || 'cdcup');
                const current = actualChannelId && await repository.getRecord(actualChannelId, 'capture', jobId);
                if (!current) throw Object.assign(new Error('캡처 작업을 찾을 수 없습니다.'), { status: 404 });
                const mimeType = String(body.mimeType || 'image/webp').toLowerCase();
                if (!MIME_EXTENSIONS[mimeType]) throw Object.assign(new Error('지원하지 않는 이미지 형식입니다.'), { status: 415 });
                const image = Buffer.from(String(body.imageBase64 || ''), 'base64');
                if (!image.length || image.length > 3 * 1024 * 1024) throw Object.assign(new Error('캡처 이미지 크기가 올바르지 않습니다.'), { status: 400 });
                const extension = MIME_EXTENSIONS[mimeType];
                const objectPath = `${actualChannelId}/${jobId}.${extension}`;
                await storage.put(objectPath, image, mimeType);
                const saved = await repository.upsertRecord(actualChannelId, 'capture', {
                    ...current,
                    status: 'complete',
                    mimeType,
                    objectPath,
                    bytes: image.length,
                    width: Math.max(0, Number.parseInt(body.width, 10) || 0),
                    height: Math.max(0, Number.parseInt(body.height, 10) || 0),
                    capturedAt: body.capturedAt || new Date().toISOString(),
                    leaseUntil: null,
                    error: ''
                });
                replyJson(res, 200, { capture: publicCapture(saved, requestOrigin(req)) });
                return true;
            }

            if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'fail' && method === 'POST') {
                if (!await requireAgent(req, res)) return true;
                const body = await readJson(req, 64 * 1024);
                const channelId = normalizeChannelId(body.channelId || 'cdcup');
                const jobId = cleanItemId(segments[1]);
                const current = channelId && await repository.getRecord(channelId, 'capture', jobId);
                if (!current) throw Object.assign(new Error('캡처 작업을 찾을 수 없습니다.'), { status: 404 });
                const saved = await repository.upsertRecord(channelId, 'capture', {
                    ...current,
                    status: 'error',
                    leaseUntil: null,
                    error: cleanText(body.error || '캡처 실패', 500)
                });
                replyJson(res, 200, { capture: publicCapture(saved, requestOrigin(req)) });
                return true;
            }

            if (segments.length === 2 && segments[0] === 'channel' && method === 'GET') {
                const channelId = normalizeChannelId(segments[1]);
                if (!channelId) throw Object.assign(new Error('채널 ID가 올바르지 않습니다.'), { status: 400 });
                const records = await repository.listRecords(channelId, 'capture');
                replyJson(res, 200, {
                    captures: records.map((record) => publicCapture(record, requestOrigin(req))).sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0))
                });
                return true;
            }

            if (segments.length === 3 && segments[0] === 'retry' && method === 'POST') {
                if (!await requireAgent(req, res)) return true;
                const channelId = normalizeChannelId(segments[1]);
                const jobId = cleanItemId(segments[2]);
                const current = channelId && await repository.getRecord(channelId, 'capture', jobId);
                if (!current) throw Object.assign(new Error('캡처 작업을 찾을 수 없습니다.'), { status: 404 });
                const saved = await repository.upsertRecord(channelId, 'capture', {
                    ...current,
                    status: 'pending',
                    requestedAt: new Date().toISOString(),
                    leaseUntil: null,
                    error: ''
                });
                replyJson(res, 200, { job: publicCapture(saved, requestOrigin(req)) });
                return true;
            }

            if (segments.length === 3 && segments[0] === 'image' && method === 'GET') {
                const channelId = normalizeChannelId(segments[1]);
                const token = cleanText(segments[2], 80);
                const record = channelId && token ? await findByToken(channelId, token) : null;
                if (!record?.objectPath || record.status !== 'complete') {
                    replyJson(res, 404, { error: '사진을 찾을 수 없습니다.' });
                    return true;
                }
                const image = await storage.get(record.objectPath);
                if (!image) {
                    replyJson(res, 404, { error: '사진 파일을 찾을 수 없습니다.' });
                    return true;
                }
                res.writeHead(200, {
                    'Content-Type': record.mimeType || 'image/webp',
                    'Content-Length': image.length,
                    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
                    'X-Content-Type-Options': 'nosniff'
                });
                res.end(image);
                return true;
            }

            return false;
        } catch (error) {
            logger.warn?.('[capture] request failed:', error.message);
            replyJson(res, error.status || 500, { error: error.status ? error.message : '캡처 요청 처리에 실패했습니다.' });
            return true;
        }
    }

    async function handleSharePage(req, res, url) {
        const match = url.pathname.match(/^\/capture\/([a-z0-9-]{2,32})\/([a-zA-Z0-9_-]{20,80})\/?$/);
        if (!match || !['GET', 'HEAD'].includes(req.method || 'GET')) return false;
        const [, channelId, token] = match;
        const record = await findByToken(channelId, token);
        if (!record?.objectPath || record.status !== 'complete') {
            replyHtml(res, 404, '<!doctype html><meta charset="utf-8"><title>사진 없음</title><p>사진을 찾을 수 없습니다.</p>');
            return true;
        }
        const origin = requestOrigin(req);
        const imageUrl = `${origin}/api/capture/image/${encodeURIComponent(channelId)}/${encodeURIComponent(token)}`;
        const title = `${record.itemNumber ? `${record.itemNumber}번 ` : ''}${record.itemName || '낙찰 개체'} 사진`;
        const escapedTitle = title.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
        const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapedTitle}</title><meta property="og:title" content="${escapedTitle}"><meta property="og:image" content="${imageUrl}"><meta property="og:type" content="website"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101214;color:#fff;font-family:system-ui,sans-serif}.card{width:min(760px,100%);padding:20px;box-sizing:border-box}.card img{display:block;width:100%;max-height:82vh;object-fit:contain;border-radius:14px;background:#070809}.card h1{margin:16px 2px 0;font-size:18px}</style></head><body><main class="card"><img src="${imageUrl}" alt="${escapedTitle}"><h1>${escapedTitle}</h1></main></body></html>`;
        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
            res.end();
        } else replyHtml(res, 200, html);
        return true;
    }

    return { handleApi, handleSharePage, isAgent };
}

module.exports = { createCaptureApi, captureIdFor, normalizeJob, publicCapture };

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ASSET_MIME_EXTENSIONS } = require('./broadcast-asset-storage');
const { normalizeChannelId } = require('./platform-core');

const BODY_LIMIT = 12 * 1024 * 1024;
const FILE_LIMIT = 8 * 1024 * 1024;

function replyJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > BODY_LIMIT) throw Object.assign(new Error('배너 파일이 너무 큽니다.'), { status: 413 });
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('업로드 형식이 올바르지 않습니다.'), { status: 400 }); }
}

function parseRange(value, size) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || '').trim());
    if (!match) return null;
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (!match[1] && match[2]) {
        start = Math.max(0, size - Number(match[2]));
        end = size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
    return { start, end: Math.min(end, size - 1) };
}

function createBroadcastAssetApi({ storage, isAdmin, logger = console } = {}) {
    if (!storage) throw new Error('broadcast asset storage is required');

    async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/broadcast-assets/')) return false;
        try {
            const segments = url.pathname.slice('/api/broadcast-assets/'.length).split('/').filter(Boolean).map(decodeURIComponent);
            const channelId = normalizeChannelId(segments[0]);
            if (!channelId) throw Object.assign(new Error('채널 ID가 올바르지 않습니다.'), { status: 400 });

            if (req.method === 'POST' && segments.length === 1) {
                if (!await isAdmin?.(req)) {
                    replyJson(res, 401, { error: '관리자 인증이 필요합니다.' });
                    return true;
                }
                const body = await readJson(req);
                const mimeType = String(body.mimeType || '').toLowerCase();
                const extension = ASSET_MIME_EXTENSIONS[mimeType];
                if (!extension) throw Object.assign(new Error('이미지, MP4 또는 MOV만 업로드할 수 있습니다.'), { status: 400 });
                const buffer = Buffer.from(String(body.dataBase64 || ''), 'base64');
                if (!buffer.length) throw Object.assign(new Error('업로드할 파일이 없습니다.'), { status: 400 });
                if (buffer.length > FILE_LIMIT) throw Object.assign(new Error('파일은 8MB 이하여야 합니다.'), { status: 413 });
                const fileName = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
                const saved = await storage.put(channelId, fileName, buffer, mimeType);
                replyJson(res, 201, { url: saved.url, mimeType, bytes: buffer.length });
                return true;
            }

            if ((req.method === 'GET' || req.method === 'HEAD') && segments.length === 2) {
                const found = await storage.localFile(channelId, segments[1]);
                if (!found) {
                    replyJson(res, 404, { error: '배너 파일을 찾을 수 없습니다.' });
                    return true;
                }
                const extension = path.extname(segments[1]).slice(1).toLowerCase();
                const mimeType = Object.entries(ASSET_MIME_EXTENSIONS).find(([, ext]) => ext === extension)?.[0] || 'application/octet-stream';
                const range = parseRange(req.headers.range, found.stat.size);
                const status = range ? 206 : 200;
                const start = range?.start ?? 0;
                const end = range?.end ?? found.stat.size - 1;
                res.writeHead(status, {
                    'Content-Type': mimeType,
                    'Content-Length': end - start + 1,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${found.stat.size}` } : {})
                });
                if (req.method === 'HEAD') res.end();
                else fs.createReadStream(found.target, { start, end }).pipe(res);
                return true;
            }

            replyJson(res, 404, { error: 'Not found' });
            return true;
        } catch (error) {
            logger.error?.('[broadcast-assets]', error.message);
            replyJson(res, error.status || 500, { error: error.status ? error.message : '배너 업로드에 실패했습니다.' });
            return true;
        }
    }

    return { handle };
}

module.exports = { createBroadcastAssetApi, parseRange };

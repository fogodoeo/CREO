'use strict';

// Optional web-only runtime. It owns no auction database and starts no sender.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {isProtectedEntry,entryPath}=require('./operator-entry');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
    '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
    '.wasm': 'application/wasm', '.gif': 'image/gif', '.avif': 'image/avif', '.pdf': 'application/pdf',
    '.mov': 'video/quicktime', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8' };

function pageAlias(pathname) {
    if(entryPath(pathname)==='/')return '/welcome.html';
    if (/^\/w\/op_[A-Za-z0-9_-]{16}$/.test(pathname)) return '/checkout-changes.html';
    if (/^\/[ds]\/[A-Za-z0-9_-]{8,24}$/.test(pathname)) return '/buyer-shipping.html';
    if (/^\/[vw]\/[A-Za-z0-9_-]{8,24}$/.test(pathname)) return '/vendor-checkout.html';
    if (/^\/o\/[A-Za-z0-9_-]{24}$/.test(pathname)) return '/organizer-shipping.html';
    return pathname;
}

function createGateway(options = {}) {
    const upstream = new URL(options.backendUrl || process.env.CREO_BACKEND_URL || '');
    const publicOrigin = new URL(options.publicOrigin || process.env.CREO_PUBLIC_ORIGIN || 'https://creok.onrender.com');
    if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password
        || upstream.search || upstream.hash || upstream.pathname !== '/') throw new Error('CREO_BACKEND_URL must be an origin');
    const publicDir = path.resolve(options.publicDir || path.join(__dirname, 'public'));
    const client = upstream.protocol === 'https:' ? https : http;

    function proxy(req, res) {
        if (req.headers.host === upstream.host) {
            res.writeHead(503); return res.end('Gateway backend points to itself');
        }
        const headers = { ...req.headers, host: upstream.host,
            'x-forwarded-host': publicOrigin.host, 'x-forwarded-proto': publicOrigin.protocol.slice(0, -1) };
        // Preserve the core's same-origin check only for this gateway's own browser requests.
        if (headers.origin) {
            try { if (new URL(headers.origin).host === req.headers.host) headers.origin = upstream.origin; } catch { /* core rejects it */ }
        }
        // The gateway never caches, buffers whole uploads, or retries writes.
        const outgoing = client.request(new URL(req.url, upstream), { method: req.method, headers }, incoming => {
            const responseHeaders = { ...incoming.headers, 'cache-control': 'no-store' };
            if (responseHeaders.location) {
                const redirect = new URL(responseHeaders.location, publicOrigin);
                if (redirect.host === req.headers.host && redirect.pathname + redirect.search === req.url) {
                    incoming.resume(); res.writeHead(404); return res.end('Not found');
                }
            }
            if (responseHeaders.location?.startsWith(upstream.origin + '/')) {
                responseHeaders.location = publicOrigin.origin + responseHeaders.location.slice(upstream.origin.length);
            }
            res.writeHead(incoming.statusCode, responseHeaders);
            incoming.pipe(res);
            incoming.on('error', () => res.destroy());
        });
        outgoing.setTimeout(60_000, () => outgoing.destroy(new Error('backend timeout')));
        outgoing.on('error', () => {
            if (res.headersSent) return res.destroy();
            res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '3' });
            res.end(JSON.stringify({ error: '서버 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.', code: 'BACKEND_UNAVAILABLE' }));
        });
        req.on('aborted', () => outgoing.destroy());
        res.on('close', () => { if (!res.writableEnded) outgoing.destroy(); });
        req.pipe(outgoing);
    }

    return http.createServer(async (req, res) => {
        try {
            if (!req.url.startsWith('/') || req.url.startsWith('//')) {
                res.writeHead(400); return res.end('Invalid request target');
            }
            const url = new URL(req.url, publicOrigin);
            if(isProtectedEntry(url.pathname))return proxy(req,res);
            if (!['GET', 'HEAD'].includes(req.method) || url.pathname.startsWith('/api/') || url.pathname === '/health') return proxy(req, res);
            let pathname;
            try { pathname = decodeURIComponent(pageAlias(url.pathname)); } catch { pathname = '\0'; }
            if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) {
                res.writeHead(400); return res.end('Invalid path');
            }
            if (pathname === '/crewart-survey-manager.html') {
                res.writeHead(308, { Location: '/crewart-survey.html', 'Cache-Control': 'no-store' }); return res.end();
            }
            let file = path.resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
            if (!file.startsWith(publicDir + path.sep)) { res.writeHead(400); return res.end('Invalid path'); }
            let stat;
            try {
                stat = await fsp.stat(file);
                if (stat.isDirectory()) { file = path.join(file, 'index.html'); stat = await fsp.stat(file); }
            } catch (error) {
                if (['ENOENT', 'ENOTDIR'].includes(error.code)) return proxy(req, res);
                throw error;
            }
            if (!stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
            const extension = path.extname(file).toLowerCase();
            const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
            const headers = { 'Content-Type': TYPES[extension] || 'application/octet-stream',
                'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN',
                'Permissions-Policy': ['cam.html', 'cam/index.html'].includes(path.relative(publicDir, file).split(path.sep).join('/'))
                    ? 'camera=(self), microphone=(self), geolocation=()' : 'camera=(), microphone=(), geolocation=()',
                'Cache-Control': ['.html', '.js', '.css', '.json'].includes(extension) ? 'no-cache' : 'public, max-age=3600',
                'Accept-Ranges': 'bytes', ETag: etag };
            if (!req.headers.range && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
            let start = 0, end = stat.size - 1, status = 200;
            if (req.headers.range) {
                const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
                if (match && (match[1] || match[2])) {
                    start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
                    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
                } else { start = -1; }
                if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
                    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }); return res.end();
                }
                status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
            }
            headers['Content-Length'] = stat.size ? end - start + 1 : 0;
            res.writeHead(status, headers);
            if (req.method === 'HEAD' || !stat.size) return res.end();
            const stream = fs.createReadStream(file, { start, end });
            stream.on('error', () => res.destroy()); stream.pipe(res);
            res.on('close', () => stream.destroy());
        } catch {
            if (res.headersSent) res.destroy();
            else { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('Gateway error'); }
        }
    });
}

if (require.main === module) {
    const server = createGateway();
    server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
    let stopping = false;
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
        if (stopping) return;
        stopping = true;
        const timeout = setTimeout(() => process.exit(1), 25_000); timeout.unref();
        server.close(() => { clearTimeout(timeout); process.exit(0); });
    });
}

module.exports = { createGateway, pageAlias };

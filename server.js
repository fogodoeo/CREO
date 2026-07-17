'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createBandOAuth } = require('./band-oauth');

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const bandOAuth = createBandOAuth();

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function send(res, status, body, contentType, headers = {}) {
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': contentType,
        'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
        ...headers
    });
    res.end(body);
}

function sendJson(res, status, value) {
    send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', {
        'Cache-Control': 'no-store'
    });
}

async function serveHome(res) {
    try {
        const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
        send(res, 200, html, 'text/html; charset=utf-8');
    } catch (error) {
        console.error('[server] failed to read home page:', error.message);
        send(res, 500, 'Server error', 'text/plain; charset=utf-8');
    }
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        if (url.pathname.startsWith('/api/band-oauth/')) {
            if (await bandOAuth.handle(req, res, url)) return;
            sendJson(res, 404, { error: 'Not found' });
            return;
        }

        if (url.pathname === '/health' && req.method === 'GET') {
            sendJson(res, 200, {
                ok: true,
                service: 'creo',
                bandOAuthConfigured: bandOAuth.config.configured,
                now: new Date().toISOString()
            });
            return;
        }

        if ((url.pathname === '/' || url.pathname === '/index.html') && req.method === 'GET') {
            await serveHome(res);
            return;
        }

        sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
        console.error('[server] request failed:', error.message);
        sendJson(res, 500, { error: 'Server error' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[creo] listening on http://${HOST}:${PORT}`);
    console.log(`[creo] BAND OAuth configured: ${bandOAuth.config.configured}`);
});

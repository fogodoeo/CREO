'use strict';
// Isolated real buyer page + in-memory object storage. No external accounts/data.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sharp = require('sharp');
const { fixture } = require('./national-settlement-fixture.cjs');
const { EntryPhotoStorage } = require('../entry-photo-storage');
const { BroadcastAssetStorage } = require('../broadcast-asset-storage');
const { createBroadcastAssetApi } = require('../broadcast-asset-api');
const { CaptureStorage } = require('../capture-storage');
const { createCaptureApi } = require('../capture-api');

async function main() {
    const port = Number(process.env.R2_PREVIEW_PORT) || 4450, origin = `http://127.0.0.1:${port}`, objectOrigin = `http://127.0.0.1:${port + 1}`;
    const objects = new Map(), key = 'isolated-object-signing-key';
    const signature = (name, expires) => crypto.createHmac('sha256', key).update(name + ':' + expires).digest('hex');
    const r2 = {
        bucket: 'isolated-preview',
        async put(namespace, object, bytes, type) { objects.set(namespace + '/' + object, { bytes, type }); },
        async has(namespace, object) { return objects.has(namespace + '/' + object); },
        async signedUrl(namespace, object) {
            const name = namespace + '/' + object, expires = Math.floor(Date.now() / 1000) + 3600;
            return objectOrigin + '/' + name + '?expires=' + expires + '&signature=' + signature(name, expires);
        }
    };
    const storage = new EntryPhotoStorage({ r2, secret: 'isolated-entry-signing-key', legacyFallback: false });
    const f = await fixture({ origin, apiOptions: { entryPhotoStorage: storage } });
    const owner = crypto.randomUUID(), photos = [];
    for (const color of ['#60a5fa', '#34d399', '#fbbf24']) {
        const full = await sharp({ create: { width: 800, height: 500, channels: 3, background: color } }).webp().toBuffer();
        const thumb = await sharp(full).resize(320).webp().toBuffer();
        const media = storage.describe(owner, crypto.randomUUID(), full, thumb, { width: 800, height: 500 });
        await storage.persist(media, full, thumb); photos.push(media);
    }
    const original = await f.repository.getRecord('national-cre', 'item', 'a01');
    await f.repository.upsertRecord('national-cre', 'item', { ...original, photoUrl: photos[0].url,
        attributes: { ...original.attributes, media: [photos[0]], parents: [
            { role: 'sire', name: '가상 부개체', media: [photos[1]] }, { role: 'dam', name: '가상 모개체', media: [photos[2]] }
        ] } });
    const assets = new BroadcastAssetStorage({ r2, legacyFallback: false, supabaseUrl: '', serviceKey: '' });
    const banner = await assets.put('preview', 'poster.webp', objects.values().next().value.bytes, 'image/webp');
    const assetApi = createBroadcastAssetApi({ storage: assets, isAdmin: () => false });
    const captures = new CaptureStorage({ r2, legacyFallback: false, supabaseUrl: '', serviceKey: '' });
    const captureApi = createCaptureApi({ repository: f.repository, storage: captures, isAdmin: () => false });
    await captures.put('national-cre/preview.webp', objects.values().next().value.bytes, 'image/webp');
    await f.repository.upsertRecord('national-cre', 'capture', { id: 'capture-preview', status: 'complete', itemId: 'a01', itemName: '가상 캡처',
        itemNumber: 1, shareToken: 'isolated-capture-preview-token', objectPath: 'national-cre/preview.webp', mimeType: 'image/webp' });
    const objectServer = http.createServer((req, res) => {
        const url = new URL(req.url, objectOrigin), name = decodeURIComponent(url.pathname.slice(1)), expires = url.searchParams.get('expires');
        if (Number(expires) < Date.now() / 1000 || signature(name, expires) !== url.searchParams.get('signature') || !objects.has(name)) { res.writeHead(403); res.end(); return; }
        const object = objects.get(name);
        res.writeHead(200, { 'Content-Type': object.type, 'Content-Length': object.bytes.length,
            'Access-Control-Allow-Origin': origin, 'Cache-Control': 'private, max-age=60' });
        res.end(req.method === 'HEAD' ? undefined : object.bytes);
    });
    const root = path.resolve(__dirname, '../public');
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, origin);
            if (url.pathname === '/') { res.writeHead(302, { Location: '/buyer-shipping.html?code=' + f.code }); res.end(); return; }
            if (url.pathname === '/banner-preview') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<title>R2 배너 테스트</title><img src="${banner.url}" alt="가상 배너">`); return; }
            if (await captureApi.handleSharePage(req, res, url)) return;
            if (await captureApi.handleApi(req, res, url)) return;
            if (await assetApi.handle(req, res, url)) return;
            if (url.pathname.startsWith('/api/') && await f.api.handle(req, res, url)) return;
            const target = path.resolve(root, '.' + url.pathname);
            if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(target)] || 'application/octet-stream' });
            fs.createReadStream(target).pipe(res);
        } catch (error) { res.writeHead(500); res.end('Isolated preview: ' + error.message); }
    });
    objectServer.listen(port + 1, '127.0.0.1');
    server.listen(port, '127.0.0.1', () => console.log('Isolated R2 buyer photo preview: ' + origin));
    const close = () => { server.close(); objectServer.close(); f.close(); process.exit(); };
    process.on('SIGINT', close); process.on('SIGTERM', close);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

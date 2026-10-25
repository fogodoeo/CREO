'use strict';
// An isolated synthetic file; never modify auction records or customer photos.
const assert = require('node:assert/strict');
const { createR2MediaStorage, sha256 } = require('../r2-media-storage');

async function main() {
    const storage = createR2MediaStorage();
    if (!storage) throw Error('R2 must be explicitly configured');
    const origin = 'https://creok.onrender.com';
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#1a7655"/><text x="18" y="65" fill="white" font-size="24">CREO R2 CHECK</text></svg>');
    const key = `checks/${sha256(bytes)}.svg`;
    await storage.ensureReady();
    await storage.put('migration-validation', key, bytes, 'image/svg+xml');
    const getUrl = await storage.signedUrl('migration-validation', key);
    const get = await fetch(getUrl, { headers: { Origin: origin } });
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('access-control-allow-origin'), origin);
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
    const head = await fetch(await storage.signedUrl('migration-validation', key, { method: 'HEAD' }), { method: 'HEAD', headers: { Origin: origin, 'Accept-Encoding': 'identity' } });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), bytes.length);
    const range = await fetch(getUrl, { headers: { Origin: origin, Range: 'bytes=0-15' } });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 16));
    const unsigned = new URL(getUrl); unsigned.search = '';
    assert.ok([400, 401, 403].includes((await fetch(unsigned)).status));
    const download = await fetch(await storage.signedUrl('migration-validation', key, { download: 'creo-r2-check.svg' }));
    assert.match(download.headers.get('content-disposition') || '', /attachment; filename="creo-r2-check.svg"/);
    await download.arrayBuffer();
    const preflight = await fetch(getUrl, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' } });
    assert.ok([200, 204].includes(preflight.status));
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    console.log(JSON.stringify({ passed: ['connection', 'signed GET and byte hash', 'signed HEAD', 'Range', 'CORS', 'preflight', 'unsigned access denied', 'download filename'], syntheticObject: key, bytes: bytes.length }));
}
main().catch(error => { console.error(error.name === 'AssertionError' ? `R2 verification failed: ${error.message}` : 'R2 verification failed'); process.exitCode = 1; });

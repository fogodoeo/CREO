'use strict';
// Read-only production smoke check: no auction mutations, uploads or messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { EntryPhotoStorage, REF_PREFIX } = require('../entry-photo-storage');
const { sha256 } = require('../r2-media-storage');

async function main() {
    const origin = 'https://creok.onrender.com';
    const account = process.env.CREO_R2_ACCOUNT_ID;
    assert.ok(account && process.env.CREO_ADMIN_SECRET, 'Expected production environment');
    const health = await (await fetch(origin + '/health')).json();
    assert.equal(health.capture.backend, 'r2');
    assert.equal(health.broadcastAssets.backend, 'r2');
    for (const route of ['/main', '/vendor-access.html', '/buyer-shipping.html', '/vendor-privacy.html']) {
        const response = await fetch(origin + route);
        assert.equal(response.status, 200, route);
        const html = await response.text();
        if (route === '/vendor-privacy.html') assert.ok(html.includes('Cloudflare'));
    }
    const dbPath = path.join(process.env.CREO_DATA_DIR || '/var/data/creo-platform', 'creo-platform.sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const references = new Set();
    function visit(value) {
        if (typeof value === 'string' && value.startsWith(REF_PREFIX)) references.add(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    }
    for (const row of db.prepare('SELECT value FROM platform_kv').all()) {
        try { visit(JSON.parse(row.value)); } catch { /* Non-JSON settings. */ }
    }
    db.close();
    assert.ok(references.size > 0, 'Existing photo references expected');
    const signer = new EntryPhotoStorage({ localDir: '/unused-read-only-signer', secret: process.env.CREO_ADMIN_SECRET });
    let privatePhotos = 0;
    for (const reference of [...references].slice(0, 3)) {
        const url = origin + signer.resolve(reference);
        const redirect = await fetch(url, { redirect: 'manual' });
        assert.equal(redirect.status, 307);
        const location = new URL(redirect.headers.get('location'));
        assert.equal(location.hostname, `${account}.r2.cloudflarestorage.com`);
        const photo = await fetch(location);
        assert.equal(photo.status, 200);
        assert.ok((await photo.arrayBuffer()).byteLength > 0);
        const invalid = new URL(url); invalid.searchParams.set('signature', 'invalid');
        assert.ok([401, 403, 404].includes((await fetch(invalid)).status));
        privatePhotos++;
    }
    const sitePath = 'promo-assets/hero-gyeongsang-20261026-28-v10.thumb.webp';
    const staticRedirect = await fetch(`${origin}/${sitePath}`, { redirect: 'manual' });
    assert.equal(staticRedirect.status, 307);
    assert.equal(new URL(staticRedirect.headers.get('location')).hostname, `${account}.r2.cloudflarestorage.com`);
    const siteBytes = Buffer.from(await (await fetch(staticRedirect.headers.get('location'))).arrayBuffer());
    assert.equal(sha256(siteBytes), sha256(fs.readFileSync(path.join(__dirname, '..', 'public', sitePath))));
    const privateBypass = await fetch(origin + '/api/media/public/auction-entry-photos/forbidden.webp');
    assert.equal(privateBypass.status, 404);
    console.log(JSON.stringify({ passed: true, backend: 'r2', privatePhotos, staticHash: 'matched', invalidSignatures: 'denied', privateNamespace: 'denied', customerRecordsChanged: false }));
}
main().catch(error => { console.error(error.name === 'AssertionError' ? `Production media check failed: ${error.message}` : 'Production media check failed'); process.exitCode = 1; });

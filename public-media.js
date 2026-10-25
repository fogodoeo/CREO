'use strict';

const { safeKey } = require('./r2-media-storage');
const PREFIX = '/api/media/public/';
// These namespaces were public before migration. Private photos/captures must
// never be reachable via this route, even when the R2 bucket contains them.
const PUBLIC_BUCKETS = Object.freeze(['broadcast-assets', 'banner', 'allow_anon_all', 'auction-photos']);

function createPublicMedia({ r2 = null, supabaseUrl = '', legacyFallback = true } = {}) {
    const base = String(supabaseUrl).replace(/\/+$/, '');
    const allowed = new Set(PUBLIC_BUCKETS);
    const encode = key => key.split('/').map(encodeURIComponent).join('/');
    function resolve(value) {
        if (!r2 || typeof value !== 'string' || !base || !value.startsWith(base + '/storage/v1/object/public/')) return value;
        try {
            const url = new URL(value);
            if (url.origin !== base || url.search || url.hash) return value;
            const key = safeKey(decodeURIComponent(url.pathname.slice('/storage/v1/object/public/'.length)));
            if (!allowed.has(key.split('/')[0])) return value;
            return PREFIX + encode(key);
        } catch { return value; }
    }
    async function handle(req, res, url) {
        if (!url.pathname.startsWith(PREFIX)) return false;
        try {
            if (!r2 || !['GET', 'HEAD'].includes(req.method)) throw Object.assign(new Error(), { status: 404 });
            const key = safeKey(decodeURIComponent(url.pathname.slice(PREFIX.length)));
            const [bucket, ...parts] = key.split('/'), object = parts.join('/');
            if (!allowed.has(bucket) || !object) throw Object.assign(new Error(), { status: 404 });
            let location;
            if (await r2.has(bucket, object)) location = await r2.signedUrl(bucket, object, { method: req.method });
            else if (legacyFallback && base) location = `${base}/storage/v1/object/public/${encode(key)}`;
            if (!location) throw Object.assign(new Error(), { status: 404 });
            res.writeHead(307, { Location: location, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
            res.end();
        } catch (error) {
            res.writeHead([404, 422].includes(error.status) ? 404 : 503, { 'Cache-Control': 'no-store' });
            res.end();
        }
        return true;
    }
    return { resolve, replacer: (_key, value) => resolve(value), handle };
}

module.exports = { createPublicMedia, PUBLIC_BUCKETS, PREFIX };

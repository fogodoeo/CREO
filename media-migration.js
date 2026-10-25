'use strict';

const { safeKey, sha256 } = require('./r2-media-storage');
const BUCKETS = Object.freeze(['auction-entry-photos', 'broadcast-assets', 'auction-captures', 'banner', 'allow_anon_all', 'auction-photos']);
const encode = key => key.split('/').map(encodeURIComponent).join('/');

class SupabaseMediaSource {
    constructor({ url, serviceKey, fetchFn = fetch, maxBytes = 256 * 1024 * 1024 } = {}) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') || parsed.origin !== url || !serviceKey) {
            throw Error('Invalid source Storage configuration');
        }
        this.url = url; this.serviceKey = serviceKey; this.fetch = fetchFn; this.maxBytes = maxBytes;
    }
    async request(route, init = {}) {
        let response;
        try {
            response = await this.fetch(this.url + '/storage/v1' + route, { ...init, redirect: 'error',
                signal: AbortSignal.timeout(60000), headers: { apikey: this.serviceKey,
                    Authorization: `Bearer ${this.serviceKey}`, 'Content-Type': 'application/json', ...init.headers } });
        } catch { throw Error('Source Storage connection failed'); }
        if (!response.ok) throw Error(`Source Storage HTTP ${response.status}`);
        return response;
    }
    async buckets() { return (await this.request('/bucket')).json(); }
    async *list(bucket, prefix = '') {
        safeKey(bucket);
        let offset = 0;
        while (true) {
            const page = await (await this.request(`/object/list/${encodeURIComponent(bucket)}`, {
                method: 'POST', body: JSON.stringify({ prefix, offset, limit: 1000, sortBy: { column: 'name', order: 'asc' } })
            })).json();
            if (!Array.isArray(page)) throw Error('Invalid source inventory');
            for (const item of page) {
                if (!item.name || item.name.includes('/')) throw Error('Invalid source object name');
                const key = safeKey(prefix ? `${prefix}/${item.name}` : item.name);
                if (item.id == null && item.metadata == null) yield* this.list(bucket, key);
                else yield { bucket, key, size: Number(item.metadata?.size) || 0,
                    contentType: item.metadata?.mimetype || 'application/octet-stream', updatedAt: item.updated_at || null };
            }
            if (page.length < 1000) break;
            offset += page.length;
        }
    }
    async read(bucket, key) {
        safeKey(bucket); safeKey(key);
        const response = await this.request(`/object/${encodeURIComponent(bucket)}/${encode(key)}`);
        if (Number(response.headers.get('content-length')) > this.maxBytes) throw Error('Media exceeds migration memory limit');
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > this.maxBytes) throw Error('Media exceeds migration memory limit');
            chunks.push(chunk);
        }
        return { bytes: Buffer.concat(chunks), contentType: response.headers.get('content-type') || 'application/octet-stream',
            cacheControl: response.headers.get('cache-control') || 'private, max-age=3600' };
    }
}

async function migrateMedia({ source, target, mode = 'inventory', onRecord = async () => {}, buckets = BUCKETS, concurrency = 1 } = {}) {
    if (!['inventory', 'copy', 'verify'].includes(mode)) throw Error('Invalid migration mode');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw Error('Concurrency must be from 1 to 4');
    if (mode !== 'inventory' && !target) throw Error('R2 target required');
    const catalog = await source.buckets(), names = new Set(catalog.map(bucket => bucket.id || bucket.name));
    const report = { mode, startedAt: new Date().toISOString(), objects: 0, bytes: 0, copied: 0, verified: 0,
        otherBuckets: [...names].filter(name => !buckets.includes(name)), missingBuckets: buckets.filter(name => !names.has(name)) };
    if (mode !== 'inventory') await target.ensureReady();
    // Bounded batches; serialize journal appends and drain every started task
    // before returning or throwing. Never mutate the source or auction database.
    let recordTail = Promise.resolve(), batch = [];
    async function processObject(bucket, object) {
            let result = { ...object, status: 'listed' };
            if (mode !== 'inventory') {
                const original = await source.read(bucket, object.key), hash = sha256(original.bytes);
                if (mode === 'copy') {
                    await target.put(bucket, object.key, original.bytes, original.contentType,
                        { immutable: true, cacheControl: original.cacheControl });
                    report.copied++;
                }
                const saved = await target.get(bucket, object.key);
                if (!saved || saved.length !== original.bytes.length || sha256(saved) !== hash) throw Error(`Media verification failed: ${bucket}/${object.key}`);
                result = { ...object, size: original.bytes.length, sha256: hash, status: 'verified' };
                report.verified++;
            }
            report.objects++; report.bytes += result.size;
            recordTail = recordTail.then(() => onRecord(result));
            await recordTail;
    }
    async function drain() {
        const results = await Promise.all(batch); batch = [];
        const failed = results.find(result => result.error);
        if (failed) throw failed.error;
    }
    try {
        for (const bucket of buckets.filter(name => names.has(name))) {
            for await (const object of source.list(bucket)) {
                batch.push(processObject(bucket, object).then(() => ({}), error => ({ error })));
                if (batch.length >= concurrency) await drain();
            }
            await drain();
        }
    } catch (error) {
        await Promise.all(batch);
        throw error;
    }
    return { ...report, completedAt: new Date().toISOString() };
}

module.exports = { SupabaseMediaSource, migrateMedia, BUCKETS };

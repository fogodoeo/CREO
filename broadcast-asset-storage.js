'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ASSET_MIME_EXTENSIONS = Object.freeze({
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov'
});

function safePart(value) {
    const part = String(value || '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(part) || part === '.' || part === '..') throw new Error('Invalid broadcast asset path');
    return part;
}

function encodedObjectPath(value) {
    return String(value || '').split('/').map(safePart).map(encodeURIComponent).join('/');
}

class BroadcastAssetStorage {
    constructor(options = {}) {
        this.r2 = options.r2 || null;
        this.writeToR2 = options.writeToR2 !== false;
        this.legacyFallback = options.legacyFallback !== false;
        this.supabaseUrl = String(options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
        this.serviceKey = String(options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
        this.bucket = String(options.bucket ?? process.env.CREO_BROADCAST_ASSET_BUCKET ?? 'broadcast-assets').trim() || 'broadcast-assets';
        this.localDir = path.resolve(options.localDir || path.join(process.env.CREO_DATA_DIR || __dirname, 'broadcast-assets'));
        this.remote = Boolean(this.supabaseUrl && this.serviceKey);
        this.bucketPromise = null;
    }

    headers(extra = {}) {
        return { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}`, ...extra };
    }

    async ensureBucket() {
        if (!this.remote) return;
        if (!this.bucketPromise) this.bucketPromise = this.createBucketIfMissing().catch((error) => {
            this.bucketPromise = null;
            throw error;
        });
        return this.bucketPromise;
    }

    async createBucketIfMissing() {
        const current = await fetch(`${this.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(this.bucket)}`, { headers: this.headers() });
        if (current.ok) return;
        const detail = await current.text().catch(() => '');
        const missing = current.status === 404
            || (current.status === 400 && /(?:bucket[^\n]*not[ _-]*found|not[ _-]*found[^\n]*bucket|"statusCode"\s*:\s*"?404)/i.test(detail));
        if (!missing) throw new Error(`Broadcast asset bucket check failed (${current.status}): ${detail.slice(0, 160)}`);
        const created = await fetch(`${this.supabaseUrl}/storage/v1/bucket`, {
            method: 'POST',
            headers: this.headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                id: this.bucket,
                name: this.bucket,
                public: true,
                file_size_limit: 8 * 1024 * 1024,
                allowed_mime_types: Object.keys(ASSET_MIME_EXTENSIONS)
            })
        });
        if (!created.ok && created.status !== 409) {
            const createdDetail = await created.text().catch(() => '');
            throw new Error(`Broadcast asset bucket creation failed (${created.status}): ${createdDetail.slice(0, 160)}`);
        }
    }

    async put(channelId, fileName, buffer, mimeType) {
        const channel = safePart(channelId);
        const file = safePart(fileName);
        if (!ASSET_MIME_EXTENSIONS[mimeType]) throw new Error('Unsupported broadcast asset type');
        if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Broadcast asset is empty');
        const objectPath = `${channel}/${file}`;
        if (this.r2 && this.writeToR2) {
            await this.r2.put(this.bucket, objectPath, buffer, mimeType, { cacheControl: 'public, max-age=31536000, immutable' });
            return { backend: 'r2', url: `/api/broadcast-assets/${encodeURIComponent(channel)}/${encodeURIComponent(file)}` };
        }
        if (this.remote) {
            await this.ensureBucket();
            const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodedObjectPath(objectPath)}`, {
                method: 'POST',
                headers: this.headers({
                    'Content-Type': mimeType,
                    'Cache-Control': '31536000',
                    'x-upsert': 'false'
                }),
                body: buffer
            });
            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                throw new Error(`Broadcast asset upload failed (${response.status}): ${detail.slice(0, 160)}`);
            }
            return {
                backend: 'supabase',
                url: `${this.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${encodedObjectPath(objectPath)}`
            };
        }

        const directory = path.resolve(this.localDir, channel);
        const target = path.resolve(directory, file);
        if (!target.startsWith(`${directory}${path.sep}`)) throw new Error('Invalid local broadcast asset path');
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(target, buffer, { flag: 'wx' });
        return { backend: 'local', url: `/api/broadcast-assets/${encodeURIComponent(channel)}/${encodeURIComponent(file)}` };
    }

    async localFile(channelId, fileName) {
        if (this.remote && !this.r2) return null;
        const channel = safePart(channelId);
        const file = safePart(fileName);
        const directory = path.resolve(this.localDir, channel);
        const target = path.resolve(directory, file);
        if (!target.startsWith(`${directory}${path.sep}`)) return null;
        try {
            const stat = await fs.stat(target);
            return stat.isFile() ? { target, stat } : null;
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    health() {
        return { backend: this.r2 ? 'r2' : this.remote ? 'supabase' : 'local', bucket: this.r2 ? this.r2.bucket : this.remote ? this.bucket : null };
    }

    async view(channelId, fileName, method = 'GET') {
        if (!this.r2) return null;
        const object = `${safePart(channelId)}/${safePart(fileName)}`;
        if (await this.r2.has(this.bucket, object)) return this.r2.signedUrl(this.bucket, object, { method });
        if (!this.legacyFallback) return null;
        // Prefer old disk assets before remote fallback; older deployments used both.
        if (await this.localFile(channelId, fileName)) return null;
        return this.remote ? `${this.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${encodedObjectPath(object)}` : null;
    }
}

module.exports = { ASSET_MIME_EXTENSIONS, BroadcastAssetStorage };

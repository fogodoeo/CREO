'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MIME_EXTENSIONS = Object.freeze({
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png'
});

function safeObjectPath(value) {
    const parts = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..' || !/^[a-zA-Z0-9._-]+$/.test(part))) {
        throw new Error('Invalid capture object path');
    }
    return parts.join('/');
}

function encodedObjectPath(value) {
    return safeObjectPath(value).split('/').map(encodeURIComponent).join('/');
}

class CaptureStorage {
    constructor(options = {}) {
        this.r2 = options.r2 || null;
        this.writeToR2 = options.writeToR2 !== false;
        this.legacyFallback = options.legacyFallback !== false;
        this.supabaseUrl = String(options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
        this.serviceKey = String(options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
        this.bucket = String(options.bucket ?? process.env.CREO_CAPTURE_BUCKET ?? 'auction-captures').trim() || 'auction-captures';
        this.localDir = path.resolve(options.localDir || process.env.CREO_CAPTURE_DIR || path.join(process.env.CREO_DATA_DIR || __dirname, 'capture-media'));
        this.remote = Boolean(this.supabaseUrl && this.serviceKey);
        this.bucketPromise = null;
    }

    headers(extra = {}) {
        return {
            apikey: this.serviceKey,
            Authorization: `Bearer ${this.serviceKey}`,
            ...extra
        };
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
        const current = await fetch(`${this.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(this.bucket)}`, {
            headers: this.headers()
        });
        if (current.ok) return;
        const currentDetail = await current.text().catch(() => '');
        // Supabase Storage currently reports a missing bucket as HTTP 400 with
        // a nested 404/not-found error body. Older versions returned HTTP 404.
        const missingBucket = current.status === 404
            || (current.status === 400 && /(?:bucket[^\n]*not[ _-]*found|not[ _-]*found[^\n]*bucket|\"statusCode\"\s*:\s*\"?404)/i.test(currentDetail));
        if (!missingBucket) {
            throw new Error(`Capture bucket check failed (${current.status}): ${currentDetail.slice(0, 160)}`);
        }
        const created = await fetch(`${this.supabaseUrl}/storage/v1/bucket`, {
            method: 'POST',
            headers: this.headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                id: this.bucket,
                name: this.bucket,
                public: false,
                file_size_limit: 3 * 1024 * 1024,
                allowed_mime_types: Object.keys(MIME_EXTENSIONS)
            })
        });
        if (!created.ok && created.status !== 409) {
            const detail = await created.text().catch(() => '');
            throw new Error(`Capture bucket creation failed (${created.status}): ${detail.slice(0, 160)}`);
        }
    }

    async put(objectPath, buffer, mimeType) {
        const object = safeObjectPath(objectPath);
        if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Capture image is empty');
        if (!MIME_EXTENSIONS[mimeType]) throw new Error('Unsupported capture image type');
        if (this.r2 && this.writeToR2) {
            await this.r2.put(this.bucket, object, buffer, mimeType, { immutable: false });
            return { backend: 'r2', objectPath: object };
        }
        if (this.remote) {
            await this.ensureBucket();
            const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodedObjectPath(object)}`, {
                method: 'POST',
                headers: this.headers({
                    'Content-Type': mimeType,
                    'Cache-Control': '3600',
                    'x-upsert': 'true'
                }),
                body: buffer
            });
            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                throw new Error(`Capture upload failed (${response.status}): ${detail.slice(0, 160)}`);
            }
            return { backend: 'supabase', objectPath: object, ...(this.r2 && !this.writeToR2 ? { readBackend: 'supabase' } : {}) };
        }
        const target = path.resolve(this.localDir, object);
        if (target !== this.localDir && !target.startsWith(`${this.localDir}${path.sep}`)) throw new Error('Invalid local capture path');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buffer);
        return { backend: 'local', objectPath: object, ...(this.r2 && !this.writeToR2 ? { readBackend: 'local' } : {}) };
    }

    async get(objectPath, { backend = '' } = {}) {
        const object = safeObjectPath(objectPath);
        if (this.r2 && backend !== 'supabase' && backend !== 'local') {
            const bytes = await this.r2.get(this.bucket, object);
            if (bytes || !this.legacyFallback) return bytes;
        }
        if (this.remote) {
            await this.ensureBucket();
            const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodedObjectPath(object)}`, {
                headers: this.headers()
            });
            if (!response.ok) return null;
            return Buffer.from(await response.arrayBuffer());
        }
        const target = path.resolve(this.localDir, object);
        if (target !== this.localDir && !target.startsWith(`${this.localDir}${path.sep}`)) return null;
        try { return await fs.readFile(target); }
        catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    async delete(objectPath) {
        const object = safeObjectPath(objectPath);
        // Remove the old copy first so a later R2 miss cannot resurrect it.
        // The caller only removes the DB record after both deletes succeed.
        if (this.r2 && !this.legacyFallback) return this.r2.delete(this.bucket, object);
        if (this.remote) {
            await this.ensureBucket();
            const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodedObjectPath(object)}`, {
                method: 'DELETE',
                headers: this.headers()
            });
            if (!response.ok && response.status !== 404) {
                const detail = await response.text().catch(() => '');
                throw new Error(`Capture delete failed (${response.status}): ${detail.slice(0, 160)}`);
            }
            if (this.r2) await this.r2.delete(this.bucket, object);
            return;
        }
        const target = path.resolve(this.localDir, object);
        if (target !== this.localDir && !target.startsWith(`${this.localDir}${path.sep}`)) throw new Error('Invalid local capture path');
        try { await fs.unlink(target); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (this.r2) await this.r2.delete(this.bucket, object);
    }

    health() {
        return { backend: this.r2 ? 'r2' : this.remote ? 'supabase' : 'local', bucket: this.r2 ? this.r2.bucket : this.remote ? this.bucket : null };
    }

    async view(objectPath, { download = '', backend = '' } = {}) {
        const object = safeObjectPath(objectPath);
        if (!this.r2 || backend === 'supabase' || backend === 'local') return null;
        if (await this.r2.has(this.bucket, object)) return this.r2.signedUrl(this.bucket, object, { download });
        return null;
    }
}

module.exports = { CaptureStorage, MIME_EXTENSIONS, safeObjectPath };

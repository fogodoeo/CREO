'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { safeKey, sha256 } = require('./r2-media-storage');
const TYPES = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' });

class DiskMediaSource {
    constructor({ directory, namespace, contentAddressed = false } = {}) {
        this.directory = path.resolve(directory); this.namespace = safeKey(namespace);
        this.contentAddressed = contentAddressed; this.files = new Map();
    }
    async buckets() {
        const stat = await fs.lstat(this.directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Media source must be a real directory');
        return [{ id: this.namespace }];
    }
    async *list(bucket, directory = this.directory) {
        if (bucket !== this.namespace) throw Error('Invalid disk media namespace');
        for (const item of await fs.readdir(directory, { withFileTypes: true })) {
            if (item.isSymbolicLink()) throw Error('Media source contains a symbolic link');
            const target = path.join(directory, item.name);
            if (item.isDirectory()) { yield* this.list(bucket, target); continue; }
            const contentType = TYPES[path.extname(item.name).toLowerCase()];
            if (!item.isFile() || !contentType) continue;
            const relative = safeKey(path.relative(this.directory, target).split(path.sep).join('/'));
            const stat = await fs.stat(target);
            const hash = this.contentAddressed ? sha256(await fs.readFile(target)) : '';
            const key = hash ? `${hash}/${relative}` : relative;
            this.files.set(key, { target, hash, size: stat.size, mtimeMs: stat.mtimeMs });
            yield { bucket, key, size: stat.size, contentType };
        }
    }
    async read(bucket, key) {
        if (bucket !== this.namespace || !this.files.has(key)) throw Error('Disk object was not inventoried');
        const file = this.files.get(key), bytes = await fs.readFile(file.target), stat = await fs.stat(file.target);
        if (file.size !== bytes.length || file.mtimeMs !== stat.mtimeMs || file.hash && sha256(bytes) !== file.hash) throw Error('Disk media changed during migration');
        return { bytes, contentType: TYPES[path.extname(file.target).toLowerCase()], cacheControl: 'public, max-age=31536000, immutable' };
    }
}

function createSiteMedia({ r2, directory, now = Date.now } = {}) {
    const root = path.resolve(directory), cache = new Map(), missing = new Map();
    return {
        async view(target, stat, method = 'GET') {
            if (!r2 || !TYPES[path.extname(target).toLowerCase()] || !target.startsWith(root + path.sep)) return null;
            const relative = safeKey(path.relative(root, target).split(path.sep).join('/'));
            let entry = cache.get(relative);
            if (!entry || entry.size !== stat.size || entry.mtimeMs !== stat.mtimeMs) {
                entry = { size: stat.size, mtimeMs: stat.mtimeMs, key: `${sha256(await fs.readFile(target))}/${relative}` };
                if (cache.size >= 1000) cache.delete(cache.keys().next().value);
                cache.set(relative, entry);
            }
            if ((missing.get(entry.key) || 0) > now()) return null;
            try {
                if (await r2.has('site-assets', entry.key)) return await r2.signedUrl('site-assets', entry.key, { method });
            } catch { /* Repo-bundled media still serves locally during outages. */ }
            if (missing.size >= 1000) missing.delete(missing.keys().next().value);
            missing.set(entry.key, now() + 60000);
            return null;
        }
    };
}
module.exports = { DiskMediaSource, createSiteMedia, TYPES };

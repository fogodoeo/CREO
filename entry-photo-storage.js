'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const REF_PREFIX = '/__entry_photo__/';
const LOCAL_PREFIX = '/api/platform/entry-photo/';
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const OBJECT = new RegExp(`^${UUID}/${UUID}/[a-f0-9]{64}/(full|thumb)\\.webp$`);
const error = (message, status = 503) => Object.assign(new Error(message), { status });
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function objectPath(value) {
    if (typeof value !== 'string' || !OBJECT.test(value)) throw error('사진 경로를 확인해 주세요.', 422);
    return value;
}

// Durable records contain this reference, never an expiring signed URL.
function privatePhotoReference(value) {
    return typeof value === 'string' && value.startsWith(REF_PREFIX);
}

class EntryPhotoStorage {
    constructor({ supabaseUrl = '', serviceKey = '', bucket = 'auction-entry-photos', localDir = '',
        secret = '', fetchFn = fetch, now = Date.now, expiresIn = 3600 } = {}) {
        this.base = String(supabaseUrl).replace(/\/+$/, '');
        this.key = String(serviceKey);
        this.bucket = bucket;
        // Local disk must be explicitly requested by an isolated preview/test.
        this.localDir = localDir ? path.resolve(localDir) : '';
        this.secret = secret;
        this.fetch = fetchFn;
        this.now = now;
        this.expiresIn = Math.max(60, Math.min(3600, Number(expiresIn) || 3600));
        this.signed = new Map();
        this.views = new Map();
        this.pending = new Map();
        this.bucketCheckedAt = 0;
        this.bucketCheck = null;
    }

    configured() {
        if (this.localDir) return Boolean(this.secret);
        try {
            const url = new URL(this.base);
            return Boolean(this.key && this.secret && /^[a-z0-9][a-z0-9-]{0,62}$/.test(this.bucket)
                && url.protocol === 'https:' && !url.username && !url.password
                && url.origin === this.base && url.hostname.endsWith('.supabase.co'));
        } catch { return false; }
    }

    async request(route, init = {}) {
        try {
            return await this.fetch(`${this.base}/storage/v1${route}`, {
                ...init, redirect: 'error', signal: AbortSignal.timeout(8000),
                headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, ...init.headers }
            });
        } catch { throw error('사진 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    }

    async ensureReady() {
        if (!this.configured()) throw error('사진 저장소가 아직 연결되지 않았어요. 운영자에게 문의해 주세요.');
        if (this.localDir) return;
        if (this.bucketCheckedAt && this.now() - this.bucketCheckedAt < 300000) return;
        if (!this.bucketCheck) this.bucketCheck = (async () => {
            const response = await this.request(`/bucket/${this.bucket}`);
            const data = await response.json().catch(() => null);
            if (!response.ok || data?.public !== false) throw error('비공개 사진 저장소 설정을 확인해 주세요.');
            this.bucketCheckedAt = this.now();
        })().finally(() => { this.bucketCheck = null; });
        await this.bucketCheck;
    }

    describe(ownerId, id, full, thumb, dimensions) {
        const hash = digest(Buffer.concat([full, thumb]));
        const prefix = `${String(ownerId).toLowerCase()}/${String(id).toLowerCase()}/${hash}`;
        const fullPath = objectPath(`${prefix}/full.webp`), thumbPath = objectPath(`${prefix}/thumb.webp`);
        return { id: String(id).toLowerCase(), url: REF_PREFIX + fullPath, thumbnailUrl: REF_PREFIX + thumbPath,
            size: full.length, thumbnailSize: thumb.length, width: dimensions.width, height: dimensions.height,
            ...(dimensions.sourceHash ? { sourceHash: dimensions.sourceHash } : {}) };
    }

    async put(object, bytes) {
        objectPath(object);
        if (this.localDir) {
            const target = path.join(this.localDir, object);
            await fs.mkdir(path.dirname(target), { recursive: true });
            try { await fs.writeFile(target, bytes, { flag: 'wx' }); }
            catch (cause) {
                if (cause.code !== 'EEXIST') throw cause;
                if (digest(await fs.readFile(target)) !== digest(bytes)) throw error('저장된 사진이 달라요. 새 사진으로 다시 등록해 주세요.', 409);
            }
            return;
        }
        const response = await this.request(`/object/${this.bucket}/${object}`, {
            method: 'POST', headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=3600', 'x-upsert': 'false' }, body: bytes
        });
        if (response.ok) return;
        const detail = await response.json().catch(() => ({}));
        // Content-addressed, server-only paths: a duplicate is a lost-response retry.
        if ((response.status === 409 || Number(detail.statusCode) === 409)
            && /duplicate|already exists/i.test(`${detail.error || ''} ${detail.message || ''}`)) return;
        throw error('사진을 저장하지 못했어요. 다시 시도해 주세요.');
    }

    async persist(media, full, thumb) {
        await this.ensureReady();
        await this.put(media.url.slice(REF_PREFIX.length), full);
        await this.put(media.thumbnailUrl.slice(REF_PREFIX.length), thumb);
        // Never remove objects after an uncertain DB write; an acknowledgement may be lost.
    }

    signature(object, expires) {
        return crypto.createHmac('sha256', this.secret).update(`${object}:${expires}`).digest('base64url');
    }

    resolve(reference) {
        if (!privatePhotoReference(reference)) return reference;
        const object = objectPath(reference.slice(REF_PREFIX.length));
        if (!this.configured()) throw error('사진 저장소가 아직 연결되지 않았어요.');
        const cached = this.views.get(object);
        if (cached && cached.until > this.now()) return cached.url;
        const expires = Math.floor(this.now() / 1000) + this.expiresIn;
        const url = `${LOCAL_PREFIX}${object}?expires=${expires}&signature=${this.signature(object, expires)}`;
        if (this.views.size >= 2000) this.views.delete(this.views.keys().next().value);
        this.views.set(object, { url, until: this.now() + (this.expiresIn - Math.min(300, this.expiresIn / 5)) * 1000 });
        return url;
    }

    async remoteSigned(object) {
        await this.ensureReady();
        const cached = this.signed.get(object);
        if (cached && cached.until > this.now()) return cached.url;
        if (this.pending.has(object)) return this.pending.get(object);
        const operation = (async () => {
            const response = await this.request(`/object/sign/${this.bucket}/${object}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: this.expiresIn })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || typeof data.signedURL !== 'string') throw error('사진 주소를 불러오지 못했어요. 다시 열어 주세요.');
            const expected = `/storage/v1/object/sign/${this.bucket}/${object}`;
            const supplied = data.signedURL.startsWith('/object/') ? `/storage/v1${data.signedURL}` : data.signedURL;
            const signed = new URL(supplied, this.base);
            if (signed.origin !== this.base || signed.pathname !== expected || signed.username || signed.password || signed.hash || !signed.searchParams.get('token')) throw error('사진 주소를 확인하지 못했어요.');
            const url = signed.href;
            if (this.signed.size >= 2000) this.signed.delete(this.signed.keys().next().value);
            this.signed.set(object, { url, until: this.now() + (this.expiresIn - Math.min(300, this.expiresIn / 5)) * 1000 });
            return url;
        })().finally(() => this.pending.delete(object));
        this.pending.set(object, operation);
        return operation;
    }

    authorizedObject(url) {
        if (!this.secret || !url.pathname.startsWith(LOCAL_PREFIX)) return null;
        let object;
        try { object = objectPath(url.pathname.slice(LOCAL_PREFIX.length)); } catch { return null; }
        const expires = url.searchParams.get('expires') || '', signature = url.searchParams.get('signature') || '';
        if (!/^\d{10}$/.test(expires) || Number(expires) <= this.now() / 1000
            || Number(expires) > this.now() / 1000 + this.expiresIn + 60) return null;
        const expected = Buffer.from(this.signature(object, expires)), received = Buffer.from(signature);
        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
        return object;
    }

    async readLocal(url) {
        const object = this.authorizedObject(url);
        if (!this.localDir || !object) return null;
        try { return await fs.readFile(path.join(this.localDir, object)); }
        catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
    }

    async view(url) {
        const object = this.authorizedObject(url);
        if (!object) return null;
        if (this.localDir) {
            const bytes = await this.readLocal(url);
            return bytes ? { bytes } : null;
        }
        // A small authenticated redirect; image bytes go directly from Storage to the browser.
        return { location: await this.remoteSigned(object) };
    }
}

module.exports = { EntryPhotoStorage, privatePhotoReference, REF_PREFIX, LOCAL_PREFIX };

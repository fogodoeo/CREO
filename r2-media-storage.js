'use strict';

const crypto = require('node:crypto');
const {
    S3Client, HeadBucketCommand, HeadObjectCommand, GetObjectCommand,
    PutObjectCommand, DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const failure = (message, status = 503) => Object.assign(new Error(message), { status });
function safeKey(value) {
    const key = String(value || '');
    if (!key || Buffer.byteLength(key) > 1024 || /[\\\u0000-\u001f\u007f]/.test(key)
        || key.split('/').some(part => !part || part === '.' || part === '..')) throw failure('Invalid media path', 422);
    return key;
}
function missing(error) { return error?.$metadata?.httpStatusCode === 404 || ['NotFound', 'NoSuchKey'].includes(error?.name); }

class R2MediaStorage {
    constructor({ accountId, accessKeyId, secretAccessKey, bucket = 'creo-media', client, sign = getSignedUrl,
        now = Date.now, timeoutMs = 15000 } = {}) {
        if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw failure('Invalid R2 bucket configuration');
        if (!client && (!/^[a-f0-9]{32}$/.test(accountId || '') || !accessKeyId || !secretAccessKey)) {
            throw failure('R2 credentials are incomplete');
        }
        this.bucket = bucket;
        this.client = client || new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true, maxAttempts: 2,
            requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
        this.sign = sign;
        this.now = now;
        this.timeoutMs = timeoutMs;
        this.exists = new Map();
        this.pending = new Map();
    }
    key(namespace, object) { return safeKey(`${safeKey(namespace)}/${safeKey(object)}`); }
    async send(command) {
        try { return await this.client.send(command, { abortSignal: AbortSignal.timeout(this.timeoutMs) }); }
        catch (error) {
            // Never include SDK request details, credentials or signed URLs in API/log errors.
            if (missing(error)) throw Object.assign(failure('Media not found', 404), { name: 'NotFound' });
            if (error?.$metadata?.httpStatusCode === 412) throw failure('Media already exists', 409);
            throw failure('R2 media storage request failed');
        }
    }
    async ensureReady() { await this.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    async head(namespace, object) {
        try { return await this.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(namespace, object) })); }
        catch (error) { if (error.status === 404) return null; throw error; }
    }
    async has(namespace, object) {
        const key = this.key(namespace, object);
        if ((this.exists.get(key) || 0) > this.now()) return true;
        if (this.pending.has(key)) return this.pending.get(key);
        const operation = this.head(namespace, object).then(result => {
            if (result) {
                if (this.exists.size >= 2000) this.exists.delete(this.exists.keys().next().value);
                this.exists.set(key, this.now() + 60000);
            }
            return Boolean(result);
        }).finally(() => this.pending.delete(key));
        this.pending.set(key, operation);
        return operation;
    }
    async get(namespace, object) {
        try {
            const result = await this.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(namespace, object) }));
            return Buffer.from(await result.Body.transformToByteArray());
        } catch (error) { if (error.status === 404) return null; throw error; }
    }
    async put(namespace, object, bytes, contentType, { immutable = true, cacheControl = 'private, max-age=3600' } = {}) {
        if (!Buffer.isBuffer(bytes) || !bytes.length) throw failure('Media is empty', 422);
        const key = this.key(namespace, object), hash = sha256(bytes);
        try {
            await this.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes,
                ContentType: contentType, CacheControl: cacheControl, Metadata: { sha256: hash },
                ...(immutable ? { IfNoneMatch: '*' } : {}) }));
        } catch (error) {
            if (error.status !== 409 || !immutable) throw error;
            // A duplicate/lost acknowledgement is successful only for identical bytes.
            const existing = await this.get(namespace, object);
            if (!existing || sha256(existing) !== hash) throw failure('Existing media differs; refusing overwrite', 409);
        }
        this.exists.delete(key);
        return { bytes: bytes.length, sha256: hash };
    }
    async signedUrl(namespace, object, { expiresIn = 3600, download = '', method = 'GET' } = {}) {
        const command = method === 'HEAD' ? HeadObjectCommand : GetObjectCommand;
        const input = { Bucket: this.bucket, Key: this.key(namespace, object),
            ...(download && method === 'GET' ? { ResponseContentDisposition: `attachment; filename="${String(download).replace(/[^a-zA-Z0-9._-]/g, '_')}"` } : {}) };
        try { return await this.sign(this.client, new command(input), { expiresIn: Math.min(3600, Math.max(60, expiresIn)) }); }
        catch { throw failure('Could not issue media URL'); }
    }
    async delete(namespace, object) {
        const key = this.key(namespace, object);
        await this.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        this.exists.delete(key);
    }
}

function createR2MediaStorage(env = process.env) {
    const mode = String(env.CREO_MEDIA_STORAGE || 'supabase');
    if (mode === 'supabase') return null;
    if (!['r2', 'r2-read'].includes(mode)) throw failure('Unknown CREO_MEDIA_STORAGE setting');
    return new R2MediaStorage({ accountId: env.CREO_R2_ACCOUNT_ID, accessKeyId: env.CREO_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CREO_R2_SECRET_ACCESS_KEY, bucket: env.CREO_R2_BUCKET || 'creo-media' });
}

module.exports = { R2MediaStorage, createR2MediaStorage, safeKey, sha256 };

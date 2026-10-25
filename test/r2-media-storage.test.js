'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { R2MediaStorage, createR2MediaStorage } = require('../r2-media-storage');
const { EntryPhotoStorage } = require('../entry-photo-storage');
const { BroadcastAssetStorage } = require('../broadcast-asset-storage');
const { CaptureStorage } = require('../capture-storage');
const { createBroadcastAssetApi } = require('../broadcast-asset-api');
const { createPublicMedia } = require('../public-media');
const { migrateMedia, SupabaseMediaSource } = require('../media-migration');

function memory() {
    const objects = new Map(), calls = [];
    const client = { async send(command) {
        const name = command.constructor.name, input = command.input, key = input.Key;
        calls.push({ name, input });
        if (name === 'HeadBucketCommand') return {};
        if (name === 'PutObjectCommand') {
            if (input.IfNoneMatch === '*' && objects.has(key)) throw { $metadata: { httpStatusCode: 412 } };
            objects.set(key, Buffer.from(input.Body)); return {};
        }
        if (name === 'DeleteObjectCommand') { objects.delete(key); return {}; }
        if (!objects.has(key)) throw { $metadata: { httpStatusCode: 404 } };
        if (name === 'HeadObjectCommand') return { ContentLength: objects.get(key).length };
        return { Body: { transformToByteArray: async () => objects.get(key) } };
    } };
    const sign = async (_client, command) => `https://media.example.test/${command.input.Key}?method=${command.constructor.name}`;
    const create = () => new R2MediaStorage({ bucket: 'isolated-media', client, sign });
    return { r2: create(), create, objects, calls };
}
class ResponseCapture {
    writeHead(status, headers) { this.status = status; this.headers = headers; }
    end(body) { this.body = body; }
}
async function publicRequest(media, path, method = 'GET') {
    const res = new ResponseCapture();
    await media.handle({ method }, res, new URL(path, 'https://creo.test'));
    return res;
}

test('R2 is opt-in and incomplete cutover configuration fails closed', () => {
    assert.equal(createR2MediaStorage({}), null);
    assert.throws(() => createR2MediaStorage({ CREO_MEDIA_STORAGE: 'r2' }), /incomplete/);
    assert.throws(() => createR2MediaStorage({ CREO_MEDIA_STORAGE: 'typo' }), /Unknown/);
    const { r2 } = memory();
    for (const key of ['../secret', '/secret', 'x//y', 'x/./y', 'x\\y', 'x\ny']) assert.throws(() => r2.key('photos', key));
});

test('duplicate/concurrent immutable writes survive restart, but different bytes never overwrite', async () => {
    const m = memory(), bytes = Buffer.from('one photo');
    await Promise.all([m.r2.put('photos', 'owner/full.webp', bytes, 'image/webp'), m.r2.put('photos', 'owner/full.webp', bytes, 'image/webp')]);
    assert.equal(m.objects.size, 1);
    const restarted = m.create();
    assert.deepEqual(await restarted.get('photos', 'owner/full.webp'), bytes);
    await assert.rejects(restarted.put('photos', 'owner/full.webp', Buffer.from('other'), 'image/webp'), error => error.status === 409);
    assert.deepEqual(await restarted.get('photos', 'owner/full.webp'), bytes);
});

test('missing, forbidden and transient failures are distinct; errors do not expose SDK credentials', async () => {
    let status = 404;
    const r2 = new R2MediaStorage({ client: { async send() { throw { message: 'SECRET credential', $metadata: { httpStatusCode: status } }; } } });
    assert.equal(await r2.has('photos', 'a.webp'), false);
    for (status of [403, 429, 500]) await assert.rejects(r2.has('photos', 'a.webp'), error => error.status === 503 && !error.message.includes('SECRET'));
    status = 404; assert.equal(await r2.get('photos', 'a.webp'), null);
});

test('R2 object existence checks coalesce and do not cache missing files', async () => {
    const { r2, objects, calls } = memory();
    assert.equal(await r2.has('photos', 'new.webp'), false);
    objects.set('photos/new.webp', Buffer.from('photo'));
    const found = await Promise.all([r2.has('photos', 'new.webp'), r2.has('photos', 'new.webp')]);
    assert.deepEqual(found, [true, true]);
    await r2.has('photos', 'new.webp');
    assert.equal(calls.filter(c => c.name === 'HeadObjectCommand').length, 2);
});

test('private entry references and signatures survive cutover/restart; incomplete uploads can retry', async () => {
    const m = memory(), secret = 'existing-server-signing-key'; let now = Date.now();
    const old = new EntryPhotoStorage({ supabaseUrl: 'https://demo.supabase.co', serviceKey: 'legacy-key', secret, now: () => now });
    const full = Buffer.from('full'), thumb = Buffer.from('thumb');
    const photo = old.describe(randomUUID(), randomUUID(), full, thumb, { width: 100, height: 100 });
    const oldUrl = new URL(old.resolve(photo.url), 'https://creo.test');
    const storage = new EntryPhotoStorage({ r2: m.r2, secret, now: () => now, legacyFallback: false });
    await storage.put(photo.url.slice('/__entry_photo__/'.length), full);
    await storage.persist(photo, full, thumb);
    assert.equal(m.objects.size, 2);
    const result = await storage.view(oldUrl);
    assert.match(result.location, /^https:\/\/media.example.test\/auction-entry-photos\//);
    assert.equal(result.bytes, undefined);
    const unsigned = new URL(oldUrl); unsigned.search = '';
    assert.equal(await storage.view(unsigned), null);
    const tampered = new URL(oldUrl); tampered.pathname = tampered.pathname.replace('full.webp', 'thumb.webp');
    assert.equal(await storage.view(tampered), null);
    now += 3601000; assert.equal(await storage.view(oldUrl), null);
    assert.ok((await storage.view(new URL(storage.resolve(photo.url), 'https://creo.test'))).location);
});

test('entry reads fall back only on a missing R2 object, not a permission/outage failure', async () => {
    const m = memory(); let legacyCalls = 0;
    const storage = new EntryPhotoStorage({ r2: m.r2, secret: 'key', supabaseUrl: 'https://demo.supabase.co', serviceKey: 'legacy', fetchFn: async url => {
        legacyCalls++;
        if (url.includes('/bucket/')) return Response.json({ public: false });
        return Response.json({ signedURL: url.replace('https://demo.supabase.co/storage/v1', '') + '?token=legacy' });
    } });
    const photo = storage.describe(randomUUID(), randomUUID(), Buffer.from('full'), Buffer.from('thumb'), { width: 1, height: 1 });
    const url = new URL(storage.resolve(photo.url), 'https://creo.test');
    assert.match((await storage.view(url)).location, /supabase.co/);
    const broken = new EntryPhotoStorage({ r2: { async has() { throw Object.assign(Error('offline'), { status: 503 }); } }, secret: 'key', fetchFn: () => { throw Error('must not use legacy'); } });
    await assert.rejects(broken.view(url), /offline/);
    assert.equal(legacyCalls, 2);
});

test('public URL mapping is origin/namespace scoped and leaves durable values untouched', async () => {
    const { r2, objects } = memory();
    const media = createPublicMedia({ r2, supabaseUrl: 'https://demo.supabase.co' });
    const original = { imageUrl: 'https://demo.supabase.co/storage/v1/object/public/banner/a.png', amount: 100000 };
    const mapped = JSON.parse(JSON.stringify(original, media.replacer));
    assert.equal(mapped.imageUrl, '/api/media/public/banner/a.png');
    assert.equal(original.imageUrl.startsWith('https://'), true); assert.equal(mapped.amount, 100000);
    for (const value of ['https://evil.test/storage/v1/object/public/banner/a.png', 'https://demo.supabase.co/storage/v1/object/public/auction-entry-photos/x.webp']) assert.equal(media.resolve(value), value);
    objects.set('banner/a.png', Buffer.from('photo'));
    assert.equal((await publicRequest(media, mapped.imageUrl)).status, 307);
    assert.match((await publicRequest(media, mapped.imageUrl, 'HEAD')).headers.Location, /HeadObjectCommand/);
    for (const namespace of ['auction-entry-photos', 'auction-captures', 'arbitrary-bucket']) assert.equal((await publicRequest(media, `/api/media/public/${namespace}/a.png`)).status, 404);
    assert.equal((await publicRequest(media, '/api/media/public/banner/a.png', 'POST')).status, 404);
    assert.equal((await publicRequest(media, '/api/media/public/banner/%2Fsecret')).status, 404);
    assert.match((await publicRequest(media, '/api/media/public/banner/old.png')).headers.Location, /^https:\/\/demo.supabase.co\//);
});

test('new broadcast uploads use stable same-origin URLs and Range/HEAD requests redirect to R2', async () => {
    const { r2 } = memory(), storage = new BroadcastAssetStorage({ r2, legacyFallback: false, supabaseUrl: '', serviceKey: '' });
    const saved = await storage.put('round-a', 'movie.mp4', Buffer.from('video'), 'video/mp4');
    assert.equal(saved.url, '/api/broadcast-assets/round-a/movie.mp4');
    const api = createBroadcastAssetApi({ storage });
    for (const method of ['GET', 'HEAD']) {
        const response = new ResponseCapture();
        await api.handle({ method, headers: { range: 'bytes=1-3' } }, response, new URL(saved.url, 'https://creo.test'));
        assert.equal(response.status, 307);
        assert.match(response.headers.Location, method === 'HEAD' ? /HeadObjectCommand/ : /GetObjectCommand/);
        assert.equal(response.body, undefined);
    }
});

test('capture uploads stay in their namespace and downloads get attachment signatures', async () => {
    const { r2, objects } = memory();
    const storage = new CaptureStorage({ r2, legacyFallback: false, supabaseUrl: '', serviceKey: '' });
    const saved = await storage.put('round-a/item.webp', Buffer.from('capture'), 'image/webp');
    assert.equal(saved.backend, 'r2'); assert.ok(objects.has('auction-captures/round-a/item.webp'));
    assert.match(await storage.view(saved.objectPath, { download: 'capture.webp' }), /auction-captures/);
    await storage.delete(saved.objectPath); assert.equal(await storage.get(saved.objectPath), null);
});

function sourceFixture() {
    const files = new Map([['banner/a.webp', Buffer.from('a')], ['auction-entry-photos/owner/full.webp', Buffer.from('private')]]);
    return { files, async buckets() { return [{ id: 'banner' }, { id: 'auction-entry-photos' }]; },
        async *list(bucket) { for (const [path, bytes] of files) if (path.startsWith(bucket + '/')) yield { bucket, key: path.slice(bucket.length + 1), size: bytes.length }; },
        async read(bucket, key) { return { bytes: files.get(`${bucket}/${key}`), contentType: 'image/webp' }; } };
}

test('migration inventory does not write; copy verifies every byte and resume is idempotent', async () => {
    const source = sourceFixture(), m = memory(), records = [];
    const listed = await migrateMedia({ source }); assert.equal(listed.objects, 2); assert.equal(m.objects.size, 0);
    const first = await migrateMedia({ source, target: m.r2, mode: 'copy', onRecord: row => records.push(row) });
    assert.equal(first.verified, 2); assert.equal(m.objects.size, 2);
    const second = await migrateMedia({ source, target: m.create(), mode: 'copy' }); assert.equal(second.verified, 2);
    assert.equal(records.every(row => /^[a-f0-9]{64}$/.test(row.sha256)), true);
    source.files.set('banner/a.webp', Buffer.from('changed source'));
    await assert.rejects(migrateMedia({ source, target: m.r2, mode: 'copy' }), /refusing overwrite/);
    assert.equal(m.objects.get('banner/a.webp').toString(), 'a');
});

test('verification detects missing/corrupt copies instead of marking migration complete', async () => {
    const source = sourceFixture(), m = memory();
    await assert.rejects(migrateMedia({ source, target: m.r2, mode: 'verify' }), /verification failed/);
    await migrateMedia({ source, target: m.r2, mode: 'copy' });
    m.objects.set('banner/a.webp', Buffer.from('corrupt'));
    await assert.rejects(migrateMedia({ source, target: m.r2, mode: 'verify' }), /verification failed/);
});

test('Supabase inventory paginates and traverses folders without writing source data', async () => {
    const calls = [];
    const source = new SupabaseMediaSource({ url: 'https://demo.supabase.co', serviceKey: 'secret', fetchFn: async (url, init) => {
        calls.push({ url, init }); const { prefix, offset } = JSON.parse(init.body);
        if (!prefix) return Response.json([{ name: 'folder', id: null, metadata: null }]);
        if (offset === 0) return Response.json(Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, name: `p${i}.webp`, metadata: { size: 2 } })));
        return Response.json([{ id: 'last', name: 'last.webp', metadata: { size: 3 } }]);
    } });
    const result = []; for await (const object of source.list('banner')) result.push(object);
    assert.equal(result.length, 1001); assert.equal(result.at(-1).key, 'folder/last.webp');
    assert.ok(calls.every(c => c.url.endsWith('/object/list/banner') && c.init.method === 'POST' && c.init.redirect === 'error'));
});

test('AWS signer produces expiring R2 URLs locally without a signing network call', async () => {
    const r2 = new R2MediaStorage({ accountId: 'a'.repeat(32), accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' });
    const url = new URL(await r2.signedUrl('photos', 'owner/a.webp', { download: 'photo.webp' }));
    assert.equal(url.hostname, `${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '3600');
    assert.match(url.searchParams.get('response-content-disposition'), /attachment/);
    assert.equal(url.href.includes('test-secret-key'), false);
});

test('read-only rollback keeps new R2 photos readable while uploads use the private legacy store', async () => {
    const m = memory(), legacy = [];
    const storage = new EntryPhotoStorage({ r2: m.r2, writeToR2: false, secret: 'key',
        supabaseUrl: 'https://demo.supabase.co', serviceKey: 'server-only', fetchFn: async (url, init) => {
            legacy.push({ url, init });
            return url.includes('/bucket/') ? Response.json({ public: false }) : Response.json({ Key: 'saved' });
        } });
    const full = Buffer.from('full'), thumb = Buffer.from('thumb');
    const photo = storage.describe(randomUUID(), randomUUID(), full, thumb, { width: 1, height: 1 });
    await storage.persist(photo, full, thumb);
    assert.equal(m.objects.size, 0); assert.equal(legacy.length, 3);
    m.objects.set('auction-entry-photos/' + photo.url.slice('/__entry_photo__/'.length), full);
    assert.match((await storage.view(new URL(storage.resolve(photo.url), 'https://creo.test'))).location, /media.example/);
    assert.equal(legacy.length, 3, 'R2 reads do not depend on legacy availability');
});

test('repo media uses verified content hashes and a changed asset cannot serve an old copy', async t => {
    const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
    const { DiskMediaSource, createSiteMedia } = require('../disk-media-source');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-r2-site-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const target = path.join(directory, 'poster.png'); await fs.writeFile(target, 'original-image');
    await fs.writeFile(path.join(directory, 'private.env'), 'not-media');
    const m = memory(), source = new DiskMediaSource({ directory, namespace: 'site-assets', contentAddressed: true });
    const result = await migrateMedia({ source, target: m.r2, mode: 'copy', buckets: ['site-assets'] });
    assert.equal(result.objects, 1);
    const serving = createSiteMedia({ r2: m.r2, directory });
    assert.match(await serving.view(target, await fs.stat(target)), /site-assets\/[a-f0-9]{64}\/poster.png/);
    await fs.writeFile(target, 'new-longer-image');
    assert.equal(await serving.view(target, await fs.stat(target)), null);
    assert.equal(await serving.view(path.join(directory, 'private.env'), await fs.stat(path.join(directory, 'private.env'))), null);
    assert.equal(await serving.view(path.join(directory, '..', 'secret.png'), { size: 1, mtimeMs: 1 }), null);
});

test('a capture changed during read-only rollback uses legacy bytes rather than its stale R2 copy', async t => {
    const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'creo-r2-capture-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const m = memory(); m.objects.set('auction-captures/round-a/item.webp', Buffer.from('old'));
    const storage = new CaptureStorage({ r2: m.r2, writeToR2: false, supabaseUrl: '', serviceKey: '', localDir: directory });
    const saved = await storage.put('round-a/item.webp', Buffer.from('new'), 'image/webp');
    assert.equal(saved.readBackend, 'local');
    assert.equal(await storage.view(saved.objectPath, { backend: saved.readBackend }), null);
    assert.equal((await storage.get(saved.objectPath, { backend: saved.readBackend })).toString(), 'new');
    await storage.delete(saved.objectPath);
    assert.equal(m.objects.size, 0); assert.equal(await storage.get(saved.objectPath), null);
});

test('legacy vendor photo upload does not require an operator session during R2 rollout', async () => {
    const source = require('node:fs').readFileSync(require.resolve('../public/supabase-bridge.js'), 'utf8');
    const start = source.indexOf('async function uploadPhotos('), end = source.indexOf('\n/**', start);
    const calls = [];
    const context = require('node:vm').createContext({ SUPABASE_URL: 'https://legacy.supabase.co', SUPABASE_KEY: 'test-anon-key', atob, Uint8Array, Blob, fetch: async (url, options) => {
        calls.push({ url, options });
        return new Response('', { status: 200 });
    } });
    require('node:vm').runInContext(source.slice(start, end), context);
    const result = await context.uploadPhotos([{ data: 'data:image/webp;base64,YQ==', filename: 'photo.webp' }]);
    assert.match(result[0], /^https:\/\/legacy\.supabase\.co\/storage\/v1\/object\/public\/auction-photos\//);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-anon-key');
    assert.ok(calls.every(call => !call.url.startsWith('/api/broadcast-assets/')));
});

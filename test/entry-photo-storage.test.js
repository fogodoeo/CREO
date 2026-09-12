'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { EntryPhotoStorage, REF_PREFIX } = require('../entry-photo-storage');
const { createEntryPhotoProcessor, decodeImage } = require('../entry-photo-codec');
const { createVendorEntries } = require('../vendor-entries');
const { publicItem } = require('../platform-core');

const seed = () => sharp({ create: { width: 40, height: 20, channels: 3, background: '#f27883' } }).png().toBuffer();
async function local(t, options = {}) {
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ongdong-entry-photo-'));
    t.after(async () => {
        assert.equal(path.dirname(localDir), os.tmpdir());
        assert.ok(path.basename(localDir).startsWith('ongdong-entry-photo-'));
        await fs.rm(localDir, { recursive: true, force: true });
    });
    return new EntryPhotoStorage({ localDir, secret: 'isolated-photo-secret', ...options });
}
async function media(storage) {
    const prepared = await createEntryPhotoProcessor()((await seed()).toString('base64'));
    return { ...prepared, record: storage.describe(randomUUID(), randomUUID(), prepared.full, prepared.thumb, prepared) };
}

test('photo codec accepts actual raster pixels, preserves orientation and strips source metadata', async () => {
    const input = await sharp(await seed()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await createEntryPhotoProcessor()('data:image/jpeg;base64,' + input.toString('base64'));
    const full = await sharp(result.full).metadata(), thumb = await sharp(result.thumb).metadata();
    assert.equal(full.format, 'webp'); assert.equal(full.width, 20); assert.equal(full.height, 40);
    assert.equal(full.exif, undefined); assert.equal(full.icc, undefined); assert.equal(full.orientation, undefined);
    assert.ok(thumb.width <= 320 && thumb.height <= 320);
    assert.ok(result.full.length <= 400000 && result.thumb.length <= 60000);
    for (const bad of ['', 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'), Buffer.from('GIF89a').toString('base64'), 'AA-_', 'AAAA===']) {
        assert.throws(() => decodeImage(bad), e => e.status === 422 || e.status === 413);
    }
    await assert.rejects(createEntryPhotoProcessor()(Buffer.from([0xff,0xd8,0xff,0,0]).toString('base64')), /사진을 읽지/);
    assert.throws(() => decodeImage(Buffer.alloc(400001).toString('base64')), e => e.status === 413);
    const large = await sharp({ create: { width: 4001, height: 4001, channels: 3, background: '#fff' } }).png().toBuffer();
    await assert.rejects(createEntryPhotoProcessor()(large.toString('base64')), /사진을 읽지/);
});

test('photo work is bounded and a failed decode releases the processing slot', async () => {
    let release, started;
    const gate = new Promise(r => { release = r; }), seen = new Promise(r => { started = r; });
    const process = createEntryPhotoProcessor({ transform: async () => { started(); await gate; throw Error('synthetic decoder fault'); } });
    const input = (await seed()).toString('base64');
    const first = process(input); await seen;
    await assert.rejects(process(input), e => e.status === 429);
    release(); await assert.rejects(first, e => e.status === 422);
    await assert.rejects(process(input), e => e.status === 422, 'failed work does not leave the worker busy');
});

test('private local files are immutable, require an unexpired capability and survive storage restart', async t => {
    let now = Date.now();
    const storage = await local(t, { now: () => now }), photo = await media(storage);
    await Promise.all([storage.persist(photo.record, photo.full, photo.thumb), storage.persist(photo.record, photo.full, photo.thumb)]);
    const reference = photo.record.url;
    assert.ok(reference.startsWith(REF_PREFIX));
    const link = storage.resolve(reference), request = new URL(link, 'http://localhost');
    assert.deepEqual(await storage.readLocal(request), photo.full);
    const unsigned = new URL(request); unsigned.search = '';
    assert.equal(await storage.readLocal(unsigned), null);
    const wrong = new URL(request); wrong.pathname = wrong.pathname.replace('/full.webp', '/thumb.webp');
    assert.equal(await storage.readLocal(wrong), null);
    const restarted = new EntryPhotoStorage({ localDir: storage.localDir, secret: storage.secret, now: () => now });
    assert.deepEqual(await restarted.readLocal(request), photo.full);
    await assert.rejects(storage.put(reference.slice(REF_PREFIX.length), Buffer.from('replacement')), e => e.status === 409);
    now += 3601000; assert.equal(await restarted.readLocal(request), null);
    assert.notEqual(restarted.resolve(reference), link);
    for (const bad of ['/__entry_photo__/../secret', '/__entry_photo__/C:/secret', '/__entry_photo__/x%2fy']) assert.throws(() => storage.resolve(bad));
    assert.equal(publicItem({ photoUrl: reference, attributes: { media: [photo.record] } }).photoUrl, '');
    assert.equal(publicItem({ photoUrl: '/assets/old.webp' }).photoUrl, '/assets/old.webp');
});

test('remote storage signs on image request, sends no image through Render, and never exposes its service key', async () => {
    const calls = [], base = 'https://test-project.supabase.co';
    const storage = new EntryPhotoStorage({ supabaseUrl: base, serviceKey: 'server-only-key', secret: 'view-key', fetchFn: async (url, init) => {
        calls.push({ url, init });
        if (url.includes('/bucket/')) return Response.json({ public: false });
        if (url.includes('/object/sign/')) return Response.json({ signedURL: url.replace(base + '/storage/v1', '') + '?token=temporary-storage-token' });
        return Response.json({ Key: 'ok' });
    } });
    const photo = await media(storage);
    const reference = storage.resolve(photo.record.url);
    assert.equal(calls.length, 0, 'checkout can issue viewing URLs without waiting for Storage');
    await storage.persist(photo.record, photo.full, photo.thumb);
    const posts = calls.filter(c => c.init.method === 'POST');
    assert.equal(posts.length, 2); assert.ok(posts.every(c => c.init.headers['x-upsert'] === 'false'));
    assert.ok(posts.every(c => c.init.headers['Cache-Control'] === 'max-age=3600'));
    const results = await Promise.all([storage.view(new URL(reference, 'http://localhost')), storage.view(new URL(reference, 'http://localhost'))]);
    assert.equal(calls.filter(c => c.url.includes('/object/sign/')).length, 1);
    assert.deepEqual(results[0], results[1]); assert.equal(results[0].bytes, undefined);
    assert.ok(results[0].location.startsWith(base + '/storage/v1/object/sign/'));
    assert.ok(!JSON.stringify(results).includes('server-only-key'));
    assert.ok(calls.every(c => c.init.redirect === 'error' && c.init.signal));
});

test('misconfigured/public storage and malicious signed URL responses fail closed; transient errors can retry', async () => {
    await assert.rejects(new EntryPhotoStorage().ensureReady(), e => e.status === 503);
    let behavior = 'public';
    const storage = new EntryPhotoStorage({ supabaseUrl: 'https://test.supabase.co', serviceKey: 'key', secret: 'secret', fetchFn: async url => {
        if (url.includes('/bucket/')) return Response.json({ public: behavior === 'public' });
        if (behavior === 'offline') throw Error('offline');
        if (behavior === 'evil') return Response.json({ signedURL: 'https://evil.test/?token=secret' });
        return Response.json({ signedURL: url.replace('https://test.supabase.co/storage/v1', '') + '?token=ok' });
    } });
    await assert.rejects(storage.ensureReady(), e => e.status === 503);
    behavior = 'offline'; await storage.ensureReady();
    const photo = await media(storage), request = new URL(storage.resolve(photo.record.url), 'http://localhost');
    await assert.rejects(storage.view(request), e => e.status === 503);
    behavior = 'evil'; await assert.rejects(storage.view(request), e => e.status === 503);
    behavior = 'ok'; assert.ok((await storage.view(request)).location.includes('?token=ok'));
});

test('partial image storage can retry immutable objects without acknowledging incomplete metadata', async () => {
    const objects = new Set(); let interrupt = true;
    const storage = new EntryPhotoStorage({ supabaseUrl: 'https://test.supabase.co', serviceKey: 'key', secret: 'secret', fetchFn: async url => {
        if (url.includes('/bucket/')) return Response.json({ public: false });
        if (url.endsWith('/thumb.webp') && interrupt) { interrupt = false; throw Error('connection lost'); }
        if (objects.has(url)) return Response.json({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }, { status: 400 });
        objects.add(url); return Response.json({ Key: 'stored' });
    } });
    const photo = await media(storage);
    await assert.rejects(storage.persist(photo.record, photo.full, photo.thumb), e => e.status === 503);
    assert.equal(objects.size, 1);
    await storage.persist(photo.record, photo.full, photo.thumb);
    assert.equal(objects.size, 2);
});

test('media registration retries an uncertain commit once, enforces ownership/quota, and leaves sales unchanged', async t => {
    const storage = await local(t), photo = await media(storage), ownerId = photo.record.url.slice(REF_PREFIX.length).split('/')[0];
    const rows = new Map(); let loseReply = true, persisted = 0;
    const repository = {
        async getRowsByKeys(keys) { return keys.map(k => rows.get(k)).filter(Boolean); },
        async upsertRows(values) { values.forEach(v => rows.set(v.key, { ...v })); if (loseReply) { loseReply = false; throw Error('lost DB acknowledgement'); } },
        async getRecord() { return { open: true }; }
    };
    const channel = { id: 'one', status: 'active', name: '가상 경매' };
    const context = { channel, vendor: { id: 'vendor' }, profile: { id: ownerId, members: [{ channelId: 'one', vendorId: 'vendor' }] }, catalog: { channels: [channel] } };
    let service = createVendorEntries(repository, { resolveMediaUrl: value => storage.resolve(value), maxMediaBytes: photo.full.length + photo.thumb.length });
    const save = () => { persisted++; return storage.persist(photo.record, photo.full, photo.thumb); };
    await assert.rejects(service.addMedia(context, photo.record, save), /acknowledgement/);
    service = createVendorEntries(repository, { resolveMediaUrl: value => storage.resolve(value), maxMediaBytes: photo.full.length + photo.thumb.length });
    await Promise.all([service.addMedia(context, photo.record, save), service.addMedia(context, photo.record, save)]);
    assert.equal(persisted, 1);
    const view = await service.read(context); assert.equal(view.media.length, 1); assert.ok(view.media[0].url.includes('signature='));
    const durable = JSON.parse([...rows.values()][0].value); assert.equal(durable.media[0].url, photo.record.url); assert.ok(!JSON.stringify(durable).includes('signature='));
    const different = storage.describe(ownerId, randomUUID(), photo.full, photo.thumb, photo);
    await assert.rejects(service.addMedia(context, different, save), e => e.status === 413);
    await assert.rejects(service.addMedia({ ...context, vendor: { id: 'intruder' } }, photo.record, save), e => e.status === 403);
    assert.equal(rows.size, 1, 'only the owner media document is persisted, no auction row');
    assert.equal(persisted, 1, 'quota and ownership are checked before object uploads');
    const outage = createVendorEntries(repository, { resolveMediaUrl: () => { throw Error('storage outage'); } });
    assert.equal((await outage.read(context)).media[0].url, photo.record.url);
});

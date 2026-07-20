'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SQLitePlatformRepository } = require('../sqlite-platform-repository');

class OfflineMirror {
    async upsertRows() { throw new Error('mirror offline'); }
    async deleteRow() { throw new Error('mirror offline'); }
}

class ReadableMirror {
    constructor() {
        this.rows = new Map();
        this.records = new Map();
    }
    async getRow(key) { return this.rows.has(key) ? { key, value: this.rows.get(key) } : null; }
    async getRowsByKeys(keys) { return keys.filter((key) => this.rows.has(key)).map((key) => ({ key, value: this.rows.get(key) })); }
    async listRecords(channel, type) { return structuredClone(this.records.get(`${channel}:${type}`) || []); }
    async upsertRows() {}
    async deleteRow() {}
}

test('SQLite repository persists channel-isolated records across restarts', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-sqlite-'));
    const database = path.join(directory, 'platform.sqlite');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    const first = new SQLitePlatformRepository({
        dbPath: database,
        durable: true,
        adminSecret: 'secret',
        mirror: new OfflineMirror(),
        startWorker: false
    });
    await first.saveCatalog([
        { id: 'alpha', name: '알파', status: 'active' },
        { id: 'beta', name: '베타', status: 'active' }
    ], 1);
    await first.upsertRecord('alpha', 'vendor', { id: 'same', name: '알파 업체' });
    await first.upsertRecord('beta', 'vendor', { id: 'same', name: '베타 업체' });
    await first.upsertRecord('alpha', 'item', { id: 'item_one', lotNumber: 1, name: '알파 개체', vendorId: 'same' });
    await first.setActiveChannel('beta');
    const beforeClose = await first.health();
    assert.equal(beforeClose.ok, true);
    assert.equal(beforeClose.durable, true);
    assert.ok(beforeClose.outboxPending >= 4);
    first.close();

    const reopened = new SQLitePlatformRepository({ dbPath: database, durable: true, adminSecret: 'secret', startWorker: false });
    assert.equal((await reopened.listRecords('alpha', 'vendor'))[0].name, '알파 업체');
    assert.equal((await reopened.listRecords('beta', 'vendor'))[0].name, '베타 업체');
    assert.equal((await reopened.listRecords('beta', 'item')).length, 0);
    assert.equal(await reopened.getActiveChannel(), 'beta');
    assert.equal(await reopened.verifyAdmin('wrong'), false);
    assert.equal(await reopened.verifyAdmin('secret'), true);
    reopened.close();
});

test('SQLite delete creates a durable mirror tombstone', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-outbox-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const repository = new SQLitePlatformRepository({
        dbPath: path.join(directory, 'platform.sqlite'),
        adminSecret: 'secret',
        mirror: new OfflineMirror(),
        startWorker: false
    });
    await repository.upsertRecord('alpha', 'vendor', { id: 'one', name: '업체' });
    await repository.deleteRecord('alpha', 'vendor', 'one');
    assert.equal((await repository.listRecords('alpha', 'vendor')).length, 0);
    assert.equal((await repository.health()).outboxPending, 1);
    repository.close();
});

test('catalog compare-and-swap rejects simultaneous stale saves', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-catalog-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const repository = new SQLitePlatformRepository({
        dbPath: path.join(directory, 'platform.sqlite'),
        adminSecret: 'secret',
        startWorker: false
    });
    const alpha = [{ id: 'alpha', name: '알파', status: 'active' }];
    const beta = [{ id: 'beta', name: '베타', status: 'active' }];
    const results = await Promise.allSettled([
        repository.saveCatalog(alpha, 1),
        repository.saveCatalog(beta, 1)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'VERSION_CONFLICT').length, 1);
    assert.equal((await repository.getCatalog()).version, 2);
    repository.close();
});

test('ephemeral SQLite restores missing catalog and assets from the Supabase mirror once', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-hydrate-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const mirror = new ReadableMirror();
    mirror.rows.set('creo_v2::catalog', JSON.stringify({ version: 7, channels: [{ id: 'alpha', name: '알파', status: 'active' }] }));
    mirror.records.set('alpha:asset', [{ id: 'banner', name: '복구 배너', kind: 'banner', page: 'all', imageUrl: 'https://example.com/banner.webp', active: true }]);
    const repository = new SQLitePlatformRepository({
        dbPath: path.join(directory, 'platform.sqlite'),
        mirror,
        startWorker: false
    });
    assert.equal((await repository.getCatalog()).version, 7);
    assert.equal((await repository.listRecords('alpha', 'asset'))[0].name, '복구 배너');
    mirror.rows.clear();
    mirror.records.clear();
    assert.equal((await repository.getCatalog()).version, 7);
    assert.equal((await repository.listRecords('alpha', 'asset'))[0].name, '복구 배너');
    repository.close();
});

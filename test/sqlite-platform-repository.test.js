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

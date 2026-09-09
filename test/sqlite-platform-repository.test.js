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

class RecordingMirror extends ReadableMirror {
    async upsertRows(rows) {
        rows.forEach((row) => this.rows.set(row.key, row.value));
    }
    async deleteRow(key) {
        this.rows.delete(key);
    }
}

test('deleted records cannot return from a stale mirror, including empty lists and restart', async t => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creo-delete-read-'));
    t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    const dbPath=path.join(directory,'db.sqlite'),mirror=new ReadableMirror();
    const key='creo_v2::alpha::shipment::one',record={id:'one',itemId:'test'};
    mirror.rows.set(key,JSON.stringify(record));mirror.records.set('alpha:shipment',[record]);
    mirror.records.set('beta:shipment',[record]);
    let repo=new SQLitePlatformRepository({dbPath,mirror,durable:true,startWorker:false});
    await repo.listRecords('alpha','shipment');
    await repo.deleteRecord('alpha','shipment','one');
    await repo.deleteRecord('alpha','shipment','one');
    await repo.flushOutbox(); // Mirror still returns its stale snapshot even after acknowledging deletion.
    repo.close();repo=new SQLitePlatformRepository({dbPath,mirror,durable:true,startWorker:false});
    try {
        assert.deepEqual(await repo.listRecords('alpha','shipment'),[]);
        assert.equal(await repo.getRow(key),null);
        assert.deepEqual(await repo.getRowsByKeys([key]),[]);
        assert.equal((await repo.listRecords('beta','shipment')).length,1);
        await repo.upsertRecord('alpha','shipment',{...record,itemId:'new'});
        assert.equal((await repo.getRecord('alpha','shipment','one')).itemId,'new');
    } finally {repo.close();}
});

for(const action of ['delete','update']) test(`late mirror reads cannot undo a local ${action}`,async t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creo-late-read-'));
    t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    let release;const key='creo_v2::alpha::item::one';
    const mirror={getRow:()=>new Promise(resolve=>{release=resolve;})};
    const repo=new SQLitePlatformRepository({dbPath:path.join(directory,'db.sqlite'),mirror,durable:true,startWorker:false});
    try {
        const pending=repo.getRow(key);
        if(action==='delete')await repo.deleteRow(key);else await repo.upsertRows([{key,value:'new'}]);
        release({key,value:'old'});
        const row=await pending;
        assert.equal(row?.value,action==='delete'?undefined:'new');
    } finally {repo.close();}
});

test('SQLite repository disables admin access when no secret is configured', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-default-admin-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const previous = process.env.CREO_ADMIN_SECRET;
    delete process.env.CREO_ADMIN_SECRET;
    t.after(() => {
        if (previous === undefined) delete process.env.CREO_ADMIN_SECRET;
        else process.env.CREO_ADMIN_SECRET = previous;
    });
    const repository = new SQLitePlatformRepository({
        dbPath: path.join(directory, 'platform.sqlite'),
        startWorker: false
    });
    assert.equal(await repository.verifyAdmin('1234'), false);
    assert.equal(await repository.verifyAdmin('anything'), false);
    assert.equal((await repository.health()).adminConfigured, false);
    repository.close();
});

for(const fails of [false,true]) test(`mirror ${fails?'failure':'acknowledgement'} cannot discard a newer deletion`,async t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creo-mirror-order-'));
    t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
    let release;const deleted=[];
    const mirror={upsertRows:()=>new Promise((resolve,reject)=>{release=()=>fails?reject(Error('offline')):resolve();}),deleteRow:async key=>deleted.push(key)};
    const repo=new SQLitePlatformRepository({dbPath:path.join(directory,'db.sqlite'),mirror,durable:true,startWorker:false});
    try {
        await repo.upsertRows([{key:'entry',value:'old'}]);
        const pending=repo.flushOutbox();
        await repo.deleteRow('entry');
        release();await pending;
        assert.equal((await repo.health()).outboxPending,1);
        await repo.flushOutbox();
        assert.deepEqual(deleted,['entry']);
        assert.equal((await repo.health()).outboxPending,0);
    } finally {repo.close();}
});

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

test('ephemeral SQLite mirrors a mutation before returning', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-sync-mirror-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const mirror = new RecordingMirror();
    const repository = new SQLitePlatformRepository({
        dbPath: path.join(directory, 'platform.sqlite'),
        durable: false,
        mirror,
        startWorker: false
    });
    await repository.upsertRecord('alpha', 'item', { id: 'item_one', lotNumber: 1, name: '즉시 미러 개체' });
    assert.match(mirror.rows.get('creo_v2::alpha::item::item_one'), /즉시 미러 개체/);
    assert.equal((await repository.health()).outboxPending, 0);
    repository.close();
});

test('ephemeral SQLite restores every operational record type from the Supabase mirror once', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creo-hydrate-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const mirror = new ReadableMirror();
    mirror.rows.set('creo_v2::catalog', JSON.stringify({ version: 7, channels: [{ id: 'alpha', name: '알파', status: 'active' }] }));
    mirror.rows.set('creo_v2::active_channel', 'alpha');
    mirror.rows.set('creo_v2::alpha::broadcast::state', JSON.stringify({ id: 'state', mode: 'live', page: 2 }));
    mirror.records.set('alpha:vendor', [{ id: 'vendor', name: '복구 업체' }]);
    mirror.records.set('alpha:item', [{ id: 'item', lotNumber: 1, name: '복구 개체' }]);
    mirror.records.set('alpha:shipment', [{ id: 'shipment', itemId: 'item', method: 'delivery' }]);
    mirror.records.set('alpha:asset', [{ id: 'banner', name: '복구 배너', kind: 'banner', page: 'all', imageUrl: 'https://example.com/banner.webp', active: true }]);
    const repository = new SQLitePlatformRepository({
        dbPath: path.join(directory, 'platform.sqlite'),
        mirror,
        startWorker: false
    });
    assert.equal((await repository.getCatalog()).version, 7);
    assert.equal(await repository.getActiveChannel(), 'alpha');
    assert.equal((await repository.listRecords('alpha', 'vendor'))[0].name, '복구 업체');
    assert.equal((await repository.listRecords('alpha', 'item'))[0].name, '복구 개체');
    assert.equal((await repository.listRecords('alpha', 'shipment'))[0].id, 'shipment');
    assert.equal((await repository.getRecord('alpha', 'broadcast', 'state')).mode, 'live');
    assert.equal((await repository.listRecords('alpha', 'asset'))[0].name, '복구 배너');
    mirror.rows.clear();
    mirror.records.clear();
    assert.equal((await repository.getCatalog()).version, 7);
    assert.equal((await repository.listRecords('alpha', 'vendor'))[0].name, '복구 업체');
    assert.equal((await repository.listRecords('alpha', 'item'))[0].name, '복구 개체');
    assert.equal((await repository.listRecords('alpha', 'shipment'))[0].id, 'shipment');
    assert.equal((await repository.getRecord('alpha', 'broadcast', 'state')).mode, 'live');
    assert.equal((await repository.listRecords('alpha', 'asset'))[0].name, '복구 배너');
    repository.close();
});

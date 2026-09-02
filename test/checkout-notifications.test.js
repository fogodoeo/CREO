'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CheckoutNotificationService,
    SolapiAlimtalkProvider,
    notificationId,
    solapiAuthorization
} = require('../checkout-notifications');

class MemoryRepository {
    constructor() { this.records = new Map(); }
    key(channelId, type, id) { return `${channelId}:${type}:${id}`; }
    async getRecord(channelId, type, id) { return structuredClone(this.records.get(this.key(channelId, type, id)) || null); }
    async upsertRecord(channelId, type, record) {
        const previous = this.records.get(this.key(channelId, type, record.id));
        const stored = {
            ...record,
            channelId,
            createdAt: previous?.createdAt || record.createdAt || '2026-09-02T00:00:00.000Z',
            updatedAt: '2026-09-02T00:00:00.000Z'
        };
        this.records.set(this.key(channelId, type, record.id), stored);
        return structuredClone(stored);
    }
    async listRecords(channelId, type) {
        return [...this.records.entries()]
            .filter(([key]) => key.startsWith(`${channelId}:${type}:`))
            .map(([, value]) => structuredClone(value));
    }
}

function event(overrides = {}) {
    return {
        eventKey: 'sale:item-a:cycle-1',
        templateKey: 'buyer_win_initial',
        recipientRole: 'buyer',
        recipientPhone: '01012345678',
        variables: { 구매자명: '김상정', 접속코드: 'abc12345678' },
        fallbackText: '김상정님 낙찰 안내입니다.',
        ...overrides
    };
}

test('notification enqueue is deterministic and waits safely for template configuration', async () => {
    const repository = new MemoryRepository();
    const provider = { readiness: () => ({ ready: false, missing: ['template:buyer_win_initial'] }) };
    const service = new CheckoutNotificationService({ repository, provider, now: () => Date.parse('2026-09-02T00:00:00Z') });

    const first = await service.enqueue('basic', event());
    const repeated = await service.enqueue('basic', event());

    assert.equal(first.duplicate, false);
    assert.equal(repeated.duplicate, true);
    assert.equal(first.record.id, notificationId('basic', 'sale:item-a:cycle-1', 'buyer_win_initial', 'buyer'));
    assert.equal(first.record.status, 'configuration_pending');
    assert.equal((await service.list('basic')).length, 1);
});

test('configured notification flush sends exactly once and persists the provider receipt', async () => {
    const repository = new MemoryRepository();
    let sends = 0;
    const provider = {
        readiness: () => ({ ready: true, missing: [] }),
        async send(record) {
            sends += 1;
            assert.equal(record.variables['#{구매자명}'], '김상정');
            return { messageId: 'message-1', groupId: 'group-1' };
        }
    };
    const service = new CheckoutNotificationService({ repository, provider, now: () => Date.parse('2026-09-02T00:00:00Z') });
    await Promise.all([service.enqueue('basic', event()), service.enqueue('basic', event())]);

    const result = await service.flushChannel('basic');
    const again = await service.flushChannel('basic');
    const [stored] = await service.list('basic');

    assert.equal(result.processed, 1);
    assert.equal(again.processed, 0);
    assert.equal(sends, 1);
    assert.equal(stored.status, 'sent');
    assert.equal(stored.providerMessageId, 'message-1');
});

test('a stale sending record is reclaimed after a process restart', async () => {
    const repository = new MemoryRepository();
    const id = notificationId('basic', 'sale:item-a:cycle-1', 'buyer_win_initial', 'buyer');
    await repository.upsertRecord('basic', 'notification', {
        id,
        ...event(),
        status: 'sending',
        attempts: 1,
        nextAttemptAt: '2026-09-02T00:01:00.000Z',
        expiresAt: '2026-09-03T00:00:00.000Z'
    });
    let sends = 0;
    const provider = {
        readiness: () => ({ ready: true, missing: [] }),
        async send() { sends += 1; return { messageId: 'recovered' }; }
    };
    const service = new CheckoutNotificationService({
        repository,
        provider,
        now: () => Date.parse('2026-09-02T00:03:00.000Z')
    });

    const result = await service.flushChannel('basic');
    const stored = await repository.getRecord('basic', 'notification', id);

    assert.equal(result.processed, 1);
    assert.equal(sends, 1);
    assert.equal(stored.status, 'sent');
    assert.equal(stored.attempts, 2);
});

test('Solapi provider creates an authenticated AlimTalk request with SMS fallback', async () => {
    let request;
    const provider = new SolapiAlimtalkProvider({
        apiKey: 'api-key',
        apiSecret: 'api-secret',
        pfId: 'PF123',
        from: '01049278600',
        templateIds: { buyer_win_initial: 'TPL123' },
        fetchImpl: async (url, options) => {
            request = { url, options, body: JSON.parse(options.body) };
            return { ok: true, status: 200, json: async () => ({ errorCount: 0, resultList: [{ messageId: 'M1', groupId: 'G1', statusCode: '2000' }] }) };
        }
    });

    const result = await provider.send(event());

    assert.equal(result.messageId, 'M1');
    assert.equal(request.url, 'https://api.solapi.com/messages/v4/send-many/detail');
    assert.match(request.options.headers.Authorization, /^HMAC-SHA256 apiKey=api-key, date=/);
    assert.deepEqual(request.body.messages[0].kakaoOptions, {
        pfId: 'PF123', templateId: 'TPL123', disableSms: false,
        variables: { '#{구매자명}': '김상정', '#{접속코드}': 'abc12345678' }
    });
    assert.equal(request.body.messages[0].from, '01049278600');
    assert.equal(request.body.allowDuplicates, false);
});

test('Solapi authorization signature is stable for a fixed date and salt', () => {
    const value = solapiAuthorization('key', 'secret', new Date('2026-09-02T00:00:00.000Z'), 'salt');
    assert.equal(value, 'HMAC-SHA256 apiKey=key, date=2026-09-02T00:00:00.000Z, salt=salt, signature=90ead2be5ffc4bd11aa94c14767e33e7064658044363fb18d70e18d04977b03a');
});

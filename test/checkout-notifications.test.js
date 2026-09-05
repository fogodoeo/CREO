'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    AligoNotificationProvider,
    CheckoutNotificationService,
    createDefaultNotificationProvider,
    messageText,
    notificationTransport,
    notificationId
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

test('transaction SMS copy preserves intentional mobile line breaks', () => {
    assert.equal(messageText(' 낙찰 안내\r\n\r\n  배송·결제 링크  \nhttps://example.com '), '낙찰 안내\n\n배송·결제 링크\nhttps://example.com');
});

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
    assert.equal(first.record.transport, 'sms');
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

test('Aligo is the only default checkout notification provider', () => {
    assert.ok(createDefaultNotificationProvider() instanceof AligoNotificationProvider);
});

test('payment actions use Aligo SMS while a pure completion notice prefers AlimTalk', () => {
    for (const key of ['buyer_win_initial', 'buyer_win_additional', 'vendor_win', 'vendor_payment_reported', 'buyer_card_link_ready']) {
        assert.equal(notificationTransport(key), 'sms');
    }
    assert.equal(notificationTransport('buyer_payment_confirmed'), 'alimtalk');
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'kakao-alimtalk-templates.json'), 'utf8'));
    const byKey = Object.fromEntries(spec.templates.map((entry) => [entry.key, entry]));
    for (const key of ['buyer_win_initial', 'buyer_win_additional', 'vendor_win', 'vendor_payment_reported', 'buyer_card_link_ready']) {
        assert.equal(byKey[key].transport, 'sms');
    }
    assert.equal(byKey.buyer_payment_confirmed.transport, 'alimtalk');
    assert.equal(byKey.buyer_payment_confirmed.link, '');
    assert.equal(byKey.buyer_payment_confirmed.buttonName, '');
    assert.equal(byKey.buyer_payment_confirmed.content, '#{구매자명}님, #{업체명} 결제가 확인되었습니다.\n확인금액: #{결제금액}\n\n배송·결제 페이지에서 전체 진행 상태를 확인할 수 있습니다.');
});

test('Aligo provider sends a payment action as URL-encoded LMS without a Kakao template', async () => {
    let request;
    const provider = new AligoNotificationProvider({
        apiKey: 'api-key', userId: 'user-id', from: '01049278600',
        fetchImpl: async (url, options) => {
            request = { url, options, body: new URLSearchParams(options.body) };
            return { ok: true, status: 200, json: async () => ({ result_code: 1, msg_id: 1234, success_cnt: 1, error_cnt: 0 }) };
        }
    });
    const notification = { ...event(), id: 'ntf_sms', transport: 'sms', fallbackText: `낙찰 안내입니다.\n${'https://creok.onrender.com/s/example'.repeat(3)}` };

    const result = await provider.send(notification);

    assert.equal(result.messageId, '1234');
    assert.equal(request.url, 'https://apis.aligo.in/send/');
    assert.equal(request.body.get('key'), 'api-key');
    assert.equal(request.body.get('user_id'), 'user-id');
    assert.equal(request.body.get('receiver'), '01012345678');
    assert.equal(request.body.get('msg_type'), 'LMS');
    assert.equal(request.body.get('testmode_yn'), 'N');
    assert.equal(request.body.has('senderkey'), false);
});

test('Aligo provider renders an approved status template without payment-link fallback', async () => {
    let request;
    const provider = new AligoNotificationProvider({
        apiKey: 'api-key', userId: 'user-id', senderKey: 'sender-key', from: '01049278600',
        templates: {
            buyer_payment_confirmed: {
                code: 'UK_APPROVED', subject: '결제 확인 완료',
                content: '#{구매자명}님, #{업체명} 결제가 확인되었습니다.'
            }
        },
        fetchImpl: async (url, options) => {
            request = { url, options, body: new URLSearchParams(options.body) };
            return { ok: true, status: 200, json: async () => ({ code: 0, info: { mid: 5678, scnt: 1, fcnt: 0 } }) };
        }
    });
    const notification = event({
        id: 'ntf_alimtalk', templateKey: 'buyer_payment_confirmed', transport: 'alimtalk',
        variables: { 구매자명: '김상정', 업체명: '테스트업체' },
        fallbackText: '문자용 링크가 포함될 수 있지만 알림톡 본문에는 사용하지 않습니다. https://example.com'
    });

    const result = await provider.send(notification);

    assert.equal(result.messageId, '5678');
    assert.equal(request.url, 'https://kakaoapi.aligo.in/akv10/alimtalk/send/');
    assert.equal(request.body.get('tpl_code'), 'UK_APPROVED');
    assert.equal(request.body.get('message_1'), '김상정님, 테스트업체 결제가 확인되었습니다.');
    assert.equal(request.body.get('failover'), 'N');
    assert.equal(request.body.get('button_1'), null);
});

test('missing AlimTalk approval falls back to configured Aligo SMS once', async () => {
    const repository = new MemoryRepository();
    const sent = [];
    const provider = new AligoNotificationProvider({
        apiKey: 'api-key', userId: 'user-id', from: '01049278600',
        fetchImpl: async (url, options) => {
            sent.push({ url, body: new URLSearchParams(options.body) });
            return { ok: true, status: 200, json: async () => ({ result_code: 1, msg_id: 999, success_cnt: 1, error_cnt: 0 }) };
        }
    });
    const service = new CheckoutNotificationService({ repository, provider, now: () => Date.parse('2026-09-02T00:00:00Z') });
    const queued = await service.enqueue('basic', event({ templateKey: 'buyer_payment_confirmed', transport: 'alimtalk' }));

    assert.equal(queued.record.transport, 'sms');
    assert.equal(queued.record.status, 'queued');
    await service.flushChannel('basic');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://apis.aligo.in/send/');
});

test('a pre-deploy pending AlimTalk record migrates to Aligo SMS after restart', async () => {
    const repository = new MemoryRepository();
    const id = notificationId('basic', 'confirmed:legacy', 'buyer_payment_confirmed', 'buyer');
    await repository.upsertRecord('basic', 'notification', {
        id,
        eventKey: 'confirmed:legacy',
        templateKey: 'buyer_payment_confirmed',
        transport: 'alimtalk',
        recipientRole: 'buyer',
        recipientPhone: '01012345678',
        variables: { 구매자명: '김상정' },
        fallbackText: '결제 확인 완료 안내',
        status: 'configuration_pending',
        attempts: 0,
        nextAttemptAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-09-05T00:00:00.000Z'
    });
    let sends = 0;
    const provider = new AligoNotificationProvider({
        apiKey: 'api-key', userId: 'user-id', from: '01049278600',
        fetchImpl: async () => {
            sends += 1;
            return { ok: true, status: 200, json: async () => ({ result_code: 1, msg_id: 1000, success_cnt: 1, error_cnt: 0 }) };
        }
    });
    const service = new CheckoutNotificationService({ repository, provider, now: () => Date.parse('2026-09-02T00:00:00Z') });

    await service.flushChannel('basic');
    const stored = await repository.getRecord('basic', 'notification', id);

    assert.equal(sends, 1);
    assert.equal(stored.transport, 'sms');
    assert.equal(stored.status, 'sent');
});

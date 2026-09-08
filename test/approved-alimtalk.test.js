const test = require('node:test');
const assert = require('node:assert/strict');
const { AligoNotificationProvider, CheckoutNotificationService } = require('../checkout-notifications');

test('approved bodies and buttons substitute all variables and retain approved routes', async () => {
    const requests = [];
    const provider = new AligoNotificationProvider({ apiKey: 'key', userId: 'user', senderKey: 'profile', from: '01049278600',
        fetchImpl: async (_, options) => { requests.push(new URLSearchParams(options.body)); return { ok: true, json: async () => ({ code: 0, info: { mid: 1, scnt: 1 } }) }; } });
    for (const templateKey of Object.keys(require('../approved-alimtalk').codes)) {
        await provider.send({ templateKey, recipientPhone: '01012345678', variables: { 구매자명: '테스트 "구매자"', 업체명: '테스트업체', 개체명: 'A01', 낙찰금액: '30,000원', 결제금액: '30,000원', 접속코드: 'buyer123456', 업체접속코드: 'vendor123456' } });
    }
    for (const request of requests) {
        assert.doesNotMatch(request.get('message_1') + request.get('button_1'), /#\{/);
        assert.equal(JSON.parse(request.get('button_1')).button[0].linkType, 'AC');
        assert.equal(request.get('failover'), 'N');
    }
    assert.match(JSON.parse(requests[0].get('button_1')).button[1].linkMo, /\/d\/buyer123456$/);
    assert.match(JSON.parse(requests.at(-1).get('button_1')).button[1].linkMo, /\/s\/buyer123456$/);
    await assert.rejects(provider.send({ templateKey: 'vendor_win', variables: {} }), /변수 누락/);
    assert.equal(requests.length, 8);
    const card = requests.find(request => request.get('tpl_code') === 'UL_0884');
    assert.match(JSON.parse(card.get('button_1')).button[1].linkMo, /\/d\/buyer123456$/);
});

for (const templateKey of ['buyer_win_initial', 'buyer_card_link_ready']) test(`${templateKey} retains Alimtalk across configuration waits and restart`, async () => {
    const records = new Map();
    const repository = { async getRecord(c,t,id) { return records.get(id); }, async upsertRecord(c,t,r) { records.set(r.id,r); return r; }, async listRecords() { return [...records.values()]; } };
    const provider = { readiness: (_, transport) => ({ ready: transport === 'sms', missing: ['profile'] }), send() { throw Error('must not send'); } };
    const service = new CheckoutNotificationService({ repository, provider });
    const queued = await service.enqueue('qa', { eventKey: 'sale:1', templateKey, recipientRole: 'buyer', recipientPhone: '01012345678', allowSmsFallback: false });
    assert.equal(queued.record.transport, 'alimtalk');
    await new CheckoutNotificationService({ repository, provider }).flushChannel('qa');
    const [record] = await service.list('qa');
    assert.equal(record.transport, 'alimtalk');
    assert.equal(record.status, 'configuration_pending');
});

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
    assert.equal(requests.length, 10);
    const card = requests.find(request => request.get('tpl_code') === 'UL_0884');
    assert.match(JSON.parse(card.get('button_1')).button[1].linkMo, /\/d\/buyer123456$/);
});

for (const templateKey of ['buyer_win_initial', 'buyer_card_link_ready']) test(`${templateKey} retains Alimtalk across configuration waits and restart`, async () => {
    const records = new Map();
    const repository = { async getRecord(c,t,id) { return records.get(id); }, async upsertRecord(c,t,r) { records.set(r.id,r); return r; }, async listRecords() { return [...records.values()]; } };
    const provider = { readiness: (_, transport) => ({ ready: transport === 'sms', missing: ['profile'] }), send() { throw Error('must not send'); } };
    const service = new CheckoutNotificationService({ repository, provider });
    const queued = await service.enqueue('qa', { eventKey: 'sale:1', templateKey, recipientRole: 'buyer', recipientPhone: '01012345678', allowSmsFallback: false, failureSmsFallback: true });
    assert.equal(queued.record.transport, 'alimtalk');
    await new CheckoutNotificationService({ repository, provider }).flushChannel('qa');
    const [record] = await service.list('qa');
    assert.equal(record.transport, 'alimtalk');
    assert.equal(record.status, 'configuration_pending');
    assert.equal(record.failureSmsFallback, true);
});

test('Aligo owns delivery-failure SMS and worker does not send a second message', async () => {
    const requests = [], records = new Map();
    const repository = { async getRecord(c,t,id) { return records.get(id); }, async upsertRecord(c,t,r) { records.set(r.id,r); return r; }, async listRecords() { return [...records.values()]; } };
    const provider = new AligoNotificationProvider({apiKey:'key',userId:'user',senderKey:'profile',from:'01049278600',testMode:'N',fetchImpl:async(url,options)=>{requests.push({url,body:new URLSearchParams(options.body)});return {ok:true,json:async()=>({code:0,info:{mid:123,scnt:1}})}}});
    const service=new CheckoutNotificationService({repository,provider});
    const event={eventKey:'card:1',templateKey:'buyer_card_link_ready',recipientRole:'buyer',recipientPhone:'01012345678',allowSmsFallback:false,failureSmsFallback:true,fallbackText:'[옹동2] 카드결제 안내\nhttps://creok.onrender.com/d/example',variables:{구매자명:'테스트',업체명:'업체',개체명:'A01',낙찰금액:'30,000원',접속코드:'example'}};
    await service.enqueue('qa',event);assert.equal((await service.enqueue('qa',event)).duplicate,true);
    const restarted=new CheckoutNotificationService({repository,provider});await restarted.flushChannel('qa');await restarted.flushChannel('qa');
    assert.equal(requests.length,1);assert.match(requests[0].url,/alimtalk\/send/);assert.equal(requests[0].body.get('failover'),'Y');assert.equal(requests[0].body.get('fmessage_1'),event.fallbackText);
    await assert.rejects(provider.send({...event,fallbackText:''}),/대체문자/);
    await assert.rejects(provider.send({...event,fallbackText:'가'.repeat(40)}),/90바이트/);
    assert.equal(requests.length,1);
});

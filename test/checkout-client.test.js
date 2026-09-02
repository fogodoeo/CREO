const test = require('node:test');
const assert = require('node:assert/strict');

const Checkout = require('../public/checkout-client');

function location(pathname, search = '', origin = 'https://creok.onrender.com') {
    return { pathname, search, origin };
}

function response(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return payload; }
    };
}

test('checkout credentials support buyer and vendor short links', () => {
    assert.deepEqual(
        Checkout.readCredential(location('/s/Buyer_123'), 's'),
        { code: 'Buyer_123', token: '' }
    );
    assert.deepEqual(
        Checkout.readCredential(location('/v/Vendor-123'), 'v'),
        { code: 'Vendor-123', token: '' }
    );
    assert.deepEqual(
        Checkout.readCredential(location('/s/short'), 's'),
        { code: '', token: '' }
    );
});

test('checkout API origin only accepts the service origin, production, or local development', () => {
    const production = location('/s/Buyer_123');
    assert.equal(Checkout.resolveApiOrigin(production), production.origin);
    assert.equal(Checkout.resolveApiOrigin(production, 'https://creok.onrender.com'), production.origin);
    assert.equal(Checkout.resolveApiOrigin(production, 'https://creok.onrender.com.evil.test'), '');
    assert.equal(Checkout.resolveApiOrigin(production, 'http://creok.onrender.com'), '');
    assert.equal(
        Checkout.resolveApiOrigin(location('/s/Buyer_123', '', 'http://localhost:4179')),
        'http://localhost:4179'
    );
});

test('checkout client sends short-code auth consistently for reads and mutations', async () => {
    const calls = [];
    const client = Checkout.createClient({
        location: location('/s/Buyer_123'),
        endpoint: '/api/platform/buyer-shipping',
        shortPrefix: 's',
        retries: 1,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return response(200, { ok: true });
        }
    });
    assert.equal(client.valid, true);
    await client.request();
    await client.request('/save', { destinationId: 'hub-1', requestId: 'request-1' });
    assert.equal(calls[0].url, 'https://creok.onrender.com/api/platform/buyer-shipping?code=Buyer_123');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[1].url, 'https://creok.onrender.com/api/platform/buyer-shipping/save');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        code: 'Buyer_123', destinationId: 'hub-1', requestId: 'request-1'
    });
});

test('checkout client retries server failures but not validation failures', async () => {
    let serverAttempts = 0;
    const recovering = Checkout.createClient({
        location: location('/v/Vendor-123'), endpoint: '/api/platform/vendor-checkout', shortPrefix: 'v', retries: 2,
        fetch: async () => {
            serverAttempts += 1;
            return serverAttempts === 1 ? response(503, { error: '잠시 중단' }) : response(200, { ok: true });
        }
    });
    assert.deepEqual(await recovering.request(), { ok: true });
    assert.equal(serverAttempts, 2);

    let validationAttempts = 0;
    const invalid = Checkout.createClient({
        location: location('/v/Vendor-123'), endpoint: '/api/platform/vendor-checkout', shortPrefix: 'v', retries: 3,
        fetch: async () => {
            validationAttempts += 1;
            return response(422, { error: '입력 오류' });
        }
    });
    await assert.rejects(() => invalid.request(), /입력 오류/);
    assert.equal(validationAttempts, 1);
});

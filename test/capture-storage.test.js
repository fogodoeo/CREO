'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CaptureStorage } = require('../capture-storage');

test('creates a missing Supabase bucket when Storage reports HTTP 400', async (t) => {
    const originalFetch = global.fetch;
    const requests = [];
    t.after(() => { global.fetch = originalFetch; });

    global.fetch = async (url, options = {}) => {
        requests.push({ url: String(url), options });
        if (requests.length === 1) {
            return new Response(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Bucket not found' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (requests.length === 2) return new Response('', { status: 200 });
        if (requests.length === 3) return new Response('', { status: 200 });
        throw new Error('unexpected fetch call');
    };

    const storage = new CaptureStorage({
        supabaseUrl: 'https://example.supabase.co',
        serviceKey: 'service-role-test',
        bucket: 'auction-captures'
    });
    const image = Buffer.from([1, 2, 3]);

    const saved = await storage.put('auction/item.png', image, 'image/png');

    assert.deepEqual(saved, { backend: 'supabase', objectPath: 'auction/item.png' });
    assert.equal(requests.length, 3);
    assert.match(requests[0].url, /storage\/v1\/bucket\/auction-captures$/);
    assert.equal(requests[1].options.method, 'POST');
    assert.match(requests[1].url, /storage\/v1\/bucket$/);
    assert.equal(requests[2].options.method, 'POST');
    assert.match(requests[2].url, /storage\/v1\/object\/auction-captures\/auction\/item\.png$/);
});

test('does not create a bucket for unrelated HTTP 400 responses', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 400 });

    const storage = new CaptureStorage({
        supabaseUrl: 'https://example.supabase.co',
        serviceKey: 'bad-key',
        bucket: 'auction-captures'
    });

    await assert.rejects(
        storage.put('auction/item.png', Buffer.from([1]), 'image/png'),
        /Capture bucket check failed \(400\):.*Invalid JWT/
    );
});

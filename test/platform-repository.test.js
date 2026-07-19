'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { protectStoredValue, readStoredValue } = require('../platform-repository');

test('platform values are signed and reject direct tampering', () => {
    const key = 'creo_v2::alpha::item::one';
    const secret = 'integration-secret';
    const original = JSON.stringify({ id: 'one', name: '개체' });
    const stored = protectStoredValue(key, original, secret);
    assert.notEqual(stored, original);
    assert.equal(readStoredValue(key, stored, secret), original);

    const envelope = JSON.parse(stored);
    envelope.payload = JSON.stringify({ id: 'one', name: '변조' });
    assert.equal(readStoredValue(key, JSON.stringify(envelope), secret), null);
    assert.equal(readStoredValue(key, original, secret), null);
});

test('legacy non-platform keys remain compatible', () => {
    assert.equal(protectStoredValue('admin_pw', 'plain', 'secret'), 'plain');
    assert.equal(readStoredValue('admin_pw', 'plain', 'secret'), 'plain');
});

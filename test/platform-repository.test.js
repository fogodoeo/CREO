'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseConfigRepository, protectStoredValue, readStoredValue } = require('../platform-repository');

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

test('server storage never falls back to a hardcoded Supabase project', async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousAnonKey = process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    try {
        const repository = new SupabaseConfigRepository({ fetchImpl: async () => { throw new Error('must not fetch'); } });
        await assert.rejects(repository.request('config?select=key,value'), /credentials are not configured/);
    } finally {
        if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
        if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
        if (previousAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnonKey;
    }
});

test('survey prefix reads request only the requested key/value page', async () => {
    let requestedUrl = '';
    const repository = new SupabaseConfigRepository({
        url: 'https://example.supabase.co',
        key: 'test-anon-key',
        fetchImpl: async (url) => {
            requestedUrl = String(url);
            return new Response(JSON.stringify([
                { key: 'crewart_survey_response_entry_a', value: '{"ok":true}' },
                { key: 'unrelated', value: 'must-be-filtered' }
            ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
    });
    const rows = await repository.listRowsByPrefix('crewart_survey_response_entry_', 25, 50);
    assert.deepEqual(rows.map((row) => row.key), ['crewart_survey_response_entry_a']);
    assert.match(requestedUrl, /select=key,value/);
    assert.match(requestedUrl, /key=like\.crewart_survey_response_entry_\*/);
    assert.match(requestedUrl, /limit=25/);
    assert.match(requestedUrl, /offset=50/);
    assert.doesNotMatch(requestedUrl, /select=\*/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCdcupRoundsApi, roundTwoFinalists } = require('../cdcup-rounds-api');

function groupsConfig() {
    return JSON.stringify({
        groups: [
            { code: 'A', name: 'A팀', members: ['A1', 'A2', 'A3', 'A4'] },
            { code: 'B', name: 'B팀', members: ['B1', 'B2', 'B3', 'B4'] },
            { code: 'C', name: 'C팀', members: ['C1', 'C2', 'C3', 'C4'] }
        ]
    });
}

function roundItems() {
    return ['A', 'B', 'C'].flatMap((code, groupIndex) => Array.from({ length: 4 }, (_, index) => ({
        id: groupIndex * 4 + index + 1,
        num: groupIndex * 4 + index + 1,
        company: `${code}${index + 1}`,
        status: '완료',
        sold_price: code === 'B' ? 30 : (code === 'C' ? 20 : 10),
        checklist: '_auction:tournament|_stage:8'
    })));
}

test('server-side round transition selects all members of the top two teams', () => {
    const finalists = roundTwoFinalists({
        active_tournament: '8',
        tournament_stage_groups_8: groupsConfig()
    }, roundItems());
    assert.deepEqual(finalists.map((entry) => entry.member), ['B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4']);
});

test('round transition archives before deleting and prepares an anonymous eight-person final', async () => {
    const calls = [];
    const items = roundItems();
    const configRows = [
        { key: 'active_tournament', value: '8' },
        { key: 'tournament_format', value: 'three-round-team-final' },
        { key: 'tournament_stage_groups_8', value: groupsConfig() },
        { key: 'auction_archive_index', value: '[]' }
    ];
    const repository = {
        async request(path, options = {}) {
            calls.push({ type: 'request', path, method: options.method || 'GET' });
            if (path.startsWith('items?select=')) return items;
            if (path.startsWith('parents?select=')) return [];
            if (path.startsWith('config?select=')) return configRows;
            if (path === 'items?id=gt.0' && options.method === 'DELETE') return null;
            throw new Error(`unexpected request ${path}`);
        },
        async upsertRows(rows) {
            calls.push({ type: 'upsert', rows });
        }
    };
    const api = createCdcupRoundsApi({ repository, isAdmin: async () => true });
    let status = 0;
    let body = '';
    const response = {
        writeHead(value) { status = value; },
        end(value) { body = Buffer.from(value || '').toString('utf8'); }
    };
    const handled = await api.handle({ method: 'POST', headers: {} }, response, new URL('https://example.test/api/cdcup/rounds/prepare-three'));
    const payload = JSON.parse(body);
    assert.equal(handled, true);
    assert.equal(status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.archive.itemCount, 12);
    assert.deepEqual(payload.finalists.map((entry) => entry.code), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const upsertIndex = calls.findIndex((call) => call.type === 'upsert');
    const deleteIndex = calls.findIndex((call) => call.path === 'items?id=gt.0');
    assert.ok(upsertIndex >= 0 && deleteIndex > upsertIndex);
    const written = Object.fromEntries(calls[upsertIndex].rows.map((row) => [row.key, row.value]));
    assert.equal(written.active_tournament, '4');
    assert.equal(written.bracket_full_blind, '1');
    assert.equal(JSON.parse(written.tournament_finalists_4).entrants.length, 8);
    assert.deepEqual(JSON.parse(written.tournament_round_amounts_8), {
        A1: 10, A2: 10, A3: 10, A4: 10,
        B1: 30, B2: 30, B3: 30, B4: 30,
        C1: 20, C2: 20, C3: 20, C4: 20
    });
});

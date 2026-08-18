'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCdcupRoundsApi, roundTwoFinalists, reseedRoundThreeFinalists, roundThreeAuctionItems } = require('../cdcup-rounds-api');

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
        sold_price: code === 'B' ? 40 - index * 5 : (code === 'C' ? 24 - index : 10),
        checklist: '_auction:tournament|_stage:8'
    })));
}

test('server-side round transition selects top-team members and seeds lowest individual total from A to H', () => {
    const finalists = roundTwoFinalists({
        active_tournament: '8',
        tournament_stage_groups_8: groupsConfig()
    }, roundItems());
    assert.deepEqual(finalists.map((entry) => entry.member), ['C4', 'C3', 'C2', 'C1', 'B4', 'B3', 'B2', 'B1']);
    assert.deepEqual(finalists.map((entry) => entry.anonymousCode), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    assert.deepEqual(finalists.map((entry) => entry.roundTwoAmount), [21, 22, 23, 24, 25, 30, 35, 40]);
});

test('saved round-three finalists can be reseeded from archived round-two totals', () => {
    const entrants = ['B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4'].map((member) => ({ member, code: member.charAt(0) }));
    const finalists = reseedRoundThreeFinalists({
        tournament_finalists_4: JSON.stringify({ entrants }),
        tournament_round_amounts_8: JSON.stringify({ B1: 40, B2: 35, B3: 30, B4: 25, C1: 24, C2: 23, C3: 22, C4: 21 })
    });
    assert.deepEqual(finalists.map((entry) => `${entry.anonymousCode}:${entry.member}`), [
        'A:C4', 'B:C3', 'C:C2', 'D:C1', 'E:B4', 'F:B3', 'G:B2', 'H:B1'
    ]);
});

test('round-three auction list is generated in A01-H01, A02-H02, A03-H03 order', () => {
    const finalists = ['렙소디', '디어렙 청주', '미야', '해치랩', '눈썹공룡', '디어렙 본점', '마리드', '베누스']
        .map((member) => ({ member }));
    const rows = roundThreeAuctionItems(finalists);
    assert.equal(rows.length, 24);
    assert.deepEqual(rows.slice(0, 8).map((row) => row.name), ['A01', 'B01', 'C01', 'D01', 'E01', 'F01', 'G01', 'H01']);
    assert.deepEqual(rows.slice(8, 16).map((row) => row.name), ['A02', 'B02', 'C02', 'D02', 'E02', 'F02', 'G02', 'H02']);
    assert.deepEqual(rows.slice(16).map((row) => row.name), ['A03', 'B03', 'C03', 'D03', 'E03', 'F03', 'G03', 'H03']);
    assert.deepEqual(rows.filter((row) => row.company === '렙소디').map((row) => row.name), ['A01', 'A02', 'A03']);
    assert.deepEqual(rows.filter((row) => row.company === '베누스').map((row) => row.name), ['H01', 'H02', 'H03']);
    assert.deepEqual(rows.map((row) => row.num), Array.from({ length: 24 }, (_, index) => index + 1));
});

test('public round state exposes broadcast fields without admin or archive secrets', async () => {
    const repository = {
        async request(path) {
            if (path.startsWith('items?select=')) return [{ id: 1, company: '업체A', status: '대기' }];
            if (path.startsWith('config?select=')) return [{ key: 'active_tournament', value: '4' }];
            throw new Error(`unexpected request ${path}`);
        },
        async upsertRows() {}
    };
    let status = 0;
    let body = '';
    const api = createCdcupRoundsApi({ repository, isAdmin: async () => false });
    const response = { writeHead(value) { status = value; }, end(value) { body = Buffer.from(value || '').toString('utf8'); } };
    await api.handle({ method: 'GET', headers: {} }, response, new URL('https://example.test/api/cdcup/rounds/public-state'));
    assert.equal(status, 200);
    assert.deepEqual(JSON.parse(body), {
        items: [{ id: 1, company: '업체A', status: '대기' }],
        config: { active_tournament: '4' }
    });
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
            if (path === 'items' && options.method === 'POST') {
                calls.at(-1).body = JSON.parse(options.body);
                return null;
            }
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
    assert.equal(payload.createdItems, 24);
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
        B1: 40, B2: 35, B3: 30, B4: 25,
        C1: 24, C2: 23, C3: 22, C4: 21
    });
    const insert = calls.find((call) => call.path === 'items' && call.method === 'POST');
    assert.ok(insert);
    assert.deepEqual(insert.body.map((row) => row.name), [
        'A01', 'B01', 'C01', 'D01', 'E01', 'F01', 'G01', 'H01',
        'A02', 'B02', 'C02', 'D02', 'E02', 'F02', 'G02', 'H02',
        'A03', 'B03', 'C03', 'D03', 'E03', 'F03', 'G03', 'H03'
    ]);
});

test('round-three recovery endpoint fills only missing slots and never mixes previous-round rows', async () => {
    const entrants = ['렙소디', '디어렙 청주', '미야', '해치랩', '눈썹공룡', '디어렙 본점', '마리드', '베누스']
        .map((member) => ({ member }));
    const planned = roundThreeAuctionItems(entrants);
    const inserts = [];
    const configRows = [
        { key: 'active_tournament', value: '4' },
        { key: 'tournament_finalists_4', value: JSON.stringify({ entrants }) },
        { key: 'tournament_round_amounts_8', value: JSON.stringify(Object.fromEntries(entrants.map((row, index) => [row.member, index + 1]))) }
    ];
    const repository = {
        async request(path, options = {}) {
            if (path.startsWith('items?select=')) return planned.slice(0, 2);
            if (path.startsWith('config?select=')) return configRows;
            if (path === 'items' && options.method === 'POST') {
                inserts.push(...JSON.parse(options.body));
                return null;
            }
            throw new Error(`unexpected request ${path}`);
        },
        async upsertRows() {}
    };
    const api = createCdcupRoundsApi({ repository, isAdmin: async () => true });
    let status = 0;
    let body = '';
    const response = { writeHead(value) { status = value; }, end(value) { body = Buffer.from(value || '').toString('utf8'); } };
    await api.handle({ method: 'POST', headers: {} }, response, new URL('https://example.test/api/cdcup/rounds/seed-three-items'));
    assert.equal(status, 200);
    assert.equal(JSON.parse(body).created, 22);
    assert.equal(inserts.length, 22);

    const mixedRepository = {
        async request(path) {
            if (path.startsWith('items?select=')) return [{ ...planned[0], checklist: '_auction:tournament|_stage:8|_slot:A1|_team:A' }];
            if (path.startsWith('config?select=')) return configRows;
            throw new Error(`unexpected request ${path}`);
        },
        async upsertRows() {}
    };
    const mixedApi = createCdcupRoundsApi({ repository: mixedRepository, isAdmin: async () => true });
    status = 0;
    body = '';
    await mixedApi.handle({ method: 'POST', headers: {} }, response, new URL('https://example.test/api/cdcup/rounds/seed-three-items'));
    assert.equal(status, 409);
    assert.match(JSON.parse(body).error, /이전 회차/);
});

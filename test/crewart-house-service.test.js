'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createCrewartHouseService,
    memberKeyForPhone,
    normalizeHouseKey
} = require('../crewart-house-service');

const SECRET = 'crewart-house-test-secret-longer-than-thirty-two-characters';

class MemoryConfigRepository {
    constructor() { this.rows = new Map(); }
    async getRowsByKeys(keys) {
        return keys.filter(key => this.rows.has(key)).map(key => ({ key, value: this.rows.get(key) }));
    }
    async upsertRows(rows) {
        rows.forEach(row => this.rows.set(row.key, row.value));
    }
}

test('survey house codes map to the four public auction colors', () => {
    assert.deepEqual(
        ['SF', 'ST', 'NT', 'NF'].map(normalizeHouseKey),
        ['R', 'G', 'B', 'Y']
    );
});

test('nonparticipants receive a stable privacy-safe random house', async () => {
    const repository = new MemoryConfigRepository();
    const service = createCrewartHouseService({ repository, secret: SECRET, now: () => 0 });
    const input = {
        channelId: 'crewart', itemId: 'item-1', phone: '010-4215-0831', winnerAlias: '배원직'
    };

    const first = await service.resolveWinnerAssignment(input);
    const second = await service.resolveWinnerAssignment({ ...input, itemId: 'item-2' });

    assert.match(first.houseKey, /^[RGBY]$/);
    assert.equal(first.source, 'random');
    assert.equal(second.houseKey, first.houseKey);
    assert.equal(repository.rows.size, 1);
    assert.doesNotMatch(JSON.stringify([...repository.rows]), /010|4215|0831|배원직/);
});

test('verified survey assignment replaces a prior random assignment for the same member', async () => {
    const repository = new MemoryConfigRepository();
    const service = createCrewartHouseService({ repository, secret: SECRET, now: () => 0 });
    const phone = '01012345678';
    const random = await service.resolveWinnerAssignment({ channelId: 'crewart', itemId: 'item-1', phone });
    assert.equal(random.source, 'random');

    const linked = await service.linkSurveyAssignment(memberKeyForPhone(phone, SECRET), 'NT', 'participant-safe-key');
    const resolved = await service.resolveWinnerAssignment({ channelId: 'crewart', itemId: 'item-2', phone });

    assert.equal(linked.houseKey, 'B');
    assert.equal(linked.source, 'survey');
    assert.equal(resolved.houseKey, 'B');
    assert.equal(resolved.source, 'survey');
});

test('live bidders resolve in one batch and reuse the same cached assignments', async () => {
    const repository = new MemoryConfigRepository();
    let reads = 0;
    let writes = 0;
    const originalRead = repository.getRowsByKeys.bind(repository);
    const originalWrite = repository.upsertRows.bind(repository);
    repository.getRowsByKeys = async (keys) => { reads += 1; return originalRead(keys); };
    repository.upsertRows = async (rows) => { writes += 1; return originalWrite(rows); };
    const service = createCrewartHouseService({ repository, secret: SECRET, now: () => 0 });
    const inputs = [
        { channelId: 'crewart', itemId: 'item-1', phone: '01011112222', winnerAlias: '첫번째' },
        { channelId: 'crewart', itemId: 'item-1', phone: '01033334444', winnerAlias: '두번째' },
        { channelId: 'crewart', itemId: 'item-1', phone: '01011112222', winnerAlias: '첫번째' }
    ];

    const first = await service.resolveBidderAssignments(inputs);
    const second = await service.resolveBidderAssignments(inputs);

    assert.equal(reads, 1);
    assert.equal(writes, 1);
    assert.equal(first[0].houseKey, first[2].houseKey);
    assert.deepEqual(second.map(row => row.houseKey), first.map(row => row.houseKey));
    assert.ok(first.every(row => /^[RGBY]$/.test(row.houseKey)));
});

test('a temporary assignment-store outage never blocks a sale', async () => {
    const repository = {
        async getRowsByKeys() { throw new Error('temporary outage'); },
        async upsertRows() { throw new Error('temporary outage'); }
    };
    const warnings = [];
    const service = createCrewartHouseService({
        repository, secret: SECRET, now: () => 0,
        logger: { warn(...args) { warnings.push(args.join(' ')); } }
    });

    const first = await service.resolveWinnerAssignment({
        channelId: 'crewart', itemId: 'item-1', phone: '01099998888'
    });
    const second = await service.resolveWinnerAssignment({
        channelId: 'crewart', itemId: 'item-2', phone: '01099998888'
    });

    assert.match(first.houseKey, /^[RGBY]$/);
    assert.equal(first.houseKey, second.houseKey);
    assert.equal(first.persisted, false);
    assert.ok(warnings.length >= 2);
});

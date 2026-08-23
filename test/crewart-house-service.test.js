'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createCrewartHouseService,
    memberKeyForPhone,
    normalizeHouseKey,
    deterministicWeightedHouse
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

test('weighted fallback never assigns the current leader and follows the 10/30/60 slots', () => {
    const counts = { R: 0, G: 0, B: 0, Y: 0 };
    for (let index = 0; index < 4000; index += 1) {
        counts[deterministicWeightedHouse(`viewer-${index}`, SECRET, { R: 0, G: 10, B: 30, Y: 60 })] += 1;
    }
    assert.equal(counts.R, 0);
    assert.ok(counts.G > 300 && counts.G < 500, JSON.stringify(counts));
    assert.ok(counts.B > 1050 && counts.B < 1350, JSON.stringify(counts));
    assert.ok(counts.Y > 2200 && counts.Y < 2600, JSON.stringify(counts));
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

test('a session locks survey assignments at broadcast start and never changes them mid-broadcast', async () => {
    const repository = new MemoryConfigRepository();
    let now = Date.parse('2026-08-21T09:00:00.000Z');
    const phone = '01012345678';
    const memberKey = memberKeyForPhone(phone, SECRET);
    const service = createCrewartHouseService({ repository, secret: SECRET, now: () => now });
    await service.linkSurveyAssignment(memberKey, 'R', 'survey-before-start');

    const session = { sessionId: 'broadcast-1', lockedAt: '2026-08-21T09:00:01.000Z' };
    now = Date.parse('2026-08-21T09:00:02.000Z');
    const first = await service.resolveWinnerAssignment({ ...session, channelId: 'crewart', phone });
    assert.equal(first.houseKey, 'R');
    assert.equal(first.source, 'survey');
    assert.equal(first.isNew, true);

    now = Date.parse('2026-08-21T09:00:03.000Z');
    await service.linkSurveyAssignment(memberKey, 'B', 'late-survey-edit');
    const later = await service.resolveWinnerAssignment({ ...session, channelId: 'crewart', phone });
    assert.equal(later.houseKey, 'R');
    assert.equal(later.source, 'survey');
    assert.equal(later.isNew, false);
});

test('a survey submitted after the cutoff cannot replace the session random house', async () => {
    const repository = new MemoryConfigRepository();
    let now = Date.parse('2026-08-21T09:00:02.000Z');
    const phone = '01077778888';
    const service = createCrewartHouseService({ repository, secret: SECRET, now: () => now });
    await service.linkSurveyAssignment(memberKeyForPhone(phone, SECRET), 'G', 'late-participant');

    const input = {
        sessionId: 'broadcast-cutoff', lockedAt: '2026-08-21T09:00:01.000Z',
        channelId: 'crewart', phone
    };
    const assigned = await service.resolveWinnerAssignment(input);
    assert.equal(assigned.source, 'random');
    assert.match(assigned.houseKey, /^[RGBY]$/);

    now += 60_000;
    await service.linkSurveyAssignment(memberKeyForPhone(phone, SECRET), 'Y', 'later-edit');
    const repeated = await service.resolveWinnerAssignment(input);
    assert.equal(repeated.houseKey, assigned.houseKey);
    assert.equal(repeated.source, 'random');
});

test('an operator correction replaces the current and future house once without replaying', async () => {
    const repository = new MemoryConfigRepository();
    let writes = 0;
    const upsert = repository.upsertRows.bind(repository);
    repository.upsertRows = async (rows) => { writes += 1; return upsert(rows); };
    const service = createCrewartHouseService({ repository, secret: SECRET, now: () => 1234 });
    const input = { channelId: 'crewart', itemId: 'A02', phone: '01053995774', assignmentSequence: 9 };
    const session = { sessionId: 'broadcast-live', lockedAt: '2026-08-23T11:14:12.000Z' };

    const random = await service.resolveWinnerAssignment({ ...input, ...session });
    assert.equal(random.source, 'random');
    const beforeCorrectionWrites = writes;
    const corrected = await service.overrideSessionAssignment(input, session, 'GREEN');
    const duplicate = await service.overrideSessionAssignment(input, session, 'G');
    const restarted = createCrewartHouseService({ repository, secret: SECRET, now: () => 5678 });
    const duplicateAfterRestart = await restarted.overrideSessionAssignment(input, session, 'G');
    const current = await service.resolveWinnerAssignment({ ...input, ...session });
    const future = await service.resolveWinnerAssignment({ ...input, sessionId: '', lockedAt: '', itemId: 'A03' });

    assert.equal(corrected.houseKey, 'G');
    assert.equal(corrected.source, 'survey');
    assert.equal(current.houseKey, 'G');
    assert.equal(future.houseKey, 'G');
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicateAfterRestart.duplicate, true);
    assert.equal(writes, beforeCorrectionWrites + 1);
    assert.doesNotMatch(JSON.stringify([...repository.rows]), /01053995774/);
});

test('session assignments survive a service restart and a new broadcast gets an isolated draw', async () => {
    const repository = new MemoryConfigRepository();
    const input = { channelId: 'crewart', winnerAlias: 'band-user-stable' };
    const firstService = createCrewartHouseService({ repository, secret: SECRET, now: () => 1000 });
    const first = await firstService.resolveWinnerAssignment({
        ...input, sessionId: 'broadcast-a', lockedAt: '1970-01-01T00:00:00.500Z'
    });
    assert.equal(first.isNew, true);

    const restarted = createCrewartHouseService({ repository, secret: SECRET, now: () => 2000 });
    const restored = await restarted.resolveWinnerAssignment({
        ...input, sessionId: 'broadcast-a', lockedAt: '1970-01-01T00:00:00.500Z'
    });
    const nextBroadcast = await restarted.resolveWinnerAssignment({
        ...input, sessionId: 'broadcast-b', lockedAt: '1970-01-01T00:00:01.500Z'
    });

    assert.equal(restored.houseKey, first.houseKey);
    assert.equal(restored.isNew, false);
    assert.equal(nextBroadcast.isNew, true);
    assert.notEqual(nextBroadcast.key, restored.key);
});

test('session assignment lookup fails closed instead of silently randomizing a surveyed bidder', async () => {
    const service = createCrewartHouseService({
        repository: {
            async getRowsByKeys() { throw new Error('assignment store offline'); },
            async upsertRows() { throw new Error('must not write'); }
        },
        secret: SECRET,
        logger: { warn() {} }
    });
    await assert.rejects(
        service.resolveWinnerAssignment({
            sessionId: 'broadcast-fail-closed', lockedAt: new Date().toISOString(),
            channelId: 'crewart', winnerAlias: 'unknown'
        }),
        /assignment store offline/
    );
});

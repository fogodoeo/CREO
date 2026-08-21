'use strict';

const crypto = require('node:crypto');
const { normalizePhone } = require('./band-membership');

const HOUSE_KEYS = Object.freeze(['R', 'G', 'B', 'Y']);
const ASSIGNMENT_PREFIX = 'crewart_house_assignment_v1_';
const SESSION_ASSIGNMENT_PREFIX = 'crewart_house_session_assignment_v1_';

function clean(value, max = 120) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeHouseKey(value) {
    const key = clean(value, 8).toUpperCase();
    const aliases = {
        RED: 'R', GREEN: 'G', BLUE: 'B', YELLOW: 'Y',
        SF: 'R', ST: 'G', NT: 'B', NF: 'Y'
    };
    return HOUSE_KEYS.includes(key) ? key : (aliases[key] || '');
}

function memberKeyForPhone(phone, secret) {
    const normalized = normalizePhone(phone);
    if (!normalized || String(secret || '').length < 32) return '';
    return `member_${crypto.createHmac('sha256', secret)
        .update(`band-phone:${normalized}`)
        .digest('base64url')
        .slice(0, 32)}`;
}

function assignmentIdentity(input = {}, secret = '') {
    const memberKey = clean(input.memberKey, 80) || memberKeyForPhone(input.phone, secret);
    if (memberKey) return `member:${memberKey}`;
    const alias = clean(input.winnerAlias || input.winnerName, 80)
        .toLowerCase()
        .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/gi, '');
    if (alias) return `alias:${clean(input.channelId, 40)}:${alias}`;
    return `item:${clean(input.channelId, 40)}:${clean(input.itemId, 80)}`;
}

function identityHash(identity, secret) {
    return crypto.createHmac('sha256', String(secret || 'crewart-house-assignment'))
        .update(String(identity || ''))
        .digest('hex');
}

function assignmentKey(identity, secret) {
    return ASSIGNMENT_PREFIX + identityHash(identity, secret).slice(0, 40);
}

function sessionAssignmentKey(sessionId, identity, secret) {
    return SESSION_ASSIGNMENT_PREFIX + identityHash(
        `session:${clean(sessionId, 80)}:${identity}`,
        secret
    ).slice(0, 40);
}

function deterministicRandomHouse(identity, secret) {
    const digest = Buffer.from(identityHash(identity, secret), 'hex');
    return HOUSE_KEYS[digest.readUInt32BE(0) % HOUSE_KEYS.length];
}

function timestampMs(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function createCrewartHouseService({ repository, secret, now = () => Date.now(), logger = console } = {}) {
    if (!repository) throw new Error('repository is required');
    const assignmentSecret = String(secret || '');
    const assignmentCache = new Map();
    const sessionAssignmentCache = new Map();

    function assignmentFromRow(row, identity) {
        if (!row?.value) return null;
        try {
            const parsed = JSON.parse(row.value);
            const houseKey = normalizeHouseKey(parsed.houseKey);
            if (!houseKey) return null;
            const assignment = { ...parsed, houseKey, key: row.key };
            assignmentCache.set(identity, assignment);
            return assignment;
        } catch (_) {
            return null;
        }
    }

    async function read(identity) {
        if (assignmentCache.has(identity)) return assignmentCache.get(identity);
        const key = assignmentKey(identity, assignmentSecret);
        const rows = await repository.getRowsByKeys([key]);
        return assignmentFromRow(rows?.[0], identity);
    }

    async function write(identity, assignment) {
        const key = assignmentKey(identity, assignmentSecret);
        const value = {
            version: 1,
            houseKey: normalizeHouseKey(assignment.houseKey),
            source: assignment.source === 'survey' ? 'survey' : 'random',
            participantKey: clean(assignment.participantKey, 48),
            updatedAt: new Date(now()).toISOString()
        };
        if (!value.houseKey) throw new Error('valid house key is required');
        await repository.upsertRows([{ key, value: JSON.stringify(value) }]);
        const saved = { ...value, key };
        assignmentCache.set(identity, saved);
        return saved;
    }

    function sessionCacheKey(sessionId, identity) {
        return `${clean(sessionId, 80)}\n${identity}`;
    }

    function sessionAssignmentFromRow(row, sessionId, identity) {
        if (!row?.value) return null;
        try {
            const parsed = JSON.parse(row.value);
            const houseKey = normalizeHouseKey(parsed.houseKey);
            if (!houseKey || clean(parsed.sessionId, 80) !== clean(sessionId, 80)) return null;
            const assignment = { ...parsed, houseKey, key: row.key };
            sessionAssignmentCache.set(sessionCacheKey(sessionId, identity), assignment);
            return assignment;
        } catch (_) {
            return null;
        }
    }

    async function resolveSessionAssignments(inputs = [], session = {}) {
        const sessionId = clean(session.sessionId, 80);
        const lockedAt = clean(session.lockedAt, 80);
        if (!sessionId) throw new Error('active audience session is required');

        const entries = (Array.isArray(inputs) ? inputs : []).map((input) => {
            const identity = assignmentIdentity(input, assignmentSecret);
            return {
                input,
                identity,
                cacheKey: sessionCacheKey(sessionId, identity),
                key: sessionAssignmentKey(sessionId, identity, assignmentSecret),
                surveyKey: assignmentKey(identity, assignmentSecret)
            };
        });
        const newInCall = new Set();
        const unique = new Map(entries.map((entry) => [entry.identity, entry]));
        const unresolved = [...unique.values()].filter((entry) => !sessionAssignmentCache.has(entry.cacheKey));

        if (unresolved.length) {
            let storedRows = [];
            try {
                storedRows = await repository.getRowsByKeys(unresolved.map((entry) => entry.key));
            } catch (error) {
                logger.warn?.('[crewart-house] session assignment lookup unavailable; refusing a new assignment', error?.message || error);
                throw error;
            }
            const storedByKey = new Map((storedRows || []).map((row) => [row.key, row]));
            unresolved.forEach((entry) => sessionAssignmentFromRow(storedByKey.get(entry.key), sessionId, entry.identity));

            const missing = unresolved.filter((entry) => !sessionAssignmentCache.has(entry.cacheKey));
            if (missing.length) {
                let surveyRows = [];
                try {
                    surveyRows = await repository.getRowsByKeys(missing.map((entry) => entry.surveyKey));
                } catch (error) {
                    logger.warn?.('[crewart-house] survey assignment lookup unavailable; refusing a random fallback', error?.message || error);
                    throw error;
                }
                const surveyByKey = new Map((surveyRows || []).map((row) => [row.key, row]));
                const assignedAt = new Date(now()).toISOString();
                const pending = missing.map((entry) => {
                    let survey = null;
                    try { survey = JSON.parse(surveyByKey.get(entry.surveyKey)?.value || 'null'); } catch (_) { survey = null; }
                    const surveyHouse = normalizeHouseKey(survey?.houseKey);
                    const surveyBeforeLock = survey?.source === 'survey'
                        && surveyHouse
                        && (!timestampMs(lockedAt) || (timestampMs(survey.updatedAt) && timestampMs(survey.updatedAt) <= timestampMs(lockedAt)));
                    const value = {
                        version: 1,
                        sessionId,
                        houseKey: surveyBeforeLock
                            ? surveyHouse
                            : deterministicRandomHouse(`session:${sessionId}:${entry.identity}`, assignmentSecret),
                        source: surveyBeforeLock ? 'survey' : 'random',
                        participantKey: surveyBeforeLock ? clean(survey.participantKey, 48) : '',
                        assignedAt,
                        lockedAt,
                        assignmentSequence: Math.max(0, Number.parseInt(entry.input?.assignmentSequence, 10) || 0)
                    };
                    return { ...entry, value, row: { key: entry.key, value: JSON.stringify(value) } };
                });
                let persisted = true;
                try {
                    await repository.upsertRows(pending.map((entry) => entry.row));
                } catch (error) {
                    persisted = false;
                    logger.warn?.('[crewart-house] session assignment persistence unavailable; using deterministic fallback', error?.message || error);
                }
                pending.forEach((entry) => sessionAssignmentCache.set(entry.cacheKey, {
                    ...entry.value,
                    key: entry.key,
                    ...(persisted ? {} : { persisted: false })
                }));
                pending.forEach((entry) => newInCall.add(entry.cacheKey));
            }
        }

        return entries.map((entry) => ({
            ...sessionAssignmentCache.get(entry.cacheKey),
            isNew: newInCall.has(entry.cacheKey)
        }));
    }

    async function linkSurveyAssignment(memberKey, houseKey, participantKey = '') {
        const identity = assignmentIdentity({ memberKey }, assignmentSecret);
        if (!clean(memberKey, 80) || !normalizeHouseKey(houseKey)) return null;
        return write(identity, { houseKey, participantKey, source: 'survey' });
    }

    async function resolveWinnerAssignment(input = {}) {
        if (clean(input.sessionId, 80)) {
            const [assignment] = await resolveSessionAssignments([input], {
                sessionId: input.sessionId,
                lockedAt: input.lockedAt
            });
            return assignment;
        }
        const identity = assignmentIdentity(input, assignmentSecret);
        let existing = null;
        try {
            existing = await read(identity);
        } catch (error) {
            logger.warn?.('[crewart-house] assignment lookup unavailable; using stable fallback', error?.message || error);
        }
        if (existing) return existing;
        const houseKey = deterministicRandomHouse(identity, assignmentSecret);
        try {
            return await write(identity, { houseKey, source: 'random' });
        } catch (error) {
            logger.warn?.('[crewart-house] assignment persistence unavailable; sale can continue', error?.message || error);
            return {
                version: 1,
                houseKey,
                source: 'random',
                participantKey: '',
                updatedAt: new Date(now()).toISOString(),
                key: assignmentKey(identity, assignmentSecret),
                persisted: false
            };
        }
    }

    async function resolveBidderAssignments(inputs = []) {
        const sessionId = clean(inputs?.[0]?.sessionId, 80);
        if (sessionId) {
            return resolveSessionAssignments(inputs, {
                sessionId,
                lockedAt: inputs?.[0]?.lockedAt
            });
        }
        const entries = (Array.isArray(inputs) ? inputs : []).map((input) => {
            const identity = assignmentIdentity(input, assignmentSecret);
            return { input, identity, key: assignmentKey(identity, assignmentSecret) };
        });
        const unique = new Map(entries.map((entry) => [entry.identity, entry]));
        const unresolved = [...unique.values()].filter((entry) => !assignmentCache.has(entry.identity));

        if (unresolved.length) {
            let storedRows = [];
            try {
                storedRows = await repository.getRowsByKeys(unresolved.map((entry) => entry.key));
            } catch (error) {
                logger.warn?.('[crewart-house] bidder assignment lookup unavailable; using stable fallback', error?.message || error);
            }
            const storedByKey = new Map((storedRows || []).map((row) => [row.key, row]));
            unresolved.forEach((entry) => assignmentFromRow(storedByKey.get(entry.key), entry.identity));

            const missing = unresolved.filter((entry) => !assignmentCache.has(entry.identity));
            if (missing.length) {
                const pending = missing.map((entry) => {
                    const value = {
                        version: 1,
                        houseKey: deterministicRandomHouse(entry.identity, assignmentSecret),
                        source: 'random',
                        participantKey: '',
                        updatedAt: new Date(now()).toISOString()
                    };
                    return { ...entry, value, row: { key: entry.key, value: JSON.stringify(value) } };
                });
                let persisted = true;
                try {
                    await repository.upsertRows(pending.map((entry) => entry.row));
                } catch (error) {
                    persisted = false;
                    logger.warn?.('[crewart-house] bidder assignment persistence unavailable; broadcast can continue', error?.message || error);
                }
                pending.forEach((entry) => assignmentCache.set(entry.identity, {
                    ...entry.value,
                    key: entry.key,
                    ...(persisted ? {} : { persisted: false })
                }));
            }
        }

        return entries.map((entry) => assignmentCache.get(entry.identity));
    }

    return Object.freeze({
        linkSurveyAssignment,
        resolveBidderAssignments,
        resolveSessionAssignments,
        resolveWinnerAssignment
    });
}

module.exports = {
    ASSIGNMENT_PREFIX,
    HOUSE_KEYS,
    SESSION_ASSIGNMENT_PREFIX,
    assignmentIdentity,
    assignmentKey,
    createCrewartHouseService,
    deterministicRandomHouse,
    memberKeyForPhone,
    normalizeHouseKey,
    sessionAssignmentKey
};

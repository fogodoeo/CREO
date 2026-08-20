'use strict';

const crypto = require('node:crypto');
const { normalizePhone } = require('./band-membership');

const HOUSE_KEYS = Object.freeze(['R', 'G', 'B', 'Y']);
const ASSIGNMENT_PREFIX = 'crewart_house_assignment_v1_';

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

function deterministicRandomHouse(identity, secret) {
    const digest = Buffer.from(identityHash(identity, secret), 'hex');
    return HOUSE_KEYS[digest.readUInt32BE(0) % HOUSE_KEYS.length];
}

function createCrewartHouseService({ repository, secret, now = () => Date.now(), logger = console } = {}) {
    if (!repository) throw new Error('repository is required');
    const assignmentSecret = String(secret || '');

    async function read(identity) {
        const key = assignmentKey(identity, assignmentSecret);
        const rows = await repository.getRowsByKeys([key]);
        const row = rows?.[0];
        if (!row?.value) return null;
        try {
            const parsed = JSON.parse(row.value);
            const houseKey = normalizeHouseKey(parsed.houseKey);
            return houseKey ? { ...parsed, houseKey, key } : null;
        } catch (_) {
            return null;
        }
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
        return { ...value, key };
    }

    async function linkSurveyAssignment(memberKey, houseKey, participantKey = '') {
        const identity = assignmentIdentity({ memberKey }, assignmentSecret);
        if (!clean(memberKey, 80) || !normalizeHouseKey(houseKey)) return null;
        return write(identity, { houseKey, participantKey, source: 'survey' });
    }

    async function resolveWinnerAssignment(input = {}) {
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

    return Object.freeze({ linkSurveyAssignment, resolveWinnerAssignment });
}

module.exports = {
    ASSIGNMENT_PREFIX,
    HOUSE_KEYS,
    assignmentIdentity,
    assignmentKey,
    createCrewartHouseService,
    deterministicRandomHouse,
    memberKeyForPhone,
    normalizeHouseKey
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../public/auction-contract');

test('auction status aliases normalize to one canonical lifecycle', () => {
    for (const value of ['낙찰', '낙찰-대기', '낙찰-입금완료', '완료', 'sold']) {
        assert.equal(contract.normalizeStatus(value), contract.STATUS.SOLD, value);
        assert.equal(contract.isSoldStatus(value), true, value);
        assert.equal(contract.isTerminalStatus(value), true, value);
    }
    for (const value of ['진행', '진행중', '경매중', 'active', 'live']) {
        assert.equal(contract.normalizeStatus(value), contract.STATUS.LIVE, value);
        assert.equal(contract.isLiveStatus(value), true, value);
        assert.equal(contract.isTerminalStatus(value), false, value);
    }
    for (const value of ['유찰', 'unsold', 'passed']) {
        assert.equal(contract.normalizeStatus(value), contract.STATUS.PASSED, value);
        assert.equal(contract.isTerminalStatus(value), true, value);
    }
    for (const value of ['취소', 'cancelled', 'canceled']) {
        assert.equal(contract.normalizeStatus(value), contract.STATUS.CANCELLED, value);
        assert.equal(contract.isTerminalStatus(value), true, value);
    }
});

test('auction amount and checklist parsing are shared across server and browser', () => {
    assert.equal(contract.parseAmount('1,234.5만원'), 1234.5);
    assert.equal(contract.parseAmount(''), 0);
    assert.deepEqual(contract.checklistMeta({
        num: 17,
        checklist: '_auction:tournament|_label:17|_stage:4|_slot:A3|_team:A'
    }), {
        auctionType: 'tournament',
        visibilityMode: '',
        tournamentCode: 'A3',
        teamCode: 'A',
        tournamentStage: 4,
        publicNumber: 17
    });
});

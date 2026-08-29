'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BasicDice = require('../public/basic-dice-core');
const { DEFAULT_CHANNELS } = require('../platform-core');

test('contribution totals use the frozen dice contribution for sold parity items', () => {
    const totals = BasicDice.contributionTotals([
        { status: 'sold', soldPrice: 10, attributes: { audience_group_key: 'odd', audience_contribution_amount: 40 } },
        { status: 'sold', soldPrice: 50, attributes: { audience_group_key: 'even', audience_contribution_amount: 100 } },
        { status: 'live', soldPrice: 999, attributes: { audience_group_key: 'odd', audience_contribution_amount: 999 } },
        { status: 'sold', soldPrice: 999, attributes: { audience_group_key: 'unknown', audience_contribution_amount: 999 } }
    ]);
    assert.deepEqual(totals, { odd: 40, even: 100 });
});

test('dice stays uniform for the leading or tied team and gradually favors high faces for the trailing team', () => {
    const tied = BasicDice.balancedDiceWeights('odd', { odd: 100, even: 100 });
    tied.forEach((weight) => assert.ok(Math.abs(weight - 100 / 6) < 1e-9));

    const halfDeficit = BasicDice.balancedDiceWeights('odd', { odd: 50, even: 100 });
    const fullDeficit = BasicDice.balancedDiceWeights('odd', { odd: 0, even: 100 });
    assert.deepEqual(fullDeficit, [8, 10, 13, 18, 23, 28]);
    assert.ok(halfDeficit[0] < tied[0]);
    assert.ok(halfDeficit[5] > tied[5]);
    assert.ok(halfDeficit[5] < fullDeficit[5]);
    assert.ok(Math.abs(fullDeficit.reduce((sum, value) => sum + value, 0) - 100) < 1e-9);

    const atEightyPercent = (maximum) => Math.floor(maximum * 0.8);
    assert.equal(BasicDice.chooseBalancedDiceFace('odd', { odd: 100, even: 100 }, atEightyPercent), 5);
    assert.equal(BasicDice.chooseBalancedDiceFace('odd', { odd: 0, even: 100 }, atEightyPercent), 6);
});

test('P3 ranks the higher parity team left and changes number direction by screen position', () => {
    const odd = { group: { id: 'odd', sortOrder: 1 }, points: 210 };
    const even = { group: { id: 'even', sortOrder: 2 }, points: 350 };
    assert.deepEqual(BasicDice.rankParityGroups([odd, even]).map((row) => row.group.id), ['even', 'odd']);
    assert.equal(BasicDice.scoreFirstAt(0), false, 'left card renders team name before score');
    assert.equal(BasicDice.scoreFirstAt(1), true, 'right card renders score before team name');
    assert.deepEqual(BasicDice.rankParityGroups([{ ...odd, points: 0 }, { ...even, points: 0 }]).map((row) => row.group.id), ['odd', 'even']);
});

test('BASIC P1 and P2 share ticker content and render the NOTICE badge', () => {
    const basic = DEFAULT_CHANNELS.find((channel) => channel.id === 'basic');
    const live = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-live.html'), 'utf8');
    const control = fs.readFileSync(path.join(__dirname, '..', 'public', 'auction-control.html'), 'utf8');
    assert.equal(basic.broadcastDefaults.page1Ticker, basic.broadcastDefaults.page2Ticker);
    assert.match(live, /c\.broadcastProfile==='basic-dice'\?'NOTICE'/);
    assert.match(live, /function pageTicker\(c,s,pageNo\)/);
    assert.match(control, /P1·P2 공통 순환 자막/);
    assert.match(control, /next\.page2Ticker=next\.page1Ticker/);
    assert.match(control, /syncBasicTickerFields\(event\.target\.name\)/);
});

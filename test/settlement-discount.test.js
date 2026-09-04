'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Discount = require('../public/settlement-discount');

const item = (house, amount, extra = {}) => ({
    soldAmountWon: amount,
    attributes: { crewart_house_key: house },
    ...extra
});

test('winning house receives ten percent off auction amounts but never shipping', () => {
    const allItems = [item('R', 200000), item('B', 150000), item('R', 100000)];
    const result = Discount.calculate(
        { enabled: true, rule: 'winner-house', ratePercent: 10, excludeShipping: true },
        [allItems[0], allItems[2]],
        allItems
    );
    assert.equal(result.winningKey, 'R');
    assert.equal(result.originalAmount, 300000);
    assert.equal(result.discountAmount, 30000);
    assert.equal(result.payableAuctionAmount, 270000);
    assert.equal(result.payableAuctionAmount + 5000, 275000);
});

test('non-winning house and disabled policies never discount settlement', () => {
    const allItems = [item('R', 200000), item('B', 150000)];
    assert.equal(Discount.calculate({ enabled: true, rule: 'winner-house', ratePercent: 10 }, [allItems[1]], allItems).discountAmount, 0);
    assert.equal(Discount.calculate({ enabled: false, rule: 'winner-house', ratePercent: 10 }, [allItems[0]], allItems).discountAmount, 0);
});

test('missing competition identity never becomes an empty winning key discount', () => {
    const unassigned = [item('', 100000), item('', 200000)];
    const result = Discount.calculate(
        { enabled: true, rule: 'winner-house', ratePercent: 10 },
        unassigned,
        unassigned
    );
    assert.equal(result.winningKey, '');
    assert.equal(result.eligibleAmount, 0);
    assert.equal(result.discountAmount, 0);
    assert.equal(result.payableAuctionAmount, 300000);
});

test('ties follow the configured house order and vendor or buyer rules remain reusable', () => {
    const tied = [item('Y', 100000), item('G', 100000)];
    assert.equal(Discount.calculate({ enabled: true, rule: 'winner-house', ratePercent: 10 }, tied, tied).winningKey, 'G');
    const vendors = [item('', 200000, { company: '업체A' }), item('', 300000, { company: '업체B' })];
    assert.equal(Discount.calculate({ enabled: true, rule: 'top-vendor', ratePercent: 5 }, [vendors[1]], vendors).discountAmount, 15000);
    const buyers = [item('', 100000, { winner: '가' }), item('', 250000, { winner: '나' })];
    assert.equal(Discount.calculate({ enabled: true, rule: 'top-buyer', ratePercent: 20 }, [buyers[1]], buyers).discountAmount, 50000);
});

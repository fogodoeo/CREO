'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Summary = require('../public/print-shipping-summary');

function sold(overrides = {}) {
    return {
        name: 'A01', company: '라이언게코', sold_amount_won: 100000,
        _winner: { name: '김미옥', phone: '01012345678' },
        shipping_type: '배송', shipping_company: '파르게', shipping_region: '수도권 (화성점)',
        shipping_cost: 0, buyer_submitted_at: '2026-08-31T00:00:00.000Z',
        payment_status: 'awaiting_payment', payment_method: 'bank_transfer',
        payment_requested_amount: 326000, payment_confirmed_amount: 0,
        ...overrides
    };
}

test('print settlement groups one buyer and vendor into one combined-shipping row', () => {
    const rows = Summary.groupBundles([
        sold({ name: 'A01', sold_amount_won: 100000, shipping_cost: 26000, payment_status: 'paid', payment_confirmed_amount: 326000 }),
        sold({ name: 'A02', sold_amount_won: 200000, payment_status: 'paid', payment_confirmed_amount: 326000 })
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].combined, true);
    assert.equal(rows[0].itemSummary, 'A01 · A02');
    assert.equal(rows[0].soldAmountWon, 300000);
    assert.equal(rows[0].shippingCost, 26000);
    assert.equal(rows[0].paymentState, 'paid');
    assert.equal(rows[0].inputLabel, '입력 완료');
});

test('same buyer remains separated by vendor and missing shipping is obvious', () => {
    const rows = Summary.groupBundles([
        sold(),
        sold({ company: '다른업체', name: 'B01', shipping_type: '', shipping_company: '', shipping_region: '', buyer_submitted_at: '', payment_status: '', payment_method: '' })
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].company, '다른업체');
    assert.equal(rows[0].inputState, 'waiting');
    assert.equal(rows[0].paymentLabel, '배송 미입력');
});

test('additional payment has priority and sheet export keeps raw numeric amounts', () => {
    const rows = Summary.groupBundles([
        sold({ shipping_cost: 26000, payment_status: 'paid', payment_confirmed_amount: 300000 }),
        sold({ name: 'A02', payment_status: 'additional_payment', payment_confirmed_amount: 300000 })
    ]);
    assert.equal(rows[0].paymentState, 'additional_payment');
    const sheet = Summary.sheetRows(rows);
    assert.equal(sheet[0][7], '배송비');
    assert.equal(sheet[1][7], 26000);
    assert.equal(sheet[1][11], '추가 결제');
    assert.equal(sheet[1][14], '2026-08-31 09:00');
});

test('sheet input time is always formatted in Korea Standard Time', () => {
    assert.equal(Summary.formatKoreanDateTime('2026-08-31T14:59:00.000Z'), '2026-08-31 23:59');
    assert.equal(Summary.formatKoreanDateTime('2026-08-31T15:01:00.000Z'), '2026-09-01 00:01');
    assert.equal(Summary.formatKoreanDateTime(''), '');
});

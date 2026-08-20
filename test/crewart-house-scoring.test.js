'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AuctionContract = require('../public/auction-contract');

function loadModule() {
    const window = {
        CreoAuctionContract: AuctionContract,
        location: { search: '?module=crewart' }
    };
    vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, '..', 'public', 'event-modules.js'), 'utf8'),
        { window, URLSearchParams }
    );
    return window;
}

test('P3 totals use the frozen winning viewer color, never the item or vendor group', () => {
    const module = loadModule();
    const config = {
        crewart_score_scope: 'all',
        crewart_participants: '설문참여자|GREEN'
    };
    const items = [
        {
            id: 'blue-win', status: 'sold', groupId: 'red', sold_price: 10,
            attributes: { crewart_house_key: 'B' }, winner: '배원직'
        },
        {
            id: 'yellow-win', status: '낙찰', teamName: 'GREEN', soldPrice: 7,
            crewartHouseKey: 'Y', winner: '로이'
        },
        { id: 'legacy-survey', status: 'sold', sold_price: 5, winner: '설문참여자' },
        { id: 'waiting', status: 'waiting', sold_price: 99, crewartHouseKey: 'R' }
    ];

    const result = module.buildCrewartHouseScores(items, config);
    const byName = Object.fromEntries(result.houses.map(row => [row.name, row]));
    assert.equal(byName.BLUE.amount, 10);
    assert.equal(byName.YELLOW.amount, 7);
    assert.equal(byName.GREEN.amount, 5);
    assert.equal(byName.RED.amount, 0);
    assert.equal(result.unassigned.length, 0);
    assert.equal(result.houses[0].name, 'BLUE');
});

test('P3 board presents sold amount totals and assignment rules without legacy points', () => {
    const module = loadModule();
    const html = module.renderCrewartHouseBoardHTML([
        { status: 'sold', sold_price: 18, crewartHouseKey: 'R', winner: '낙찰자' }
    ], { crewart_score_scope: 'all' });

    assert.match(html, /팀별 낙찰금 합계/);
    assert.match(html, /설문 배정 · 미참여 랜덤/);
    assert.match(html, /18<small>만원<\/small>/);
    assert.match(html, /낙찰 1건/);
    assert.doesNotMatch(html, /POINTS|기숙사 미지정/);
});

test('P3 gives tied houses the same rank and does not highlight an empty leader', () => {
    const module = loadModule();
    const result = module.buildCrewartHouseScores([], { crewart_score_scope: 'all' });
    assert.deepEqual(Array.from(result.houses, row => row.rank), [1, 1, 1, 1]);
    const html = module.renderCrewartHouseBoardHTML([], { crewart_score_scope: 'all' });
    assert.doesNotMatch(html, /is-leading/);
});

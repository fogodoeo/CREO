'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AuctionContract = require('../public/auction-contract');
const BroadcastBridge = require('../public/channel-broadcast-bridge');

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

test('P3 includes only the current live highest bid and moves it between houses without double counting', () => {
    const module = loadModule();
    const config = { crewart_score_scope: 'all' };
    const sold = {
        id: 'sold-blue', status: 'sold', sold_price: 10, crewartHouseKey: 'B',
        bid_log: JSON.stringify([{ amount: 10, crewart_house_key: 'B' }])
    };
    const live = {
        id: 'live-one', status: 'live', sold_price: 0,
        bid_log: JSON.stringify([
            { name: '초록 입찰자', amount: 12, crewart_house_key: 'G' },
            { name: '빨강 입찰자', amount: 11, crewart_house_key: 'R' }
        ])
    };

    const first = module.buildCrewartHouseScores([sold, live], config);
    const firstByName = Object.fromEntries(first.houses.map(row => [row.name, row.amount]));
    assert.equal(firstByName.BLUE, 10);
    assert.equal(firstByName.GREEN, 12);
    assert.equal(firstByName.RED, 0);

    live.bid_log = JSON.stringify([
        { name: '파랑 입찰자', amount: 14, crewart_house_key: 'B' },
        { name: '초록 입찰자', amount: 12, crewart_house_key: 'G' }
    ]);
    const moved = module.buildCrewartHouseScores([sold, live], config);
    const movedByName = Object.fromEntries(moved.houses.map(row => [row.name, row.amount]));
    assert.equal(movedByName.BLUE, 24);
    assert.equal(movedByName.GREEN, 0);

    live.status = 'sold';
    live.sold_price = 14;
    live.crewartHouseKey = 'B';
    const finalized = module.buildCrewartHouseScores([sold, live], config);
    const finalizedByName = Object.fromEntries(finalized.houses.map(row => [row.name, row.amount]));
    assert.equal(finalizedByName.BLUE, 24);
});

test('P3 uses the public won amount for platform live bids without changing the legacy amount field', () => {
    const module = loadModule();
    const item = {
        id: 'platform-live', status: 'live',
        bidLog: [{ name: '입찰자', amount: 15, amount_won: 150000, crewart_house_key: 'R' }]
    };
    const result = module.buildCrewartHouseScores([item], { crewart_score_scope: 'all' });
    const red = result.houses.find(row => row.name === 'RED');
    assert.equal(red.amount, 150000);
    assert.equal(item.bidLog[0].amount, 15);
});

test('P3 uses contribution only after reveal while sold price remains unchanged', () => {
    const module = loadModule();
    const item = {
        id: 'roulette-red', status: 'sold', soldPrice: 150000, crewartHouseKey: 'R',
        attributes: {
            crewart_house_key: 'R',
            crewart_contribution_base: 150000,
            crewart_contribution_multiplier: 2,
            crewart_contribution_amount: 300000,
            crewart_contribution_effective_at: new Date(Date.now() + 60000).toISOString(),
            crewart_roulette_status: 'completed'
        }
    };
    let result = module.buildCrewartHouseScores([item], { crewart_score_scope: 'all' });
    assert.equal(result.houses.find(row => row.name === 'RED').amount, 150000);
    assert.equal(item.soldPrice, 150000);

    item.attributes.crewart_contribution_effective_at = new Date(Date.now() - 1000).toISOString();
    result = module.buildCrewartHouseScores([item], { crewart_score_scope: 'all' });
    assert.equal(result.houses.find(row => row.name === 'RED').amount, 300000);
    assert.equal(item.soldPrice, 150000);
});

test('P3 keeps a bridged one-manwon sold item at one before roulette reveal', () => {
    const module = loadModule();
    const item = BroadcastBridge.toLegacyItem({
        id: 'buy-now-yellow',
        status: 'sold',
        soldPrice: 10_000,
        attributes: {
            crewart_house_key: 'Y',
            crewart_roulette_status: 'unused',
            crewart_contribution_effective_at: ''
        }
    }, 'crewart');

    const result = module.buildCrewartHouseScores([item], { crewart_score_scope: 'all' });
    assert.equal(result.houses.find(row => row.name === 'YELLOW').amount, 10_000);
    const html = module.renderCrewartHouseBoardHTML([item], { crewart_score_scope: 'all' });
    assert.match(html, /data-house="Y"[\s\S]*?<strong class="crewart-house-score">1<\/strong>/);
});

test('P3 board presents only four house cards and their amount numbers', () => {
    const module = loadModule();
    const html = module.renderCrewartHouseBoardHTML([
        { status: 'sold', sold_price: 10_000_000, crewartHouseKey: 'R', winner: '낙찰자' }
    ], { crewart_score_scope: 'all' });

    assert.equal((html.match(/class="crewart-house-card"/g) || []).length, 4);
    assert.match(html, /<strong class="crewart-house-score">1,000<\/strong>/);
    assert.match(html, /data-house="Y"[^>]*--house:#80631f;--house-ink:#fff0c8;/);
    const threeManwon = module.renderCrewartHouseBoardHTML([
        { status: 'sold', sold_price: 30_000, crewartHouseKey: 'R' }
    ], { crewart_score_scope: 'all' });
    assert.match(threeManwon, /<strong class="crewart-house-score">3<\/strong>/);
    assert.doesNotMatch(threeManwon, /<strong class="crewart-house-score">30,000<\/strong>/);
    assert.doesNotMatch(html, /crewart-score-head|crewart-house-stats|crewart-house-sigil|<small>|POINTS|기숙사 미지정/);

    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'event-modules.js'), 'utf8');
    assert.match(source, /\.crewart-house-list \{[\s\S]*?grid-template-columns:1fr;grid-template-rows:repeat\(4,minmax\(0,1fr\)\);flex:1 1 100%/);
    assert.match(source, /\.crewart-house-card,[\s\S]*?width:100%;height:100%/);
    assert.match(source, /align-items:center;justify-items:end/);
    assert.match(source, /border:0;border-radius:8px/);
    assert.match(source, /background:color-mix\(in srgb,var\(--house\) 30%,rgba\(10,12,14,\.74\)\)/);
    assert.match(source, /justify-self:end;align-self:center/);
    assert.match(source, /box-shadow:none/);
    assert.doesNotMatch(source, /body\[data-event-module="crewart"\]\.bracket-page #bracket-page-tree-full \{[\s\S]*?inset:0 !important;width:100% !important;height:100% !important/);
    assert.match(source, /\.crewart-scoreboard\.is-compact \{[\s\S]*?flex-direction:column;align-items:stretch/);
    assert.doesNotMatch(source, /width:calc\(100% \+ clamp\(42px,3vw,64px\)\)|translateX\(-\.22em\)/);
});

test('P3 reorders cards by amount and keeps RGBY order for ties', () => {
    const module = loadModule();
    const result = module.buildCrewartHouseScores([], { crewart_score_scope: 'all' });
    assert.deepEqual(Array.from(result.houses, row => row.rank), [1, 1, 1, 1]);
    assert.deepEqual(Array.from(result.houses, row => row.name), ['RED', 'GREEN', 'BLUE', 'YELLOW']);

    const html = module.renderCrewartHouseBoardHTML([
        { status: 'sold', sold_price: 118, crewartHouseKey: 'R' },
        { status: 'sold', sold_price: 50, crewartHouseKey: 'G' },
        { status: 'sold', sold_price: 140, crewartHouseKey: 'B' },
        { status: 'sold', sold_price: 90, crewartHouseKey: 'Y' }
    ], { crewart_score_scope: 'all' });
    const order = ['B', 'R', 'Y', 'G'].map(house => html.indexOf(`data-house="${house}"`));
    assert.ok(order.every((position, index) => index === 0 || order[index - 1] < position));
});

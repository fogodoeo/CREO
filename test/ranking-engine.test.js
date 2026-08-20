'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rankingsForChannel } = require('../public/ranking-engine');

test('shared ranking engine follows each channel scoreboard configuration', () => {
    const items = [
        { status: 'sold', vendorId: 'v1', vendorName: '업체 하나', groupId: 'red', teamName: 'R', soldPrice: 300, points: 2 },
        { status: 'sold', vendorId: 'v2', vendorName: '업체 둘', groupId: 'blue', teamName: 'B', soldPrice: 500, points: 7 }
    ];
    const vendorChannel = { groups: [], scoreboards: [{ id: 'vendors', name: '업체', dimension: 'vendor', metric: 'soldAmount', unit: '원', topN: 8 }] };
    const groupChannel = { groups: [{ id: 'red', name: 'Red', shortName: 'R' }, { id: 'blue', name: 'Blue', shortName: 'B' }], scoreboards: [{ id: 'groups', name: '그룹', dimension: 'group', metric: 'points', unit: '점', topN: 4 }] };

    const vendorRows = rankingsForChannel(vendorChannel, items)[0].rows;
    const groupRows = rankingsForChannel(groupChannel, items)[0].rows;
    assert.deepEqual(vendorRows.map((row) => [row.name, row.total]), [['업체 둘', 500], ['업체 하나', 300]]);
    assert.deepEqual(groupRows.map((row) => [row.name, row.total]), [['B', 7], ['R', 2]]);
});

test('ranking engine excludes unsold rows and enforces each board top limit', () => {
    const channel = { scoreboards: [{ id: 'count', name: '수량', dimension: 'category', metric: 'soldCount', unit: '건', topN: 1 }] };
    const rows = rankingsForChannel(channel, [
        { status: 'waiting', category: '제외', soldPrice: 0 },
        { status: 'sold', category: 'A', soldPrice: 1 },
        { status: 'sold', category: 'B', soldPrice: 1 },
        { status: 'sold', category: 'B', soldPrice: 1 }
    ])[0].rows;
    assert.deepEqual(rows.map((row) => [row.name, row.total, row.count]), [['B', 2, 2]]);
});

test('winner house rankings aggregate sold amounts by the viewer color frozen on each item', () => {
    const channel = {
        groups: [
            { id: 'house-red', name: 'RED', shortName: 'R', color: '#aa0000' },
            { id: 'house-blue', name: 'BLUE', shortName: 'B', color: '#0000aa' }
        ],
        scoreboards: [{
            id: 'houses', name: '팀별 낙찰금 합계', dimension: 'winnerHouse',
            metric: 'soldAmount', unit: '만원', topN: 4
        }]
    };
    const board = rankingsForChannel(channel, [
        { status: 'sold', soldPrice: 100000, groupId: 'house-red', attributes: { crewart_house_key: 'B' } },
        { status: 'sold', soldPrice: 70000, crewartHouseKey: 'B' },
        { status: 'sold', soldPrice: 50000, crewartHouseKey: 'R' }
    ])[0];
    assert.deepEqual(board.rows.map(row => ({ key: row.key, total: row.total })), [
        { key: 'B', total: 170000 },
        { key: 'R', total: 50000 }
    ]);
});

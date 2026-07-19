'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    channelKey,
    channelLinks,
    normalizeChannel,
    publicItem,
    validateChannel
} = require('../platform-core');

test('channel identifiers and storage keys create hard data boundaries', () => {
    assert.equal(channelKey('summer-auction', 'vendor', 'ven_1'), 'creo_v2::summer-auction::vendor::ven_1');
    assert.throws(() => channelKey('!!!', 'vendor', 'one'), /Invalid channel key/);
    assert.match(channelLinks('summer-auction').workspace, /channel=summer-auction/);
});

test('channel configuration is normalized and duplicate ids are rejected', () => {
    const channel = normalizeChannel({
        id: 'New Auction!',
        name: '  여름   경매  ',
        status: 'active',
        broadcastTemplate: 'classic',
        theme: { primary: '#ABCDEF', secondary: 'invalid' }
    });
    assert.equal(channel.id, 'new-auction');
    assert.equal(channel.name, '여름 경매');
    assert.equal(channel.theme.primary, '#abcdef');
    assert.equal(channel.theme.secondary, '#d6b25e');

    const result = validateChannel(channel, [{ id: 'new-auction' }]);
    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /이미 사용 중/);
});

test('public broadcast items never expose winner or shipping contact data', () => {
    const item = publicItem({
        id: 'item_1', lotNumber: 3, name: '테스트 개체', winnerName: '홍길동',
        winnerPhone: '01012345678', shippingAddress: '서울', soldPrice: 20
    });
    assert.equal(item.name, '테스트 개체');
    assert.equal(item.soldPrice, 20);
    assert.equal('winnerPhone' in item, false);
    assert.equal('shippingAddress' in item, false);
});
